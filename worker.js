/**
 * ScoutingHub — Cloudflare Worker (toernooi-flow)
 * ------------------------------------------------------------
 * Web-standaard runtime (V8 isolate) — GEEN Node, GEEN firebase-admin,
 * GEEN Buffer/require. Eén Worker bedient drie logische endpoints:
 *
 *   POST /parseToernooiUrl        → import (multi-tab fetch → vast contract)
 *   POST /syncTournamentResults   → scores + standen (additief)
 *   POST /parseToernooiReglement  → URL/HTML reglement → regels-contract
 *
 * Verschillen t.o.v. de Firebase-versie (bewust):
 *   - req/res (Express)  → fetch(request) → new Response(...)
 *   - corsHeaders(res)   → CORS-headers op elke Response
 *   - verifyAuth (admin) → token wordt NIET server-side geverifieerd.
 *       De Firestore SECURITY RULES blijven de poortwachter; deze functie
 *       leest alleen publieke Tournify-data en schrijft NIETS naar Firestore.
 *   - PDF-reglement (pdf-parse/Buffer) → niet beschikbaar op Workers.
 *       URL/HTML-reglementen werken volledig; voor PDF geeft de functie een
 *       nette waarschuwing met actiepunt (plak de reglement-URL i.p.v. PDF).
 *
 * Gratis Cloudflare-plan: 100.000 requests/dag, geen creditcard nodig.
 */

import { connect } from 'cloudflare:sockets';

/* ============================================================ *
 * GEDEELDE HELPERS (runtime-agnostisch — 1:1 overgezet)        *
 * ============================================================ */
const HARD_DEADLINE_MS = 25000;          // ruim binnen Worker CPU/wall budget
const PER_FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (compatible; ScoutingHubImporter/1.0; +https://msteeman.github.io/database/)';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '3600'
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

function S(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  return '';
}
function SorNull(v) { const s = S(v); return s ? s : null; }
function firstNonEmpty(...vals) { for (const v of vals) { const s = S(v); if (s) return s; } return ''; }
function pickId(obj, keys) { for (const k of keys) { if (obj && obj[k] != null && S(obj[k])) return S(obj[k]); } return null; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

async function fetchWithTimeout(url, opts = {}, timeoutMs = PER_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: 'follow', ...opts, signal: ctrl.signal,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

/* ---- URL + identifier ---- */
function validateAndNormalizeUrl(rawUrl, warnings) {
  const raw = S(rawUrl);
  if (!raw) { warnings.push('Geen URL meegegeven'); return null; }
  let u;
  try { u = new URL(raw.includes('://') ? raw : 'https://' + raw); }
  catch (_) { warnings.push('URL kon niet worden geparsed'); return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') { warnings.push('URL heeft geen http(s)-protocol'); return null; }
  u.protocol = 'https:';
  const host = u.hostname.toLowerCase();
  const allowed = ['tournifyapp.com', 'tournify.nl'];
  if (!allowed.some(h => host === h || host.endsWith('.' + h))) {
    warnings.push(`Onbekende host "${host}" — verwacht tournifyapp.com / tournify.nl`);
  }
  return u;
}
function detectTournamentIdentifier(u, warnings) {
  if (!u) return null;
  const m = u.pathname.match(/\/(?:live|share)\/([a-zA-Z0-9_-]{2,})/i);
  if (m && m[1]) return m[1];
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length) { warnings.push('Geen /live|/share segment — laatste pad-segment als ID gebruikt'); return segs[segs.length - 1]; }
  warnings.push('Geen toernooi-ID uit de URL af te leiden');
  return null;
}

/* ---- embedded JSON / SPA-detectie ---- */
function tryParseJson(text) {
  const t = S(text); if (!t) return null;
  try { return JSON.parse(t); } catch (_) {}
  const start = t.search(/[\[{]/);
  if (start >= 0) for (let end = t.length; end > start; end--) {
    const slice = t.slice(start, end);
    if (/[\]}]$/.test(slice)) { try { return JSON.parse(slice); } catch (_) {} }
  }
  return null;
}
function looksLikeTournamentJson(obj) {
  return /("teams"|"matches"|"games"|"fixtures"|"poules?"|"standings"|"wedstrijden"|"participants")/i
    .test(JSON.stringify(obj || {}));
}
function extractEmbeddedJson(html, debug) {
  if (!html) return null;
  const blobs = [];
  const next = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (next) blobs.push({ tag: '__NEXT_DATA__', body: next[1] });
  const appJson = html.match(/<script[^>]+type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of appJson) blobs.push({ tag: 'application/json', body: b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '') });
  for (const re of [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i,
    /window\.__NUXT__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i,
    /window\.__APP__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i
  ]) { const m = html.match(re); if (m) blobs.push({ tag: re.source.slice(8, 22), body: m[1] }); }
  debug.scriptsInspected += blobs.length;
  for (const b of blobs) { const p = tryParseJson(b.body); if (p && looksLikeTournamentJson(p)) return { source: b.tag, data: p }; }
  for (const b of blobs) { const p = tryParseJson(b.body); if (p) return { source: b.tag, data: p }; }
  return null;
}
function deepFind(obj, keys, wantArray, maxDepth = 9) {
  const want = keys.map(k => k.toLowerCase());
  const seen = new Set();
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > maxDepth || seen.has(node)) return null;
    seen.add(node);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (want.includes(k.toLowerCase())) {
        if (wantArray && Array.isArray(v) && v.length) return v;
        if (!wantArray && v && typeof v === 'object' && !Array.isArray(v)) return v;
      }
    }
    for (const k of Object.keys(node)) { const f = walk(node[k], depth + 1); if (f) return f; }
    return null;
  }
  return walk(obj, 0) || (wantArray ? [] : null);
}

/* ---- multi-tab ophalen ---- */
function tabUrls(u, id) {
  const base = `${u.origin}/live/${encodeURIComponent(id)}`;
  return { info: base, schedule: `${base}/schedule`, standings: `${base}/standings`, myteam: `${base}/myteam` };
}
function apiCandidates(origin, id) {
  const i = encodeURIComponent(id);
  return [
    `${origin}/api/tournaments/${i}`,
    `${origin}/api/live/${i}`,
    `${origin}/api/v1/tournaments/${i}`,
    `${origin}/api/${i}/schedule`,
    `${origin}/api/${i}/standings`,
    `https://api.tournifyapp.com/v1/tournaments/${i}`
  ];
}
async function fetchTab(url, warnings, debug) {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'Accept': 'text/html,application/json' } });
    debug.htmlFetched = true;
    if (!res.ok) { warnings.push(`Pagina ${url} gaf status ${res.status}`); return { structured: null, html: '' }; }
    const ct = S(res.headers.get('content-type'));
    if (/json/i.test(ct)) { try { return { structured: await res.json(), html: '' }; } catch (_) {} }
    const html = await res.text();
    if (/tournament.*(isn['’]t|not).*available|niet meer beschikbaar/i.test(html)) {
      warnings.push('Tournify meldt dat dit toernooi niet meer beschikbaar is');
    }
    const emb = extractEmbeddedJson(html, debug);
    return { structured: emb ? emb.data : null, html };
  } catch (err) {
    warnings.push(`Kon ${url} niet ophalen: ${err.message || err}`);
    return { structured: null, html: '' };
  }
}
async function tryApiCandidates(origin, id, warnings, debug, timeLeft) {
  for (const url of apiCandidates(origin, id)) {
    if (timeLeft() < PER_FETCH_TIMEOUT_MS + 1200) break;
    debug.apiChecked = true;
    debug.jsonEndpointsChecked.push(url);
    try {
      const r = await fetchWithTimeout(url, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) continue;
      if (!/json/i.test(S(r.headers.get('content-type')))) continue;
      const j = await r.json();
      if (j && looksLikeTournamentJson(j)) { debug.apiUsable = true; return j; }
    } catch (_) {}
  }
  return null;
}

/* ---- parsers (1:1 overgezet) ---- */
function parseTournamentMeta(data, html, warnings) {
  const t = deepFind(data, ['tournament', 'toernooi', 'event', 'data'], false) || data || {};
  let name = firstNonEmpty(t.name, t.title, t.tournamentName, t.naam, data && data.name);
  let location = firstNonEmpty(t.location, t.venue, t.place, t.city, t.plaats, t.locatie, t.address);
  let startDate = firstNonEmpty(t.startDate, t.start, t.dateStart, t.startsAt, t.beginDate);
  let endDate = firstNonEmpty(t.endDate, t.end, t.dateEnd, t.endsAt);
  if (!name && html) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) name = S(h1[1].replace(/<[^>]+>/g, ''));
    if (!name) { const ti = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (ti) name = S(ti[1].replace(/\|.*$/, '').replace(/<[^>]+>/g, '')); }
  }
  if (!name) warnings.push('Toernooinaam niet gevonden in de bron');
  return { name: S(name), location: SorNull(location), startDate: normDate(startDate), endDate: normDate(endDate) };
}
function normDate(v) { const s = S(v); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
function normDateTime(v) { const s = S(v); if (!s) return null; if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return s.replace(' ', 'T'); const d = new Date(s); return isNaN(d.getTime()) ? s : d.toISOString(); }

function teamNameOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return S(v);
  if (typeof v === 'object') return firstNonEmpty(v.name, v.title, v.teamName, v.naam, v.club, v.label);
  return '';
}
function parseTeams(data, warnings) {
  const raw = deepFind(data, ['teams', 'participants', 'deelnemers', 'clubs'], true);
  const out = [], seen = new Set();
  for (const tm of raw) {
    const name = teamNameOf(tm); if (!name) continue;
    const k = name.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    out.push({ importedId: (tm && typeof tm === 'object') ? pickId(tm, ['id', '_id', 'teamId', 'uid', 'key']) : null, name });
  }
  if (!out.length) warnings.push('Geen teams in de gestructureerde bron — mapper reconstrueert uit wedstrijden');
  return out;
}
function parseMatches(data, warnings) {
  const raw = deepFind(data, ['matches', 'games', 'fixtures', 'schedule', 'wedstrijden', 'duels'], true);
  const out = [], seen = new Set();
  let dropped = 0;
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    let home = teamNameOf(m.home || m.homeTeam || m.thuis || m.teamA || m.team1 || m.home_team);
    let away = teamNameOf(m.away || m.awayTeam || m.uit || m.teamB || m.team2 || m.away_team);
    if ((!home || !away) && Array.isArray(m.teams) && m.teams.length >= 2) { home = home || teamNameOf(m.teams[0]); away = away || teamNameOf(m.teams[1]); }
    if (!home || !away) { dropped++; continue; }
    const startRaw = firstNonEmpty(m.startTime, m.start, m.datetime, m.date, m.kickoff, m.time, m.tijd);
    const startTime = normDateTime(startRaw);
    const field = SorNull(firstNonEmpty(m.field, m.court, m.pitch, m.veld, m.location, m.venue));
    const key = [home.toLowerCase(), away.toLowerCase(), startTime || '', field || ''].join('|');
    if (seen.has(key)) continue; seen.add(key);
    out.push({
      importedId: pickId(m, ['id', '_id', 'matchId', 'gameId', 'uid', 'key']),
      homeTeam: home, awayTeam: away, startTime, field,
      category: SorNull(firstNonEmpty(m.category, m.poule, m.group, m.division, m.klasse, m.categorie)),
      stage: SorNull(firstNonEmpty(m.stage, m.round, m.phase, m.fase, m.ronde, m.type)),
      rawDate: SorNull(firstNonEmpty(m.date, m.day, m.datum, startRaw))
    });
  }
  if (dropped) warnings.push(`${dropped} wedstrijd(en) zonder twee herkenbare teams overgeslagen`);
  if (!out.length) warnings.push('Geen wedstrijden gevonden in de bron');
  return out;
}
function parsePlayers(data, teams, warnings) {
  const raw = deepFind(data, ['players', 'spelers', 'roster', 'lineup', 'athletes'], true);
  const out = [], seen = new Set();
  const byId = new Map(); for (const t of teams) if (t.importedId) byId.set(String(t.importedId), t.name);
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const name = firstNonEmpty(p.name, p.fullName, p.playerName, p.naam, [S(p.firstName), S(p.lastName)].filter(Boolean).join(' '));
    if (!name) continue;
    let teamName = teamNameOf(p.teamName || p.team || p.club);
    if (!teamName && p.teamId != null) teamName = byId.get(String(p.teamId)) || '';
    if (!S(teamName)) continue;
    const k = name.toLowerCase() + '|' + teamName.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    out.push({ importedId: pickId(p, ['id', '_id', 'playerId', 'uid', 'key']), name: S(name), teamName: S(teamName) });
  }
  if (!out.length) warnings.push('Geen spelerslijst beschikbaar in de bron — players[] blijft leeg (niet gefaket)');
  return out;
}

function normalizeData(sources, ctx, warnings, debug) {
  const infoData = (sources.api) || (sources.info && sources.info.structured) || {};
  const infoHtml = (sources.info && sources.info.html) || '';
  const meta = parseTournamentMeta(infoData, infoHtml, warnings);

  const teamMap = new Map();
  const addTeams = list => { for (const t of list) { const k = t.name.toLowerCase(); if (!teamMap.has(k)) teamMap.set(k, t); else if (!teamMap.get(k).importedId && t.importedId) teamMap.set(k, t); } };
  if (sources.standings && sources.standings.structured) addTeams(parseTeams(sources.standings.structured, []));
  if (sources.schedule && sources.schedule.structured) addTeams(parseTeams(sources.schedule.structured, []));
  if (sources.api) addTeams(parseTeams(sources.api, []));
  if (sources.info && sources.info.structured) addTeams(parseTeams(sources.info.structured, []));
  const teams = [...teamMap.values()];

  const matchSrc = (sources.schedule && sources.schedule.structured) || sources.api || (sources.info && sources.info.structured) || {};
  const matches = parseMatches(matchSrc, warnings);

  const playerSrc = (sources.myteam && sources.myteam.structured) || (sources.schedule && sources.schedule.structured) || (sources.info && sources.info.structured) || sources.api || {};
  const players = parsePlayers(playerSrc, teams, warnings);

  const categories = [], catSeen = new Set();
  for (const m of matches) { const c = S(m.category); if (c && !catSeen.has(c.toLowerCase())) { catSeen.add(c.toLowerCase()); categories.push(c); } }

  debug.teamsFound = teams.length; debug.matchesFound = matches.length; debug.playersFound = players.length;

  return {
    name: S(meta.name), location: meta.location, startDate: meta.startDate, endDate: meta.endDate,
    categories, teams, matches, players,
    meta: { source: 'tournify', url: ctx.url, fetchedVia: ctx.fetchedVia, detectedTournamentId: ctx.id || null, warnings, debug }
  };
}
function validateOutput(result, warnings) {
  for (const k of ['teams', 'matches', 'players', 'categories']) if (!Array.isArray(result[k])) result[k] = [];
  if (!result.name) result.name = result.meta.detectedTournamentId ? `Tournify ${result.meta.detectedTournamentId}` : 'Geïmporteerd toernooi';
  if (result.teams.length === 0 && result.matches.length === 0) {
    warnings.push('Tournify-data is client-side gerenderd en kon niet server-side worden opgehaald. Open het toernooi in je browser → DevTools → Network → zoek de XHR/fetch call naar de data-API → deel die URL zodat we hem als eerste kandidaat kunnen toevoegen.');
  }
  return result;
}

/* ============================================================ *
 * FIRESTORE-LAAG — Tournify draait op Firebase Firestore.      *
 * De live-pagina logt anoniem in en leest publieke toernooi-   *
 * data uit project "tournamentsoftware-a1b3d". De Worker doet   *
 * dat na via de Firestore REST-API (read-only, alleen apiKey).  *
 * Lukt het niet (security rules), dan valt alles terug op de    *
 * bestaande HTML/embedded-JSON route — nooit een stille fout.   *
 * ============================================================ */
const FB = { projectId: 'tournamentsoftware-a1b3d', apiKey: 'AIzaSyDpqIP2yOZBWjAcknp1szptkyh0fk6zGQI' };
function fsBase() { return `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents`; }
function fsVal(v) {
  if (v == null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fsVal);
  if ('mapValue' in v) return fsFields((v.mapValue && v.mapValue.fields) || {});
  return null;
}
function fsFields(fields) { const o = {}; for (const k of Object.keys(fields || {})) o[k] = fsVal(fields[k]); return o; }
function fsDoc(doc) {
  if (!doc) return null;
  const o = fsFields(doc.fields || {});
  if (doc.name) { const segs = doc.name.split('/'); o.id = segs[segs.length - 1]; const i = doc.name.indexOf('/documents/'); if (i >= 0) o._path = doc.name.slice(i + 11); }
  return o;
}
// Anonieme Firebase-login → idToken. De Tournify-SPA doet exact dit voordat
// hij Firestore leest; de security rules vereisen request.auth != null.
// Zonder token geeft elke read 403 PERMISSION_DENIED (bevestigd in DevTools).
async function fsAnonToken(debug) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB.apiKey}`;
  try {
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ returnSecureToken: true })
    });
    if (!r.ok) { debug.firestoreAuth = `signUp ${r.status}`; return null; }
    const j = await r.json();
    debug.firestoreAuth = (j && j.idToken) ? 'anon-ok' : 'anon-no-token';
    return (j && j.idToken) || null;
  } catch (_) { debug.firestoreAuth = 'anon-error'; return null; }
}
function fsHeaders(token, extra) {
  return { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(extra || {}) };
}
async function fsGetDoc(path, token, debug) {
  const url = `${fsBase()}/${path}?key=${FB.apiKey}`;
  debug.firestorePathsTried.push('GET ' + path);
  try {
    const r = await fetchWithTimeout(url, { headers: fsHeaders(token) });
    if (r.status === 403) { debug.firestoreForbidden = true; return null; }
    if (!r.ok) return null;
    const j = await r.json();
    return (j && j.fields) ? fsDoc(j) : null;
  } catch (_) { return null; }
}
async function fsListCollection(path, token, debug, max = 600) {
  const out = []; let pageToken = ''; let lastStatus = 0;
  for (let i = 0; i < 5; i++) {
    const url = `${fsBase()}/${path}?key=${FB.apiKey}&pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    debug.firestorePathsTried.push('LIST ' + path);
    try {
      const r = await fetchWithTimeout(url, { headers: fsHeaders(token) });
      lastStatus = r.status;
      if (r.status === 403) { debug.firestoreForbidden = true; break; }
      if (!r.ok) break;
      const j = await r.json();
      for (const d of (j.documents || [])) out.push(fsDoc(d));
      pageToken = j.nextPageToken || '';
      if (!pageToken || out.length >= max) break;
    } catch (_) { break; }
  }
  // Diagnostiek: per subcollectie status + vorm van het eerste document.
  if (debug.firestoreListStatus) {
    const seg = path.split('/').pop();
    debug.firestoreListStatus[seg] = { status: lastStatus, count: out.length, sampleKeys: out[0] ? sampleShape(out[0]) : [] };
  }
  return out;
}
// Compacte vorm-beschrijving: top-level veldnamen + voor array-velden de keys
// van het eerste element (zo zie ik waar embedded games/wedstrijden zitten).
function sampleShape(doc) {
  const shape = [];
  for (const k of Object.keys(doc)) {
    const v = doc[k];
    if (Array.isArray(v)) {
      const first = v.find(x => x && typeof x === 'object');
      shape.push(first ? `${k}[]{${Object.keys(first).slice(0, 12).join(',')}}` : `${k}[${v.length}]`);
    } else if (v && typeof v === 'object') {
      shape.push(`${k}{${Object.keys(v).slice(0, 8).join(',')}}`);
    } else {
      shape.push(k);
    }
  }
  return shape;
}
async function fsListCollectionIds(path, token, debug) {
  const url = `${fsBase()}/${path}:listCollectionIds?key=${FB.apiKey}`;
  try {
    const r = await fetchWithTimeout(url, { method: 'POST', headers: fsHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ pageSize: 100 }) });
    if (r.status === 403) { debug.firestoreForbidden = true; return []; }
    if (!r.ok) return [];
    const j = await r.json();
    return j.collectionIds || [];
  } catch (_) { return []; }
}
async function fsRunQueryTop(collectionId, field, value, token, debug) {
  const url = `${fsBase()}:runQuery?key=${FB.apiKey}`;
  const body = { structuredQuery: { from: [{ collectionId }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: String(value) } } }, limit: 5 } };
  debug.firestorePathsTried.push(`QUERY ${collectionId}.${field}==${value}`);
  try {
    const r = await fetchWithTimeout(url, { method: 'POST', headers: fsHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    if (r.status === 403) { debug.firestoreForbidden = true; return []; }
    if (!r.ok) return [];
    const j = await r.json();
    const docs = [];
    for (const row of (Array.isArray(j) ? j : [])) if (row && row.document) docs.push(fsDoc(row.document));
    return docs;
  } catch (_) { return []; }
}
// Firestore-matchdocumenten gebruiken een eigen schema (st/et, team-referenties,
// pouleId/round) i.p.v. de namen die parseMatches kent. Deze helper resolvet de
// referenties naar namen en zet de waarden op de contract-velden, zodat de
// bestaande parsers (parseMatches / parseScoredMatches) ze 1:1 oppakken.
function teamIdFromRef(ref) {
  if (ref == null) return null;
  if (typeof ref === 'string') { const segs = ref.split('/').filter(Boolean); return segs.length ? segs[segs.length - 1] : null; }
  if (typeof ref === 'object') {
    const cand = firstNonEmpty(ref.id, ref._path, ref.path, ref.ref, ref.reference, ref.teamId, ref.key);
    if (cand) return teamIdFromRef(cand);
  }
  return null;
}
// id → naam uit een subcollectie. Pakt ook geneste velden-arrays mee
// (een sportPark-doc bevat field-objecten met eigen id+naam).
function nameMapFrom(arr) {
  const map = new Map();
  for (const d of (Array.isArray(arr) ? arr : [])) {
    if (!d || typeof d !== 'object') continue;
    const id = firstNonEmpty(d.id, pickId(d, ['_id', 'uid', 'key']));
    const name = firstNonEmpty(d.name, d.title, d.naam, d.label);
    if (id && name) map.set(String(id), name);
    for (const nk of ['fields', 'courts', 'velden']) {
      if (Array.isArray(d[nk])) for (const f of d[nk]) {
        if (!f || typeof f !== 'object') continue;
        const fid = firstNonEmpty(f.id, f.key, f._id);
        const fn = firstNonEmpty(f.name, f.title, f.label, f.naam);
        if (fid && fn) map.set(String(fid), fn);
      }
    }
  }
  return map;
}
// Veldnaam inkorten. Tournify levert soms het volledige sportpark-adres als
// veld ("SO Soest, Bosstraat, Soest, Nederland"). >20 tekens → gebruik het
// nummer (numInField of eerste getal in de string), anders het eerste segment
// vóór de komma. Korte waarden ("1", "2", "SEC") blijven onveranderd.
function shortenFieldName(v, numInField) {
  const s = S(v);
  if (!s || s.length <= 20) return s;
  const numField = numInField != null ? S(numInField) : '';
  if (numField && /\w/.test(numField)) return numField;
  const m = s.match(/\d{1,3}[a-zA-Z]?/);
  if (m && m[0]) return m[0];
  return S(s.split(',')[0]);
}

// Het ECHTE Tournify-matchschema (bevestigd via DevTools): NIET teams[] maar
// losse scalaire velden team1/team2 (referenties), score1/score2 (of scores1/
// scores2), st/et, poule (referentie), round, field. Deze helper resolvet de
// referenties naar namen en zet alles op de contract-velden, zodat parseMatches
// / parseScoredMatches ze 1:1 oppakken.
function enrichFirestoreMatches(result) {
  const matches = Array.isArray(result.matches) ? result.matches : [];
  if (!matches.length) return;

  const teamsArr = Array.isArray(result.teams) ? result.teams : [];

  // --- Globale id → naam (alleen unieke doc-/id-velden; voor knock-out refs) ---
  const teamsById = new Map();
  const ID_FIELDS = ['id', '_id', 'teamId', 'uid', 'key'];
  for (const t of teamsArr) {
    if (!t || typeof t !== 'object') continue;
    const name = teamNameOf(t); if (!name) continue;
    for (const k of ID_FIELDS) { const s = S(t[k]); if (s && !teamsById.has(s)) teamsById.set(s, name); }
  }
  const nameFromId = (id) => (id != null && teamsById.has(String(id))) ? teamsById.get(String(id)) : '';

  // --- KERN: team1/team2 zijn POULE-RELATIEVE indices, geen globale id's. ---
  // We bouwen per poule een geordende teamlijst: positie → naam. Bronnen:
  //   A) poule-document met geordende team-lijst (teams[]/ranking[] of team0,team1,…)
  //   B) team-document dat z'n poule + positie declareert (poule0 + numInPoule0 e.d.)
  // We verzamelen (positie, naam)-paren per poule en normaliseren daarna op de
  // laagste positie, zodat 0- én 1-gebaseerde nummering allebei op index 0 landt
  // (team1=0 wijst naar de eerste poule-positie).
  const pouleRaw = new Map();   // pid → [{pos, name}]
  const addPair = (pid, pos, name) => {
    if (pid == null || name == null || !Number.isFinite(Number(pos))) return;
    const k = String(pid); if (!pouleRaw.has(k)) pouleRaw.set(k, []);
    pouleRaw.get(k).push({ pos: Number(pos), name });
  };

  // Strategy A — poule-docs met geordende teamlijst
  for (const p of (Array.isArray(result.standings) ? result.standings : [])) {
    if (!p || typeof p !== 'object') continue;
    const pid = firstNonEmpty(p.id, pickId(p, ['_id', 'key', 'uid']));
    if (!pid) continue;
    let list = null;
    for (const lk of ['teams', 'participants', 'ranking', 'standing', 'standings', 'rows', 'deelnemers']) {
      if (Array.isArray(p[lk]) && p[lk].length) { list = p[lk]; break; }
    }
    if (!list) {
      const tk = Object.keys(p).filter(k => /^team\d+$/i.test(k)).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
      if (tk.length) list = tk.map(k => p[k]);
    }
    if (!list) continue;
    list.forEach((ref, i) => {
      const nm = nameFromId(teamIdFromRef(ref)) || teamNameOf(ref);
      if (nm) addPair(pid, i, nm);
    });
  }

  // Strategy B — team-docs die poule + positie declareren (poule0 + numInPoule0)
  for (const t of teamsArr) {
    if (!t || typeof t !== 'object') continue;
    const name = teamNameOf(t); if (!name) continue;
    const pouleFields = Object.keys(t).filter(k => /^(poule|poules|group|pool|groep)\d*$/i.test(k));
    for (const pk of pouleFields) {
      const pid = teamIdFromRef(t[pk]) || ((typeof t[pk] === 'string' || typeof t[pk] === 'number') ? String(t[pk]) : null);
      if (!pid) continue;
      const suffix = (pk.match(/(\d+)$/) || [])[1] || '';
      let pos = null;
      for (const pc of [`numInPoule${suffix}`, 'numInPoule', `num${suffix}`, 'num', `number${suffix}`, 'number', `pos${suffix}`, 'pos', `position${suffix}`, 'position', `order${suffix}`, 'order', 'rank']) {
        if (t[pc] != null && Number.isFinite(Number(t[pc]))) { pos = Number(t[pc]); break; }
      }
      if (pos != null) addPair(pid, pos, name);
    }
  }

  // Normaliseer elke poule naar een 0-gebaseerde array (index = poule-positie).
  const pouleOrder = new Map(); // pid → [name@0, name@1, …]
  for (const [pid, pairs] of pouleRaw.entries()) {
    if (!pairs.length) continue;
    const min = Math.min(...pairs.map(x => x.pos));
    const arr = [];
    for (const { pos, name } of pairs) { const i = pos - min; if (arr[i] == null) arr[i] = name; }
    pouleOrder.set(pid, arr);
  }

  // CROSS-LINK: een poule-array kan onder z'n naam OF z'n doc-id zijn opgeslagen,
  // terwijl match.poule het andere bevat. Registreer daarom elke array onder ALLE
  // identifiers van het poule-doc (doc-id + naam + key), zodat match.poule de lijst
  // vindt — of hij nu "Poule A" of "EgoVC1QpKQAg3HYfMHx" is.
  for (const p of (Array.isArray(result.standings) ? result.standings : [])) {
    if (!p || typeof p !== 'object') continue;
    const aliases = [p.id, p.name, p.title, p.naam, p.label, p.key, p._id, p.uid].map(S).filter(Boolean);
    let arr = null;
    for (const a of aliases) { if (pouleOrder.has(a)) { arr = pouleOrder.get(a); break; } }
    if (!arr) continue;
    for (const a of aliases) { if (!pouleOrder.has(a)) pouleOrder.set(a, arr); }
  }

  const poulesById = nameMapFrom(result.standings);
  const fieldsById = nameMapFrom(result.fields);
  // FIX veldnaam: het toernooi-doc heeft een `fields`-map (key = veld-index) met de
  // echte labels ("Veld 1A - ..."). match.field is die index -> bouw index -> naam.
  const tdocFieldName = new Map();
  const _tdf = result._tdocFields;
  if (_tdf && typeof _tdf === 'object') {
    for (const _fk of Object.keys(_tdf)) {
      const _fe = _tdf[_fk];
      if (!_fe || typeof _fe !== 'object') continue;
      const _fnm = S(firstNonEmpty(_fe.label, _fe.name)).trim();
      if (!_fnm) continue;
      // kort tot alleen de veldcode: "Veld 1A - De Hypotheekshop (Amersfoort)" -> "1A"
      let _code = _fnm.replace(/^veld\s*/i, '').split(/\s+-\s+/)[0].trim();
      if (!_code) _code = _fnm;
      tdocFieldName.set(String(_fk), _code);
      if (_fe.num != null) tdocFieldName.set(String(_fe.num), _code);
      if (_fe.id != null) tdocFieldName.set(String(_fe.id), _code);
    }
  }
  // FIX poule-letter: volledig poule-label (naam + letter) per poule-id. Tournify
  // geeft per poule een `name` ("1e Klasse (Middag)") EN een `letter` ("C"); zonder
  // de letter vallen alle sub-poules met dezelfde naam samen tot één lijst.
  const pouleLabelById = new Map();
  for (const p of (Array.isArray(result.standings) ? result.standings : [])) {
    if (!p || typeof p !== 'object') continue;
    const _ppid = firstNonEmpty(p.id, pickId(p, ['_id', 'key', 'uid']));
    if (!_ppid) continue;
    const _pnm = S(firstNonEmpty(p.name, p.title, p.naam)).trim();
    const _plt = S(firstNonEmpty(p.letter, p.pouleLetter, p.poule_letter)).trim();
    const _label = !_pnm ? (_plt ? ('Poule ' + _plt) : '') : ((!_plt || /poule/i.test(_pnm)) ? _pnm : (_pnm + ' - Poule ' + _plt));
    if (_label) pouleLabelById.set(String(_ppid), _label);
  }
  const resolveRef = (ref, map) => {              // generiek (poule/veld)
    const id = teamIdFromRef(ref);
    if (id && map.has(id)) return map.get(id);
    if (typeof ref === 'string' && !ref.includes('/')) return S(ref);
    return '';
  };

  // Resolve een team binnen z'n match-poule. Eerst poule-relatieve index, dan
  // globale doc-id (knock-out), dan ruwe naam. {name, via} voor de trace.
  const resolveTeamTrace = (ref, pouleId) => {
    if (ref == null) return { name: '', via: 'null' };
    const arr = pouleId != null ? pouleOrder.get(String(pouleId)) : null;
    const asIdx = (typeof ref === 'number') ? ref : ((typeof ref === 'string' && /^\d+$/.test(ref)) ? Number(ref) : null);
    if (arr && asIdx != null && arr[asIdx]) return { name: arr[asIdx], via: 'pouleIdx[' + asIdx + ']' };
    const id = teamIdFromRef(ref);
    if (id && teamsById.has(String(id))) return { name: teamsById.get(String(id)), via: 'globalId' };
    if (typeof ref === 'string' && !ref.includes('/')) {
      if (teamsById.has(ref)) return { name: teamsById.get(ref), via: 'globalKey' };
      return { name: S(ref), via: 'asName' };
    }
    return { name: '', via: 'nomatch' };
  };

  let resolved = 0; let idx = 0;
  const trace = []; const unresolvedTrace = [];
  for (const m of matches) {
    if (!m || typeof m !== 'object') continue;
    // poule van de match bepaalt welke poule-teamlijst we indexeren
    const pouleRef = m.poule != null ? m.poule : (m.pouleId != null ? m.pouleId : (m.group != null ? m.group : null));
    const pid = teamIdFromRef(pouleRef) || ((typeof pouleRef === 'string' || typeof pouleRef === 'number') ? String(pouleRef) : null);
    // 1. team1 = thuis (poule-index), team2 = uit. Onresolvebaar → '' zodat
    //    parseMatches de match dropt i.p.v. een index als naam te tonen.
    const homeRef = m.team1 != null ? m.team1 : (m.home != null ? m.home : (m.homeTeam != null ? m.homeTeam : (Array.isArray(m.teams) ? m.teams[0] : null)));
    const awayRef = m.team2 != null ? m.team2 : (m.away != null ? m.away : (m.awayTeam != null ? m.awayTeam : (Array.isArray(m.teams) ? m.teams[1] : null)));
    const rh = resolveTeamTrace(homeRef, pid);
    const ra = resolveTeamTrace(awayRef, pid);
    if (idx < 3) {
      const po = pid != null ? pouleOrder.get(String(pid)) : null;
      trace.push({ rawTeam1: homeRef, rawTeam2: awayRef, pouleId: pid, pouleTeams: po ? po.filter(Boolean) : [], homeVia: rh.via, awayVia: ra.via, homeName: rh.name, awayName: ra.name });
    }
    idx++;
    if (!S(m.homeTeam)) m.homeTeam = rh.name || '';
    if (!S(m.awayTeam)) m.awayTeam = ra.name || '';
    if (S(m.homeTeam) && S(m.awayTeam)) resolved++;
    else if (unresolvedTrace.length < 5) {
      // diagnose van de niet-opgeloste matches: poule bekend? index of knock-out-ref?
      unresolvedTrace.push({ rawTeam1: homeRef, rawTeam2: awayRef, pouleId: pid, pidInOrder: pid != null && pouleOrder.has(String(pid)), round: m.round != null ? m.round : (m.stage != null ? m.stage : null), homeVia: rh.via, awayVia: ra.via });
    }
    // 2. starttijd uit `st` (en `et` als eindtijd)
    if (m.startTime == null && m.st != null) m.startTime = m.st;
    if (m.endTime == null && m.et != null) m.endTime = m.et;
    // 3. categorie: VOLLEDIG poule-label (naam + letter) via poule-referentie, zodat
    //    sub-poules met dezelfde naam (A/B/C…) niet samenvallen tot één lijst.
    //    Val terug op alleen-naam, dan ruwe pouleKey/pouleId.
    if (m.category == null) {
      const _pid = teamIdFromRef(m.poule) || ((typeof m.poule === 'string' || typeof m.poule === 'number') ? String(m.poule) : null);
      m.category = (_pid && pouleLabelById.has(String(_pid)) ? pouleLabelById.get(String(_pid)) : null)
        || SorNull(resolveRef(m.poule, poulesById))
        || SorNull(firstNonEmpty(m.pouleKey, m.pouleId)) || null;
    }
    // 4. stage uit `round`
    if (m.stage == null && m.round != null) m.stage = m.round;
    // 5. veld: eerst de ECHTE naam uit het toernooi-doc (`fields`-map, key = index);
    //    anders referentie-resolutie / directe waarde / numInField (met inkorting).
    let _fieldResolved = false;
    if (m.field != null && typeof m.field !== 'object') {
      const _tn = tdocFieldName.get(String(m.field));
      if (_tn) { m.field = _tn; _fieldResolved = true; }
    }
    if (!_fieldResolved) {
      if (m.field != null) {
        const fn = resolveRef(m.field, fieldsById);
        m.field = SorNull(fn) || (typeof m.field === 'object' ? null : SorNull(m.field));
      }
      if (m.field == null && m.numInField != null) m.field = SorNull(m.numInField);
      if (m.field != null) m.field = SorNull(shortenFieldName(m.field, m.numInField));
    }
    // 6. scores: score1/score2 (of scores1/scores2)
    if (m.scoreHome == null) m.scoreHome = numOrNull(firstNonEmpty(m.score1, m.scores1));
    if (m.scoreAway == null) m.scoreAway = numOrNull(firstNonEmpty(m.score2, m.scores2));
  }
  result._enrichResolved = resolved;
  result._teamKeyCount = teamsById.size;
  result._trace = trace;
  result._unresolvedTrace = unresolvedTrace;
  result._pouleOrder = [...pouleOrder.entries()].slice(0, 6).map(([k, v]) => ({ poule: poulesById.get(k) || k, teams: v.filter(Boolean) }));
}
// Hoofdfunctie: vind het toernooi-document en verzamel teams/wedstrijden/spelers/standen.
// Geeft een PLAT object terug dat door de bestaande parsers (deepFind) wordt gelezen.
async function fetchFromFirestore(id, warnings, debug, timeLeft) {
  if (!id) return null;
  debug.firestorePathsTried = []; debug.firestoreForbidden = false; debug.firestoreDoc = null; debug.firestoreSubcollections = []; debug.firestoreListStatus = {};
  const token = await fsAnonToken(debug);
  if (!token) warnings.push('Anonieme Firebase-login bij Tournify mislukte — Firestore-toegang wordt zonder token geprobeerd');
  const eid = encodeURIComponent(id);
  const docCols = ['tournaments', 'events', 'live'];
  let tdoc = null, tpath = null;
  // 1. directe document-ID (slug == doc-id, meest waarschijnlijk)
  for (const c of docCols) {
    if (timeLeft() < 5000) break;
    const d = await fsGetDoc(`${c}/${eid}`, token, debug);
    if (d) { tdoc = d; tpath = d._path || `${c}/${id}`; debug.firestoreFoundVia = `${c}/${id}`; break; }
  }
  // 2. terugval: zoek op slug-veld (itt2026 is een slug, niet de doc-id).
  //    Tournify bewaart de slug in het veld `liveLink` (bevestigd via WebChannel:
  //    tournaments/<docId> heeft liveLink:"itt2026", key:"<docId>"). Daarom staat
  //    liveLink vooraan — daarna pas de generieke kandidaten.
  if (!tdoc) {
    const fields = ['liveLink', 'url', 'slug', 'shortName', 'code', 'key', 'name'];
    outer: for (const c of docCols) {
      for (const f of fields) {
        if (timeLeft() < 5000) break outer;
        const res = await fsRunQueryTop(c, f, id, token, debug);
        if (res.length) { tdoc = res[0]; tpath = tdoc._path || `${c}/${tdoc.id}`; debug.firestoreFoundVia = `${c}.${f}`; break outer; }
      }
    }
  }
  if (!tdoc) {
    if (debug.firestoreForbidden) warnings.push('Tournify Firestore blokkeert externe toegang (security rules) — terugval op HTML-parse');
    return null;
  }
  debug.firestoreDoc = tpath;
  const result = { ...tdoc };
  try { debug.tdocKeys = Object.keys(tdoc); const _cand = {}; for (const _k of ['fields','velden','courts','locations','fieldNames','veldnamen','pitches','veldNamen']) { if (tdoc[_k] != null) _cand[_k] = JSON.stringify(tdoc[_k]).slice(0, 600); } debug.tdocFieldCandidate = _cand; } catch (_) {}
  result._tdocFields = (tdoc && tdoc.fields && typeof tdoc.fields === 'object') ? tdoc.fields : null;
  // 3. echte subcollecties ontdekken
  let subs = [];
  if (timeLeft() > 4000) { subs = await fsListCollectionIds(tpath, token, debug); debug.firestoreSubcollections = subs; }
  // Bevestigd leesbare Tournify-subcollecties (directe LIST → 200): teams (16),
  // matches (48), poules (28). `listCollectionIds` rapporteert `matches` NIET,
  // dus de gate hieronder mag deze namen niet wegfilteren — daarom staan ze in
  // PRIMARY en worden ze altijd geprobeerd, ook als `subs` ze mist.
  const PRIMARY = new Set(['teams', 'matches', 'poules']);
  const want = {
    teams: ['teams', 'participants', 'deelnemers', 'clubs'],
    matches: ['matches', 'games', 'fixtures', 'wedstrijden', 'duels', 'schedule', 'brackets', 'resultSpots', 'days'],
    players: ['players', 'spelers', 'roster', 'athletes'],
    standings: ['poules', 'standings', 'groups', 'pools', 'groepen', 'ranking'],
    fields: ['fields', 'sportParks', 'courts', 'velden', 'locations']
  };
  for (const [outKey, names] of Object.entries(want)) {
    for (const n of names) {
      if (timeLeft() < 3500) break;
      if (subs.length && !subs.includes(n) && !PRIMARY.has(n)) continue;  // gate, behalve bevestigd-open subcollecties
      const list = await fsListCollection(`${tpath}/${n}`, token, debug);
      if (list.length) { result[outKey] = (Array.isArray(result[outKey]) ? result[outKey] : []).concat(list); break; }
    }
  }
  // DIAGNOSE: ruwe vorm van het eerste match- en team-doc vóór enrichment, zodat
  // we zien hoe team1/team2 zijn opgeslagen (pad / los ID / object) en welk
  // id-veld de teams gebruiken. Tijdelijk — verwijder zodra de mapping klopt.
  if (Array.isArray(result.matches) && result.matches.length) {
    const m0 = result.matches[0];
    debug.matchSampleRaw = JSON.stringify(m0, (k, v) => k === 'history' || k === 'goals' || k === 'sets' || k === 'playerPoints' ? undefined : v).slice(0, 1500);
    debug.matchTeamFields = { team1: m0 && m0.team1, team2: m0 && m0.team2, team1Type: typeof (m0 && m0.team1), team2Type: typeof (m0 && m0.team2) };
  }
  if (Array.isArray(result.teams) && result.teams.length) {
    debug.teamSampleRaw = JSON.stringify(result.teams[0]).slice(0, 800);
    debug.teamIds = result.teams.slice(0, 5).map(t => t && (t.id || t._id || t.key));
  }
  // Map de Firestore-matchdocs (st/et, team-referenties, pouleId/round) naar het
  // output-contract (homeTeam/awayTeam/startTime/category/stage) vóór parseMatches.
  enrichFirestoreMatches(result);
  debug.matchesResolved = result._enrichResolved;   // # matches met 2 herkende teams
  debug.teamKeyCount = result._teamKeyCount;          // # sleutels in de team-lookup
  debug.teamResolveTrace = result._trace;             // eerste 3 matches: raw team1/team2 → via → naam
  debug.unresolvedTrace = result._unresolvedTrace;    // tot 5 niet-opgeloste matches: poule bekend? knock-out?
  debug.pouleOrder = result._pouleOrder;              // per poule de geordende teamlijst (positie → naam)
  if (Array.isArray(result.standings) && result.standings.length) debug.pouleSampleRaw = JSON.stringify(result.standings[0]).slice(0, 1000);
  // DEBUG veldnaam-onderzoek: ruwe waarden van de fields/sportParks-bron, zodat we
  // zien of de echte veldnaam ("2C") leesbaar is en hoe match.field ("9") koppelt.
  if (Array.isArray(result.fields) && result.fields.length) {
    debug.fieldsCount = result.fields.length;
    debug.fieldsSampleRaw = result.fields.slice(0, 12).map(f => (f && typeof f === 'object') ? { name: f.name, secondaryName: f.secondaryName, num: f.num, indexNum: f.indexNum, letter: f.letter, id: (f.id || f._id) } : f);
  } else { debug.fieldsCount = 0; }
  if (Array.isArray(result.matches) && result.matches.length) {
    const m0 = result.matches[0];
    debug.enrichedSample = { homeTeam: m0.homeTeam, awayTeam: m0.awayTeam, startTime: m0.startTime, field: m0.field, category: m0.category, stage: m0.stage, scoreHome: m0.scoreHome, scoreAway: m0.scoreAway };
  }
  // 4. terugval: data kan in top-level collecties staan, gekoppeld via tournamentId
  const needMatches = !Array.isArray(result.matches) || !result.matches.length;
  const needTeams = !Array.isArray(result.teams) || !result.teams.length;
  if ((needMatches || needTeams) && tdoc.id && timeLeft() > 4000) {
    const linkFields = ['tournamentId', 'tournament', 'eventId', 'event'];
    if (needMatches) { for (const f of linkFields) { if (timeLeft() < 3500) break; const r = await fsRunQueryTop('matches', f, tdoc.id, token, debug); if (r.length) { result.matches = r; break; } } }
    if (needTeams) { for (const f of linkFields) { if (timeLeft() < 3500) break; const r = await fsRunQueryTop('teams', f, tdoc.id, token, debug); if (r.length) { result.teams = r; break; } } }
  }
  debug.firestoreUsable = !!((Array.isArray(result.teams) && result.teams.length) || (Array.isArray(result.matches) && result.matches.length));
  return result;
}

/* ============================================================ *
 * HANDLER 1 — parseToernooiUrl (import, multi-tab)            *
 * ============================================================ */
async function handleParseToernooiUrl(body) {
  const warnings = [];
  const debug = { apiChecked: false, apiUsable: false, jsonEndpointsChecked: [], htmlFetched: false, scriptsInspected: 0, teamsFound: 0, matchesFound: 0, playersFound: 0 };
  const t0 = Date.now(); const timeLeft = () => HARD_DEADLINE_MS - (Date.now() - t0);

  const mode = S(body.mode) || 'import';
  const u = validateAndNormalizeUrl(S(body.url), warnings);
  const id = detectTournamentIdentifier(u, warnings);
  const ctx = { url: u ? u.toString() : '', id, fetchedVia: 'html-scrape' };

  if (mode === 'sync') return await buildSync(u, id, warnings, debug, timeLeft);

  if (!u) return json(validateOutput(normalizeData({}, ctx, warnings, debug), warnings));

  // 0. PRIMAIRE BRON — Firestore REST (Tournify draait op Firebase Firestore).
  //    Met anonieme login leveren teams/wedstrijden/spelers/standen direct op.
  let fsData = null;
  if (id && timeLeft() > 6000) fsData = await fetchFromFirestore(id, warnings, debug, timeLeft);
  const fsUsable = !!(fsData && debug.firestoreUsable);
  if (fsUsable) ctx.fetchedVia = 'firestore';

  // 1. HTML-tabs alleen ophalen als Firestore geen bruikbare data gaf (meta-terugval).
  let info = { structured: null, html: '' }, schedule = { structured: null, html: '' },
      standings = { structured: null, html: '' }, myteam = { structured: null, html: '' };
  if (!fsUsable) {
    const urls = tabUrls(u, id);
    [info, schedule, standings, myteam] = await Promise.all([
      fetchTab(urls.info, warnings, debug),
      timeLeft() > PER_FETCH_TIMEOUT_MS ? fetchTab(urls.schedule, warnings, debug) : Promise.resolve({ structured: null, html: '' }),
      timeLeft() > PER_FETCH_TIMEOUT_MS ? fetchTab(urls.standings, warnings, debug) : Promise.resolve({ structured: null, html: '' }),
      timeLeft() > PER_FETCH_TIMEOUT_MS ? fetchTab(urls.myteam, warnings, debug).catch(() => ({ structured: null, html: '' })) : Promise.resolve({ structured: null, html: '' })
    ]);
  }

  const sources = { info, schedule, standings, myteam, api: fsData || null };
  const anyStructured = [info, schedule, standings, myteam].some(s => s && s.structured);
  if (!fsUsable && anyStructured) ctx.fetchedVia = 'embedded-json';

  if (!fsUsable && !anyStructured && id && timeLeft() > PER_FETCH_TIMEOUT_MS) {
    const api = await tryApiCandidates(u.origin, id, warnings, debug, timeLeft);
    if (api) { sources.api = api; ctx.fetchedVia = debug.apiUsable ? 'api' : 'json-endpoint'; }
  }
  if (!fsUsable && !anyStructured && !sources.api) {
    ctx.fetchedVia = 'html-scrape';
    warnings.push('Geen Firestore-data, embedded JSON of API gevonden — alleen HTML-metadata beschikbaar (SPA-shell)');
  }

  return json(validateOutput(normalizeData(sources, ctx, warnings, debug), warnings));
}

/* ============================================================ *
 * SYNC — scores + standen                                     *
 * ============================================================ */
async function buildSync(u, id, warnings, debug, timeLeft) {
  const sdebug = { matchesWithScores: 0, matchesWithoutScores: 0, groupsFound: 0, jsonEndpointsChecked: debug.jsonEndpointsChecked, scriptsInspected: 0 };
  if (!u || !id) {
    return json({ matches: [], standings: {}, meta: { source: 'tournify', url: u ? u.toString() : '', fetchedVia: 'html-scrape', syncedAt: new Date().toISOString(), warnings, debug: sdebug } });
  }
  // PRIMAIRE BRON — Firestore REST (scores + standen staan in dezelfde collecties).
  let fsData = null;
  if (timeLeft() > 6000) fsData = await fetchFromFirestore(id, warnings, debug, timeLeft);
  const fsUsable = !!(fsData && debug.firestoreUsable);
  let fetchedVia, schedStruct, standStruct;
  if (fsUsable) {
    fetchedVia = 'firestore'; schedStruct = fsData; standStruct = fsData;
  } else {
    const urls = tabUrls(u, id);
    const [schedule, standings] = await Promise.all([
      fetchTab(urls.schedule, warnings, debug),
      timeLeft() > PER_FETCH_TIMEOUT_MS ? fetchTab(urls.standings, warnings, debug) : Promise.resolve({ structured: null, html: '' })
    ]);
    fetchedVia = (schedule.structured || standings.structured) ? 'embedded-json' : 'html-scrape';
    schedStruct = schedule.structured; standStruct = standings.structured;
    if (!schedStruct && !standStruct && timeLeft() > PER_FETCH_TIMEOUT_MS) {
      const api = await tryApiCandidates(u.origin, id, warnings, debug, timeLeft);
      if (api) { schedStruct = api; standStruct = api; fetchedVia = debug.apiUsable ? 'api' : 'json-endpoint'; }
    }
  }

  const matches = parseScoredMatches(schedStruct, warnings, sdebug);
  const standingsObj = parseStandings(standStruct, warnings, sdebug);
  if (!matches.length) warnings.push('Geen wedstrijden met uitslagen gevonden — mogelijk client-side gerenderd');

  return json({ matches, standings: standingsObj, meta: { source: 'tournify', url: u.toString(), fetchedVia, syncedAt: new Date().toISOString(), warnings, debug: sdebug } });
}
function parseScoredMatches(data, warnings, sdebug) {
  const raw = deepFind(data, ['matches', 'games', 'fixtures', 'schedule', 'wedstrijden'], true);
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    let home = teamNameOf(m.home || m.homeTeam || m.thuis || m.teamA || m.team1);
    let away = teamNameOf(m.away || m.awayTeam || m.uit || m.teamB || m.team2);
    if ((!home || !away) && Array.isArray(m.teams) && m.teams.length >= 2) { home = home || teamNameOf(m.teams[0]); away = away || teamNameOf(m.teams[1]); }
    if (!home || !away) continue;
    let sh = numOrNull(firstNonEmpty(m.scoreHome, m.homeScore, m.scoreA, m.goalsHome, m.thuisScore));
    let sa = numOrNull(firstNonEmpty(m.scoreAway, m.awayScore, m.scoreB, m.goalsAway, m.uitScore));
    const scoreStr = S(m.score || m.result || m.uitslag);
    if ((sh == null || sa == null) && /^\d{1,2}\s*[-–:]\s*\d{1,2}$/.test(scoreStr)) {
      const mm = scoreStr.match(/(\d{1,2})\s*[-–:]\s*(\d{1,2})/); if (mm) { sh = Number(mm[1]); sa = Number(mm[2]); }
    }
    const has = sh != null && sa != null;
    if (has) sdebug.matchesWithScores++; else sdebug.matchesWithoutScores++;
    let status = S(m.status || m.state).toLowerCase();
    // Geen expliciete status: alleen 'finished' als er ECHT gespeeld is (score > 0).
    // Een 0-0 zonder status blijft 'scheduled' zodat het niet als gelijkspel telt.
    if (!status) status = (has && (Number(sh) > 0 || Number(sa) > 0)) ? 'finished' : 'scheduled';
    else if (/finish|done|afgelopen|ended|ft/.test(status)) status = 'finished';
    else if (/live|playing|bezig/.test(status)) status = 'live';
    else status = 'scheduled';
    out.push({ importedId: pickId(m, ['id', '_id', 'matchId', 'gameId', 'uid', 'key']), homeTeam: home, awayTeam: away, scoreHome: sh, scoreAway: sa, resultStatus: status, startTime: normDateTime(firstNonEmpty(m.startTime, m.start, m.datetime, m.time, m.tijd)) });
  }
  return out;
}
function parseStandings(data, warnings, sdebug) {
  const groups = deepFind(data, ['standings', 'groups', 'poules', 'pools', 'groepen'], true);
  const result = {};
  const list = Array.isArray(groups) ? groups : [];
  for (const g of list) {
    if (!g || typeof g !== 'object') continue;
    const gname = firstNonEmpty(g.name, g.title, g.group, g.poule, g.naam) || `Poule ${Object.keys(result).length + 1}`;
    const rows = deepFind(g, ['teams', 'standings', 'rows', 'ranking'], true);
    const teams = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      const name = teamNameOf(r.team || r) || firstNonEmpty(r.name, r.teamName); if (!name) continue;
      const gf = numOrNull(firstNonEmpty(r.goalsFor, r.gf, r.for, r.dv, r.voor)) || 0;
      const ga = numOrNull(firstNonEmpty(r.goalsAgainst, r.ga, r.against, r.dt, r.tegen)) || 0;
      teams.push({
        name, played: numOrNull(firstNonEmpty(r.played, r.gp, r.gs, r.gespeeld)) || 0,
        won: numOrNull(firstNonEmpty(r.won, r.w, r.gewonnen)) || 0,
        drawn: numOrNull(firstNonEmpty(r.drawn, r.draw, r.d, r.g, r.gelijk)) || 0,
        lost: numOrNull(firstNonEmpty(r.lost, r.l, r.v, r.verloren)) || 0,
        goalsFor: gf, goalsAgainst: ga,
        goalDifference: numOrNull(firstNonEmpty(r.goalDifference, r.gd, r.ds, r.saldo)) ?? (gf - ga),
        points: numOrNull(firstNonEmpty(r.points, r.pts, r.ptn, r.punten)) || 0, rank: numOrNull(r.rank) || 0
      });
    }
    teams.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
    teams.forEach((t, i) => { if (!t.rank) t.rank = i + 1; });
    if (teams.length) { result[gname] = { teams }; sdebug.groupsFound++; }
  }
  return result;
}
async function handleSyncTournamentResults(body) {
  const warnings = [];
  const debug = { apiChecked: false, apiUsable: false, jsonEndpointsChecked: [], htmlFetched: false, scriptsInspected: 0 };
  const t0 = Date.now(); const timeLeft = () => HARD_DEADLINE_MS - (Date.now() - t0);
  const u = validateAndNormalizeUrl(S(body.url), warnings);
  const id = detectTournamentIdentifier(u, warnings);
  return await buildSync(u, id, warnings, debug, timeLeft);
}

/* ============================================================ *
 * HANDLER 3 — parseToernooiReglement (URL/HTML → regels)      *
 * ============================================================ */
const CATEGORY_RE = /\b((?:J|M)?O\s?-?\s?(?:1[0-9]|2[0-3]|[6-9])|U\s?-?\s?(?:1[0-9]|2[0-3]|[6-9])|onder\s?-?\s?(?:1[0-9]|[6-9]))\b/gi;
const STAGE_WORDS = [
  { re: /\b(poule|groepsfase|groep|voorronde|pool)\b/i, key: 'poule' },
  { re: /\b(kwartfinale)\b/i, key: 'kwartfinale' },
  { re: /\b(halve\s*finale|halvefinale)\b/i, key: 'halve finale' },
  { re: /\b(troostfinale)\b/i, key: 'troostfinale' },
  { re: /\b(kruisfinale)\b/i, key: 'kruisfinale' },
  { re: /\b(finale)\b/i, key: 'finale' },
  { re: /\b(knock-?out|kruis)\b/i, key: 'knock-out' }
];
function normalizeCategory(raw) {
  let s = S(raw).toUpperCase().replace(/\s|-/g, '').replace(/^ONDER/, 'O').replace(/^JO/, 'O').replace(/^MO/, 'MO').replace(/^U/, 'O');
  const m = s.match(/O(\d{1,2})/); return m ? `O${m[1]}` : S(raw);
}
function cleanText(t) { return S(t).replace(/\r/g, '\n').replace(/-\n/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n'); }

function parseRuleBlock(text, category, stage, warnings) {
  const t = text.toLowerCase();
  let numberOfHalves = null, halfDuration = null, matchDuration = null, halftimeBreak = null;
  let extraTime = false, extraTimeDuration = null, penalties = false;

  let m = t.match(/(\d)\s*[x×]\s*(\d{1,3})\s*(?:minuten|min)/);
  if (m) { numberOfHalves = Number(m[1]); halfDuration = Number(m[2]); matchDuration = numberOfHalves * halfDuration; }
  if (halfDuration == null) { m = t.match(/(?:twee|2)\s*helften\s*van\s*(\d{1,3})\s*(?:minuten|min)/); if (m) { numberOfHalves = 2; halfDuration = Number(m[1]); matchDuration = 2 * halfDuration; } }
  if (halfDuration == null) { m = t.match(/(?:speeltijd|per\s*helft)[:\s]*?(\d{1,3})\s*(?:minuten|min)\s*per\s*helft/); if (m) { halfDuration = Number(m[1]); numberOfHalves = numberOfHalves || 2; matchDuration = numberOfHalves * halfDuration; } }
  if (matchDuration == null) { m = t.match(/(?:wedstrijdduur|speelduur|duren)\D{0,12}(\d{1,3})\s*(?:minuten|min)/); if (m) matchDuration = Number(m[1]); }

  m = t.match(/(?:rust(?:tijd)?|pauze)[:\s]*?(\d{1,3})\s*(?:minuten|min)/); if (m) halftimeBreak = Number(m[1]);

  if (/geen\s+(?:sprake\s+van\s+)?(?:extra\s+speeltijd|verlenging)/.test(t)) extraTime = false;
  m = t.match(/verleng\w*\s*(?:met\s*)?(\d)\s*[x×]\s*(\d{1,3})\s*(?:minuten|min)/);
  if (m) { extraTime = true; extraTimeDuration = Number(m[1]) * Number(m[2]); }
  else if (/verlenging/.test(t) && !/geen\s+verlenging/.test(t)) { extraTime = true; }
  if (/strafschoppen|penalty['s]*|penalties/.test(t)) penalties = true;

  return { category: category || null, stage: stage || null, matchDuration, numberOfHalves, halfDuration, halftimeBreak, extraTime, extraTimeDuration, penalties, notes: null };
}
function parseReglementText(rawText, warnings, debug) {
  const text = cleanText(rawText);
  const sentences = text.split(/(?<=[.;\n])\s+/).map(s => s.trim()).filter(Boolean);
  const categoriesDetected = [...new Set((text.match(CATEGORY_RE) || []).map(normalizeCategory))];
  const rules = [], additionalRules = [];
  let patternsMatched = 0; const unmatched = [];

  const stagesPresent = STAGE_WORDS.filter(s => s.re.test(text)).map(s => s.key);
  const cat = categoriesDetected[0] || null;

  const pouleSent = sentences.filter(s => /poule|groepsfase|wedstrijden duren|2\s*[x×]\s*\d/.test(s.toLowerCase()));
  if (pouleSent.length) {
    const blk = parseRuleBlock(pouleSent.join(' '), cat, stagesPresent.includes('poule') ? 'poule' : null, warnings);
    if (/geen\s+(?:sprake\s+van\s+)?extra\s+speeltijd/.test(text.toLowerCase())) blk.extraTime = false;
    if (/strafschoppen/.test(text.toLowerCase())) blk.penalties = true;
    blk.notes = composeNotes(text, 'poule');
    if (blk.matchDuration || blk.halfDuration) { rules.push(blk); patternsMatched++; }
  }
  if (/finale/.test(text.toLowerCase()) && /verleng/.test(text.toLowerCase())) {
    const base = rules[0] ? { ...rules[0] } : parseRuleBlock(text, cat, 'finale', warnings);
    const fm = text.toLowerCase().match(/(\d)\s*[x×]\s*(\d{1,3})\s*(?:minuten|min)\s*verleng/);
    base.stage = 'finale'; base.extraTime = true;
    base.extraTimeDuration = fm ? Number(fm[1]) * Number(fm[2]) : (base.extraTimeDuration || null);
    base.penalties = /strafschoppen/.test(text.toLowerCase());
    base.notes = composeNotes(text, 'finale');
    rules.push(base); patternsMatched++;
  }
  if (!rules.length) {
    const blk = parseRuleBlock(text, cat, stagesPresent[0] || null, warnings);
    if (blk.matchDuration || blk.halfDuration) { rules.push(blk); patternsMatched++; }
    else { warnings.push('Geen wedstrijdduur/rust herkend in de tekst'); unmatched.push(text.slice(0, 200)); }
  }

  if (/onbeperkt\s+wisselen|doorwisselen/i.test(text)) additionalRules.push({ type: 'substitutions', value: 'onbeperkt, doorwisselen toegestaan', category: null });
  const knvb = text.match(/KNVB\s+spelregels(?:\s+voor)?\s*(?:U|O)?\s?\d{0,2}/i); if (knvb) additionalRules.push({ type: 'ruleSet', value: S(knvb[0]), category: null });
  const poules = text.match(/(\d+)\s*poules?\s*van\s*(\d+)/i); if (poules) additionalRules.push({ type: 'format', value: S(poules[0]) + (/(kruisfinale|kruis)/i.test(text) ? ', kruisfinales' : ''), category: null });
  const age = text.match(/geboren\s+(?:op of\s+)?na\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/i); if (age) { additionalRules.push({ type: 'ageRequirement', value: S(age[0]).slice(0, 160), category: null }); patternsMatched++; }
  if (/2\s*x?\s*geel|tweede\s+gele/i.test(text)) additionalRules.push({ type: 'yellowCards', value: '2x geel = rood', category: null });
  if (/rode?\s*kaart/i.test(text)) additionalRules.push({ type: 'redCard', value: 'uitsluiting + mogelijke schorsing', category: null });

  debug.patternsMatched = patternsMatched; debug.unmatchedSections = unmatched;
  return { rules, additionalRules, categoriesDetected };
}
function composeNotes(text, stage) {
  const notes = [];
  const lt = text.toLowerCase();
  if (/geen\s+(?:sprake\s+van\s+)?extra\s+speeltijd/.test(lt)) notes.push('Geen extra speeltijd.');
  if (stage === 'poule' && /strafschoppen/.test(lt)) notes.push('Strafschoppen bij gelijke stand op zondag.');
  if (stage === 'finale' && /verleng/.test(lt)) notes.push('Verlenging 2x5 minuten alleen in finale.');
  return notes.length ? notes.join(' ') : null;
}
function htmlToText(html) {
  return S(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&[a-z]+;/gi, ' '));
}
function validateUrlGeneric(raw, warnings) {
  try { const u = new URL(S(raw).includes('://') ? raw : 'https://' + raw); if (!/^https?:$/.test(u.protocol)) { warnings.push('Geen http(s)-URL'); return null; } return u; }
  catch (_) { warnings.push('Reglement-URL kon niet worden geparsed'); return null; }
}
async function handleParseToernooiReglement(body) {
  const warnings = [];
  const debug = { patternsMatched: 0, unmatchedSections: [] };
  let rawText = '', source = 'url', srcUrl = null, filename = null;

  if (S(body.pdfBase64)) {
    // Workers heeft geen Node-PDF-parser. URL-reglementen werken volledig;
    // voor een PDF vragen we de gebruiker de online reglement-URL te plakken.
    source = 'pdf'; filename = SorNull(body.filename);
    warnings.push('PDF-reglementen worden door de gratis Cloudflare-functie niet gelezen. Plak in plaats daarvan de reglement-URL (de webpagina met het reglement), dan worden de regels wél automatisch herkend.');
    return json({ rules: [], additionalRules: [], meta: { source, url: null, filename, warnings, rawTextLength: 0, rulesFound: 0, categoriesDetected: [], debug } });
  } else if (S(body.url)) {
    source = 'url'; srcUrl = S(body.url);
    const u = validateUrlGeneric(srcUrl, warnings);
    if (u) {
      try {
        const r = await fetchWithTimeout(u.toString(), { headers: { 'Accept': 'text/html,application/pdf' } });
        const ct = S(r.headers.get('content-type'));
        if (/pdf/i.test(ct)) {
          warnings.push('De URL wijst naar een PDF; de gratis Cloudflare-functie leest geen PDF. Plak de HTML-reglementpagina (geen .pdf-link) voor automatische herkenning.');
        } else { rawText = htmlToText(await r.text()); }
      } catch (err) { warnings.push('Bron kon niet worden opgehaald: ' + (err.message || err)); }
    }
  } else { warnings.push('Geen url of pdfBase64 meegegeven'); }

  if (!rawText) {
    return json({ rules: [], additionalRules: [], meta: { source, url: srcUrl, filename, warnings: warnings.concat('Geen leesbare tekst uit de bron'), rawTextLength: 0, rulesFound: 0, categoriesDetected: [], debug } });
  }
  const parsed = parseReglementText(rawText, warnings, debug);
  return json({
    rules: parsed.rules, additionalRules: parsed.additionalRules,
    meta: { source, url: srcUrl, filename, warnings, rawTextLength: rawText.length, rulesFound: parsed.rules.length, categoriesDetected: parsed.categoriesDetected, debug }
  });
}

/* ============================================================ *
 * ROUTER — één Worker, drie paden                            *
 * ============================================================ */
const ROUTES = '/parse | /sync | /reglement';

/* ============================================================ *
 * FASE 1+ — Toegang aanvragen · account aanmaken · mailing.
 * Beveiligd: Cloudflare Turnstile, honeypot, rate-limit (KV),
 * dedup, server-side validatie. Accountcreatie via service-account
 * (vertrouwd serverpad). ALLE config via env — geen secrets in code.
 *
 * Benodigde env/secrets (zet via `wrangler secret` / dashboard):
 *   SERVICE_ACCOUNT_JSON  (secret)  service-account JSON, project database-scouting
 *   FB_API_KEY            (secret)  web-apiKey database-scouting (Identity Toolkit)
 *   TURNSTILE_SECRET      (secret)  Cloudflare Turnstile secret
 *   RESEND_API_KEY        (secret)  Resend API key
 *   RATE_LIMIT            (KV)      KV-namespace voor rate-limit
 *   CONTACT_FROM, ADMIN_FROM, ADMIN_NOTIFY_TO, CONTACT_EMAIL,
 *   APP_URL, ADMIN_EMAILS (vars)
 *
 * LET OP: deploy deze worker pas nadat bovenstaande env/secrets staan.
 * Zonder TURNSTILE_SECRET/SERVICE_ACCOUNT_JSON faalt request-access
 * bewust (fail-closed) — houd de huidige worker live tot alles staat.
 * ============================================================ */
const SH_FB = { projectId: 'database-scouting' };

function cfg(env, key, fb){ return (env && env[key] != null && String(env[key]).length) ? String(env[key]) : fb; }
function appBaseUrl(env){ return cfg(env, 'SITE_URL', cfg(env, 'APP_ORIGIN', cfg(env, 'APP_URL', 'https://www.scoutinghub.nl'))).replace(/\/+$/, ''); }
function contactFrom(env){ return cfg(env, 'CONTACT_FROM', 'ScoutingHub <contact@scoutinghub.nl>'); }
function adminFrom(env){ return cfg(env, 'ADMIN_FROM', 'ScoutingHub Beheer <admin@scoutinghub.nl>'); }
function adminNotifyTo(env){ return cfg(env, 'ADMIN_NOTIFY_TO', '').split(',').map(s=>s.trim()).filter(Boolean); }
function contactEmail(env){ return cfg(env, 'CONTACT_EMAIL', 'contact@scoutinghub.nl'); }
function feedbackNotifyTo(env){ const v = cfg(env, 'FEEDBACK_NOTIFY_TO', ''); return v || contactEmail(env); }
function fbApiKey(env){ return cfg(env, 'FB_API_KEY', ''); }
function adminEmails(env){ return cfg(env, 'ADMIN_EMAILS', '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean); }

/* ---- validatie / escaping ---- */
function shValidEmail(e){ return typeof e==='string' && e.length>3 && e.length<200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function shEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function clip(s, n){ return String(s==null?'':s).trim().slice(0, n); }

/* ---- Cloudflare Turnstile (fail-closed) ---- */
async function verifyTurnstile(env, token, ip){
  const secret = env && env.TURNSTILE_SECRET;
  if(!secret) return { ok:false, reason:'no-secret' };
  if(!token) return { ok:false, reason:'no-token' };
  try{
    const form = new URLSearchParams();
    form.set('secret', secret); form.set('response', String(token)); if(ip) form.set('remoteip', ip);
    const r = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method:'POST', body: form });
    const j = await r.json();
    return { ok: !!(j && j.success) };
  } catch(_){ return { ok:false, reason:'verify-error' }; }
}

/* ---- rate-limit (KV, best-effort) ---- */
async function rateLimit(env, key, limit, windowSec){
  const kv = env && env.RATE_LIMIT;
  if(!kv) return { ok:true, skipped:true };
  try{
    const k = 'rl:'+key;
    const cur = await kv.get(k);
    const n = cur ? parseInt(cur,10) : 0;
    if(n >= limit) return { ok:false };
    await kv.put(k, String(n+1), { expirationTtl: windowSec });
    return { ok:true };
  } catch(_){ return { ok:true, error:true }; }
}

/* ---- service-account OAuth2 (RS256 JWT -> access token) ---- */
let _saTokenCache = null;
function _pemToBuf(pem){
  const b64 = pem.replace(/-----BEGIN [^-]+-----/,'').replace(/-----END [^-]+-----/,'').replace(/\s+/g,'');
  const bin = atob(b64); const buf = new ArrayBuffer(bin.length); const v = new Uint8Array(buf);
  for(let i=0;i<bin.length;i++) v[i] = bin.charCodeAt(i);
  return buf;
}
function _b64urlBytes(buf){ let s=''; const v=new Uint8Array(buf); for(let i=0;i<v.length;i++) s+=String.fromCharCode(v[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _b64urlStr(str){ return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function getServiceAccountToken(env){
  const nowSec = Math.floor(Date.now()/1000);
  if(_saTokenCache && _saTokenCache.exp - 60 > nowSec) return _saTokenCache.token;
  const raw = env && env.SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error('sa-missing');
  const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const scope = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase';
  const header = { alg:'RS256', typ:'JWT' };
  const claim = { iss: sa.client_email, scope, aud:'https://oauth2.googleapis.com/token', iat: nowSec, exp: nowSec+3600 };
  const unsigned = _b64urlStr(JSON.stringify(header)) + '.' + _b64urlStr(JSON.stringify(claim));
  const key = await crypto.subtle.importKey('pkcs8', _pemToBuf(sa.private_key), { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + '.' + _b64urlBytes(sig);
  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+encodeURIComponent(jwt) });
  const j = await res.json();
  if(!j || !j.access_token) throw new Error('sa-token-failed');
  _saTokenCache = { token: j.access_token, exp: nowSec + (j.expires_in||3600) };
  return _saTokenCache.token;
}

/* ---- Firestore REST met service-account Bearer ---- */
function _fsv(v){
  if(v===null || v===undefined) return { nullValue:null };
  if(v && v.__ts) return { timestampValue: v.__ts };
  if(typeof v==='boolean') return { booleanValue: v };
  if(typeof v==='number') return Number.isInteger(v) ? { integerValue:String(v) } : { doubleValue:v };
  return { stringValue:String(v) };
}
function _fsFieldsOut(obj){ const f={}; for(const k of Object.keys(obj)) f[k]=_fsv(obj[k]); return { fields:f }; }
function TS(iso){ return { __ts: iso }; }
function _fsBase(){ return 'https://firestore.googleapis.com/v1/projects/'+SH_FB.projectId+'/databases/(default)/documents'; }
async function saFsCreate(token, collection, obj){
  const r = await fetchWithTimeout(_fsBase()+'/'+collection, { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(_fsFieldsOut(obj)) });
  if(!r.ok) return null;
  const j = await r.json(); return (j && j.name) ? j.name.split('/').pop() : null;
}
async function saFsPatch(token, path, obj){
  const mask = Object.keys(obj).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
  const r = await fetchWithTimeout(_fsBase()+'/'+path+'?'+mask, { method:'PATCH', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(_fsFieldsOut(obj)) });
  return r.ok;
}
async function saFsGet(token, path){
  const r = await fetchWithTimeout(_fsBase()+'/'+path, { headers:{ Authorization:'Bearer '+token } });
  if(!r.ok) return null;
  const j = await r.json(); return (j && j.fields) ? fsFields(j.fields) : null;
}
async function saFsList(token, collectionPath, pageSize){
  const out = []; let pageToken = '';
  for(let i=0;i<10;i++){
    const url = _fsBase()+'/'+collectionPath+'?pageSize='+(pageSize||300)+(pageToken?('&pageToken='+encodeURIComponent(pageToken)):'');
    try {
      const r = await fetchWithTimeout(url, { headers:{ Authorization:'Bearer '+token } });
      if(!r.ok) break;
      const j = await r.json();
      for(const d of (j.documents||[])){ const o = fsFields(d.fields||{}); if(d.name){ o.id = d.name.split('/').pop(); } out.push(o); }
      pageToken = j.nextPageToken||''; if(!pageToken) break;
    } catch(_){ break; }
  }
  return out;
}
async function saFsCount(token, parentPath, collectionId){
  const url = _fsBase()+(parentPath?('/'+parentPath):'')+':runAggregationQuery';
  const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId }] }, aggregations: [{ alias:'c', count:{} }] } };
  try {
    const r = await fetchWithTimeout(url, { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if(!r.ok) return 0; const j = await r.json();
    for(const row of (Array.isArray(j)?j:[])){ const af = row && row.result && row.result.aggregateFields; if(af && af.c) return Number(af.c.integerValue||0); }
    return 0;
  } catch(_){ return 0; }
}
async function saFsCountGroup(token, collectionId){
  const url = _fsBase()+':runAggregationQuery';
  const body = { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId, allDescendants: true }] }, aggregations: [{ alias:'c', count:{} }] } };
  try {
    const r = await fetchWithTimeout(url, { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if(!r.ok) return 0; const j = await r.json();
    for(const row of (Array.isArray(j)?j:[])){ const af = row && row.result && row.result.aggregateFields; if(af && af.c) return Number(af.c.integerValue||0); }
    return 0;
  } catch(_){ return 0; }
}
async function saFsPendingExists(token, email){
  const body = { structuredQuery:{ from:[{collectionId:'access_requests'}], where:{ compositeFilter:{ op:'AND', filters:[
    { fieldFilter:{ field:{fieldPath:'email'}, op:'EQUAL', value:{stringValue:email} } },
    { fieldFilter:{ field:{fieldPath:'status'}, op:'EQUAL', value:{stringValue:'pending'} } }
  ]}}, limit:1 } };
  const r = await fetchWithTimeout(_fsBase()+':runQuery', { method:'POST', headers:{ Authorization:'Bearer '+token, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if(!r.ok) return false;
  const j = await r.json();
  return Array.isArray(j) && j.some(row=>row && row.document);
}

/* ---- Identity Toolkit (token-verificatie + account aanmaken) ---- */
async function verifyCallerToken(env, idToken){
  const apiKey = fbApiKey(env);
  if(!apiKey || !idToken) return null;
  const r = await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+apiKey, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken }) });
  if(!r.ok) return null;
  const j = await r.json(); const u = j && j.users && j.users[0];
  if(!u || !u.localId) return null;
  return { uid: u.localId, email: String(u.email||'').toLowerCase(), emailVerified: !!u.emailVerified };
}
async function isCallerAdmin(env, saToken, caller){
  if(!caller) return false;
  if(adminEmails(env).includes(caller.email)) return true;
  try { const u = await saFsGet(saToken, 'users/'+caller.uid); return !!(u && u.role==='admin'); } catch(_){ return false; }
}
function _genPassword(){ const a=new Uint8Array(24); crypto.getRandomValues(a); return 'Sh!'+_b64urlBytes(a.buffer).slice(0,28)+'7'; }
async function createAuthUser(env, email){
  const apiKey = fbApiKey(env);
  const r = await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+apiKey, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password:_genPassword(), returnSecureToken:true }) });
  const j = await r.json();
  if(!r.ok) return { error: (j && j.error && j.error.message) || 'signup-failed' };
  return { uid: j.localId };
}
async function deleteAuthUser(saToken, uid){
  try { await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/projects/'+SH_FB.projectId+'/accounts:delete', { method:'POST', headers:{ Authorization:'Bearer '+saToken, 'Content-Type':'application/json' }, body: JSON.stringify({ localId: uid }) }); } catch(_){}
}
async function genResetLink(saToken, email){
  try {
    const r = await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', { method:'POST', headers:{ Authorization:'Bearer '+saToken, 'Content-Type':'application/json' }, body: JSON.stringify({ requestType:'PASSWORD_RESET', email, returnOobLink:true }) });
    if(!r.ok) return null; const j = await r.json(); return (j && j.oobLink) ? j.oobLink : null;
  } catch(_){ return null; }
}
function _resetUrl(env, oobLink){
  if(!oobLink) return '';
  try { const u = new URL(oobLink); const code = u.searchParams.get('oobCode'); const mode = u.searchParams.get('mode') || 'resetPassword'; if(code) return appBaseUrl(env) + '/wachtwoord.html?mode=' + encodeURIComponent(mode) + '&oobCode=' + encodeURIComponent(code); } catch(_){}
  return oobLink;
}

async function lookupUidByEmail(saToken, email){
  try {
    const r = await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method:'POST', headers:{ Authorization:'Bearer '+saToken, 'Content-Type':'application/json' }, body: JSON.stringify({ email:[email] }) });
    if(!r.ok) return null; const j = await r.json(); const u = j && j.users && j.users[0]; return (u && u.localId) ? u.localId : null;
  } catch(_){ return null; }
}
async function enableAuthUser(saToken, uid){
  try { await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/accounts:update', { method:'POST', headers:{ Authorization:'Bearer '+saToken, 'Content-Type':'application/json' }, body: JSON.stringify({ localId: uid, disableUser:false }) }); } catch(_){}
}
async function disableAuthUser(saToken, uid){
  try { await fetchWithTimeout('https://identitytoolkit.googleapis.com/v1/accounts:update', { method:'POST', headers:{ Authorization:'Bearer '+saToken, 'Content-Type':'application/json' }, body: JSON.stringify({ localId: uid, disableUser:true }) }); } catch(_){}
}

/* ---- Mailmodule (huisstijl) ---- */
const MAIL_P = 'margin:0 0 14px;font-size:15px;line-height:1.65;color:#334155;';
const MAIL_MUTED = 'margin:0 0 14px;font-size:14px;line-height:1.6;color:#64748b;';
const MAIL_H = 'margin:16px 0 6px;font-size:15px;font-weight:700;color:#0f172a;';
function ctaButton(text, url){
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td align="center" style="border-radius:8px;background:#e30613;"><a href="'+url+'" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:8px;">'+text+'</a></td></tr></table>';
}
function mailShell(env, title, bodyHtml){
  const base = appBaseUrl(env); const ce = contactEmail(env); const host = base.replace(/^https?:\/\//,'');
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;color:#0f172a;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:28px 14px;"><tr><td align="center">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">'
    + '<tr><td style="background:#10151e;padding:22px 32px;"><span style="font-size:22px;font-weight:800;letter-spacing:-.01em;color:#ffffff;">Scouting<span style="color:#e30613;">Hub</span></span></td></tr>'
    + '<tr><td style="padding:30px 32px 8px;"><h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:#0f172a;font-weight:700;">'+title+'</h1>'+bodyHtml+'</td></tr>'
    + '<tr><td style="padding:18px 32px 26px;border-top:1px solid #eef1f5;color:#64748b;font-size:12px;line-height:1.7;">'
    + 'ScoutingHub &middot; <a href="'+base+'" style="color:#2563eb;text-decoration:none;">'+host+'</a> &middot; <a href="mailto:'+ce+'" style="color:#2563eb;text-decoration:none;">'+ce+'</a><br>'
    + '<a href="'+base+'/privacy.html" style="color:#94a3b8;text-decoration:none;">Privacy</a> &middot; <a href="'+base+'/voorwaarden.html" style="color:#94a3b8;text-decoration:none;">Voorwaarden</a></td></tr>'
    + '</table></td></tr></table></body></html>';
}
async function sendMail(env, opts){
  if(!env || !env.RESEND_API_KEY) return false;
  try {
    const payload = { from: opts.from, to: Array.isArray(opts.to)?opts.to:[opts.to], subject: opts.subject, html: opts.html };
    if(opts.text) payload.text = opts.text;
    if(opts.replyTo) payload.reply_to = opts.replyTo;
    if(opts.attachments) payload.attachments = opts.attachments;
    const r = await fetchWithTimeout('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:'Bearer '+env.RESEND_API_KEY, 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    return r.ok;
  } catch(_){ return false; }
}

/* ---- Mail-builders (ScoutingHub-huisstijl) ---- */
async function sendConfirmationMail(env, d){
  const body = '<p style="'+MAIL_P+'">Hallo '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Bedankt voor je interesse in ScoutingHub. We hebben je aanvraag ontvangen en beoordelen elke aanvraag handmatig. Je hoort van ons zodra deze is verwerkt.</p>'
    + '<div style="margin:4px 0 16px;padding:14px 16px;background:#f6f8fb;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.8;color:#334155;">'
      + '<strong style="color:#0f172a;">Je aanvraag</strong><br>Naam: '+shEsc(d.name||'')+'<br>E-mail: '+shEsc(d.email||'')+'<br>Club: '+shEsc(d.club||'')+'<br>Functie: '+shEsc(d.functie||'')+'</div>'
    + '<p style="'+MAIL_MUTED+'">Vragen? Mail <a href="mailto:'+contactEmail(env)+'" style="color:#2563eb;">'+contactEmail(env)+'</a>.</p>';
  const text = 'Hallo '+(d.name||'')+',\n\nBedankt voor je interesse in ScoutingHub. We hebben je aanvraag ontvangen en beoordelen deze handmatig. Je hoort van ons zodra deze is verwerkt.\n\nGegevens: '+(d.name||'')+' / '+(d.email||'')+' / '+(d.club||'')+' / '+(d.functie||'')+'\n\nVragen? '+contactEmail(env);
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Je aanvraag voor ScoutingHub is ontvangen', html: mailShell(env,'Je aanvraag is ontvangen',body), text });
}
async function sendAdminNotifyMail(env, d){
  const to = adminNotifyTo(env); if(!to.length) return false;
  const base = appBaseUrl(env);
  const body = '<p style="'+MAIL_P+'">Er is een nieuwe toegangsaanvraag binnengekomen.</p>'
    + '<div style="margin:2px 0 14px;padding:14px 16px;background:#f6f8fb;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.8;color:#0f172a;">'
      + '<span style="color:#64748b;">Naam</span> &nbsp; '+shEsc(d.name||'')+'<br>'
      + '<span style="color:#64748b;">E-mail</span> &nbsp; '+shEsc(d.email||'')+'<br>'
      + '<span style="color:#64748b;">Club</span> &nbsp; '+shEsc(d.club||'')+'<br>'
      + '<span style="color:#64748b;">Functie</span> &nbsp; '+shEsc(d.functie||'')+'<br>'
      + '<span style="color:#64748b;">Motivatie</span> &nbsp; '+shEsc(d.message||'—')+'<br>'
      + '<span style="color:#64748b;">Aangevraagd</span> &nbsp; '+shEsc(d.requestedAt||'')+'</div>'
    + ctaButton('Open Beheer', base)
    + '<p style="'+MAIL_MUTED+'">Beoordeel in Beheer: kies rol en team, en keur goed of wijs af.</p>';
  return sendMail(env, { from: adminFrom(env), to, replyTo: contactEmail(env), subject:'Nieuwe toegangsaanvraag — ScoutingHub', html: mailShell(env,'Nieuwe toegangsaanvraag',body) });
}
async function sendWelcomeMail(env, d){
  const base = appBaseUrl(env);
  const roleLabel = d.role === 'coordinator' ? 'Coördinator' : 'Scout';
  const cta = '<p style="'+MAIL_P+'">Stel eerst je wachtwoord in en log daarna direct in:</p>' + ctaButton('Wachtwoord instellen & inloggen', d.resetUrl || base);
  const teamLine = d.teamName
    ? '<p style="'+MAIL_P+'">Je rol: <strong>'+roleLabel+'</strong> &middot; Team: <strong>'+shEsc(d.teamName)+'</strong></p>'
    : '<p style="'+MAIL_P+'">Je rol: <strong>'+roleLabel+'</strong> &middot; je werkt als <strong>individuele scout</strong> (geen team).</p>';
  const steps = '<p style="'+MAIL_H+'">Zo start je</p>'
    + '<ol style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">'
    + '<li>Controleer je profiel</li><li>Voeg je eerste speler toe</li><li>Zet een wedstrijd in je programma</li><li>Gebruik het live-dashboard tijdens de wedstrijd</li></ol>';
  const tips = '<p style="'+MAIL_H+'">Tips</p>'
    + '<ul style="margin:0 0 14px;padding-left:20px;font-size:14px;line-height:1.8;color:#334155;">'
    + '<li>Observeer kort en concreet; werk met live-aantekeningen tijdens de wedstrijd.</li>'
    + '<li>Rond rapporten direct na de wedstrijd af.</li>'
    + '<li>Installeer ScoutingHub als app (PWA) op je telefoon of tablet.</li>'
    + '<li>Ga zorgvuldig om met persoonsgegevens en notities.</li></ul>';
  const body = '<p style="'+MAIL_P+'">Welkom '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Je toegang tot ScoutingHub is goedgekeurd en je account staat klaar.</p>'
    + cta + teamLine + steps + tips
    + '<p style="'+MAIL_MUTED+'">Meer weten? Bekijk de <a href="'+base+'/handleiding.html" style="color:#2563eb;">handleiding</a>. Vragen? Mail <a href="mailto:'+contactEmail(env)+'" style="color:#2563eb;">'+contactEmail(env)+'</a>.</p>';
  const text = 'Welkom '+(d.name||'')+',\n\nJe toegang tot ScoutingHub is goedgekeurd. Rol: '+roleLabel+(d.teamName?(' / Team: '+d.teamName):' (individuele scout)')+'.\n\n'+('Stel je wachtwoord in: '+(d.resetUrl||base))+'\n\nHandleiding: '+base+'/handleiding.html\nVragen? '+contactEmail(env);
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Welkom bij ScoutingHub — je account is klaar', html: mailShell(env,'Welkom bij ScoutingHub',body), text });
}
async function sendRejectMail(env, d){
  const body = '<p style="'+MAIL_P+'">Hallo '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Bedankt voor je interesse in ScoutingHub. We kunnen je aanvraag op dit moment helaas niet goedkeuren.</p>'
    + '<p style="'+MAIL_MUTED+'">Heb je vragen? Je kunt ons bereiken via <a href="mailto:'+contactEmail(env)+'" style="color:#2563eb;">'+contactEmail(env)+'</a>.</p>'
    + '<p style="'+MAIL_P+'">Met vriendelijke groet,<br>ScoutingHub</p>';
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Je aanvraag voor ScoutingHub', html: mailShell(env,'Je aanvraag voor ScoutingHub',body) });
}
async function sendDeactivationMail(env, d){
  const body = '<p style="'+MAIL_P+'">Hallo '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Je toegang tot ScoutingHub is door de beheerder <strong>tijdelijk gedeactiveerd</strong>. Je kunt op dit moment niet inloggen.</p>'
    + '<p style="'+MAIL_P+'">Je gegevens blijven bewaard. Zodra je toegang weer wordt geactiveerd, ontvang je daarvan bericht.</p>'
    + '<p style="'+MAIL_MUTED+'">Vragen? Mail <a href="mailto:'+contactEmail(env)+'" style="color:#2563eb;">'+contactEmail(env)+'</a>.</p>';
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Je toegang tot ScoutingHub is gedeactiveerd', html: mailShell(env,'Toegang gedeactiveerd',body) });
}
async function sendReactivationMail(env, d){
  const base = appBaseUrl(env);
  const body = '<p style="'+MAIL_P+'">Hallo '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Goed nieuws: je toegang tot ScoutingHub is weer <strong>geactiveerd</strong>. Je kunt weer inloggen.</p>'
    + ctaButton('Inloggen', base)
    + '<p style="'+MAIL_MUTED+'">Vragen? Mail <a href="mailto:'+contactEmail(env)+'" style="color:#2563eb;">'+contactEmail(env)+'</a>.</p>';
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Je toegang tot ScoutingHub is weer actief', html: mailShell(env,'Toegang weer actief',body) });
}
async function sendDeletionMail(env, d){
  const base = appBaseUrl(env);
  const body = '<p style="'+MAIL_P+'">Hallo '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Je account bij ScoutingHub is <strong>verwijderd</strong> door de beheerder. Je hebt geen toegang meer tot het platform.</p>'
    + '<p style="'+MAIL_P+'">Wil je in de toekomst weer toegang? Dien dan opnieuw een aanvraag in via de website.</p>'
    + ctaButton('Opnieuw toegang aanvragen', base)
    + '<p style="'+MAIL_MUTED+'">Vragen? Mail <a href="mailto:'+contactEmail(env)+'" style="color:#2563eb;">'+contactEmail(env)+'</a>.</p>';
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Je ScoutingHub-account is verwijderd', html: mailShell(env,'Account verwijderd',body) });
}

/* ============================================================ *
 * HANDLER — request-access (beveiligd)
 * ============================================================ */
async function handleRequestAccess(body, env, request){
  const ip = (request && request.headers && request.headers.get('CF-Connecting-IP')) || '0.0.0.0';
  // 1) honeypot: stil slikken met neutrale respons
  if(clip(body.website || body.companyUrl || '', 200)) return json({ ok:true });
  // 2) Turnstile
  const ts = await verifyTurnstile(env, body.turnstileToken || body.cfTurnstileToken, ip);
  if(!ts.ok) return json({ ok:false, error:'Verificatie mislukt. Vernieuw de pagina en probeer het opnieuw.' });
  // 3) validatie (server-side; frontend nooit vertrouwen)
  const email = clip(String(body.email||'').toLowerCase(), 200);
  const name = clip(body.name, 120), club = clip(body.club, 160), functie = clip(body.functie, 80), message = clip(body.message, 1000);
  const acceptedTerms = body.acceptedTerms === true || body.acceptedTerms === 'true';
  const newsletterOptIn = body.newsletterOptIn === true || body.newsletterOptIn === 'true';
  if(!name) return json({ ok:false, error:'Vul je naam in.' });
  if(!shValidEmail(email)) return json({ ok:false, error:'Dit is geen geldig e-mailadres.' });
  if(!club) return json({ ok:false, error:'Vul je club of organisatie in.' });
  if(!functie) return json({ ok:false, error:'Kies je functie.' });
  if(!acceptedTerms) return json({ ok:false, error:'Accepteer eerst de voorwaarden.' });
  // 4) rate-limit per IP en per e-mail
  const rlIp = await rateLimit(env, 'ip:'+ip, 5, 3600);
  const rlEmail = await rateLimit(env, 'em:'+email, 3, 86400);
  if(!rlIp.ok || !rlEmail.ok) return json({ ok:false, error:'Er zijn al meerdere aanvragen ontvangen. Probeer het later opnieuw.' });
  // 5) service-account (vertrouwd schrijfpad — blijft werken na rules-flip)
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ saToken = null; }
  if(!saToken) return json({ ok:false, error:'De server is even niet beschikbaar. Probeer het later opnieuw.' });
  // 6) dedup
  try { if(await saFsPendingExists(saToken, email)) return json({ ok:true, deduped:true, message:'Er is al een aanvraag ontvangen of recent ingediend. Je ontvangt bericht zodra deze is verwerkt.' }); } catch(_){}
  // 7) schrijven
  const nowIso = new Date().toISOString();
  const docObj = { email, name, club, functie, message, acceptedTerms:true, acceptedTermsAt: TS(nowIso), newsletterOptIn,
    status:'pending', source:'public_request_form', requestedAt: TS(nowIso),
    reviewedAt:null, reviewedBy:null, approvedAt:null, approvedBy:null, rejectedAt:null, rejectedBy:null,
    assignedRole:null, authUid:null, teamId:null, teamName:null };
  const reqId = await saFsCreate(saToken, 'access_requests', docObj);
  if(!reqId) return json({ ok:false, error:'Er ging iets mis bij het opslaan. Probeer het later opnieuw.' });
  // 8) mails (pas na succesvolle write)
  const m1 = await sendConfirmationMail(env, { name, email, club, functie });
  const m2 = await sendAdminNotifyMail(env, { name, email, club, functie, message, requestedAt: nowIso, requestId: reqId });
  return json({ ok:true, saved:true, mailSent: !!m1, adminNotified: !!m2 });
}

/* ============================================================ *
 * HANDLER — create-account (admin, service-account)
 * ============================================================ */
async function handleCreateAccount(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500); }
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const role = String(body.role||'');
  if(role!=='scout' && role!=='coordinator') return json({ ok:false, error:'Ongeldige rol' }, 400);
  const reqId = clip(body.accessRequestId, 200);
  if(!reqId) return json({ ok:false, error:'Aanvraag-id ontbreekt' }, 400);
  const teamId = clip(body.teamId, 120), teamName = clip(body.teamName, 160);
  if(role === 'coordinator' && (!teamId || !teamName)) return json({ ok:false, error:'Een co\u00f6rdinator moet aan een team gekoppeld worden' }, 400);
  const reqDoc = await saFsGet(saToken, 'access_requests/'+reqId);
  if(!reqDoc) return json({ ok:false, error:'Aanvraag niet gevonden' }, 404);
  if(reqDoc.status !== 'pending') return json({ ok:false, error:'Aanvraag is al verwerkt' }, 409);
  const email = String(reqDoc.email||'').toLowerCase();
  if(!shValidEmail(email)) return json({ ok:false, error:'Aanvraag heeft geen geldig e-mailadres' }, 400);
  // account aanmaken — of een bestaand VERWIJDERD/inactief account hergebruiken
  let uid, _fresh = true;
  const created = await createAuthUser(env, email);
  if(created.error){
    if(/EMAIL_EXISTS/.test(created.error)){
      const existingUid = await lookupUidByEmail(saToken, email);
      if(!existingUid) return json({ ok:false, error:'Er bestaat al een account met dit e-mailadres' }, 409);
      const existingProfile = await saFsGet(saToken, 'users/'+existingUid);
      const profileActive = existingProfile && existingProfile.status !== 'deleted' && existingProfile.isActive !== false;
      if(profileActive) return json({ ok:false, error:'Er bestaat al een actief account met dit e-mailadres' }, 409);
      await enableAuthUser(saToken, existingUid);
      uid = existingUid; _fresh = false;
    } else {
      return json({ ok:false, error:'Account aanmaken mislukt' }, 500);
    }
  } else {
    uid = created.uid;
  }
  const nowIso = new Date().toISOString();
  const nm = clip(reqDoc.name, 120) || '';
  const ok1 = await saFsPatch(saToken, 'users/'+uid, { uid, email, name: nm, displayName: nm, role, teamId, teamName, isActive:true, status:'active', createdAt: TS(nowIso), createdBy: caller.uid, source:'access_request', accessRequestId: reqId, deletedAt:null, deletedBy:null });
  if(!ok1){ if(_fresh) await deleteAuthUser(saToken, uid); return json({ ok:false, error:'Profiel aanmaken mislukt' + (_fresh?' \u2014 account teruggedraaid':'') }, 500); }
  const ok2 = await saFsPatch(saToken, 'access_requests/'+reqId, { status:'approved', authUid: uid, assignedRole: role, teamId, teamName, reviewedAt: TS(nowIso), reviewedBy: caller.uid, approvedAt: TS(nowIso), approvedBy: caller.uid });
  // welkomstmail (account bestaat al; mailfout draait niets terug)
  let resetUrl = '';
  try { const _ob = await genResetLink(saToken, email); resetUrl = _resetUrl(env, _ob); } catch(_){}
  const mailSent = await sendWelcomeMail(env, { email, name: nm, role, teamName, resetUrl });
  return json({ ok:true, uid, role, requestUpdated: !!ok2, mailSent });
}

/* ============================================================ *
 * HANDLER — reject-request (admin, optionele mail)
 * ============================================================ */
async function handleRejectRequest(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500); }
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const reqId = clip(body.accessRequestId, 200);
  if(!reqId) return json({ ok:false, error:'Aanvraag-id ontbreekt' }, 400);
  const reqDoc = await saFsGet(saToken, 'access_requests/'+reqId);
  if(!reqDoc) return json({ ok:false, error:'Aanvraag niet gevonden' }, 404);
  if(reqDoc.status !== 'pending') return json({ ok:false, error:'Aanvraag is al verwerkt' }, 409);
  const nowIso = new Date().toISOString();
  const ok = await saFsPatch(saToken, 'access_requests/'+reqId, { status:'rejected', reviewedAt: TS(nowIso), reviewedBy: caller.uid, rejectedAt: TS(nowIso), rejectedBy: caller.uid });
  if(!ok) return json({ ok:false, error:'Bijwerken mislukt' }, 500);
  let mailSent = false;
  if(body.notify === true || body.notify === 'true'){
    const email = String(reqDoc.email||'').toLowerCase();
    if(shValidEmail(email)) mailSent = await sendRejectMail(env, { email, name: clip(reqDoc.name,120) });
  }
  return json({ ok:true, mailSent });
}

async function handleDeleteAccount(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500); }
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const uid = clip(body.uid, 200);
  if(!uid) return json({ ok:false, error:'Gebruiker-id ontbreekt' }, 400);
  if(uid === caller.uid) return json({ ok:false, error:'Je kunt je eigen account niet verwijderen' }, 400);
  const prof = await saFsGet(saToken, 'users/'+uid);
  if(prof && prof.role === 'admin') return json({ ok:false, error:'Admin-accounts kunnen niet verwijderd worden' }, 400);
  await deleteAuthUser(saToken, uid);
  const nowIso = new Date().toISOString();
  await saFsPatch(saToken, 'users/'+uid, { status:'deleted', isActive:false, deletedAt: TS(nowIso), deletedBy: caller.uid });
  const _delEmail = (prof && prof.email) ? String(prof.email) : '';
  let _delMail = false;
  if(shValidEmail(_delEmail)) _delMail = await sendDeletionMail(env, { email:_delEmail, name: (prof && (prof.displayName||prof.name)) || '' });
  return json({ ok:true, mailSent:_delMail });
}

async function handleSetActive(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500); }
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const uid = clip(body.uid, 200);
  if(!uid) return json({ ok:false, error:'Gebruiker-id ontbreekt' }, 400);
  if(uid === caller.uid) return json({ ok:false, error:'Je kunt je eigen account niet (de)activeren' }, 400);
  const makeActive = body.active === true || body.active === 'true';
  const prof = await saFsGet(saToken, 'users/'+uid);
  if(prof && prof.role === 'admin') return json({ ok:false, error:'Admin-accounts kun je niet wijzigen' }, 400);
  if(makeActive) await enableAuthUser(saToken, uid); else await disableAuthUser(saToken, uid);
  await saFsPatch(saToken, 'users/'+uid, { isActive: makeActive });
  const email = (prof && prof.email) ? String(prof.email) : '';
  let mailSent = false;
  if(shValidEmail(email)){
    mailSent = makeActive ? await sendReactivationMail(env, { email, name: (prof.displayName||prof.name)||'' })
                          : await sendDeactivationMail(env, { email, name: (prof.displayName||prof.name)||'' });
  }
  return json({ ok:true, mailSent });
}

async function sendFeedbackMail(env, d){
  const body = '<p style="'+MAIL_P+'">Er is nieuwe feedback binnengekomen via ScoutingHub.</p>'
    + '<div style="margin:2px 0 14px;padding:14px 16px;background:#f6f8fb;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.8;color:#0f172a;">'
    + '<span style="color:#64748b;">Naam</span> &nbsp; '+shEsc(d.name||'—')+'<br>'
    + '<span style="color:#64748b;">E-mail</span> &nbsp; '+shEsc(d.email||'—')+'<br>'
    + '<span style="color:#64748b;">Rol</span> &nbsp; '+shEsc(d.role||'—')+(d.teamName?(' &middot; '+shEsc(d.teamName)):'')+'<br>'
    + '<span style="color:#64748b;">Pagina</span> &nbsp; '+shEsc(d.route||'—')+'<br>'
    + '<span style="color:#64748b;">UID</span> &nbsp; '+shEsc(d.uid||'—')+'</div>'
    + '<p style="'+MAIL_H+'">Feedback</p>'
    + '<div style="margin:0 0 12px;padding:14px 16px;background:#ffffff;border:1px solid #e2e8f0;border-left:3px solid #e30613;border-radius:0 10px 10px 0;font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap;">'+shEsc(d.text||'')+'</div>'
    + (d.ua ? ('<p style="'+MAIL_MUTED+'">Browser: '+shEsc(d.ua)+'</p>') : '');
  const opts = { from: contactFrom(env), to: feedbackNotifyTo(env), replyTo: (d.email && shValidEmail(d.email)) ? d.email : contactEmail(env), subject:'Nieuwe feedback — ScoutingHub', html: mailShell(env,'Nieuwe feedback',body) };
  if(d.attachment && d.attachment.content) opts.attachments = [{ filename: d.attachment.filename || 'bijlage', content: d.attachment.content }];
  return sendMail(env, opts);
}
async function handleFeedback(body, env, request){
  const ip = (request && request.headers && request.headers.get('CF-Connecting-IP')) || '0.0.0.0';
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  const rl1 = await rateLimit(env, 'fb-uid:'+caller.uid, 8, 3600);
  const rl2 = await rateLimit(env, 'fb-ip:'+ip, 15, 3600);
  if(!rl1.ok || !rl2.ok) return json({ ok:false, error:'Je hebt recent al feedback gestuurd. Probeer het later opnieuw.' }, 429);
  const text = clip(body.text, 4000);
  if(!text) return json({ ok:false, error:'Feedback is leeg' }, 400);
  const route = clip(body.route, 200);
  const ua = clip(body.userAgent, 300);
  let attachment = null;
  if(body.attachment && body.attachment.contentBase64){
    const okTypes = ['image/png','image/jpeg','image/webp','application/pdf'];
    const type = String(body.attachment.type||'');
    if(okTypes.indexOf(type)===-1) return json({ ok:false, error:'Bijlage-type niet toegestaan' }, 400);
    const b64 = String(body.attachment.contentBase64||'');
    const approxBytes = Math.floor(b64.length * 3 / 4);
    if(approxBytes > 5*1024*1024) return json({ ok:false, error:'Bijlage te groot (max 5 MB)' }, 400);
    attachment = { filename: clip(body.attachment.filename, 160) || 'bijlage', content: b64 };
  }
  let name = '', role = '', teamName = '';
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ saToken = null; }
  if(saToken){ try { const u = await saFsGet(saToken, 'users/'+caller.uid); if(u){ name = u.displayName||u.name||''; role = u.role||''; teamName = u.teamName||''; } } catch(_){} }
  const mailSent = await sendFeedbackMail(env, { name, email: caller.email, uid: caller.uid, role, teamName, route, ua, text, attachment });
  // Opslaan in Firestore → admin-panel kan feedback tonen
  if(saToken){
    try {
      await saFsCreate(saToken, 'feedback', {
        name, email: caller.email, uid: caller.uid, role, teamName,
        route, ua, text: text.slice(0, 4000),
        status: 'open',
        createdAt: new Date().toISOString()
      });
    } catch(_){}
  }
  return json({ ok:true, mailSent });
}

async function sendPasswordResetMail(env, d){
  const body = '<p style="'+MAIL_P+'">Hallo '+shEsc(d.name||'')+',</p>'
    + '<p style="'+MAIL_P+'">Er is een wachtwoord-reset voor je ScoutingHub-account aangevraagd. Klik hieronder om een nieuw wachtwoord in te stellen:</p>'
    + ctaButton('Wachtwoord instellen', d.link)
    + '<p style="'+MAIL_MUTED+'">Heb je dit niet aangevraagd? Dan kun je deze mail negeren. De link is eenmalig en verloopt.</p>';
  const text = 'Hallo '+(d.name||'')+',\n\nEr is een wachtwoord-reset voor je ScoutingHub-account aangevraagd. Stel je wachtwoord in via deze link:\n'+d.link+'\n\nHeb je dit niet aangevraagd? Dan kun je deze mail negeren.';
  return sendMail(env, { from: contactFrom(env), to: d.email, subject:'Stel je ScoutingHub-wachtwoord in', html: mailShell(env,'Wachtwoord instellen',body), text });
}
async function handleSendPasswordReset(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500); }
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const uid = clip(body.uid, 200);
  let email = clip(body.email, 200), name = '';
  if(uid){ try { const u = await saFsGet(saToken, 'users/'+uid); if(u){ if(!email) email = String(u.email||''); name = u.displayName||u.name||''; } } catch(_){} }
  email = String(email||'').toLowerCase();
  if(!shValidEmail(email)) return json({ ok:false, error:'Geen geldig e-mailadres' }, 400);
  let link = ''; try { const _ob = await genResetLink(saToken, email); link = _resetUrl(env, _ob); } catch(_){}
  if(!link) return json({ ok:false, error:'Kon geen reset-link genereren' }, 500);
  const mailSent = await sendPasswordResetMail(env, { email, name, link });
  return json({ ok:true, mailSent });
}

/* ============================================================ *
 * HANDLER — request-password-reset (PUBLIEK, self-service)
 * Geen auth: een UITGELOGDE gebruiker vraagt zelf een reset aan
 * vanaf het inlogscherm ("Wachtwoord vergeten?").
 * Beveiliging: honeypot + optionele Turnstile + KV-rate-limit
 * (per e-mail EN per IP) + ALTIJD neutrale respons (geen e-mail-
 * enumeratie). Branded Resend-mail (contact@) met link naar
 * wachtwoord.html — dezelfde flow als de welkomst-/adminreset.
 * Geen tokens/secrets gelogd; alleen de eenmalige link gaat per mail.
 * ============================================================ */
async function handlePublicPasswordReset(body, env, request){
  // Neutrale standaardrespons — onthult nooit of een account bestaat.
  const neutral = json({ ok:true, message:'Als er een account bestaat met dit e-mailadres, ontvang je een herstel-link.' });
  try {
    // 1) honeypot: gevuld = bot -> neutraal afdoen, niets doen
    if(body && body.company) return neutral;
    const email = String((body && body.email) || '').trim().toLowerCase();
    if(!shValidEmail(email)) return neutral;
    const ip = (request && request.headers && (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For'))) || '';
    // 2) optionele Turnstile (alleen verifieren als de client een token meestuurt)
    if(body && body.turnstileToken){
      const ts = await verifyTurnstile(env, body.turnstileToken, ip);
      if(!ts.ok) return neutral;
    }
    // 3) rate-limit: max 3/uur per e-mail, max 10/uur per IP
    const rlMail = await rateLimit(env, 'pwr:mail:'+email, 3, 3600);
    if(!rlMail.ok) return neutral;
    if(ip){ const rlIp = await rateLimit(env, 'pwr:ip:'+ip, 10, 3600); if(!rlIp.ok) return neutral; }
    // 4) service-account -> reset-link -> branded mail (alleen als account bestaat)
    let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return neutral; }
    let link = ''; try { const _ob = await genResetLink(saToken, email); link = _resetUrl(env, _ob); } catch(_){}
    if(link){
      let name = '';
      try { const uid = await lookupUidByEmail(saToken, email); if(uid){ const u = await saFsGet(saToken, 'users/'+uid); if(u) name = u.displayName || u.name || ''; } } catch(_){}
      await sendPasswordResetMail(env, { email, name, link });
    }
  } catch(_){}
  return neutral;
}

async function handleAdminStats(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken; try { saToken = await getServiceAccountToken(env); } catch(_){ return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500); }
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const COLS = { players:'players', matchReports:'match_reports', programma:'programma', tips:'tips', ritten:'ritten', analyses:'analyses', contacts:'contacts', tournaments:'tournaments' };
  const keys = Object.keys(COLS);
  // Per-gebruiker telling (drill-down)
  const uid = clip(body.uid, 200);
  if(uid){
    const vals = await Promise.all(keys.map(k => saFsCount(saToken, 'users/'+uid, COLS[k])));
    const counts = {}; keys.forEach((k,i)=>{ counts[k]=vals[i]; });
    return json({ ok:true, uid, counts });
  }
  // Overzicht: gebruikers-metadata + totalen (collection-group)
  const users = (await saFsList(saToken, 'users', 300)).map(u => ({
    uid: u.id, name: u.displayName||u.name||'', email: u.email||'', role: u.role||'scout',
    teamId: u.teamId||'', teamName: u.teamName||'', isActive: u.isActive!==false, status: u.status||'active',
    createdAt: u.createdAt||null, lastLoginAt: u.lastLoginAt||null, loginCount: Number(u.loginCount||0)
  }));
  const totalsArr = await Promise.all(keys.map(k => saFsCountGroup(saToken, COLS[k])));
  const totals = {}; keys.forEach((k,i)=>{ totals[k]=totalsArr[i]; });
  return json({ ok:true, users, totals, generatedAt: new Date().toISOString() });
}

/* ============================================================ *
 * HANDLER — admin-status (admin, alleen aanwezig/ontbreekt)
 * Geeft GEEN secret-waarden terug, alleen booleans/aantallen/
 * publieke adressen — t.b.v. het Instellingen-paneel in Beheer.
 * ============================================================ */
async function handleAdminStatus(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const status = {
    siteUrl: appBaseUrl(env),
    turnstile: !!(env && env.TURNSTILE_SECRET),
    resend: !!(env && env.RESEND_API_KEY),
    serviceAccount: !!(env && env.SERVICE_ACCOUNT_JSON),
    rateLimit: !!(env && env.RATE_LIMIT),
    fbApiKey: !!fbApiKey(env),
    adminEmailsCount: adminEmails(env).length,
    adminNotifyCount: adminNotifyTo(env).length,
    contactEmail: contactEmail(env),
    feedbackNotifyTo: feedbackNotifyTo(env)
  };
  return json({ ok:true, status });
}

/* ============================================================ *
 * HANDLER — admin-mail-test (admin, Mailcentrum)
 * Verstuurt een korte testmail naar admin@/contact@/info@ via
 * Resend, zodat een beheerder de mailroutes kan verifiëren.
 * ============================================================ */
async function handleAdminMailTest(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const type = String(body.type||'');
  const notify = adminNotifyTo(env);
  const MAP = {
    admin:   { from: adminFrom(env),   to: notify[0] || adminEmails(env)[0] || '', label:'admin@scoutinghub.nl' },
    contact: { from: contactFrom(env), to: contactEmail(env), label:'contact@scoutinghub.nl' },
    info:    { from: 'ScoutingHub <info@scoutinghub.nl>', to: contactEmail(env), label:'info@scoutinghub.nl' }
  };
  const m = MAP[type];
  if(!m) return json({ ok:false, error:'Onbekend mailtype' }, 400);
  if(!m.to) return json({ ok:false, error:'Geen ontvanger geconfigureerd voor dit type' }, 400);
  const when = new Date().toLocaleString('nl-NL');
  const html = '<p style="'+MAIL_P+'">Dit is een testmail vanuit de ScoutingHub Beheerconsole, voor route <strong>'+shEsc(m.label)+'</strong>.</p>'
    + '<p style="'+MAIL_MUTED+'">Verstuurd door '+shEsc(caller.email)+' op '+shEsc(when)+'.</p>';
  const text = 'Testmail vanuit de ScoutingHub Beheerconsole, voor route '+m.label+'.\nVerstuurd door '+caller.email+' op '+when+'.';
  const sent = await sendMail(env, { from: m.from, to: m.to, subject: 'Testmail — '+m.label, html: mailShell(env, 'Testmail', html), text });
  return json({ ok:true, sent, error: sent ? undefined : 'Verzenden via Resend mislukt' });
}

/* ============================================================ *
 * HANDLER — admin-mail-send (admin, Mailcentrum)
 * Verstuurt een mail vanuit admin@/contact@/info@ via Resend,
 * in de ScoutingHub-huisstijl (mailShell) met automatische
 * ondertekening. Alleen voor beheerders.
 * ============================================================ */
async function handleAdminMailSend(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);

  const type = String(body.type||'');
  const FROM_MAP = {
    admin:   { from: adminFrom(env),   label:'admin@scoutinghub.nl' },
    contact: { from: contactFrom(env), label:'contact@scoutinghub.nl' },
    info:    { from: 'ScoutingHub <info@scoutinghub.nl>', label:'info@scoutinghub.nl' }
  };
  const m = FROM_MAP[type];
  if(!m) return json({ ok:false, error:'Onbekend mailtype' }, 400);

  const to = String(body.to||'').trim();
  if(!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json({ ok:false, error:'Ongeldig e-mailadres bij "Aan"' }, 400);
  const subject = clip(String(body.subject||'').trim(), 200);
  if(!subject) return json({ ok:false, error:'Onderwerp ontbreekt' }, 400);
  const message = clip(String(body.message||'').trim(), 10000);
  if(!message) return json({ ok:false, error:'Bericht is leeg' }, 400);

  // Vrije tekst -> alinea's (huisstijl), met automatische handtekening.
  const paragraphs = message.split(/\n{2,}/).map(p => '<p style="'+MAIL_P+'">'+shEsc(p).replace(/\n/g,'<br>')+'</p>').join('');
  const html = paragraphs
    + '<p style="'+MAIL_P+'">Met vriendelijke groet,<br>Team ScoutingHub<br><span style="color:#64748b;">'+shEsc(m.label)+'</span></p>';
  const text = message + '\n\nMet vriendelijke groet,\nTeam ScoutingHub\n' + m.label;

  const sent = await sendMail(env, { from: m.from, to, subject, html: mailShell(env, subject, html), text, replyTo: m.from });
  if(!sent) return json({ ok:false, error:'Verzenden via Resend mislukt' });
  // IMAP APPEND: sla op in Verzonden map
  try{
    const dateStr = new Date().toUTCString();
    const rawMsg = 'From: '+m.from+'\r\nTo: '+to+'\r\nSubject: '+subject+'\r\nDate: '+dateStr+'\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n'+text;
    await imapAppendSent(env, type, rawMsg);
  }catch(_){}
  return json({ ok:true, sent:true });
}

/* ============================================================ *
 * IMAP APPEND — sla raw bericht op in Verzonden map
 * ============================================================ */
async function imapAppendSent(env, type, rawMsg){
  const m = imapMailboxCfg(env, type);
  if(!m||!m.pass) return false;
  let socket;
  try{
    socket = connect({ hostname: m.host, port: m.port }, { secureTransport: 'on', allowHalfOpen: false });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const enc = new TextEncoder();
    const send = (s) => writer.write(enc.encode(s + '\r\n'));
    const q = (s) => '"' + String(s).replace(/([\\"])/g,'\\$1') + '"';
    await reader.read().catch(()=>{});
    await send('A1 LOGIN '+q(m.user)+' '+q(m.pass));
    let resp = await imapReadUntilTagged(reader,'A1 ',8192);
    if(!/A1 OK/i.test(resp)){ try{writer.close();}catch(_){} return false; }
    // Zoek Verzonden map
    await send('AL LIST "" "*"');
    const lr = await imapReadUntilTagged(reader,'AL ',32768);
    const names = imapParseFolderNames(lr);
    let sentFolder = imapPickFolder(names,'sent');
    if(!sentFolder){
      try{ await send('AC CREATE "Sent"'); await imapReadUntilTagged(reader,'AC ',2048).catch(()=>{}); }catch(_){}
      sentFolder = 'Sent';
    }
    // APPEND commando
    const msgBytes = enc.encode(rawMsg);
    await writer.write(enc.encode('A5 APPEND '+q(sentFolder)+' (\\Seen) {'+msgBytes.length+'}\r\n'));
    resp = await imapReadUntilTagged(reader,'+ ',2048).catch(()=>'+');
    await writer.write(msgBytes);
    await writer.write(enc.encode('\r\n'));
    resp = await imapReadUntilTagged(reader,'A5 ',4096);
    try{ await send('A9 LOGOUT'); }catch(_){}
    try{ writer.close(); }catch(_){}
    return /A5 OK/i.test(resp);
  }catch(err){
    try{ if(socket) socket.close(); }catch(_){}
    return false;
  }
}

/* ============================================================ *
 * IMAP STATUS — ongelezen tellen per mailbox
 * ============================================================ */
async function imapGetUnread(env, type){
  const m = imapMailboxCfg(env, type);
  if(!m||!m.pass) return 0;
  let socket;
  try{
    socket = connect({ hostname: m.host, port: m.port }, { secureTransport: 'on', allowHalfOpen: false });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const enc = new TextEncoder();
    const send = (s) => writer.write(enc.encode(s + '\r\n'));
    const q = (s) => '"' + String(s).replace(/([\\"])/g,'\\$1') + '"';
    await reader.read().catch(()=>{});
    await send('A1 LOGIN '+q(m.user)+' '+q(m.pass));
    let resp = await imapReadUntilTagged(reader,'A1 ',8192);
    if(!/A1 OK/i.test(resp)){ try{writer.close();}catch(_){} return 0; }
    await send('A2 STATUS INBOX (UNSEEN)');
    resp = await imapReadUntilTagged(reader,'A2 ',4096);
    try{ await send('A9 LOGOUT'); }catch(_){}
    try{ writer.close(); }catch(_){}
    const um = resp.match(/UNSEEN\s+(\d+)/i);
    return um ? parseInt(um[1],10) : 0;
  }catch(err){
    try{ if(socket) socket.close(); }catch(_){}
    return 0;
  }
}

/* ============================================================ *
 * HANDLER — admin-mail-unread
 * ============================================================ */
async function handleAdminMailUnread(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const counts = {};
  await Promise.all(['admin','contact','info'].map(async (t) => {
    try{ counts[t] = await imapGetUnread(env, t); }catch(_){ counts[t]=0; }
  }));
  return json({ ok:true, counts });
}

/* ============================================================ *
 * HANDLER — admin-mail-attachment (bijlage ophalen als base64)
 * ============================================================ */
async function handleAdminMailAttachment(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const type = String(body.type||'');
  if(!['admin','contact','info'].includes(type)) return json({ ok:false, error:'Onbekend mailtype' }, 400);
  const folder = String(body.folder||'inbox').toLowerCase();
  const seq = parseInt(body.seq,10);
  const idx = parseInt(body.index||'0',10);
  if(!seq||seq<1) return json({ ok:false, error:'Ongeldig berichtnummer' }, 400);
  // Herlaad volledig bericht met attachment inhoud
  const m = imapMailboxCfg(env, type);
  if(!m||!m.pass) return json({ ok:false, error:'IMAP niet geconfigureerd' });
  const key = ['inbox','sent','trash'].includes(folder)?folder:'inbox';
  let socket;
  try{
    socket = connect({ hostname: m.host, port: m.port }, { secureTransport:'on', allowHalfOpen:false });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const enc = new TextEncoder();
    const send = (s) => writer.write(enc.encode(s+'\r\n'));
    const q = (s) => '"'+String(s).replace(/([\\"])/g,'\\$1')+'"';
    await reader.read().catch(()=>{});
    await send('A1 LOGIN '+q(m.user)+' '+q(m.pass));
    let resp = await imapReadUntilTagged(reader,'A1 ',8192);
    if(!/A1 OK/i.test(resp)){ try{writer.close();}catch(_){} return json({ok:false,error:'Login mislukt'}); }
    let folderName = 'INBOX';
    if(key!=='inbox'){
      await send('AL LIST "" "*"');
      const lr=await imapReadUntilTagged(reader,'AL ',32768);
      const found=imapPickFolder(imapParseFolderNames(lr),key);
      if(found) folderName=found;
    }
    await send('A2 SELECT '+q(folderName));
    resp = await imapReadUntilTagged(reader,'A2 ',8192);
    await send('A3 FETCH '+seq+' (BODY.PEEK[])');
    resp = await imapReadUntilTagged(reader,'A3 ',800000);
    try{ await send('A9 LOGOUT'); }catch(_){}
    try{ writer.close(); }catch(_){}
    const bm=resp.match(/\* \d+ FETCH \(BODY\[\] \{(\d+)\}\r\n([\s\S]*)/i);
    if(!bm) return json({ok:false,error:'Bericht niet gevonden'});
    const raw=bm[2].slice(0,parseInt(bm[1],10));
    const splitIdx=raw.indexOf('\r\n\r\n');
    const headerPart=splitIdx>=0?raw.slice(0,splitIdx):raw;
    const bodyPart=splitIdx>=0?raw.slice(splitIdx+4):'';
    const contentType=imapHeaderField(headerPart,'Content-Type');
    const extracted=imapExtractBody(bodyPart,contentType,true);
    const att=extracted.attachments[idx];
    if(!att) return json({ok:false,error:'Bijlage niet gevonden (index '+idx+')'});
    return json({ok:true,name:att.name,type:att.type,b64:att.b64||''});
  }catch(err){
    try{ if(socket) socket.close(); }catch(_){}
    return json({ok:false,error:'Bijlage ophalen mislukt: '+(err&&err.message||'')});
  }
}

/* ============================================================ *
 * HANDLER — admin-newsletter-list
 * ============================================================ */
async function handleAdminNewsletterList(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const all = await saFsList(saToken, 'access_requests', 500);
  const subs = all.filter(function(x){ return x.newsletterOptIn===true; });
  subs.sort(function(a,b){ return new Date(b.requestedAt||0)-new Date(a.requestedAt||0); });
  return json({ ok:true, subscribers: subs });
}

/* ============================================================ *
 * HANDLER — admin-newsletter-send
 * ============================================================ */
async function handleAdminNewsletterSend(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const subject = clip(String(body.subject||'').trim(),200);
  const message = clip(String(body.message||'').trim(),10000);
  if(!subject||!message) return json({ ok:false, error:'Onderwerp en bericht zijn verplicht' }, 400);
  const testEmail = clip(String(body.testEmail||'').trim(), 200);
  const paragraphs = message.split(/\n{2,}/).map(function(p){ return '<p style="'+MAIL_P+'">'+shEsc(p).replace(/\n/g,'<br>')+'</p>'; }).join('');
  const htmlBody = paragraphs
    + '<p style="'+MAIL_P+'">Met vriendelijke groet,<br>Team ScoutingHub</p>'
    + '<p style="'+MAIL_MUTED+'">Je ontvangt deze nieuwsbrief omdat je je hebt aangemeld. Stuur een mail naar contact@scoutinghub.nl om je af te melden.</p>';
  const text = message + '\n\nMet vriendelijke groet,\nTeam ScoutingHub\n\nAfmelden: stuur een mail naar contact@scoutinghub.nl';
  if(testEmail){
    const ok = await sendMail(env, { from: contactFrom(env), to: testEmail, subject:'[TEST] '+subject, html: mailShell(env,'[TEST] '+subject,htmlBody), text });
    return json({ ok:true, sent: ok?1:0, failed: ok?0:1, total:1, test:true });
  }
  const all = await saFsList(saToken, 'access_requests', 500);
  const subs = all.filter(function(x){ return x.newsletterOptIn===true && x.email; });
  if(!subs.length) return json({ ok:true, sent:0, message:'Geen abonnees gevonden' });
  let sent = 0, failed = 0;
  for(const sub of subs){
    try{
      const ok = await sendMail(env, { from: contactFrom(env), to: sub.email, subject, html: mailShell(env,subject,htmlBody), text });
      if(ok) sent++; else failed++;
    }catch(_){ failed++; }
  }
  return json({ ok:true, sent, failed, total:subs.length });
}

/* ============================================================ *
 * HANDLER — support-notify (admin, Support/meekijken)
 * Stuurt e-mail naar gebruiker: admin vraagt tijdelijke
 * supporttoegang ("meekijken") aan.
 * ============================================================ */
async function handleAdminSupportNotify(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const targetEmail = String(body.targetEmail||'').trim();
  if(!targetEmail) return json({ ok:false, error:'Geen e-mailadres voor doelgebruiker' }, 400);
  const targetName = String(body.targetName||'');
  const reason = String(body.reason||'');
  const minutes = Number(body.durationMinutes||0) || 0;
  const when = new Date().toLocaleString('nl-NL');
  const html = '<p style="'+MAIL_P+'">Hallo '+shEsc(targetName||'')+',</p>'
    + '<p style="'+MAIL_P+'">Beheerder <strong>'+shEsc(caller.email||'')+'</strong> heeft tijdelijke supporttoegang ("meekijken") tot jouw account aangevraagd.</p>'
    + '<div style="margin:4px 0 16px;padding:14px 16px;background:#f6f8fb;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.8;color:#334155;">'
      + '<span style="color:#64748b;">Reden</span> &nbsp; '+shEsc(reason||'—')+'<br>'
      + '<span style="color:#64748b;">Duur</span> &nbsp; '+shEsc(minutes ? (minutes+' minuten') : '—')+'<br>'
      + '<span style="color:#64748b;">Tijdstip</span> &nbsp; '+shEsc(when)+'</div>'
    + '<p style="'+MAIL_MUTED+'">Open de ScoutingHub-app om dit verzoek te bekijken en goed te keuren of af te wijzen.</p>';
  const text = 'Beheerder '+(caller.email||'')+' heeft tijdelijke supporttoegang tot jouw account aangevraagd.\nReden: '+(reason||'—')+'\nDuur: '+(minutes?(minutes+' minuten'):'—')+'\nTijdstip: '+when;
  const sent = await sendMail(env, { from: contactFrom(env), to: targetEmail, subject:'Verzoek om supporttoegang — ScoutingHub', html: mailShell(env,'Verzoek om supporttoegang',html), text });
  return json({ ok:true, sent });
}

/* ============================================================ *
 * IMAP-CLIENT (minimaal, alleen-lezen) — voor Mailcentrum-inbox
 * Verbindt rechtstreeks (TLS) met de IMAP-server van de provider
 * via cloudflare:sockets. Leest alleen de laatste N headers
 * (Van/Onderwerp/Datum/gelezen) van de INBOX met BODY.PEEK, zodat
 * niets als gelezen wordt gemarkeerd. Verstuurt/verwijdert niets.
 * Vereist secrets IMAP_PASS_ADMIN / IMAP_PASS_CONTACT / IMAP_PASS_INFO.
 * ============================================================ */
function imapMailboxCfg(env, type){
  const host = cfg(env, 'IMAP_HOST', 'imap.transip.email');
  const port = Number(cfg(env, 'IMAP_PORT', '993')) || 993;
  const MAP = {
    admin:   { user: cfg(env,'IMAP_USER_ADMIN','admin@scoutinghub.nl'),     pass: env && env.IMAP_PASS_ADMIN,   label:'admin@scoutinghub.nl' },
    contact: { user: cfg(env,'IMAP_USER_CONTACT','contact@scoutinghub.nl'), pass: env && env.IMAP_PASS_CONTACT, label:'contact@scoutinghub.nl' },
    info:    { user: cfg(env,'IMAP_USER_INFO','info@scoutinghub.nl'),       pass: env && env.IMAP_PASS_INFO,    label:'info@scoutinghub.nl' }
  };
  return MAP[type] ? { host, port, ...MAP[type] } : null;
}

// Leest van de socket tot een regel met de gevraagde tag (bv. "A3 ") wordt gezien.
// Houdt rekening met IMAP-literals ({n}) zodat headerblokken niet stuk geknipt worden.
async function imapReadUntilTagged(reader, tag, maxBytes){
  const dec = new TextDecoder();
  let buf = '';
  let searchFrom = 0;
  const limit = maxBytes || 200000;
  while(true){
    const { value, done } = await reader.read();
    if(done) break;
    if(value && value.length) buf += dec.decode(value, { stream:true });

    let advanced = true;
    while(advanced){
      advanced = false;
      const nl = buf.indexOf('\r\n', searchFrom);
      if(nl === -1) break;
      const line = buf.slice(searchFrom, nl);
      const litM = line.match(/\{(\d+)\}$/);
      if(litM){
        const litLen = parseInt(litM[1], 10);
        const litStart = nl + 2;
        if(buf.length < litStart + litLen) break; // wacht op meer data
        searchFrom = litStart + litLen;
        advanced = true;
        continue;
      }
      if(line.indexOf(tag) === 0) return buf;
      searchFrom = nl + 2;
      advanced = true;
    }
    if(buf.length > limit) break;
  }
  return buf;
}

// Parseert "* n FETCH (FLAGS (...) BODY[HEADER.FIELDS (...)] {len}\r\n<headers>)" blokken.
function imapParseFetchHeaders(raw){
  const out = [];
  const re = /\*\s+(\d+)\s+FETCH\s+\(([\s\S]*?)\{(\d+)\}\r\n/g;
  let m;
  while((m = re.exec(raw))){
    const seq = parseInt(m[1], 10);
    const meta = m[2] || '';
    const len = parseInt(m[3], 10);
    const start = re.lastIndex;
    const header = raw.slice(start, start + len);
    re.lastIndex = start + len;
    out.push({ seq, seen: /\\Seen/i.test(meta), from: imapHeaderField(header,'From'), to: imapHeaderField(header,'To'), subject: imapHeaderField(header,'Subject'), date: imapHeaderField(header,'Date') });
  }
  return out;
}

// Parseert "* LIST (\Flags) "/" "Mapnaam"" regels uit een IMAP LIST-response.
function imapParseFolderNames(raw){
  const out = [];
  const re = /\*\s+LIST\s+\([^)]*\)\s+(?:"[^"]*"|NIL)\s+(.+?)\r\n/g;
  let m;
  while((m = re.exec(raw))){
    let name = m[1].trim();
    if(name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/\\"/g, '"');
    if(name) out.push(name);
  }
  return out;
}

// Kiest de map voor 'sent' / 'trash' uit een lijst mapnamen (best-effort, taalonafhankelijk).
function imapPickFolder(names, kind){
  const pats = kind === 'sent'
    ? [/^sent$/i, /sent items/i, /sent mail/i, /verzonden items/i, /verzonden/i, /sent/i]
    : [/^trash$/i, /deleted items/i, /deleted/i, /prullenbak/i, /verwijderde items/i, /^bin$/i, /trash/i];
  for(const p of pats){
    const f = names.find(n => p.test(n));
    if(f) return f;
  }
  return null;
}

// Pakt één header-veld en decodeert best-effort mime-encoded-words (=?UTF-8?Q/B?...?=).
function imapHeaderField(header, name){
  const re = new RegExp('^' + name + ':[ \\t]*((?:.|\\r\\n[ \\t])*)$', 'im');
  const m = header.match(re);
  if(!m) return '';
  let val = m[1].replace(/\r\n[ \t]+/g, ' ').replace(/\r|\n/g,'').trim();
  try {
    val = val.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (all, charset, enc, txt) => {
      try {
        if(/^b$/i.test(enc)){
          const bin = atob(txt);
          const bytes = new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder(charset || 'utf-8').decode(bytes);
        }
        const t = txt.replace(/_/g,' ').replace(/=([0-9A-Fa-f]{2})/g, (x,h)=>String.fromCharCode(parseInt(h,16)));
        const bytes = new Uint8Array(t.length);
        for(let i=0;i<t.length;i++) bytes[i] = t.charCodeAt(i);
        return new TextDecoder(charset || 'utf-8').decode(bytes);
      } catch(_){ return all; }
    });
  } catch(_){}
  return clip(val, 300);
}

// folderKey: 'inbox' | 'sent' | 'trash'
async function imapFetchFolder(env, type, folderKey, limit){
  const m = imapMailboxCfg(env, type);
  if(!m) return { ok:false, error:'Onbekend mailtype' };
  if(!m.pass) return { ok:false, error:'Geen IMAP-wachtwoord ingesteld voor '+m.label+' (secret ontbreekt)' };
  const FOLDER_LABELS = { inbox:'Inbox', sent:'Verzonden', trash:'Verwijderd' };
  const key = ['inbox','sent','trash'].includes(folderKey) ? folderKey : 'inbox';
  const max = Math.max(1, Math.min(20, Number(limit)||10));
  let socket;
  try {
    socket = connect({ hostname: m.host, port: m.port }, { secureTransport: 'on', allowHalfOpen: false });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const enc = new TextEncoder();
    const send = (s) => writer.write(enc.encode(s + '\r\n'));
    const q = (s) => '"' + String(s).replace(/([\\"])/g,'\\$1') + '"';

    await reader.read().catch(()=>{}); // begroeting

    await send('A1 LOGIN ' + q(m.user) + ' ' + q(m.pass));
    let resp = await imapReadUntilTagged(reader, 'A1 ', 8192);
    if(!/A1 OK/i.test(resp)){
      try{ writer.close(); }catch(_){}
      return { ok:false, error:'IMAP-login mislukt voor '+m.label };
    }

    let folder = 'INBOX';
    if(key !== 'inbox'){
      let names = [];
      try {
        await send('AL LIST "" "*"');
        const lresp = await imapReadUntilTagged(reader, 'AL ', 32768);
        names = imapParseFolderNames(lresp);
      } catch(_){}
      const found = imapPickFolder(names, key);
      if(!found){
        try{ await send('A9 LOGOUT'); }catch(_){}
        try{ writer.close(); }catch(_){}
        return { ok:false, error:'Map "'+FOLDER_LABELS[key]+'" niet gevonden voor '+m.label };
      }
      folder = found;
    }

    await send('A2 SELECT ' + q(folder));
    resp = await imapReadUntilTagged(reader, 'A2 ', 8192);
    if(!/A2 OK/i.test(resp)){
      try{ await send('A9 LOGOUT'); }catch(_){}
      try{ writer.close(); }catch(_){}
      return { ok:false, error:'Kan map "'+folder+'" niet openen voor '+m.label };
    }
    const existsM = resp.match(/\*\s+(\d+)\s+EXISTS/i);
    const exists = existsM ? parseInt(existsM[1], 10) : 0;

    let messages = [];
    if(exists > 0){
      const lo = Math.max(1, exists - max + 1);
      await send('A3 FETCH ' + lo + ':' + exists + ' (FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])');
      resp = await imapReadUntilTagged(reader, 'A3 ', 200000);
      messages = imapParseFetchHeaders(resp);
    }

    try{ await send('A9 LOGOUT'); }catch(_){}
    try{ writer.close(); }catch(_){}

    messages.sort((a,b) => (b.seq||0) - (a.seq||0));
    return { ok:true, label:m.label, folder:FOLDER_LABELS[key], count:exists, messages };
  } catch(err){
    try{ if(socket) socket.close(); }catch(_){}
    return { ok:false, error:'IMAP-verbinding mislukt: '+(err && err.message ? err.message : 'onbekende fout') };
  }
}

// Decodeert Quoted-Printable encoding.
function imapDecodeQP(str, charset){
  // Soft line-breaks weghalen
  const s = str.replace(/=\r\n/g,'').replace(/=\n/g,'');
  // QP bytes verzamelen als raw byte-array, dan charset-bewust decoderen
  const bytes = [];
  let i = 0;
  while(i < s.length){
    if(s[i]==='=' && i+2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.slice(i+1,i+3))){
      bytes.push(parseInt(s.slice(i+1,i+3),16));
      i += 3;
    } else {
      bytes.push(s.charCodeAt(i) & 0xFF);
      i++;
    }
  }
  const cs = charset||'utf-8';
  try{ return new TextDecoder(cs).decode(new Uint8Array(bytes)); }
  catch(_){ try{ return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); }catch(__){ return bytes.map(b=>String.fromCharCode(b)).join(''); } }
}

// Strips HTML tags naar leesbare platte tekst.
function imapStripHtml(html){
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<\/div>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"')
    .replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

// Extraheert {text, html, attachments[]} uit een mail-body (plain/html/multipart).
// withContent=true voegt ook raw b64 content toe aan elke bijlage (voor download).
function imapExtractBody(body, contentType, withContent){
  let html='', text='', attachments=[];
  function b64utf8(s){
    try{
      const bin=atob(s.replace(/\s/g,''));
      const b=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(b);
    }catch(_){ try{ return atob(s.replace(/\s/g,'')); }catch(e){ return s; } }
  }
  function decodePart(pbody, penc, charset){
    const e=(penc||'').toLowerCase().trim();
    if(e==='quoted-printable') return imapDecodeQP(pbody, charset);
    if(e==='base64'){
      const bin=atob(pbody.replace(/\s/g,''));
      const b=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
      try{ return new TextDecoder(charset||'utf-8').decode(b); }catch(_){ return b64utf8(pbody); }
    }
    return pbody;
  }
  function parse(rawBody, rawCt){
    const lct=(rawCt||'').toLowerCase();
    if(lct.includes('multipart/')){
      const bm=rawCt.match(/boundary=["']?([^"';\s\r\n]+)["']?/i);
      if(!bm) return;
      const bd='--'+bm[1];
      const bRe=new RegExp(bd.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:--)?');
      const parts=rawBody.split(bRe);
      for(const part of parts){
        if(!part||/^\s*$/.test(part)) continue;
        let hi=part.indexOf('\r\n\r\n'), sepLen=4;
        if(hi<0){ hi=part.indexOf('\n\n'); sepLen=2; }
        if(hi<0) continue;
        const phdr=part.slice(0,hi);
        const pbody=part.slice(hi+sepLen).replace(/\r?\n$/,'');
        const pct=imapHeaderField(phdr,'Content-Type')||'';
        const pctl=pct.toLowerCase();
        const pcharset=(pct.match(/charset=["']?([^"';\s\r\n]+)/i)||[])[1]||'utf-8';
        const penc=(imapHeaderField(phdr,'Content-Transfer-Encoding')||'').toLowerCase().trim();
        const pdisp=(imapHeaderField(phdr,'Content-Disposition')||'').toLowerCase();
        const pname=((pct.match(/name=["']?([^"';\r\n]+)["']?/i)||pdisp.match(/filename=["']?([^"';\r\n]+)["']?/i)||[])[1]||'').trim();
        if(pctl.includes('multipart/')){
          parse(pbody, pct); continue;
        }
        if(pname||pdisp.includes('attachment')||(pct&&!pctl.includes('text/'))){
          const attObj={name:pname||'bijlage',type:(pct.split(';')[0]||'application/octet-stream').trim()};
          if(withContent){ attObj.b64=pbody.replace(/\s/g,''); }
          attachments.push(attObj);
          continue;
        }
        const dec=decodePart(pbody,penc,pcharset);
        if(pctl.includes('text/html')&&!html) html=dec;
        else if(pctl.includes('text/plain')&&!text) text=dec;
      }
    } else if(lct.includes('text/html')){
      html=rawBody;
    } else if(lct && !lct.includes('text/')){
      attachments.push({name:'bijlage', type:(lct.split(';')[0]||'application/octet-stream').trim()});
    } else {
      text=rawBody;
    }
  }
  parse(body, contentType||'');
  if(!text && !html){
    const printable = (body||'').split('').filter(c=>{ const cc=c.charCodeAt(0); return cc>=32&&cc<127; }).length;
    const ratio = body ? printable/body.length : 1;
    if(ratio < 0.8) text='[Deze e-mail bevat alleen bijlagen of binaire inhoud die niet in de browser kan worden weergegeven.]';
  }
  return {text:text.trim(), html, attachments};
}

// Extraheert leesbare tekst uit een mail-body (backwards compat).
function imapExtractText(body, contentType){
  const r=imapExtractBody(body,contentType);
  if(r.html) return imapStripHtml(r.html);
  return r.text||body;
}

// Haalt de volledige body van één bericht op via IMAP FETCH <seq> BODY.PEEK[].
async function imapFetchBody(env, type, folderKey, seq){
  const m = imapMailboxCfg(env, type);
  if(!m) return { ok:false, error:'Onbekend mailtype' };
  if(!m.pass) return { ok:false, error:'Geen IMAP-wachtwoord ingesteld voor '+m.label+' (secret ontbreekt)' };
  const key = ['inbox','sent','trash'].includes(folderKey) ? folderKey : 'inbox';
  let socket;
  try {
    socket = connect({ hostname: m.host, port: m.port }, { secureTransport: 'on', allowHalfOpen: false });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const enc = new TextEncoder();
    const send = (s) => writer.write(enc.encode(s + '\r\n'));
    const q = (s) => '"' + String(s).replace(/([\\"])/g,'\\$1') + '"';

    await reader.read().catch(()=>{});
    await send('A1 LOGIN ' + q(m.user) + ' ' + q(m.pass));
    let resp = await imapReadUntilTagged(reader, 'A1 ', 8192);
    if(!/A1 OK/i.test(resp)){ try{ writer.close(); }catch(_){} return { ok:false, error:'IMAP-login mislukt voor '+m.label }; }

    let folder = 'INBOX';
    if(key !== 'inbox'){
      let names = [];
      try{ await send('AL LIST "" "*"'); const lr = await imapReadUntilTagged(reader,'AL ',32768); names = imapParseFolderNames(lr); }catch(_){}
      const found = imapPickFolder(names, key);
      if(!found){ try{ await send('A9 LOGOUT'); }catch(_){} try{ writer.close(); }catch(_){} return { ok:false, error:'Map niet gevonden' }; }
      folder = found;
    }

    await send('A2 SELECT ' + q(folder));
    resp = await imapReadUntilTagged(reader, 'A2 ', 8192);
    if(!/A2 OK/i.test(resp)){ try{ await send('A9 LOGOUT'); }catch(_){} try{ writer.close(); }catch(_){} return { ok:false, error:'Kan map niet openen' }; }

    await send('A3 FETCH ' + seq + ' (BODY.PEEK[])');
    resp = await imapReadUntilTagged(reader, 'A3 ', 800000);
    try{ await send('A4 STORE ' + seq + ' +FLAGS (\\Seen)'); await imapReadUntilTagged(reader, 'A4 ', 2048); }catch(_){}
    try{ await send('A9 LOGOUT'); }catch(_){}
    try{ writer.close(); }catch(_){}

    const bm = resp.match(/\* \d+ FETCH \([\s\S]*?BODY\[\] \{(\d+)\}\r\n([\s\S]*)/i);
    if(!bm) return { ok:false, error:'Bericht niet gevonden of leeg' };
    const raw = bm[2].slice(0, parseInt(bm[1],10));
    let splitIdx = raw.indexOf('\r\n\r\n'), outerSepLen = 4;
    if(splitIdx < 0){ splitIdx = raw.indexOf('\n\n'); outerSepLen = 2; }
    const headerPart = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
    const bodyPart   = splitIdx >= 0 ? raw.slice(splitIdx + outerSepLen) : '';
    const contentType = imapHeaderField(headerPart,'Content-Type');
    const charset = ((contentType||'').match(/charset=["']?([^"';\s\r\n]+)/i)||[])[1]||'utf-8';
    const cte = (imapHeaderField(headerPart,'Content-Transfer-Encoding')||'').toLowerCase().trim();
    let bodyDecoded = bodyPart;
    try{
      if(cte==='quoted-printable') bodyDecoded = imapDecodeQP(bodyPart, charset);
      else if(cte==='base64'){
        const bin=atob(bodyPart.replace(/\s/g,''));
        const b=new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
        bodyDecoded=new TextDecoder(charset||'utf-8').decode(b);
      }
    }catch(_){}
    const extracted = imapExtractBody(bodyDecoded, contentType);
    return {
      ok:true,
      from: imapHeaderField(headerPart,'From'),
      to:   imapHeaderField(headerPart,'To'),
      subject: imapHeaderField(headerPart,'Subject'),
      date: imapHeaderField(headerPart,'Date'),
      text: clip(extracted.text, 60000),
      html: clip(extracted.html, 200000),
      attachments: extracted.attachments
    };
  } catch(err){
    try{ if(socket) socket.close(); }catch(_){}
    return { ok:false, error:'IMAP-verbinding mislukt: '+(err&&err.message?err.message:'onbekende fout') };
  }
}

/* ============================================================ *
 * HANDLER — admin-mail-read (open volledig bericht)
 * ============================================================ */
async function handleAdminMailRead(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const type = String(body.type||'');
  if(!['admin','contact','info'].includes(type)) return json({ ok:false, error:'Onbekend mailtype' }, 400);
  const folder = String(body.folder||'inbox').toLowerCase();
  if(!['inbox','sent','trash'].includes(folder)) return json({ ok:false, error:'Onbekende map' }, 400);
  const seq = parseInt(body.seq, 10);
  if(!seq || seq < 1) return json({ ok:false, error:'Ongeldig berichtnummer' }, 400);
  const result = await imapFetchBody(env, type, folder, seq);
  if(!result.ok) return json({ ok:false, error: result.error || 'Bericht ophalen mislukt' });
  return json({ ok:true, from:result.from, to:result.to, subject:result.subject, date:result.date, text:result.text, html:result.html||'', attachments:result.attachments||[] });
}

/* ============================================================ *
 * HANDLER — admin-mail-inbox (admin, Mailcentrum)
 * Haalt de laatste binnengekomen mails op (alleen-lezen, IMAP).
 * Vereist Cloudflare Secrets IMAP_PASS_ADMIN / IMAP_PASS_CONTACT /
 * IMAP_PASS_INFO (gebruikersnaam = het mailadres zelf).
 * ============================================================ */
async function handleAdminMailInbox(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  const type = String(body.type||'');
  if(!['admin','contact','info'].includes(type)) return json({ ok:false, error:'Onbekend mailtype' }, 400);
  const folder = String(body.folder||'inbox').toLowerCase();
  if(!['inbox','sent','trash'].includes(folder)) return json({ ok:false, error:'Onbekende map' }, 400);
  const result = await imapFetchFolder(env, type, folder, body.limit);
  if(!result.ok) return json({ ok:false, error: result.error || 'Map ophalen mislukt' });
  return json({ ok:true, label:result.label, folder:result.folder, count:result.count, messages:result.messages });
}

/* ============================================================ *
 * HANDLER — admin-feedback (leest feedback-collectie via SA)
 * ============================================================ */
async function handleAdminFeedback(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  if(!saToken) return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500);
  const items = await saFsList(saToken, 'feedback', 500);
  items.sort((a,b)=>{ const ta=new Date(a.createdAt||0).getTime(); const tb=new Date(b.createdAt||0).getTime(); return tb-ta; });
  return json({ ok:true, items });
}
async function handleAdminFeedbackUpdate(body, env, request){
  const auth = (request && request.headers && request.headers.get('Authorization')) || '';
  const idToken = auth.indexOf('Bearer ')===0 ? auth.slice(7) : (body.idToken || '');
  if(!idToken) return json({ ok:false, error:'Niet geautoriseerd' }, 401);
  const caller = await verifyCallerToken(env, idToken);
  if(!caller) return json({ ok:false, error:'Sessie ongeldig of verlopen' }, 401);
  let saToken = null; try { saToken = await getServiceAccountToken(env); } catch(_){}
  if(!(await isCallerAdmin(env, saToken, caller))) return json({ ok:false, error:'Alleen beheerders mogen dit doen' }, 403);
  if(!saToken) return json({ ok:false, error:'Serverconfiguratie ontbreekt' }, 500);
  const id = clip(String(body.id||''), 200);
  if(!id) return json({ ok:false, error:'Geen feedback-id' }, 400);
  const patch = {};
  if(body.status) patch.status = clip(String(body.status),50);
  if(body.adminNote !== undefined) patch.adminNote = clip(String(body.adminNote||''),2000);
  patch.reviewedAt = new Date().toISOString();
  patch.reviewedBy = caller.uid || '';
  await saFsPatch(saToken, 'feedback/'+id, patch);
  return json({ ok:true });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    const reqUrl = new URL(request.url);
    const path = reqUrl.pathname.replace(/\/+$/, '');

    /* ---- admin.scoutinghub.nl: proxy naar /admin/-pad op hoofdsite ---- */
    const ADMIN_HOST = cfg(env, 'ADMIN_SITE_HOST', 'admin.scoutinghub.nl');
    const reqHost = (request.headers.get('host') || reqUrl.hostname || '').toLowerCase();
    if (reqHost === ADMIN_HOST && !reqUrl.pathname.startsWith('/api/') && path !== '/api') {
      const mainHost = appBaseUrl(env).replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const target = new URL(request.url);
      target.protocol = 'https:';
      target.hostname = mainHost;
      target.port = '';
      if (target.pathname === '/' || target.pathname === '') target.pathname = '/admin/';
      const fwdHeaders = new Headers(request.headers);
      fwdHeaders.delete('host');
      try {
        const upstream = await fetch(target.toString(), {
          method: request.method,
          headers: fwdHeaders,
          body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
          redirect: 'follow'
        });
        return new Response(upstream.body, upstream);
      } catch (_) {
        return new Response('Admin-site tijdelijk niet bereikbaar', { status: 502 });
      }
    }

    if (path.endsWith('/api/request-access') || path.endsWith('/request-access')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/request-access' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleRequestAccess((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 200); }
    }
    if (path.endsWith('/api/create-account') || path.endsWith('/create-account')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/create-account' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleCreateAccount((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/reject-request') || path.endsWith('/reject-request')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/reject-request' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleRejectRequest((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/delete-account') || path.endsWith('/delete-account')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/delete-account' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleDeleteAccount((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/set-active') || path.endsWith('/set-active')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/set-active' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleSetActive((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/feedback-submit') || path.endsWith('/feedback-submit')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/feedback-submit' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleFeedback((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/admin-feedback') || path.endsWith('/admin-feedback')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminFeedback((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/admin-feedback-update') || path.endsWith('/admin-feedback-update')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminFeedbackUpdate((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/send-password-reset') || path.endsWith('/send-password-reset')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/send-password-reset' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleSendPasswordReset((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }
    if (path.endsWith('/api/request-password-reset') || path.endsWith('/request-password-reset')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/request-password-reset' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handlePublicPasswordReset((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:true, message:'Als er een account bestaat met dit e-mailadres, ontvang je een herstel-link.' }); }
    }
    if (path.endsWith('/api/admin-stats') || path.endsWith('/admin-stats')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/admin-stats' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminStats((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-status') || path.endsWith('/admin-status')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/admin-status' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminStatus((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-mail-test') || path.endsWith('/admin-mail-test')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/admin-mail-test' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminMailTest((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-mail-send') || path.endsWith('/admin-mail-send')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/admin-mail-send' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminMailSend((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-mail-read') || path.endsWith('/admin-mail-read')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/admin-mail-read' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminMailRead((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-mail-inbox') || path.endsWith('/admin-mail-inbox')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/admin-mail-inbox' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminMailInbox((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/support-notify') || path.endsWith('/support-notify')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/support-notify' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminSupportNotify((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-mail-unread') || path.endsWith('/admin-mail-unread')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminMailUnread((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-mail-attachment') || path.endsWith('/admin-mail-attachment')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminMailAttachment((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-newsletter-list') || path.endsWith('/admin-newsletter-list')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminNewsletterList((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (path.endsWith('/api/admin-newsletter-send') || path.endsWith('/admin-newsletter-send')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST' }, 405);
      let b = {}; try { b = await request.json(); } catch(_){ b = {}; }
      try { return await handleAdminNewsletterSend((b && typeof b==='object') ? b : {}, env, request); }
      catch(err){ return json({ ok:false, error:'Onverwachte fout' }, 500); }
    }

    if (request.method === 'GET') {
      return json({ status: 'ok', service: 'ScoutingHub API', routes: ['/parse','/sync','/reglement','/api/request-access','/api/create-account','/api/reject-request'], hint: 'Gebruik POST met JSON-body' });
    }
    if (request.method !== 'POST') return json({ error: 'Gebruik POST', routes: ROUTES }, 405);

    let body = {};
    try { body = await request.json(); } catch (_) { body = {}; }
    if (!body || typeof body !== 'object') body = {};
    const is = (...names) => names.some(n => path.endsWith(n));
    try {
      if (is('/parse', '/parseToernooiUrl')) return await handleParseToernooiUrl(body);
      if (is('/sync', '/syncTournamentResults')) return await handleSyncTournamentResults(body);
      if (is('/reglement', '/parseToernooiReglement')) return await handleParseToernooiReglement(body);
      return json({ error: 'Onbekende route', routes: ['/parse', '/reglement', '/sync'] }, 404);
    } catch (err) {
      return json({ error: 'Onverwachte fout', message: err && err.message ? err.message : String(err) }, 200);
    }
  },

  /* Cloudflare Cron Trigger: 0 7 1 * * (1e vd maand om 07:00 UTC)
   * Leest concept uit Firestore admin_settings/newsletter_draft,
   * verstuurt nieuwsbrief naar alle abonnees als autoSend===true. */
  async scheduled(event, env, ctx) {
    if(event.cron === '0 7 1 * *') {
      ctx.waitUntil(handleScheduledNewsletter(env));
    }
  }
};

async function handleScheduledNewsletter(env){
  try{
    const saToken = await getServiceAccountToken(env);
    if(!saToken) return;
    const draft = await saFsGet(saToken, 'admin_settings/newsletter_draft');
    if(!draft || !draft.autoSend) return;
    const subject = String(draft.subject||'').trim();
    const message = String(draft.message||'').trim();
    if(!subject||!message) return;
    const all = await saFsList(saToken, 'access_requests', 500);
    const subs = all.filter(function(x){ return x.newsletterOptIn===true && x.email; });
    if(!subs.length) return;
    const paragraphs = message.split(/\n{2,}/).map(function(p){ return '<p style="'+MAIL_P+'">'+shEsc(p).replace(/\n/g,'<br>')+'</p>'; }).join('');
    const htmlBody = paragraphs
      + '<p style="'+MAIL_P+'">Met vriendelijke groet,<br>Team ScoutingHub</p>'
      + '<p style="'+MAIL_MUTED+'">Je ontvangt deze nieuwsbrief omdat je je hebt aangemeld. Stuur een mail naar contact@scoutinghub.nl om je af te melden.</p>';
    const text = message+'\n\nMet vriendelijke groet,\nTeam ScoutingHub\n\nAfmelden: stuur een mail naar contact@scoutinghub.nl';
    for(const sub of subs){
      try{ await sendMail(env, { from: contactFrom(env), to: sub.email, subject, html: mailShell(env,subject,htmlBody), text }); }catch(_){}
    }
  }catch(_){}
}

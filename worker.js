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
    // 3. categorie: poule-naam via poule-referentie, anders pouleKey/pouleId ruw
    if (m.category == null) {
      m.category = SorNull(resolveRef(m.poule, poulesById)) || SorNull(firstNonEmpty(m.pouleKey, m.pouleId)) || null;
    }
    // 4. stage uit `round`
    if (m.stage == null && m.round != null) m.stage = m.round;
    // 5. veld: `field` (referentie → naam, anders directe waarde), val terug op numInField
    if (m.field != null) {
      const fn = resolveRef(m.field, fieldsById);
      m.field = SorNull(fn) || (typeof m.field === 'object' ? null : SorNull(m.field));
    }
    if (m.field == null && m.numInField != null) m.field = SorNull(m.numInField);
    // Lange veld-/sportpark-namen ("Veld SO Soest, Bosstraat, Soest, NL") inkorten:
    // >20 tekens → gebruik het nummer (numInField of eerste getal), anders het
    // eerste segment vóór de komma. Korte waarden ("1", "SEC") blijven ongemoeid.
    if (m.field != null) m.field = SorNull(shortenFieldName(m.field, m.numInField));
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
 * FASE 1 — Toegangsaanvraag (invite-only). Additief.
 * Schrijft naar Firestore-collectie access_requests (publieke create,
 * strikt gevalideerd in de Security Rules) en stuurt twee mails via
 * Resend. FROM = admin@scoutinghub.nl (auth/aanvragen-mailbox).
 * Geen bestaande data aangeraakt; geen secrets in de frontend.
 * ============================================================ */
const SH_FB = { projectId: 'database-scouting', apiKey: 'AIzaSyBDeLaGfzM1PN8Cl8E6nlIe8FxxxXLwRyY' };
const SH_MAIL_FROM = 'ScoutingHub <admin@scoutinghub.nl>';
const SH_MAIL_ADMIN_TO = 'marcelsteeman1@gmail.com';

function shValidEmail(e) {
  return typeof e === 'string' && e.length > 3 && e.length < 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
function shEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
}
async function shWriteAccessRequest(doc) {
  const url = `https://firestore.googleapis.com/v1/projects/${SH_FB.projectId}/databases/(default)/documents/access_requests?key=${SH_FB.apiKey}`;
  const fields = {
    email:        { stringValue: doc.email },
    name:         { stringValue: doc.name || '' },
    club:         { stringValue: doc.club || '' },
    message:      { stringValue: doc.message || '' },
    status:       { stringValue: 'pending' },
    requestedAt:  { timestampValue: new Date().toISOString() },
    reviewedAt:   { nullValue: null },
    reviewedBy:   { nullValue: null },
    assignedRole: { nullValue: null },
    authUid:      { nullValue: null },
    source:       { stringValue: 'public_request_form' }
  };
  try {
    const r = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
    return r.ok;
  } catch (_) { return false; }
}
async function shSendMail(env, to, subject, html) {
  if (!env || !env.RESEND_API_KEY) return false;
  try {
    const r = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: SH_MAIL_FROM, to: [to], subject, html })
    });
    return r.ok;
  } catch (_) { return false; }
}
async function handleRequestAccess(body, env) {
  const email = (body && body.email ? String(body.email) : '').trim();
  const name = (body && body.name ? String(body.name) : '').trim().slice(0, 120);
  const club = (body && body.club ? String(body.club) : '').trim().slice(0, 160);
  const message = (body && body.message ? String(body.message) : '').trim().slice(0, 1000);
  if (!email) return json({ ok: false, error: 'E-mailadres is verplicht.' }, 200);
  if (!shValidEmail(email)) return json({ ok: false, error: 'Dit is geen geldig e-mailadres.' }, 200);

  const saved = await shWriteAccessRequest({ email, name, club, message });

  const intern =
    '<h2 style="margin:0 0 10px">Nieuwe toegangsaanvraag — ScoutingHub</h2>' +
    '<p style="font-size:14px;line-height:1.6">' +
    '<strong>E-mail:</strong> ' + shEsc(email) + '<br>' +
    '<strong>Naam:</strong> ' + (shEsc(name) || '\u2014') + '<br>' +
    '<strong>Club/organisatie:</strong> ' + (shEsc(club) || '\u2014') + '<br>' +
    '<strong>Bericht:</strong> ' + (shEsc(message) || '\u2014') + '</p>' +
    '<p style="font-size:12px;color:#888">Status: pending \u00b7 bron: public_request_form</p>';
  const m1 = await shSendMail(env, SH_MAIL_ADMIN_TO, 'Nieuwe toegang aanvraag — ScoutingHub', intern);

  const conf =
    '<p style="font-size:14px;line-height:1.6">Bedankt voor je aanvraag voor ScoutingHub.</p>' +
    '<p style="font-size:14px;line-height:1.6">We hebben je aanvraag ontvangen en nemen binnen 24 uur contact met je op. Check ook je spam-map.</p>' +
    '<p style="font-size:14px;line-height:1.6">Groet,<br>ScoutingHub</p>';
  const m2 = await shSendMail(env, email, 'Aanvraag ontvangen — ScoutingHub', conf);

  return json({ ok: true, saved: saved, mailSent: (m1 && m2), mailConfigured: !!(env && env.RESEND_API_KEY) }, 200);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    // FASE 1 — expliciete API-route VÓÓR de generieke afhandeling, zodat
    // /api/request-access altijd wordt geraakt (en zichtbaar bestaat).
    if (path.endsWith('/api/request-access') || path.endsWith('/request-access')) {
      if (request.method !== 'POST') return json({ error: 'Gebruik POST voor /api/request-access' }, 405);
      let rbody = {};
      try { rbody = await request.json(); } catch (_) { rbody = {}; }
      if (!rbody || typeof rbody !== 'object') rbody = {};
      try { return await handleRequestAccess(rbody, env); }
      catch (err) { return json({ ok: false, error: 'Onverwachte fout', message: err && err.message ? err.message : String(err) }, 200); }
    }

    // GET → vriendelijke status (handig in de Preview-balk van Cloudflare)
    if (request.method === 'GET') {
      return json({ status: 'ok', service: 'ScoutingHub toernooi-API', routes: ['/parse', '/sync', '/reglement', '/api/request-access'], hint: 'Gebruik POST met JSON-body' });
    }
    if (request.method !== 'POST') return json({ error: 'Gebruik POST', routes: ROUTES }, 405);

    let body = {};
    try { body = await request.json(); } catch (_) { body = {}; }
    if (!body || typeof body !== 'object') body = {};

    // Beide naamschema's werken: kort (/parse) én lang (/parseToernooiUrl)
    const is = (...names) => names.some(n => path.endsWith(n));

    try {
      if (is('/parse', '/parseToernooiUrl')) return await handleParseToernooiUrl(body);
      if (is('/sync', '/syncTournamentResults')) return await handleSyncTournamentResults(body);
      if (is('/reglement', '/parseToernooiReglement')) return await handleParseToernooiReglement(body);
      return json({ error: 'Onbekende route', routes: ['/parse', '/reglement', '/sync'] }, 404);
    } catch (err) {
      return json({ error: 'Onverwachte fout', message: err && err.message ? err.message : String(err) }, 200);
    }
  }
};

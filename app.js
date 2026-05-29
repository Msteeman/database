
/* ==========================================================
   SCOUTINGHUB — Marcel Steeman
   FC Twente / Heracles — O12/O15
   Met Firebase Auth + Firestore voor cross-device sync
   ========================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc,
  onSnapshot, setDoc, deleteDoc, getDoc,
  /* s35cg: extra imports voor rollen-systeem */
  updateDoc, query, where, getDocs, orderBy, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* =============== FIREBASE CONFIG =============== */
const firebaseConfig = {
  apiKey: "AIzaSyBDeLaGfzM1PN8Cl8E6nlIe8FxxxXLwRyY",
  authDomain: "database-scouting.firebaseapp.com",
  projectId: "database-scouting",
  storageBucket: "database-scouting.firebasestorage.app",
  messagingSenderId: "632216488963",
  appId: "1:632216488963:web:f1ebb1d16b8a76f49c9236",
  measurementId: "G-P74K24RBZ1"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
try { await setPersistence(auth, browserLocalPersistence); } catch(e) { console.warn('setPersistence failed (non-fatal):', e); }

/* =============== CONFIG =============== */
const AUTO_LOGOUT_MS = 30 * 60 * 1000;

const GRADES = ['A','B','C','D'];

const POSITIONS_BY_LINE = {
  'Keeper':      [{code:'GK', label:'Keeper'}],
  'Verdediging': [
    {code:'LB', label:'Linksback'},
    {code:'LCV', label:'Linker centrale verdediger'},
    {code:'CV', label:'Centrale verdediger'},
    {code:'RCV', label:'Rechter centrale verdediger'},
    {code:'RB', label:'Rechtsback'}
  ],
  'Middenveld':  [
    {code:'VM', label:'Verdedigende middenvelder'},
    {code:'CM', label:'Centrale middenvelder'},
    {code:'AM', label:'Aanvallende middenvelder'},
    {code:'LM', label:'Linker middenvelder'},
    {code:'RM', label:'Rechter middenvelder'}
  ],
  'Aanval':      [
    {code:'LV', label:'Linksbuiten'},
    {code:'CS', label:'Centrumspits'},
    {code:'RV', label:'Rechtsbuiten'}
  ]
};
const ALL_POSITIONS = Object.values(POSITIONS_BY_LINE).flat();

/* =============== GEO: REGIO UTRECHT + VELUWE =============== */
const REGION_BOUNDS = [[51.90, 4.75], [52.50, 6.15]];
const REGION_CENTER = [52.18, 5.45];
const REGION_ZOOM = 9;

const CLUB_CITY = {
  'fc utrecht': 'Utrecht', 'utrecht': 'Utrecht',
  'jong fc utrecht': 'Utrecht', 'jong utrecht': 'Utrecht',
  'usv elinkwijk': 'Utrecht', 'elinkwijk': 'Utrecht',
  'kampong': 'Utrecht', 'hercules': 'Utrecht',
  'velox': 'Utrecht', 'desto': 'Utrecht', 'pvc': 'Utrecht',
  'sv saestum': 'Zeist', 'sv zeist': 'Zeist', 'jonathan': 'Zeist',
  'sportlust 46': 'Woerden', "sportlust '46": 'Woerden',
  'vrc': 'Veenendaal', 'vv veenendaal': 'Veenendaal', 'gvvv': 'Veenendaal',
  'ijsselmeervogels': 'Spakenburg', 'sv spakenburg': 'Spakenburg', 'spakenburg': 'Spakenburg',
  'aeolus': 'Amersfoort', 'vv amsvorde': 'Amersfoort', 'asc nieuwland': 'Amersfoort',
  'apwc': 'Amersfoort', 'cjvv': 'Amersfoort', 'asv arsenal': 'Amersfoort',
  'asc dvsa': 'Amersfoort', 'dvsa': 'Amersfoort',
  'avv columbia': 'Apeldoorn', 'csv apeldoorn': 'Apeldoorn',
  "csv '28": 'Apeldoorn', "aav '28": 'Apeldoorn',
  'wsv': 'Apeldoorn', 'robur et velocitas': 'Apeldoorn',
  'avc heerde': 'Heerde',
  'vv ermelo': 'Ermelo', "dvs '33 ermelo": 'Ermelo', "dvs '33": 'Ermelo',
  'vvog': 'Harderwijk', 'vvog harderwijk': 'Harderwijk',
  'vv harderwijk': 'Harderwijk',
  'go ahead eagles': 'Deventer',
  'vitesse': 'Arnhem',
  'pec zwolle': 'Zwolle',
  'almere city fc': 'Almere', 'almere city': 'Almere',
  'fc twente': 'Enschede', 'twente': 'Enschede',
  'heracles almelo': 'Almelo', 'heracles': 'Almelo',
  'psv': 'Eindhoven', 'ajax': 'Amsterdam', 'feyenoord': 'Rotterdam',
  'az': 'Alkmaar', 'nec': 'Nijmegen',
  'jong ajax': 'Amsterdam', 'jong psv': 'Eindhoven', 'jong az': 'Alkmaar'
};

const CITY_COORDS = {
  'Utrecht':     {lat: 52.0907, lng: 5.1214},
  'Amersfoort':  {lat: 52.1561, lng: 5.3878},
  'Zeist':       {lat: 52.0894, lng: 5.2317},
  'Veenendaal':  {lat: 52.0286, lng: 5.5547},
  'Woerden':     {lat: 52.0858, lng: 4.8836},
  'Nieuwegein':  {lat: 52.0298, lng: 5.0808},
  'Houten':      {lat: 52.0353, lng: 5.1681},
  'IJsselstein': {lat: 52.0203, lng: 5.0414},
  'Bunschoten':  {lat: 52.2436, lng: 5.3781},
  'Spakenburg':  {lat: 52.2497, lng: 5.3692},
  'Soest':       {lat: 52.1736, lng: 5.2911},
  'Baarn':       {lat: 52.2117, lng: 5.2900},
  'Wijk bij Duurstede': {lat: 51.9744, lng: 5.3406},
  'Driebergen':  {lat: 52.0539, lng: 5.2772},
  'Bilthoven':   {lat: 52.1364, lng: 5.1989},
  'De Bilt':     {lat: 52.1097, lng: 5.1811},
  'Maarssen':    {lat: 52.1392, lng: 5.0381},
  'Apeldoorn':   {lat: 52.2112, lng: 5.9699},
  'Ermelo':      {lat: 52.2989, lng: 5.6233},
  'Harderwijk':  {lat: 52.3411, lng: 5.6208},
  'Putten':      {lat: 52.2614, lng: 5.6086},
  'Nunspeet':    {lat: 52.3833, lng: 5.7794},
  'Heerde':      {lat: 52.3897, lng: 6.0364},
  'Elburg':      {lat: 52.4467, lng: 5.8369},
  'Nijkerk':     {lat: 52.2206, lng: 5.4811},
  'Barneveld':   {lat: 52.1394, lng: 5.5839},
  'Voorthuizen': {lat: 52.1844, lng: 5.6014},
  'Hilversum':   {lat: 52.2292, lng: 5.1669},
  'Almere':      {lat: 52.3508, lng: 5.2647},
  'Zwolle':      {lat: 52.5168, lng: 6.0830},
  'Deventer':    {lat: 52.2550, lng: 6.1639},
  'Arnhem':      {lat: 51.9851, lng: 5.8987},
  'Amsterdam':   {lat: 52.3676, lng: 4.9041},
  'Rotterdam':   {lat: 51.9244, lng: 4.4777},
  'Den Haag':    {lat: 52.0705, lng: 4.3007},
  'Eindhoven':   {lat: 51.4416, lng: 5.4697},
  'Enschede':    {lat: 52.2215, lng: 6.8937},
  'Almelo':      {lat: 52.3508, lng: 6.6622},
  'Nijmegen':    {lat: 51.8126, lng: 5.8372},
  'Alkmaar':     {lat: 52.6324, lng: 4.7534}
};

/* === CLUB_ADRESSEN: handmatig geverifieerde sportpark-adressen === */
const CLUB_ADRESSEN = {};

function fillClubDatalist(){
  const dl = document.getElementById('club-suggestions');
  if(!dl) return;
  const names = new Set();
  Object.values(CLUB_ADRESSEN).forEach(c => { if(c && c.naam) names.add(c.naam); });
  // v70h-s16: HV-clubs ook toevoegen
  try {
    if(typeof HV_CLUBS !== 'undefined' && Array.isArray(HV_CLUBS)){
      HV_CLUBS.forEach(c => { if(c && c.naam) names.add(c.naam); });
    }
  } catch(_){}
  const sorted = Array.from(names).sort((a,b) => a.localeCompare(b, 'nl'));
  dl.innerHTML = sorted.map(n => `<option value="${n.replace(/"/g,'&quot;')}"></option>`).join('');
}
if(document.readyState !== 'loading') fillClubDatalist();
else document.addEventListener('DOMContentLoaded', fillClubDatalist);

const CLUB_CACHE_KEY = 'scout_club_city_cache_v1';
let _clubCache = (()=>{
  try { return JSON.parse(localStorage.getItem(CLUB_CACHE_KEY) || '{}') || {}; }
  catch(_) { return {}; }
})();
function saveClubCache(){
  try { localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify(_clubCache)); } catch(_){}
}
const CITY_CACHE_KEY = 'scout_city_coords_cache_v1';
let _cityCache = (()=>{
  try { return JSON.parse(localStorage.getItem(CITY_CACHE_KEY) || '{}') || {}; }
  catch(_) { return {}; }
})();
function saveCityCache(){
  try { localStorage.setItem(CITY_CACHE_KEY, JSON.stringify(_cityCache)); } catch(_){}
}
const CLUB_ADDR_KEY = 'scout_club_address_cache_v1';
let _clubAddrCache = (()=>{
  try { return JSON.parse(localStorage.getItem(CLUB_ADDR_KEY) || '{}') || {}; }
  catch(_) { return {}; }
})();
function saveClubAddrCache(){
  try { localStorage.setItem(CLUB_ADDR_KEY, JSON.stringify(_clubAddrCache)); } catch(_){}
}

// Pre-fill cache zodra app laadt — geen netwerk nodig voor bekende clubs.
// PREFILL_CLUB_ADRESSEN_DONE

// v70h: omgekeerde index (naam.toLowerCase() -> entry) zodat lookups ook werken
// wanneer een gebruiker de volledige clubnaam typt/kiest i.p.v. de slug.
const CLUB_ADRESSEN_BY_NAAM = (function(){
  const out = {};
  try {
    for(const k in CLUB_ADRESSEN){
      const e = CLUB_ADRESSEN[k];
      if(e && e.naam){
        const nk = String(e.naam).trim().toLowerCase();
        if(!out[nk]) out[nk] = e;
      }
    }
  } catch(_){}
  return out;
})();

// v70h-s16: oude findClubInfo verwijderd — vervangen in HV-block onder.
window.findClubInfo = window.findClubInfo || function(value){
  if(!value || typeof CLUB_ADRESSEN === 'undefined') return null;
  const v = String(value).trim().toLowerCase();
  if(!v) return null;
  if(CLUB_ADRESSEN[v]) return CLUB_ADRESSEN[v];
  if(CLUB_ADRESSEN_BY_NAAM[v]) return CLUB_ADRESSEN_BY_NAAM[v];
  return null;
};

/* === v70h-s16: HollandseVelden import (letters A-D, 661 clubs) ===
   Parallel adresboek naast CLUB_ADRESSEN. Handmatig blijft leidend
   (CLUB_ADRESSEN heeft lat/lon + aliassen + jeugdopleidingen);
   HV vult de overige Nederlandse clubs aan. */
// HV_CLUBS geladen via clubs-data.js
const HV_CLUB_ADRESSEN = (function(){
  const out = {};
  try {
    for(const c of HV_CLUBS){
      if(!c) continue;
      // s35n: adres/postcode/plaats apart exposen, plus volledige string voor
      // back-compat met UI die `adresFull` verwacht.
      const adresFull = [c.adres, c.postcode, c.plaats].filter(Boolean).join(', ');
      const entry = {
        naam: c.naam,
        sportpark: c.sportpark || '',
        adres: c.adres || '',
        postcode: c.postcode || '',
        adresFull: adresFull,
        plaats: c.plaats || '',
        lat: null,
        lon: null,
        _hv: true
      };
      const keys = Array.isArray(c.keys) ? c.keys : [];
      for(const k of keys){
        const lk = String(k || '').trim().toLowerCase();
        if(lk && !out[lk]) out[lk] = entry;
      }
      // Ook full-naam lookup
      const nk = String(c.naam || '').trim().toLowerCase();
      if(nk && !out[nk]) out[nk] = entry;
    }
  } catch(_){}
  return out;
})();
try { window.HV_CLUB_ADRESSEN = HV_CLUB_ADRESSEN; } catch(_){}

// v70h-s16: uitgebreide lookup met HV-fallback.
// Volgorde: handmatig (CLUB_ADRESSEN) -> handmatig naam -> HV exact ->
// handmatig fuzzy -> HV fuzzy.
// s35n: normaliseer clubnaam — strip leeftijdscategorie aan eind.
// Voorbeelden: "FC Twente O12" -> "fc twente", "AS'80 O12-1" -> "as'80",
// "VRC O11-2" -> "vrc". Patroon: spatie + O of o + cijfers, evt. -cijfers.
function _normalizeClubName(value){
  if(!value) return '';
  let v = String(value).trim().toLowerCase();
  // strip leeftijdscategorie
  v = v.replace(/\s+[ou]\d+(?:-\d+)?$/i, '').trim();
  return v;
}
window._normalizeClubName = _normalizeClubName;

window.findClubInfo = function(value){
  if(!value || typeof CLUB_ADRESSEN === 'undefined') return null;
  const raw = String(value).trim().toLowerCase();
  if(!raw) return null;
  // s35n: stripte versie zonder leeftijdscategorie
  const v = _normalizeClubName(value);
  if(!v) return null;
  // Stap 1+2: handmatig leidend (lat/lon + zorgvuldig getuned)
  if(CLUB_ADRESSEN[v]) return CLUB_ADRESSEN[v];
  if(CLUB_ADRESSEN_BY_NAAM[v]) return CLUB_ADRESSEN_BY_NAAM[v];
  // Stap 3: HV exact match
  if(HV_CLUB_ADRESSEN[v]) return HV_CLUB_ADRESSEN[v];
  // Stap 4: handmatig fuzzy (startswith/endswith op slug)
  for(const k in CLUB_ADRESSEN){
    if(v.startsWith(k) || v.endsWith(k)) return CLUB_ADRESSEN[k];
  }
  // Stap 5: handmatig fuzzy (naam contains)
  for(const nk in CLUB_ADRESSEN_BY_NAAM){
    if(v.includes(nk) || nk.includes(v)) return CLUB_ADRESSEN_BY_NAAM[nk];
  }
  // Stap 6: HV fuzzy — keys >=3 chars (s35n: was 4, maar match-test is
  // strikt genoeg: exact, of trailing space).
  for(const hk in HV_CLUB_ADRESSEN){
    if(hk.length < 3) continue;
    if(v === hk || v.startsWith(hk + ' ') || hk.startsWith(v + ' ')){
      return HV_CLUB_ADRESSEN[hk];
    }
  }
  // s35n: split op '/' voor gedeelde academies (FC Twente/Heracles).
  if(v.includes('/')){
    for(const part of v.split('/').map(s=>s.trim()).filter(Boolean)){
      if(HV_CLUB_ADRESSEN[part]) return HV_CLUB_ADRESSEN[part];
      for(const hk in HV_CLUB_ADRESSEN){
        if(hk.length < 3) continue;
        if(part === hk || part.startsWith(hk + ' ') || hk.startsWith(part + ' ')){
          return HV_CLUB_ADRESSEN[hk];
        }
      }
    }
  }
  return null;
};

(function prefillClubCaches(){
  try {
    let dirty = false;
    for (const [k, v] of Object.entries(CLUB_ADRESSEN)) {
      if (v.adres && _clubAddrCache[k] !== v.adres) { _clubAddrCache[k] = v.adres; dirty = true; }
      if (v.plaats && _clubCache[k] !== v.plaats) { _clubCache[k] = v.plaats; dirty = true; }
      if (v.plaats && v.lat && v.lon && !_cityCache[v.plaats] && !CITY_COORDS[v.plaats]) {
        _cityCache[v.plaats] = { lat: v.lat, lng: v.lon };
        dirty = true;
      }
    }
    if (dirty) { saveClubAddrCache(); saveClubCache(); saveCityCache(); }
  } catch(_){}
})();
const _inflightLookups = new Map();

function coordsForCity(city){
  if(!city) return null;
  if(CITY_COORDS[city]) return CITY_COORDS[city];
  if(_cityCache[city]) return _cityCache[city];
  return null;
}

/* ========= Nominatim helpers (v2) =========
   Strategie: meerdere zoekqueries (sportpark/stadion/clubnaam) met POI-scoring,
   daarna reverse-geocode op coords als straatadres ontbreekt. */
/* ===== s35ce: globale Nominatim-queue =====
   Probleem: cityForPlayer() wordt voor élke speler tegelijk aangeroepen → burst van
   parallel-fetches → Nominatim 429 → browser ziet missing CORS headers → console vol.
   Oplossing: één serial queue, 1.2s spacing, negatieve cache voor 429/falen.
   Geen 'Accept' header meer → geen CORS preflight → fetch is "simple request".        */
const _NOM_GAP_MS = 1200;
let _nomLastTs = 0;
let _nomChain = Promise.resolve();
const _nomNegCache = new Map(); // url → ts (vermijdt retries binnen sessie)
const _NOM_NEG_TTL = 5 * 60 * 1000; // 5 min cooldown na fail

function _nomFetch(url){
  // Skip recent failures
  const negTs = _nomNegCache.get(url);
  if(negTs && (Date.now() - negTs) < _NOM_NEG_TTL) return Promise.resolve(null);

  // Serial chain: elke call wacht op de vorige + min 1.2s tussenpoos
  const run = _nomChain.then(async () => {
    const wait = Math.max(0, _nomLastTs + _NOM_GAP_MS - Date.now());
    if(wait > 0) await new Promise(r => setTimeout(r, wait));
    _nomLastTs = Date.now();
    try {
      // GEEN custom headers → simple CORS request, geen preflight
      const res = await fetch(url);
      if(!res.ok){
        _nomNegCache.set(url, Date.now());
        return null;
      }
      return await res.json();
    } catch(_){
      _nomNegCache.set(url, Date.now());
      return null;
    }
  });
  _nomChain = run.catch(()=>{}); // chain blijft alive
  return run;
}

async function _nominatimSearch(query){
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1&extratags=1&countrycodes=nl&accept-language=nl`;
  const data = await _nomFetch(url);
  return Array.isArray(data) ? data : [];
}
async function _nominatimReverse(lat, lon){
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=nl&zoom=18`;
  return await _nomFetch(url);
}
function _scoreHit(h){
  // Hogere score = beter resultaat. POI (sportpark/stadion) wint van settlement.
  const cls = (h.class || '').toLowerCase();
  const typ = (h.type || '').toLowerCase();
  let s = 0;
  if(cls === 'leisure'  && /sports_centre|stadium|pitch|track|park/.test(typ))      s += 220;
  else if(cls === 'amenity' && /sports_centre|stadium/.test(typ))                   s += 200;
  else if(cls === 'building'&& /sports|stadium|hall/.test(typ))                     s += 170;
  else if(cls === 'tourism'&& typ === 'attraction')                                 s += 60;
  else if(cls === 'building')                                                       s += 90;
  else if(cls === 'amenity')                                                        s += 70;
  else if(cls === 'shop')                                                           s += 40;
  else if(cls === 'highway')                                                        s += 30;
  else if(cls === 'place')                                                          s -= 60; // settlement: laatste keuze
  const tags = h.extratags || {};
  if(tags.sport && /soccer|football/i.test(tags.sport))                             s += 110;
  if(tags.club  && /sport|soccer|football/i.test(tags.club))                        s += 90;
  if(/sportpark|stadion|stadium|sportcomplex/i.test(h.display_name || ''))          s += 50;
  if(h.address?.house_number)                                                       s += 40;
  if(h.address?.road)                                                               s += 20;
  s += (parseFloat(h.importance) || 0) * 5;
  return s;
}
function _fmtAddress(a){
  if(!a) return '';
  const straat = [a.road, a.house_number].filter(Boolean).join(' ');
  const stad = a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet || '';
  const postStad = [a.postcode, stad].filter(Boolean).join(' ');
  return [straat, postStad].filter(Boolean).join(', ');
}
async function _findBestClubHit(clubName){
  // Per query 1 request; stop zodra we een sterke POI hebben.
  const queries = [
    `sportpark ${clubName}`,
    `${clubName} sportpark`,
    `${clubName} stadion`,
    `${clubName}`,
    `${clubName} voetbal Nederland`,
  ];
  let best = null, bestScore = -Infinity;
  for(const q of queries){
    const hits = await _nominatimSearch(q);
    for(const h of hits){
      const sc = _scoreHit(h);
      if(sc > bestScore){ bestScore = sc; best = h; }
    }
    if(bestScore >= 180) break;
    /* s35ce: extra sleep niet meer nodig — _nomFetch heeft globale 1.2s spacing */
  }
  return best;
}

async function lookupClubCity(clubName){
  if(!clubName) return '';
  const key = clubName.trim().toLowerCase();
  if(!key) return '';
  if(CLUB_ADRESSEN[key]){
    const a = CLUB_ADRESSEN[key];
    if(a.plaats){
      _clubCache[key] = a.plaats;
      saveClubCache();
    }
    if(a.adres){
      _clubAddrCache[key] = a.adres;
      saveClubAddrCache();
    }
    if(a.plaats && a.lat && a.lon && !CITY_COORDS[a.plaats] && !_cityCache[a.plaats]){
      _cityCache[a.plaats] = { lat: a.lat, lng: a.lon };
      saveCityCache();
    }
    return a.plaats || '';
  }
  if(CLUB_CITY[key]) return CLUB_CITY[key];
  if(_clubCache[key] !== undefined) return _clubCache[key];
  if(_inflightLookups.has(key)) return _inflightLookups.get(key);
  const promise = (async ()=>{
    try {
      const best = await _findBestClubHit(clubName);
      if(!best) return '';
      let addr = best.address || {};
      let city = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.hamlet || '';
      let formatted = _fmtAddress(addr);

      // Geen huisnummer maar wel coords? Reverse geocode voor compleet straatadres.
      if(!addr.house_number && best.lat && best.lon){
        /* s35ce: queue regelt spacing */
        const rev = await _nominatimReverse(best.lat, best.lon);
        if(rev && rev.address){
          const revFormatted = _fmtAddress(rev.address);
          if(revFormatted && revFormatted.length > formatted.length){
            formatted = revFormatted;
            addr = rev.address;
            city = city || addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.hamlet || '';
          }
        }
      }

      if(!city) return '';
      _clubCache[key] = city;
      saveClubCache();
      const adres = formatted || best.display_name || '';
      if(adres){
        _clubAddrCache[key] = adres;
        saveClubAddrCache();
      }
      if(!CITY_COORDS[city] && !_cityCache[city] && best.lat && best.lon){
        _cityCache[city] = { lat: parseFloat(best.lat), lng: parseFloat(best.lon) };
        saveCityCache();
      }
      return city;
    } catch(_){ return ''; }
    finally { _inflightLookups.delete(key); }
  })();
  _inflightLookups.set(key, promise);
  return promise;
}

async function lookupCityCoords(city){
  if(!city) return null;
  if(CITY_COORDS[city]) return CITY_COORDS[city];
  if(_cityCache[city]) return _cityCache[city];
  const key = 'city:'+city.toLowerCase();
  if(_inflightLookups.has(key)) return _inflightLookups.get(key);
  const promise = (async ()=>{
    try {
      const q = encodeURIComponent(`${city}, Nederland`);
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=nl&accept-language=nl`;
      const data = await _nomFetch(url);
      if(!Array.isArray(data) || !data.length) return null;
      const r = data[0];
      const coords = { lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
      _cityCache[city] = coords;
      saveCityCache();
      return coords;
    } catch(_){ return null; }
    finally { _inflightLookups.delete(key); }
  })();
  _inflightLookups.set(key, promise);
  return promise;
}

let _geoRerenderPending = false;
function scheduleGeoRerender(){
  if(_geoRerenderPending) return;
  _geoRerenderPending = true;
  setTimeout(()=>{
    _geoRerenderPending = false;
    if(typeof renderGeo === 'function' && document.getElementById('geo-leaflet-map')){
      renderGeo();
    }
  }, 400);
}

function cityForPlayer(p){
  if(p.plaats && p.plaats.trim()) return p.plaats.trim();
  const club = (p.club||'').trim();
  const key = club.toLowerCase();
  if(!key) return '';
  if(CLUB_ADRESSEN[key] && CLUB_ADRESSEN[key].plaats) return CLUB_ADRESSEN[key].plaats;
  if(CLUB_CITY[key]) return CLUB_CITY[key];
  // s35k: probeer de HV-adresboek (2990 clubs) vóór async Nominatim-lookup.
  // Dit voorkomt dat clubs zonder plaats-veld (PSV Eindhoven, Jonathan, ...)
  // op de Veluwe-fallback "Nederland" belanden.
  if(typeof window.findClubInfo === 'function'){
    const ci = window.findClubInfo(club);
    if(ci && ci.plaats) return ci.plaats;
  }
  if(_clubCache[key] !== undefined) return _clubCache[key] || '';
  lookupClubCity(club).then(city=>{ if(city) scheduleGeoRerender(); });
  return '';
}
function teamForPlayer(p){
  if(!p.club) return 'Onbekend';
  const candidates = [p.wedstrijd?.thuis, p.wedstrijd?.uit].filter(Boolean);
  for(const c of candidates){
    const m = c.match(/O\d+(?:-\d+)?/i);
    if(m && c.toLowerCase().includes(p.club.toLowerCase().split(' ')[0])){
      return m[0].toUpperCase();
    }
  }
  for(const c of candidates){
    const m = c.match(/O\d+(?:-\d+)?/i);
    if(m) return m[0].toUpperCase();
  }
  return 'Algemeen';
}

const LEEFTIJD_OPTIONS = (()=>{
  const out = [];
  // Format: O.{leeftijd}-{team}  (met punt, tot 10 teams per leeftijdsgroep)
  [8,9,10,11,12,13,14,15,16,17,18,19,21,23].forEach(age=>{
    for(let t=1; t<=10; t++) out.push(`O.${age}-${t}`);
  });
  return out;
})();

/* Slot meta: code → {label, short, matches[], reden}
   `matches` = welke form-positie-codes (uit POSITIONS_BY_LINE) bij dit slot horen */
const SLOT_META = {
  gk:  {label:'Keeper', short:'GK', matches:['GK']},
  lb:  {label:'Linksback', short:'LB', matches:['LB']},
  rb:  {label:'Rechtsback', short:'RB', matches:['RB']},
  lcv: {label:'Centrale verdediger (links)', short:'LCV', matches:['CV']},
  cv:  {label:'Centrale verdediger', short:'CV', matches:['CV']},
  rcv: {label:'Centrale verdediger (rechts)', short:'RCV', matches:['CV']},
  vm:  {label:'Verdedigende middenvelder', short:'VM', matches:['VM']},
  cm:  {label:'Centrale middenvelder', short:'CM', matches:['CM']},
  am:  {label:'Aanvallende middenvelder', short:'AM', matches:['AM']},
  lm:  {label:'Linker middenvelder', short:'LM', matches:['LM','CM']},
  rm:  {label:'Rechter middenvelder', short:'RM', matches:['RM','CM']},
  lv:  {label:'Linksbuiten', short:'LV', matches:['LV']},
  rv:  {label:'Rechtsbuiten', short:'RV', matches:['RV']},
  cs:  {label:'Centrumspits', short:'CS', matches:['CS']}
};

/* Per formatie: array van slots met unieke key (mag suffix _l/_r hebben),
   bron-code (verwijst naar SLOT_META), en positie x/y (%) op het veld. */
const FORMATIONS = {
  '1-4-3-3': [
    {key:'gk',   src:'gk',  x:50, y:92},
    {key:'lb',   src:'lb',  x:12, y:75},
    {key:'lcv',  src:'lcv', x:36, y:78},
    {key:'rcv',  src:'rcv', x:64, y:78},
    {key:'rb',   src:'rb',  x:88, y:75},
    {key:'vm',   src:'vm',  x:50, y:58},
    {key:'cm_l', src:'cm',  x:26, y:48},
    {key:'cm_r', src:'cm',  x:74, y:48},
    {key:'lv',   src:'lv',  x:15, y:22},
    {key:'cs',   src:'cs',  x:50, y:18},
    {key:'rv',   src:'rv',  x:85, y:22}
  ],
  '1-4-3-3 offensive': [
    {key:'gk',   src:'gk',  x:50, y:92},
    {key:'lb',   src:'lb',  x:10, y:72},
    {key:'lcv',  src:'lcv', x:36, y:78},
    {key:'rcv',  src:'rcv', x:64, y:78},
    {key:'rb',   src:'rb',  x:90, y:72},
    {key:'vm',   src:'vm',  x:50, y:55},
    {key:'cm_l', src:'cm',  x:28, y:42},
    {key:'cm_r', src:'am',  x:72, y:42},
    {key:'lv',   src:'lv',  x:12, y:18},
    {key:'cs',   src:'cs',  x:50, y:14},
    {key:'rv',   src:'rv',  x:88, y:18}
  ],
  '1-4-2-3-1': [
    {key:'gk',   src:'gk',  x:50, y:92},
    {key:'lb',   src:'lb',  x:12, y:75},
    {key:'lcv',  src:'lcv', x:36, y:78},
    {key:'rcv',  src:'rcv', x:64, y:78},
    {key:'rb',   src:'rb',  x:88, y:75},
    {key:'vm_l', src:'vm',  x:36, y:58},
    {key:'vm_r', src:'vm',  x:64, y:58},
    {key:'lm',   src:'lm',  x:15, y:35},
    {key:'am',   src:'am',  x:50, y:38},
    {key:'rm',   src:'rm',  x:85, y:35},
    {key:'cs',   src:'cs',  x:50, y:15}
  ],
  '1-3-4-3': [
    {key:'gk',   src:'gk',  x:50, y:92},
    {key:'lcv',  src:'lcv', x:25, y:78},
    {key:'cv',   src:'cv',  x:50, y:80},
    {key:'rcv',  src:'rcv', x:75, y:78},
    {key:'lm',   src:'lm',  x:8,  y:55},
    {key:'cm_l', src:'cm',  x:38, y:55},
    {key:'cm_r', src:'cm',  x:62, y:55},
    {key:'rm',   src:'rm',  x:92, y:55},
    {key:'lv',   src:'lv',  x:18, y:22},
    {key:'cs',   src:'cs',  x:50, y:18},
    {key:'rv',   src:'rv',  x:82, y:22}
  ],
  '1-4-4-2': [
    {key:'gk',   src:'gk',  x:50, y:92},
    {key:'lb',   src:'lb',  x:12, y:75},
    {key:'lcv',  src:'lcv', x:36, y:78},
    {key:'rcv',  src:'rcv', x:64, y:78},
    {key:'rb',   src:'rb',  x:88, y:75},
    {key:'lm',   src:'lm',  x:12, y:50},
    {key:'cm_l', src:'cm',  x:38, y:52},
    {key:'cm_r', src:'cm',  x:62, y:52},
    {key:'rm',   src:'rm',  x:88, y:50},
    {key:'cs_l', src:'cs',  x:36, y:18},
    {key:'cs_r', src:'cs',  x:64, y:18}
  ],
  '1-4-1-4-1': [
    {key:'gk',   src:'gk',  x:50, y:92},
    {key:'lb',   src:'lb',  x:12, y:75},
    {key:'lcv',  src:'lcv', x:36, y:78},
    {key:'rcv',  src:'rcv', x:64, y:78},
    {key:'rb',   src:'rb',  x:88, y:75},
    {key:'vm',   src:'vm',  x:50, y:62},
    {key:'lm',   src:'lm',  x:12, y:42},
    {key:'cm_l', src:'cm',  x:38, y:42},
    {key:'cm_r', src:'cm',  x:62, y:42},
    {key:'rm',   src:'rm',  x:88, y:42},
    {key:'cs',   src:'cs',  x:50, y:15}
  ]
};

const DEFAULT_FORMATION = '1-4-3-3';

/* =============== STATE =============== */
let currentUser = null;
let currentView = 'dashboard';
let playersCache = [];

/* =============== s35ag TRACE LOGGER =============== */
// Rolling buffer in localStorage 'sh-trace' (max 500 entries).
// Roep aan met __shTrace('event-naam', {extra:'data'}).
// Marcel kan window.__shTraceDump() in console plakken, OF gebruikt
// de 'Trace kopiëren' knop in Instellingen → Diagnose.
const SH_TRACE_KEY = 'sh-trace';
const SH_TRACE_MAX = 500;
function __shTrace(event, data){
  try {
    const arr = JSON.parse(localStorage.getItem(SH_TRACE_KEY) || '[]');
    arr.push({ ts: new Date().toISOString(), event: String(event||''), data: data || null });
    while(arr.length > SH_TRACE_MAX) arr.shift();
    localStorage.setItem(SH_TRACE_KEY, JSON.stringify(arr));
  } catch(_){ /* localStorage vol/private mode */ }
}
function __shTraceDump(){
  try { return localStorage.getItem(SH_TRACE_KEY) || '[]'; }
  catch(_){ return '[]'; }
}
function __shTraceClear(){
  try { localStorage.removeItem(SH_TRACE_KEY); } catch(_){ }
}
window.__shTrace = __shTrace;
window.__shTraceDump = __shTraceDump;
window.__shTraceClear = __shTraceClear;
__shTrace('app-init', { ts: Date.now(), ua: (navigator && navigator.userAgent) || '' });

let analysesCache = [];
let contactsCache = [];
let matchReportsCache = [];
let tipsCache = [];
let programmaCache = [];
let unsubProgramma = null;
let rittenCache = [];
let unsubRitten = null;

/* =============== DEMO-DATA s35cy (auto-generated) =============== */
/* JS-array fallback: laadt fictieve spelers/rapporten/wedstrijden/teams/
   contacten/tips. Alleen actief voor demo@scoutinghub.nl. */
const __SH_DEMO_PLAYERS = [
  {
    "id": "demo_p001",
    "naam": "Liam de Boer",
    "voornaam": "Liam",
    "achternaam": "de Boer",
    "geboorte": "2008-04-12",
    "club": "Ajax",
    "plaats": "Amsterdam",
    "rugnummer": "10",
    "elftal": "O.18",
    "positie": "cs",
    "linie": "Aanval",
    "been": "Links",
    "leeftijd": "18",
    "huidig_niveau": "A",
    "potentieel_niveau": "A",
    "advies": "4",
    "datum": "2026-05-10",
    "wapen": "Diepteloop met de bal onder druk"
  },
  {
    "id": "demo_p002",
    "naam": "Owen Schimmelpenninck",
    "voornaam": "Owen",
    "achternaam": "Schimmelpenninck",
    "geboorte": "2005-09-03",
    "club": "Jong Ajax",
    "plaats": "Amsterdam",
    "rugnummer": "3",
    "elftal": "O.21",
    "positie": "lb",
    "linie": "Verdediging",
    "been": "Links",
    "leeftijd": "21",
    "huidig_niveau": "B",
    "potentieel_niveau": "A",
    "advies": "3",
    "datum": "2026-04-28",
    "wapen": "Aanvallende actie over de linkerkant"
  },
  {
    "id": "demo_p003",
    "naam": "Ruben Janssen",
    "voornaam": "Ruben",
    "achternaam": "Janssen",
    "geboorte": "2009-01-17",
    "club": "sc Heerenveen",
    "plaats": "Heerenveen",
    "rugnummer": "9",
    "elftal": "O.17",
    "positie": "cs",
    "linie": "Aanval",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "B",
    "potentieel_niveau": "A",
    "advies": "3",
    "datum": "2026-04-15",
    "wapen": "Afwerken met beide benen"
  },
  {
    "id": "demo_p004",
    "naam": "Wessel Bos",
    "voornaam": "Wessel",
    "achternaam": "Bos",
    "geboorte": "2009-07-22",
    "club": "AZ",
    "plaats": "Alkmaar",
    "rugnummer": "5",
    "elftal": "O.17",
    "positie": "lv",
    "linie": "Verdediging",
    "been": "Links",
    "leeftijd": "17",
    "huidig_niveau": "B",
    "potentieel_niveau": "B",
    "advies": "3",
    "datum": "2026-03-22",
    "wapen": "Kopbalspel in het defensieve blok"
  },
  {
    "id": "demo_p005",
    "naam": "Tobias Vermeer",
    "voornaam": "Tobias",
    "achternaam": "Vermeer",
    "geboorte": "2009-03-08",
    "club": "PEC Zwolle",
    "plaats": "Zwolle",
    "rugnummer": "4",
    "elftal": "O.17",
    "positie": "rv",
    "linie": "Verdediging",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "B",
    "potentieel_niveau": "B",
    "advies": "2",
    "datum": "2026-03-08",
    "wapen": "Anticiperen op de bal en clean tacklen"
  },
  {
    "id": "demo_p006",
    "naam": "Daan Hoekstra",
    "voornaam": "Daan",
    "achternaam": "Hoekstra",
    "geboorte": "2010-11-14",
    "club": "Feyenoord",
    "plaats": "Rotterdam",
    "rugnummer": "7",
    "elftal": "O.16",
    "positie": "lb",
    "linie": "Verdediging",
    "been": "Links",
    "leeftijd": "16",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "advies": "2",
    "datum": "2026-02-20",
    "wapen": "Hoge inzet en loopvermogen over 90 min"
  },
  {
    "id": "demo_p007",
    "naam": "Niels Bakker",
    "voornaam": "Niels",
    "achternaam": "Bakker",
    "geboorte": "2009-05-30",
    "club": "Vitesse",
    "plaats": "Arnhem",
    "rugnummer": "6",
    "elftal": "O.17",
    "positie": "cs",
    "linie": "Verdediging",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "advies": "2",
    "datum": "2026-04-05",
    "wapen": "Rustig aan de bal onder druk"
  },
  {
    "id": "demo_p008",
    "naam": "Finn Bosman",
    "voornaam": "Finn",
    "achternaam": "Bosman",
    "geboorte": "2010-08-19",
    "club": "Ajax",
    "plaats": "Amsterdam",
    "rugnummer": "11",
    "elftal": "O.16",
    "positie": "lb",
    "linie": "Verdediging",
    "been": "Links",
    "leeftijd": "16",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "advies": "3",
    "datum": "2026-03-18",
    "wapen": "Snelheid over de flank gecombineerd met dribbel"
  },
  {
    "id": "demo_p009",
    "naam": "Jens Pieters",
    "voornaam": "Jens",
    "achternaam": "Pieters",
    "geboorte": "2009-02-05",
    "club": "Feyenoord",
    "plaats": "Rotterdam",
    "rugnummer": "8",
    "elftal": "O.17",
    "positie": "cs",
    "linie": "Verdediging",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "B",
    "potentieel_niveau": "B",
    "advies": "2",
    "datum": "2026-01-18",
    "wapen": "Luchtduel winnen en opspeelbaar zijn"
  },
  {
    "id": "demo_p010",
    "naam": "Sem van der Berg",
    "voornaam": "Sem",
    "achternaam": "van der Berg",
    "geboorte": "2009-12-01",
    "club": "PSV",
    "plaats": "Eindhoven",
    "rugnummer": "6",
    "elftal": "O.17",
    "positie": "lv",
    "linie": "Verdediging",
    "been": "Links",
    "leeftijd": "17",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "advies": "2",
    "datum": "2025-12-10",
    "wapen": "Afsnijden bij defensieve omschakeling"
  },
  {
    "id": "demo_p011",
    "naam": "Stef Guijt",
    "voornaam": "Stef",
    "achternaam": "Guijt",
    "geboorte": "2010-04-22",
    "club": "Quick Boys",
    "plaats": "Katwijk",
    "rugnummer": "8",
    "elftal": "O.16",
    "positie": "dmv",
    "linie": "Middenveld",
    "been": "Rechts",
    "leeftijd": "16",
    "huidig_niveau": "C",
    "potentieel_niveau": "C",
    "advies": "2",
    "datum": "2026-01-10",
    "wapen": "Balbehoud in het midden onder druk"
  },
  {
    "id": "demo_p012",
    "naam": "Bart Klaassen",
    "voornaam": "Bart",
    "achternaam": "Klaassen",
    "geboorte": "2009-06-14",
    "club": "FC Twente",
    "plaats": "Enschede",
    "rugnummer": "1",
    "elftal": "O.17",
    "positie": "gk",
    "linie": "Doel",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "C",
    "potentieel_niveau": "C",
    "advies": "2",
    "datum": "2025-11-22",
    "wapen": "Voetballende keeper — rustig positiespel"
  },
  {
    "id": "demo_p013",
    "naam": "Lars Visser",
    "voornaam": "Lars",
    "achternaam": "Visser",
    "geboorte": "2008-09-27",
    "club": "FC Utrecht",
    "plaats": "Utrecht",
    "rugnummer": "9",
    "elftal": "O.18",
    "positie": "cs",
    "linie": "Aanval",
    "been": "Rechts",
    "leeftijd": "18",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "advies": "1",
    "datum": "2026-02-08",
    "wapen": "Werklust en looparbeid"
  },
  {
    "id": "demo_p014",
    "naam": "Noah Smits",
    "voornaam": "Noah",
    "achternaam": "Smits",
    "geboorte": "2010-07-03",
    "club": "SV Spakenburg",
    "plaats": "Spakenburg",
    "rugnummer": "2",
    "elftal": "O.16",
    "positie": "rb",
    "linie": "Verdediging",
    "been": "Rechts",
    "leeftijd": "16",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "advies": "1",
    "datum": "2026-01-18",
    "wapen": "Discipline en velddekkend werken"
  },
  {
    "id": "demo_p015",
    "naam": "Jesse Mulder",
    "voornaam": "Jesse",
    "achternaam": "Mulder",
    "geboorte": "2009-10-11",
    "club": "NEC",
    "plaats": "Nijmegen",
    "rugnummer": "14",
    "elftal": "O.17",
    "positie": "rmv",
    "linie": "Middenveld",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "D",
    "potentieel_niveau": "D",
    "advies": "1",
    "datum": "2026-03-01",
    "wapen": "Velddekkend werken"
  },
  {
    "id": "demo_p016",
    "naam": "Milan de Groot",
    "voornaam": "Milan",
    "achternaam": "de Groot",
    "geboorte": "2009-08-16",
    "club": "Katwijk",
    "plaats": "Katwijk",
    "rugnummer": "5",
    "elftal": "O.17",
    "positie": "dmv",
    "linie": "Middenveld",
    "been": "Rechts",
    "leeftijd": "17",
    "huidig_niveau": "D",
    "potentieel_niveau": "D",
    "advies": "1",
    "datum": "2025-12-20",
    "wapen": "Balwinst in duels"
  },
  {
    "id": "demo_p017",
    "naam": "Sander Kool",
    "voornaam": "Sander",
    "achternaam": "Kool",
    "geboorte": "2010-03-09",
    "club": "FC Volendam",
    "plaats": "Volendam",
    "rugnummer": "17",
    "elftal": "O.16",
    "positie": "rmv",
    "linie": "Middenveld",
    "been": "Rechts",
    "leeftijd": "16",
    "huidig_niveau": "C",
    "potentieel_niveau": "C",
    "advies": "1",
    "datum": "2026-04-12",
    "wapen": "Snelle omschakeling defensief-aanvallend"
  },
  {
    "id": "demo_p018",
    "naam": "Tim de Vries",
    "voornaam": "Tim",
    "achternaam": "de Vries",
    "geboorte": "2009-11-28",
    "club": "SC Cambuur",
    "plaats": "Leeuwarden",
    "rugnummer": "7",
    "elftal": "O.17",
    "positie": "lmv",
    "linie": "Middenveld",
    "been": "Links",
    "leeftijd": "17",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "advies": "1",
    "datum": "2026-02-15",
    "wapen": "Technisch vaardig in kleine ruimte"
  }
];
const __SH_DEMO_REPORTS = [
  {
    "id": "demo_r001",
    "player_id": "demo_p001",
    "naam": "Liam de Boer",
    "club": "Ajax",
    "datum": "2025-11-15",
    "leeftijd": "O.18",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Snelheid achter de verdediging",
    "notities": "Eerste observatie. Opvallende snelheid, techniek moet rijpen. Kansrijke speler voor de lange termijn.",
    "wedstrijd": {
      "datum": "2025-11-15",
      "thuis": "Ajax O.18",
      "uit": "Feyenoord O.18",
      "uitslag": "2-1",
      "opstelling": "1-4-3-3",
      "context": "Competitiewedstrijd, speler stond als centrumspits.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Slank, atletisch postuur",
    "lengte": "Lang voor zijn leeftijd",
    "motoriek": "Soepel en gecoördineerd",
    "rijping": "Nog in ontwikkeling, groeiend in kracht",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Techniek nog ruw aan de randen, maar basis is er.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Positiespel in opbouw mag slimmer.",
      "grit_huidig": "B",
      "grit_tekst": "Vecht voor elke bal, goed karakter.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosief in de eerste passen, daarna vlakt het af.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Goed tempo, niet de snelste maar effectief.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Durft het duel aan, soms te impulsief.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Wendbaar in kleine ruimte, goed voor zijn lengte."
    }
  },
  {
    "id": "demo_r002",
    "player_id": "demo_p001",
    "naam": "Liam de Boer",
    "club": "Ajax",
    "datum": "2026-02-21",
    "leeftijd": "O.18",
    "methode": "Live",
    "advies": "3",
    "huidig_niveau": "B",
    "potentieel_niveau": "A",
    "wapen": "Diepteloop en afwerken",
    "notities": "Duidelijke progressie t.o.v. november. Technisch verfijnder, veel slimmer in zijn looplijnen. Serieuze kandidaat.",
    "wedstrijd": {
      "datum": "2026-02-21",
      "thuis": "Ajax O.18",
      "uit": "PSV O.18",
      "uitslag": "3-2",
      "opstelling": "1-4-3-3",
      "context": "Topper jeugd Eredivisie. Scoorde twee keer.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Atletisch, iets meer kracht",
    "lengte": "Lang",
    "motoriek": "Uitstekend",
    "rijping": "Merkbaar sterker geworden",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Dribbel in de zestien sterk verbeterd, schot ook.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Looplijnen veel slimmer, begrijpt ruimte goed.",
      "grit_huidig": "A",
      "grit_tekst": "Scoringsdrang en vechtlust — grote motor.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosieve start uit stilstand is zijn wapen.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Hoog tempo, ook in de 80e minuut nog.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Sterk in 1v1, won de meeste duels.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Vloeiend van links naar rechts, moeilijk te stoppen."
    }
  },
  {
    "id": "demo_r003",
    "player_id": "demo_p001",
    "naam": "Liam de Boer",
    "club": "Ajax",
    "datum": "2026-05-10",
    "leeftijd": "O.18",
    "methode": "Live",
    "advies": "4",
    "huidig_niveau": "A",
    "potentieel_niveau": "A",
    "wapen": "Diepteloop met de bal onder druk",
    "notities": "Top prestatie in bekerfinale. Compleet pakket. Sterk aanbevolen voor proeftraining bij eerste selectie.",
    "wedstrijd": {
      "datum": "2026-05-10",
      "thuis": "Ajax O.18",
      "uit": "PSV O.18",
      "uitslag": "2-0",
      "opstelling": "1-4-3-3",
      "context": "Bekerfinale. Sterk optreden van begin tot eind.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Sterk atletisch postuur",
    "lengte": "Lang",
    "motoriek": "Uitzonderlijk soepel",
    "rijping": "Fysiek volledig ontwikkeld voor zijn leeftijd",
    "beoordelingen": {
      "techniek_huidig": "A",
      "techniek_tekst": "Techniek op topniveau voor deze leeftijdscategorie.",
      "inzicht_huidig": "A",
      "inzicht_tekst": "Lees het spel voor op — anticipeert op tweede bal.",
      "grit_huidig": "A",
      "grit_tekst": "Onvermoeibaar, geeft nooit op. Leidersfiguur.",
      "explosiviteit_huidig": "A",
      "explosiviteit_tekst": "Explosiviteit bij hoge bal en sprint is uitstekend.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Snelheid is een wapen, ook in de 85e minuut.",
      "duelleren_huidig": "A",
      "duelleren_tekst": "Dominant in luchtduels en op de grond.",
      "wendbaarheid_huidig": "A",
      "wendbaarheid_tekst": "Moeiteloos van rechts naar links — niet bij te houden."
    }
  },
  {
    "id": "demo_r004",
    "player_id": "demo_p002",
    "naam": "Owen Schimmelpenninck",
    "club": "Jong Ajax",
    "datum": "2026-02-14",
    "leeftijd": "O.21",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Aanvallende actie links",
    "notities": "Eerste observatie. Goede linkerback die wil aanvallen maar defensief nog tekortschiet.",
    "wedstrijd": {
      "datum": "2026-02-14",
      "thuis": "Jong Ajax",
      "uit": "Jong PSV",
      "uitslag": "1-1",
      "opstelling": "1-4-3-3",
      "context": "Beloftencompetitie. Speelde de volledige wedstrijd.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gespierd, atletisch",
    "lengte": "Gemiddeld",
    "motoriek": "Vloeiende bewegingen",
    "rijping": "Lichamelijk uitgerijpt",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Pas- en aannamespel links solide, rechts matig.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Positiespel aanvallend goed, defensief soms te hoog.",
      "grit_huidig": "B",
      "grit_tekst": "Vecht door, maar kan rustiger worden na balverlies.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Goede explosie bij eerste stap aanvallend.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Heeft tempo, houdt bij over lange afstand.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Defensieve duels nog niet sterk genoeg.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Wendbaar over de flank, moeilijk te pakken."
    }
  },
  {
    "id": "demo_r005",
    "player_id": "demo_p002",
    "naam": "Owen Schimmelpenninck",
    "club": "Jong Ajax",
    "datum": "2026-04-28",
    "leeftijd": "O.21",
    "methode": "Live",
    "advies": "3",
    "huidig_niveau": "B",
    "potentieel_niveau": "A",
    "wapen": "Aanvallende actie over de linkerkant",
    "notities": "Duidelijke groei. Defensief betrouwbaarder geworden. Klaar voor hogere categorie.",
    "wedstrijd": {
      "datum": "2026-04-28",
      "thuis": "Jong Ajax",
      "uit": "Jong Feyenoord",
      "uitslag": "3-0",
      "opstelling": "1-4-3-3",
      "context": "Beloftencompetitie. Twee assists.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gespierd",
    "lengte": "Gemiddeld",
    "motoriek": "Uitzonderlijk soepel",
    "rijping": "Volledig uitgerijpt",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Voorzetten zijn scherp en goed geplaatst geworden.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Balans tussen aanvallen en dekken beter dan feb.",
      "grit_huidig": "A",
      "grit_tekst": "Geeft nooit op, loopt zich elke actie vrij.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Eerste stap is raak — verdedigers komen te laat.",
      "sprinten_huidig": "A",
      "sprinten_tekst": "Snelheid is een wapen, ook bij vermoeidheid.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Defensief veel stabieler, wint meer duels.",
      "wendbaarheid_huidig": "A",
      "wendbaarheid_tekst": "Fantastisch wendbaar in krappe ruimte langs de lijn."
    }
  },
  {
    "id": "demo_r006",
    "player_id": "demo_p003",
    "naam": "Ruben Janssen",
    "club": "sc Heerenveen",
    "datum": "2026-01-25",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Afwerken",
    "notities": "Jong talent, O.17 maar speelt al slim. Technisch goed, moet nog groeien in tempo.",
    "wedstrijd": {
      "datum": "2026-01-25",
      "thuis": "sc Heerenveen O.17",
      "uit": "FC Groningen O.17",
      "uitslag": "2-2",
      "opstelling": "1-4-4-2",
      "context": "Competitie. Scoorde de 2-2 in blessuretijd.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Slank, jong postuur",
    "lengte": "Gemiddelde lengte",
    "motoriek": "Soepel",
    "rijping": "Nog volop in groei",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Technisch sterk — goede eerste aanname en pass.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Begrip voor het spel is er, maar nog niet consistent.",
      "grit_huidig": "B",
      "grit_tekst": "Goede instelling, ook als het niet loopt.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Nog niet explosief — tempo moet omhoog.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Gemiddeld — niet langzaam maar ook niet snel.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Tactisch duel is ok, fysiek nog te licht.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Soepel in kleine ruimte, goed voor zijn leeftijd."
    }
  },
  {
    "id": "demo_r007",
    "player_id": "demo_p003",
    "naam": "Ruben Janssen",
    "club": "sc Heerenveen",
    "datum": "2026-04-15",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "3",
    "huidig_niveau": "B",
    "potentieel_niveau": "A",
    "wapen": "Afwerken met beide benen",
    "notities": "Flinke stap vooruit. Sneller geworden, betere positionering. Serieus in gesprek brengen.",
    "wedstrijd": {
      "datum": "2026-04-15",
      "thuis": "sc Heerenveen O.17",
      "uit": "AZ O.17",
      "uitslag": "3-1",
      "opstelling": "1-4-3-3",
      "context": "Seizoensfinale. Hattrick gescoord.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Sterker geworden",
    "lengte": "Goed postuur",
    "motoriek": "Uitstekend",
    "rijping": "Merkbaar ontwikkeld",
    "beoordelingen": {
      "techniek_huidig": "A",
      "techniek_tekst": "Linkerbeen en rechterbeen beide afgewerkt — zeldzaam op deze leeftijd.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Looplijnen veel slimmer, ook off-ball actief.",
      "grit_huidig": "B",
      "grit_tekst": "Heeft honger — zoekt altijd de diepte.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosief bij doelkansen, moeilijk te stoppen.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Goed tempo, houdt tempo vast over 90 min.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Sterker in de man — won meer dan de helft.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Vloeiend van positie wisselen in de aanval."
    }
  },
  {
    "id": "demo_r008",
    "player_id": "demo_p004",
    "naam": "Wessel Bos",
    "club": "AZ",
    "datum": "2026-01-18",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Kopbalspel",
    "notities": "Solide verdediger, goed in de lucht. Technisch moet het beter. Interessant profiel.",
    "wedstrijd": {
      "datum": "2026-01-18",
      "thuis": "AZ O.17",
      "uit": "FC Twente O.17",
      "uitslag": "1-0",
      "opstelling": "1-4-3-3",
      "context": "Competitie. Speelde volledige 90 minuten.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gespierd, robuust postuur",
    "lengte": "Lang — goed voor linksback",
    "motoriek": "Functioneel — geen danser",
    "rijping": "Lichamelijk goed ontwikkeld",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Pas- en aannamespel mag verfijnder — gaat soms de mist in.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Defensief begrijpt hij zijn positie, aanvallend te weinig risico.",
      "grit_huidig": "B",
      "grit_tekst": "Vecht voor alles, laat niemand zomaar passeren.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosieve start bij sprint vanuit stilstand.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Niet de snelste, maar efficiënt in zijn looppad.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Sterk in het luchtduel, wint het merendeel.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid in kleine ruimte is een punt van aandacht."
    }
  },
  {
    "id": "demo_r009",
    "player_id": "demo_p004",
    "naam": "Wessel Bos",
    "club": "AZ",
    "datum": "2026-03-22",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "3",
    "huidig_niveau": "B",
    "potentieel_niveau": "B",
    "wapen": "Kopbalspel in het defensieve blok",
    "notities": "Groot verschil t.o.v. januari. Passspel veel zekerder, aanvallend ook dreigender geworden.",
    "wedstrijd": {
      "datum": "2026-03-22",
      "thuis": "AZ O.17",
      "uit": "Ajax O.17",
      "uitslag": "2-2",
      "opstelling": "1-4-3-3",
      "context": "Topper. Scoorde de gelijkmaker uit corner.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gespierd",
    "lengte": "Lang",
    "motoriek": "Functioneel, verbeterd",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Passspel zekerder geworden — langere passes ook.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Positiespel aanvallend verbeterd — gaat nu ook mee omhoog.",
      "grit_huidig": "B",
      "grit_tekst": "Hoge intensiteit de volledige wedstrijd.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosie vanuit stilstand goed.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Snelheid gemiddeld — niet problematisch op dit niveau.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Dominant in de lucht, ook op de grond sterker.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid blijft aandachtspunt op hogere niveaus."
    }
  },
  {
    "id": "demo_r010",
    "player_id": "demo_p005",
    "naam": "Tobias Vermeer",
    "club": "PEC Zwolle",
    "datum": "2025-12-06",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Anticiperen",
    "notities": "Technisch redelijke rechtsback. Goede positiekeuze. Nog niet klaar voor hoger niveau.",
    "wedstrijd": {
      "datum": "2025-12-06",
      "thuis": "PEC Zwolle O.17",
      "uit": "FC Utrecht O.17",
      "uitslag": "1-1",
      "opstelling": "1-4-3-3",
      "context": "Laatste competitiewedstrijd 2025.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gemiddeld postuur",
    "lengte": "Gemiddeld",
    "motoriek": "Soepel",
    "rijping": "In ontwikkeling",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Korte pas goed, lange bal mist nog precisie.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Goed positiebewustzijn defensief.",
      "grit_huidig": "B",
      "grit_tekst": "Werkt hard, goede instelling.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit is gemiddeld.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Tempo ok maar niet uitzonderlijk.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Wint defensieve duels door timing, niet kracht.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Wendbaar in de 1v1 op zijn flank."
    }
  },
  {
    "id": "demo_r011",
    "player_id": "demo_p005",
    "naam": "Tobias Vermeer",
    "club": "PEC Zwolle",
    "datum": "2026-03-08",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "B",
    "potentieel_niveau": "B",
    "wapen": "Anticiperen op de bal en clean tacklen",
    "notities": "Stabiele B-speler. Heeft een plafond maar dat plafond is bruikbaar voor lager professioneel voetbal.",
    "wedstrijd": {
      "datum": "2026-03-08",
      "thuis": "PEC Zwolle O.17",
      "uit": "Vitesse O.17",
      "uitslag": "2-0",
      "opstelling": "1-4-3-3",
      "context": "Competitie. Solide wedstrijd gespeeld.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gemiddeld",
    "lengte": "Gemiddeld",
    "motoriek": "Soepel",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Passspel betrouwbaar geworden — weinig balverlies.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Leest het spel goed defensief.",
      "grit_huidig": "B",
      "grit_tekst": "Hoge werklust — loopt elke actie volledig af.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit niet zijn sterkste punt.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Goed tempo, efficiënt in zijn sprint.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Knap in de clean tackle — zelden fout.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Goed wendbaar langs zijn kant."
    }
  },
  {
    "id": "demo_r012",
    "player_id": "demo_p006",
    "naam": "Daan Hoekstra",
    "club": "Feyenoord",
    "datum": "2025-11-08",
    "leeftijd": "O.16",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "wapen": "Loopvermogen",
    "notities": "Jonge linksback bij Feyenoord O.16. Rauw, maar interessant voor zijn leeftijd. Herhaling nodig.",
    "wedstrijd": {
      "datum": "2025-11-08",
      "thuis": "Feyenoord O.16",
      "uit": "Ajax O.16",
      "uitslag": "1-3",
      "opstelling": "1-4-4-2",
      "context": "Verliespartij. Speler viel na 60 min. in.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Slank, nog jongetjesachtig",
    "lengte": "Gemiddeld",
    "motoriek": "Ruw maar potentie zichtbaar",
    "rijping": "Vroeg in zijn ontwikkeling",
    "beoordelingen": {
      "techniek_huidig": "D",
      "techniek_tekst": "Techniek heeft nog veel werk nodig.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Begrijpt de basispositionering, maar mist overzicht.",
      "grit_huidig": "B",
      "grit_tekst": "Werkt hard, geeft niet op — goede instelling.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit is aanwezig maar ongecontroleerd.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Heeft tempo — dat is zijn grootste plus nu.",
      "duelleren_huidig": "D",
      "duelleren_tekst": "Duels verliest hij nog te vaak.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid ok voor zijn leeftijd."
    }
  },
  {
    "id": "demo_r013",
    "player_id": "demo_p006",
    "naam": "Daan Hoekstra",
    "club": "Feyenoord",
    "datum": "2026-02-20",
    "leeftijd": "O.16",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Hoge inzet en loopvermogen over 90 min",
    "notities": "Positieve verrassing. In 3 maanden tijd merkbaar beter. Technisch nog werk aan de winkel maar het gaat de goede kant op.",
    "wedstrijd": {
      "datum": "2026-02-20",
      "thuis": "Feyenoord O.16",
      "uit": "PSV O.16",
      "uitslag": "2-1",
      "opstelling": "1-4-3-3",
      "context": "Competitie. Hele wedstrijd gespeeld.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Iets meer kracht",
    "lengte": "Gemiddeld",
    "motoriek": "Verbeterd",
    "rijping": "Groeiende",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Techniek verbeterd — aanname links nu acceptabel.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positiespel defensief betrouwbaarder.",
      "grit_huidig": "B",
      "grit_tekst": "Blijft tot het einde presteren — karakter is er.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosiviteit aanwezig — moet hij nog beter benutten.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Goed tempo over de volle 90 min.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Duels beter dan nov, maar nog te verliezen.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Wendbaar langs de lijn, moeilijk te pakken."
    }
  },
  {
    "id": "demo_r014",
    "player_id": "demo_p007",
    "naam": "Niels Bakker",
    "club": "Vitesse",
    "datum": "2026-04-05",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Rustig aan de bal onder druk",
    "notities": "Centrale verdediger met goede voetvaardigheden voor een stopper. Nog te aarzelend in zijn doortrekken.",
    "wedstrijd": {
      "datum": "2026-04-05",
      "thuis": "Vitesse O.17",
      "uit": "NEC O.17",
      "uitslag": "1-0",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Atletisch",
    "lengte": "Lang",
    "motoriek": "Soepel",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Aan de bal rustig en betrouwbaar — goed voor stopper.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positiespel defensief ok, aanvallend te weinig.",
      "grit_huidig": "C",
      "grit_tekst": "Soms te passief als het moeilijk wordt.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit gemiddeld.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Tempo ok voor zijn positie.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Wint zijn duels op timing, zelden overtreding.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid voldoende voor centrale verdediger."
    }
  },
  {
    "id": "demo_r015",
    "player_id": "demo_p008",
    "naam": "Finn Bosman",
    "club": "Ajax",
    "datum": "2026-03-18",
    "leeftijd": "O.16",
    "methode": "Video",
    "advies": "3",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Snelheid over de flank gecombineerd met dribbel",
    "notities": "Videoanalyse. Opvallende snelheid en dribbel. Live verificatie nodig maar dit is zeker een speler om in de gaten te houden.",
    "wedstrijd": {
      "datum": "2026-03-18",
      "thuis": "Ajax O.16",
      "uit": "Feyenoord O.16",
      "uitslag": "3-1",
      "opstelling": "1-4-3-3",
      "context": "Videoanalyse van competitiewedstrijd.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Slank en atletisch",
    "lengte": "Gemiddeld",
    "motoriek": "Uitstekende coördinatie",
    "rijping": "Nog jong, groeipotentie",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Technisch sterk in de dribbel, pass mag beter.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positiespel aanvallend ok, maar soms te individueel.",
      "grit_huidig": "B",
      "grit_tekst": "Zet alles op alles in de 1v1 — goed.",
      "explosiviteit_huidig": "A",
      "explosiviteit_tekst": "Explosiviteit is zijn topkwaliteit.",
      "sprinten_huidig": "A",
      "sprinten_tekst": "Snelheid is uitzonderlijk voor O.16.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Duels tactisch, maar lichaam is nog te licht.",
      "wendbaarheid_huidig": "A",
      "wendbaarheid_tekst": "Wendbaarheid uitstekend — beste kwaliteit."
    }
  },
  {
    "id": "demo_r016",
    "player_id": "demo_p009",
    "naam": "Jens Pieters",
    "club": "Feyenoord",
    "datum": "2026-01-18",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "B",
    "potentieel_niveau": "B",
    "wapen": "Luchtduel winnen en opspeelbaar zijn",
    "notities": "Klassieke centrale verdediger. Sterk in de lucht, voetballend redelijk. Follow-up gepland voor Q2.",
    "wedstrijd": {
      "datum": "2026-01-18",
      "thuis": "Feyenoord O.17",
      "uit": "Vitesse O.17",
      "uitslag": "2-0",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Robuust, gespierd",
    "lengte": "Lang — goed voor centrale verdediger",
    "motoriek": "Functioneel",
    "rijping": "Goed ontwikkeld",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Pas- en aannamespel goed — speelt mee in de opbouw.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Leest het spel goed, goed in lijnvoering.",
      "grit_huidig": "B",
      "grit_tekst": "Hoge inzet en discipline.",
      "explosiviteit_huidig": "B",
      "explosiviteit_tekst": "Explosiviteit gemiddeld voor een stopper.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Tempo ok voor zijn positie.",
      "duelleren_huidig": "A",
      "duelleren_tekst": "Dominant in de lucht en op de grond.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid aandachtspunt — moeite met snelle spitsen."
    }
  },
  {
    "id": "demo_r017",
    "player_id": "demo_p010",
    "naam": "Sem van der Berg",
    "club": "PSV",
    "datum": "2025-12-10",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "B",
    "wapen": "Afsnijden bij defensieve omschakeling",
    "notities": "Linksback bij PSV O.17. Goed in omschakeling, aanvallend nog te weinig. Interessant als verdedigende specialisatie.",
    "wedstrijd": {
      "datum": "2025-12-10",
      "thuis": "PSV O.17",
      "uit": "AZ O.17",
      "uitslag": "0-0",
      "opstelling": "1-4-3-3",
      "context": "Laatste speelronde 2025.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gespierd",
    "lengte": "Gemiddeld",
    "motoriek": "Functioneel",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Pas rechts is zijn zwakke kant.",
      "inzicht_huidig": "B",
      "inzicht_tekst": "Defensief bewustzijn goed — snijdt goed af.",
      "grit_huidig": "B",
      "grit_tekst": "Werklust is hoog — loopt elke lijn af.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit gemiddeld.",
      "sprinten_huidig": "B",
      "sprinten_tekst": "Tempo ok voor linksback.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Wint verdedigende duels redelijk.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Wendbaar langs de lijn."
    }
  },
  {
    "id": "demo_r018",
    "player_id": "demo_p011",
    "naam": "Stef Guijt",
    "club": "Quick Boys",
    "datum": "2026-01-10",
    "leeftijd": "O.16",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "C",
    "wapen": "Balbehoud in het midden onder druk",
    "notities": "Defensieve middenvelder bij Quick Boys. Goed in balbehoud. Plafond lijkt op hoog amateurvoetbal, niet hoger.",
    "wedstrijd": {
      "datum": "2026-01-10",
      "thuis": "Quick Boys O.16",
      "uit": "Katwijk O.16",
      "uitslag": "2-1",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Compact, sterk postuur",
    "lengte": "Gemiddeld",
    "motoriek": "Functioneel",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Balbehoud goed — verliest de bal zelden onnodig.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positiebewustzijn ok maar overzicht beperkt.",
      "grit_huidig": "B",
      "grit_tekst": "Werkt hard, goede motor.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit is een zwak punt.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Tempo redelijk.",
      "duelleren_huidig": "B",
      "duelleren_tekst": "Balverovert goed — sterk in zijn looppad.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid beperkt."
    }
  },
  {
    "id": "demo_r019",
    "player_id": "demo_p012",
    "naam": "Bart Klaassen",
    "club": "FC Twente",
    "datum": "2025-11-22",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "2",
    "huidig_niveau": "C",
    "potentieel_niveau": "C",
    "wapen": "Voetballende keeper",
    "notities": "Keeper bij FC Twente O.17. Voetballend sterk voor zijn niveau. Reflexen nog te verbeteren. Follow-up in het voorjaar.",
    "wedstrijd": {
      "datum": "2025-11-22",
      "thuis": "FC Twente O.17",
      "uit": "PEC Zwolle O.17",
      "uitslag": "3-1",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Lang, gespierd keeperspostuur",
    "lengte": "Lang — goed voor de positie",
    "motoriek": "Soepel voor een keeper",
    "rijping": "Goed ontwikkeld voor zijn leeftijd",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Pas met de voet is zijn sterkste punt.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positionering in de doelmond ok.",
      "grit_huidig": "B",
      "grit_tekst": "Rustig onder druk — geen paniek.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit bij hoge ballen gemiddeld.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Loopsnelheid voor een keeper acceptabel.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Reddingen ok, reflexen nog aan het rijpen.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid in de goal moet beter."
    }
  },
  {
    "id": "demo_r020",
    "player_id": "demo_p013",
    "naam": "Lars Visser",
    "club": "FC Utrecht",
    "datum": "2026-02-08",
    "leeftijd": "O.18",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "wapen": "Werklust en looparbeid",
    "notities": "Spits die hard werkt maar technisch te beperkt voor profvoetbal. Goed voor het amateur circuit.",
    "wedstrijd": {
      "datum": "2026-02-08",
      "thuis": "FC Utrecht O.18",
      "uit": "sc Heerenveen O.18",
      "uitslag": "1-2",
      "opstelling": "1-4-4-2",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Sterk, maar zwaar",
    "lengte": "Lang",
    "motoriek": "Stijf",
    "rijping": "Lichamelijk uitgerijpt",
    "beoordelingen": {
      "techniek_huidig": "D",
      "techniek_tekst": "Technisch te beperkt voor professioneel niveau.",
      "inzicht_huidig": "D",
      "inzicht_tekst": "Weinig overzicht, speelt simpel.",
      "grit_huidig": "B",
      "grit_tekst": "Werkt hard, geeft alles — dat is zijn plus.",
      "explosiviteit_huidig": "D",
      "explosiviteit_tekst": "Explosiviteit ontbreekt.",
      "sprinten_huidig": "D",
      "sprinten_tekst": "Langzaam — een duidelijk nadeel.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Verliest de meeste duels.",
      "wendbaarheid_huidig": "D",
      "wendbaarheid_tekst": "Weinig wendbaarheid."
    }
  },
  {
    "id": "demo_r021",
    "player_id": "demo_p014",
    "naam": "Noah Smits",
    "club": "SV Spakenburg",
    "datum": "2026-01-18",
    "leeftijd": "O.16",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "wapen": "Discipline en velddekkend werken",
    "notities": "Rechtsback bij Spakenburg O.16. Disciplinair en tactisch ok, maar mist de atletische basis voor profvoetbal.",
    "wedstrijd": {
      "datum": "2026-01-18",
      "thuis": "SV Spakenburg O.16",
      "uit": "Quick Boys O.16",
      "uitslag": "0-1",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gemiddeld",
    "lengte": "Klein voor rechtsback",
    "motoriek": "Stijf",
    "rijping": "Nog in ontwikkeling",
    "beoordelingen": {
      "techniek_huidig": "D",
      "techniek_tekst": "Technisch beperkt — aanname en pass zijn risico.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positie houden doet hij goed.",
      "grit_huidig": "B",
      "grit_tekst": "Discipline en inzet zijn hoog.",
      "explosiviteit_huidig": "D",
      "explosiviteit_tekst": "Geen explosiviteit.",
      "sprinten_huidig": "D",
      "sprinten_tekst": "Tempo ontbreekt voor het profcircuit.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Verliest de meeste duels.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid beperkt."
    }
  },
  {
    "id": "demo_r022",
    "player_id": "demo_p015",
    "naam": "Jesse Mulder",
    "club": "NEC",
    "datum": "2026-03-01",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "D",
    "potentieel_niveau": "D",
    "wapen": "Velddekkend werken",
    "notities": "Middenvelder bij NEC O.17. Mist de kwaliteiten voor hoger dan amateurvoetbal.",
    "wedstrijd": {
      "datum": "2026-03-01",
      "thuis": "NEC O.17",
      "uit": "Vitesse O.17",
      "uitslag": "1-3",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gemiddeld",
    "lengte": "Gemiddeld",
    "motoriek": "Stijf",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "D",
      "techniek_tekst": "Technisch zwak — verliest de bal te makkelijk.",
      "inzicht_huidig": "D",
      "inzicht_tekst": "Geen overzicht, speelt simpel en traag.",
      "grit_huidig": "C",
      "grit_tekst": "Inzet redelijk maar kan niet compenseren.",
      "explosiviteit_huidig": "D",
      "explosiviteit_tekst": "Geen explosiviteit.",
      "sprinten_huidig": "D",
      "sprinten_tekst": "Langzaam.",
      "duelleren_huidig": "D",
      "duelleren_tekst": "Verliest duels.",
      "wendbaarheid_huidig": "D",
      "wendbaarheid_tekst": "Weinig wendbaarheid."
    }
  },
  {
    "id": "demo_r023",
    "player_id": "demo_p016",
    "naam": "Milan de Groot",
    "club": "Katwijk",
    "datum": "2025-12-20",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "D",
    "potentieel_niveau": "D",
    "wapen": "Balwinst in duels",
    "notities": "Defensieve middenvelder op amateursniveau. Scouting afgesloten.",
    "wedstrijd": {
      "datum": "2025-12-20",
      "thuis": "Katwijk O.17",
      "uit": "Quick Boys O.17",
      "uitslag": "2-0",
      "opstelling": "1-4-4-2",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Compact",
    "lengte": "Klein",
    "motoriek": "Functioneel",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "D",
      "techniek_tekst": "Technisch beperkt.",
      "inzicht_huidig": "D",
      "inzicht_tekst": "Weinig overzicht.",
      "grit_huidig": "C",
      "grit_tekst": "Vecht voor de bal.",
      "explosiviteit_huidig": "D",
      "explosiviteit_tekst": "Geen explosiviteit.",
      "sprinten_huidig": "D",
      "sprinten_tekst": "Langzaam.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Wint incidenteel een duel.",
      "wendbaarheid_huidig": "D",
      "wendbaarheid_tekst": "Beperkte wendbaarheid."
    }
  },
  {
    "id": "demo_r024",
    "player_id": "demo_p017",
    "naam": "Sander Kool",
    "club": "FC Volendam",
    "datum": "2026-04-12",
    "leeftijd": "O.16",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "C",
    "potentieel_niveau": "C",
    "wapen": "Snelle omschakeling",
    "notities": "Redelijke middenvelder op zijn niveau. Geen duidelijk profiel voor hogere categorie.",
    "wedstrijd": {
      "datum": "2026-04-12",
      "thuis": "FC Volendam O.16",
      "uit": "Telstar O.16",
      "uitslag": "3-0",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Gemiddeld",
    "lengte": "Gemiddeld",
    "motoriek": "Redelijk",
    "rijping": "Stabiel",
    "beoordelingen": {
      "techniek_huidig": "C",
      "techniek_tekst": "Technisch voldoende voor dit niveau.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positiespel gemiddeld.",
      "grit_huidig": "C",
      "grit_tekst": "Inzet ok.",
      "explosiviteit_huidig": "C",
      "explosiviteit_tekst": "Explosiviteit gemiddeld.",
      "sprinten_huidig": "C",
      "sprinten_tekst": "Tempo gemiddeld.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Duels gelijkwaardig.",
      "wendbaarheid_huidig": "C",
      "wendbaarheid_tekst": "Wendbaarheid ok."
    }
  },
  {
    "id": "demo_r025",
    "player_id": "demo_p018",
    "naam": "Tim de Vries",
    "club": "SC Cambuur",
    "datum": "2026-02-15",
    "leeftijd": "O.17",
    "methode": "Live",
    "advies": "1",
    "huidig_niveau": "D",
    "potentieel_niveau": "C",
    "wapen": "Technisch vaardig in kleine ruimte",
    "notities": "Linksbuiten met goede techniek maar mist tempo en intensiteit. Te langzaam voor professioneel voetbal.",
    "wedstrijd": {
      "datum": "2026-02-15",
      "thuis": "SC Cambuur O.17",
      "uit": "FC Groningen O.17",
      "uitslag": "1-1",
      "opstelling": "1-4-3-3",
      "context": "Competitie.",
      "toernooi": false,
      "toernooi_naam": ""
    },
    "bouw": "Slank",
    "lengte": "Gemiddeld",
    "motoriek": "Soepel",
    "rijping": "Nog in ontwikkeling",
    "beoordelingen": {
      "techniek_huidig": "B",
      "techniek_tekst": "Technisch zijn beste eigenschap — fijne touch.",
      "inzicht_huidig": "C",
      "inzicht_tekst": "Positiespel ok maar mist snelheid om het te benutten.",
      "grit_huidig": "C",
      "grit_tekst": "Inzet wisselend.",
      "explosiviteit_huidig": "D",
      "explosiviteit_tekst": "Explosiviteit ontbreekt volledig.",
      "sprinten_huidig": "D",
      "sprinten_tekst": "Langzaam — groot nadeel.",
      "duelleren_huidig": "C",
      "duelleren_tekst": "Verliest duels door gebrek aan tempo.",
      "wendbaarheid_huidig": "B",
      "wendbaarheid_tekst": "Wendbaar in kleine ruimte — zijn enige plus qua beweging."
    }
  }
];
const __SH_DEMO_MATCHES = [
  {
    "id": "demo_m001",
    "datum": "2026-02-21",
    "tijd": "13:00",
    "leeftijd": "O.18",
    "methode": "Live",
    "thuis": "Ajax O.18",
    "uit": "PSV O.18",
    "locatie": "Sportpark De Toekomst",
    "plaats": "Amsterdam",
    "veld": "Veld 3",
    "info": "Jeugd Eredivisie topper.",
    "notities": "",
    "spelers": [
      {
        "id": "demo_p001",
        "naam": "Liam de Boer",
        "club": "Ajax",
        "positie": "cs"
      },
      {
        "id": "demo_p002",
        "naam": "Owen Schimmelpenninck",
        "club": "Jong Ajax",
        "positie": "lb"
      }
    ],
    "status": "verwerkt",
    "created": 1740135600000,
    "modified": 1740135600000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m002",
    "datum": "2026-03-08",
    "tijd": "14:00",
    "leeftijd": "O.17",
    "methode": "Live",
    "thuis": "PEC Zwolle O.17",
    "uit": "Vitesse O.17",
    "locatie": "MAC3PARK Stadion",
    "plaats": "Zwolle",
    "veld": "Veld 2",
    "info": "",
    "notities": "",
    "spelers": [
      {
        "id": "demo_p005",
        "naam": "Tobias Vermeer",
        "club": "PEC Zwolle",
        "positie": "rv"
      },
      {
        "id": "demo_p007",
        "naam": "Niels Bakker",
        "club": "Vitesse",
        "positie": "cs"
      }
    ],
    "status": "verwerkt",
    "created": 1741427200000,
    "modified": 1741427200000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m003",
    "datum": "2026-04-05",
    "tijd": "11:00",
    "leeftijd": "O.17",
    "methode": "Live",
    "thuis": "Vitesse O.17",
    "uit": "NEC O.17",
    "locatie": "GelreDome Jeugdcomplex",
    "plaats": "Arnhem",
    "veld": "Veld 1",
    "info": "Interessante stopper en rechtsvoor te observeren.",
    "notities": "Niels Bakker centraal gevolgd.",
    "spelers": [
      {
        "id": "demo_p007",
        "naam": "Niels Bakker",
        "club": "Vitesse",
        "positie": "cs"
      }
    ],
    "status": "gepland",
    "created": 1743847200000,
    "modified": 1743847200000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m004",
    "datum": "2026-04-12",
    "tijd": "13:30",
    "leeftijd": "O.16",
    "methode": "Live",
    "thuis": "FC Volendam O.16",
    "uit": "Telstar O.16",
    "locatie": "Kras Stadion",
    "plaats": "Volendam",
    "veld": "Veld 2",
    "info": "",
    "notities": "",
    "spelers": [
      {
        "id": "demo_p017",
        "naam": "Sander Kool",
        "club": "FC Volendam",
        "positie": "rmv"
      }
    ],
    "status": "gepland",
    "created": 1744452000000,
    "modified": 1744452000000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m005",
    "datum": "2026-04-15",
    "tijd": "14:00",
    "leeftijd": "O.17",
    "methode": "Live",
    "thuis": "sc Heerenveen O.17",
    "uit": "AZ O.17",
    "locatie": "Abe Lenstra Stadion Jeugd",
    "plaats": "Heerenveen",
    "veld": "Veld 4",
    "info": "Ruben Janssen is hier te observeren — aanvaller in goede vorm.",
    "notities": "Hattrick gescoord.",
    "spelers": [
      {
        "id": "demo_p003",
        "naam": "Ruben Janssen",
        "club": "sc Heerenveen",
        "positie": "cs"
      },
      {
        "id": "demo_p004",
        "naam": "Wessel Bos",
        "club": "AZ",
        "positie": "lv"
      }
    ],
    "status": "gepland",
    "created": 1744710000000,
    "modified": 1744710000000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m006",
    "datum": "2026-04-28",
    "tijd": "14:30",
    "leeftijd": "O.21",
    "methode": "Live",
    "thuis": "Jong Ajax",
    "uit": "Jong Feyenoord",
    "locatie": "Sportpark De Toekomst",
    "plaats": "Amsterdam",
    "veld": "Veld 1",
    "info": "Beloftencompetitie topper.",
    "notities": "Owen Schimmelpenninck twee assists.",
    "spelers": [
      {
        "id": "demo_p002",
        "naam": "Owen Schimmelpenninck",
        "club": "Jong Ajax",
        "positie": "lb"
      }
    ],
    "status": "gepland",
    "created": 1745832000000,
    "modified": 1745832000000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m007",
    "datum": "2026-05-10",
    "tijd": "13:00",
    "leeftijd": "O.18",
    "methode": "Live",
    "thuis": "Ajax O.18",
    "uit": "PSV O.18",
    "locatie": "Sportpark De Toekomst",
    "plaats": "Amsterdam",
    "veld": "Veld 3",
    "info": "Bekerfinale jeugd.",
    "notities": "Liam de Boer keiwedstrijd.",
    "spelers": [
      {
        "id": "demo_p001",
        "naam": "Liam de Boer",
        "club": "Ajax",
        "positie": "cs"
      }
    ],
    "status": "gepland",
    "created": 1746874800000,
    "modified": 1746874800000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m008",
    "datum": "2026-05-31",
    "tijd": "13:00",
    "leeftijd": "O.17",
    "methode": "Live",
    "thuis": "AZ O.17",
    "uit": "Ajax O.17",
    "locatie": "AFAS Trainingscomplex",
    "plaats": "Alkmaar",
    "veld": "Veld 2",
    "info": "Seizoensfinale. Wessel Bos te observeren als aanvoerder.",
    "notities": "",
    "spelers": [],
    "status": "gepland",
    "created": 1748608000000,
    "modified": 1748608000000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m009",
    "datum": "2026-06-07",
    "tijd": "11:00",
    "leeftijd": "O.16",
    "methode": "Live",
    "thuis": "Ajax O.16",
    "uit": "Feyenoord O.16",
    "locatie": "Sportpark De Toekomst",
    "plaats": "Amsterdam",
    "veld": "Veld 5",
    "info": "Finn Bosman live zien — video was positief.",
    "notities": "",
    "spelers": [],
    "status": "gepland",
    "created": 1749222000000,
    "modified": 1749222000000,
    "toernooi": false,
    "toernooi_naam": ""
  },
  {
    "id": "demo_m010",
    "datum": "2026-06-14",
    "tijd": "14:00",
    "leeftijd": "O.18",
    "methode": "Video",
    "thuis": "Jong PSV",
    "uit": "Jong AZ",
    "locatie": "",
    "plaats": "Eindhoven",
    "veld": "",
    "info": "Videoanalyse gepland.",
    "notities": "",
    "spelers": [],
    "status": "gepland",
    "created": 1749826800000,
    "modified": 1749826800000,
    "toernooi": false,
    "toernooi_naam": ""
  }
];
const __SH_DEMO_TEAMS = [];
const __SH_DEMO_CONTACTS = [
  {
    "id": "demo_c001",
    "naam": "Peter van Dijk",
    "rol": "Scout",
    "club": "FC Utrecht",
    "email": "p.vandijk@fcutrecht.nl",
    "telefoon": "06-12345678",
    "notities": "Goede relatie — informeert ons over interessante spelers in de regio Midden-Nederland.",
    "created": 1738400000000,
    "modified": 1738400000000
  },
  {
    "id": "demo_c002",
    "naam": "Sandra Hoiting",
    "rol": "Jeugdcoördinator",
    "club": "sc Heerenveen",
    "email": "s.hoiting@heerenveen.nl",
    "telefoon": "06-23456789",
    "notities": "Contact voor Ruben Janssen — informeerde ons over zijn progressie.",
    "created": 1739100000000,
    "modified": 1739100000000
  },
  {
    "id": "demo_c003",
    "naam": "Marco Visser",
    "rol": "Zaakwaarnemer",
    "club": "",
    "email": "marco@mv-sports.nl",
    "telefoon": "06-34567890",
    "notities": "Behartigt belangen Owen Schimmelpenninck. Snel handelen als we interesse tonen.",
    "created": 1740300000000,
    "modified": 1740300000000
  },
  {
    "id": "demo_c004",
    "naam": "Dirk Klaassen",
    "rol": "Vader / Ouder",
    "club": "",
    "email": "d.klaassen@gmail.com",
    "telefoon": "06-45678901",
    "notities": "Vader van Bart Klaassen. Actief betrokken bij zijn zoon. Belt regelmatig.",
    "created": 1741000000000,
    "modified": 1741000000000
  },
  {
    "id": "demo_c005",
    "naam": "Erik de Boer",
    "rol": "Jeugdtrainer",
    "club": "Ajax",
    "email": "e.deboer@ajax.nl",
    "telefoon": "06-56789012",
    "notities": "Trainer Liam de Boer bij Ajax O.18. Geeft updates over trainingsprestaties.",
    "created": 1742200000000,
    "modified": 1742200000000
  }
];
const __SH_DEMO_TIPS = [
  {
    "id": "demo_t001",
    "tekst": "Kijk naar de U17 finale van de KNVB Beker op 14 juni. Meerdere interessante talenten, o.a. een linksback van FC Groningen die hoog gewaardeerd wordt intern.",
    "auteur": "Daan Demers",
    "datum": "2026-05-18",
    "created": 1747605600000,
    "modified": 1747605600000
  },
  {
    "id": "demo_t002",
    "tekst": "PSV O.16 heeft een opvallende aanvaller: raak en snel, speelt waarschijnlijk door naar O.17 volgend seizoen. Naam nog onbekend — via Peter van Dijk navragen.",
    "auteur": "Daan Demers",
    "datum": "2026-04-30",
    "created": 1745967600000,
    "modified": 1745967600000
  },
  {
    "id": "demo_t003",
    "tekst": "Finn Bosman (Ajax O.16) presteerde goed op video. Live observatie ingepland voor 7 juni. Heeft potentie maar moet het ook in de wedstrijd laten zien.",
    "auteur": "Daan Demers",
    "datum": "2026-03-19",
    "created": 1742335200000,
    "modified": 1742335200000
  },
  {
    "id": "demo_t004",
    "tekst": "Tip van Sandra Hoiting (Heerenveen): houd de O.15 van Groningen in de gaten — komen er volgend seizoen twee door die potentieel hebben voor eredivisieniveau.",
    "auteur": "Daan Demers",
    "datum": "2026-02-10",
    "created": 1739185200000,
    "modified": 1739185200000
  }
];

// ============ s35aw: DEMO-account detectie + seed ============
const __SH_DEMO_EMAIL = 'demo@scoutinghub.nl';
// s35cu: pattern-match alle demo-accounts onder @scoutinghub.nl (incl. coordinator-demo)
// Strip-detectie (banner bovenaan) gebruikt de bredere check; seed-functies blijven gekoppeld
// aan het primaire demo-account via __SH_DEMO_EMAIL.
function __shIsDemoEmail(em){
  if(!em || typeof em !== 'string') return false;
  const e = em.toLowerCase().trim();
  // Alle demo-accounts op scoutinghub.nl (demo@, coordinator-demo@, demo-coord@, etc.)
  return /^([a-z0-9._-]*demo[a-z0-9._-]*)@scoutinghub\.nl$/.test(e);
}
function __shIsDemoUser(){
  try {
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.email
            && __shIsDemoEmail(currentUser.email));
  } catch(_){ return false; }
}
// Primaire demo (alleen demo@scoutinghub.nl) — voor seed/autosed-knop in instellingen
function __shIsPrimaryDemoUser(){
  try {
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.email
            && currentUser.email.toLowerCase() === __SH_DEMO_EMAIL);
  } catch(_){ return false; }
}
function __shApplyDemoChrome(){
  try {
    // s35cu: strip toont op ALLE demo-accounts (demo@... + coordinator-demo@...)
    // Seed-rij blijft beperkt tot het primaire demo-account.
    const isDemo = __shIsDemoUser();
    const isPrimary = __shIsPrimaryDemoUser();
    const strip = document.getElementById('demo-strip');
    const seedRow = document.getElementById('settings-seed-row');
    if(strip) strip.style.display = isDemo ? 'flex' : 'none';
    if(seedRow) seedRow.style.display = isPrimary ? 'flex' : 'none';
    const resetRow = document.getElementById('settings-reset-row');
    if(resetRow) resetRow.style.display = isPrimary ? 'flex' : 'none';
  } catch(_){}
}
window.__shApplyDemoChrome = __shApplyDemoChrome;
// Re-evaluate elke 2s tot user is geladen
const __shDemoChromeIv = setInterval(() => {
  __shApplyDemoChrome();
  if(typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
    clearInterval(__shDemoChromeIv);
  }
}, 2000);

const __SH_DEMO_RITTEN = [
  {
    "id": "demo_rit01",
    "datum": "2026-02-21",
    "tijd": "11:30",
    "vertrekAdres": "Scoutingbureau Utrecht, Vredenburg 40, Utrecht",
    "aankomstAdres": "Sportpark De Toekomst, Amsterdam",
    "km": 75,
    "vergoeding": 26.25,
    "programma_id": "demo_m001",
    "doel": "Ajax O.18 vs PSV O.18 observatie",
    "notities": "Vroeg vertrokken vanwege parkeren.",
    "created": 1740060000000,
    "modified": 1740060000000
  },
  {
    "id": "demo_rit02",
    "datum": "2026-03-08",
    "tijd": "12:30",
    "vertrekAdres": "Scoutingbureau Utrecht, Vredenburg 40, Utrecht",
    "aankomstAdres": "MAC3PARK Stadion, Zwolle",
    "km": 90,
    "vergoeding": 31.5,
    "programma_id": "demo_m002",
    "doel": "PEC Zwolle O.17 vs Vitesse O.17",
    "notities": "",
    "created": 1741352000000,
    "modified": 1741352000000
  },
  {
    "id": "demo_rit03",
    "datum": "2026-04-05",
    "tijd": "09:45",
    "vertrekAdres": "Scoutingbureau Utrecht, Vredenburg 40, Utrecht",
    "aankomstAdres": "GelreDome Jeugdcomplex, Arnhem",
    "km": 65,
    "vergoeding": 22.75,
    "programma_id": "demo_m003",
    "doel": "Vitesse O.17 — Niels Bakker observeren",
    "notities": "",
    "created": 1743843000000,
    "modified": 1743843000000
  },
  {
    "id": "demo_rit04",
    "datum": "2026-04-15",
    "tijd": "12:15",
    "vertrekAdres": "Scoutingbureau Utrecht, Vredenburg 40, Utrecht",
    "aankomstAdres": "Abe Lenstra Stadion, Heerenveen",
    "km": 155,
    "vergoeding": 54.25,
    "programma_id": "demo_m005",
    "doel": "sc Heerenveen O.17 seizoensfinale",
    "notities": "Lange rit maar Ruben Janssen zeer de moeite waard.",
    "created": 1744624000000,
    "modified": 1744624000000
  },
  {
    "id": "demo_rit05",
    "datum": "2026-04-28",
    "tijd": "12:45",
    "vertrekAdres": "Scoutingbureau Utrecht, Vredenburg 40, Utrecht",
    "aankomstAdres": "Sportpark De Toekomst, Amsterdam",
    "km": 75,
    "vergoeding": 26.25,
    "programma_id": "demo_m006",
    "doel": "Jong Ajax vs Jong Feyenoord — beloftenderby",
    "notities": "",
    "created": 1745748000000,
    "modified": 1745748000000
  },
  {
    "id": "demo_rit06",
    "datum": "2026-05-10",
    "tijd": "11:00",
    "vertrekAdres": "Scoutingbureau Utrecht, Vredenburg 40, Utrecht",
    "aankomstAdres": "Sportpark De Toekomst, Amsterdam",
    "km": 75,
    "vergoeding": 26.25,
    "programma_id": "demo_m007",
    "doel": "Bekerfinale jeugd — Liam de Boer afrondende observatie",
    "notities": "Definitieve beoordeling voor advies 'direct contracteren'.",
    "created": 1746788000000,
    "modified": 1746788000000
  }
];

async function __shResetAndReseedDemo(){
  if(!confirm('⚠️ Alle demo-data wordt gewist en opnieuw geladen.\nDit kan niet ongedaan worden gemaakt. Doorgaan?')) return;
  const btn = document.getElementById('settings-reset-demo');
  if(btn){ btn.disabled = true; btn.textContent = 'Bezig…'; }
  try {
    toast('Demo-data wissen…');
    // 1. Wis alle bestaande records
    const players  = loadPlayers ? loadPlayers() : [];
    const reports  = loadMatchReports ? loadMatchReports() : [];
    const matches  = typeof programmaCache !== 'undefined' ? programmaCache : [];
    const contacts = typeof contactsCache !== 'undefined' ? contactsCache : [];
    const tips     = typeof tipsCache !== 'undefined' ? tipsCache : [];
    const analyses = typeof analysisCache !== 'undefined' ? analysisCache : [];
    const ritten   = typeof rittenCache !== 'undefined' ? rittenCache : [];

    for(const p of players)  { try { await deletePlayer(p.id); } catch(_){} }
    for(const r of reports)  { try { await deleteMatchReport(r.id); } catch(_){} }
    for(const m of matches)  { try { await deleteProgrammaItem(m.id); } catch(_){} }
    for(const c of contacts) { try { await deleteContact(c.id); } catch(_){} }
    for(const t of tips)     { try { await deleteTip(t.id); } catch(_){} }
    for(const a of analyses) { try { await deleteAnalysis(a.id); } catch(_){} }
    for(const rit of ritten) { try { await deleteRit(rit.id); } catch(_){} }

    // 2. Reset localStorage-vlag zodat auto-seed niet geblokkeerd is
    if(currentUser) {
      localStorage.removeItem('sh_demo_autoseed_' + currentUser.uid);
    }

    // 3. Herlaad demo-data (seed doet nu zelf wissen + herladen; _skipConfirm=true want reset deed al confirm)
    toast('Data gewist — demo opnieuw laden…');
    await __shSeedDemoToFirestore(true);
    // __shSeedDemoToFirestore doet zelf location.reload() na 1.8s
  } catch(e){
    console.error('Reset mislukt:', e);
    toast('Reset mislukt: ' + (e.message||''), true);
    if(btn){ btn.disabled = false; btn.textContent = 'Reset & herlaad'; }
  }
}

async function __shSeedDemoToFirestore(_skipConfirm){
  if(!__shIsDemoUser()){
    if(typeof toast === 'function') toast('Demo-vullen alleen beschikbaar voor demo-account', true);
    return;
  }
  if(!_skipConfirm && !confirm('Demo-data wordt opnieuw ingeladen. Alle bestaande data in dit account wordt eerst gewist. Doorgaan?')) return;

  // s-seed-fix: altijd eerst alles wissen vóór seeden zodat oude records weg zijn
  try {
    if(typeof toast === 'function') toast('Bestaande data wissen…');
    const _players  = typeof loadPlayers     === 'function' ? loadPlayers()     : [];
    const _reports  = typeof loadMatchReports=== 'function' ? loadMatchReports(): [];
    const _matches  = (typeof programmaCache !== 'undefined' && Array.isArray(programmaCache)) ? programmaCache : [];
    const _contacts = (typeof contactsCache  !== 'undefined' && Array.isArray(contactsCache))  ? contactsCache  : [];
    const _tips     = (typeof tipsCache      !== 'undefined' && Array.isArray(tipsCache))      ? tipsCache      : [];
    const _analyses = (typeof analysisCache  !== 'undefined' && Array.isArray(analysisCache))  ? analysisCache  : [];
    const _ritten   = (typeof rittenCache    !== 'undefined' && Array.isArray(rittenCache))    ? rittenCache    : [];
    for(const p  of _players)  { try { await deletePlayer(p.id);        } catch(_){} }
    for(const r  of _reports)  { try { await deleteMatchReport(r.id);   } catch(_){} }
    for(const m  of _matches)  { try { await deleteProgrammaItem(m.id); } catch(_){} }
    for(const c  of _contacts) { try { await deleteContact(c.id);       } catch(_){} }
    for(const t  of _tips)     { try { await deleteTip(t.id);           } catch(_){} }
    for(const a  of _analyses) { try { await deleteAnalysis(a.id);      } catch(_){} }
    for(const rt of _ritten)   { try { await deleteRit(rt.id);          } catch(_){} }
    if(currentUser) localStorage.removeItem('sh_demo_autoseed_' + currentUser.uid);
  } catch(e){ console.error('seed: wis-stap mislukt', e); }

  let okP=0, okR=0, okM=0, okT=0, okC=0, okTi=0, fail=0;
  if(typeof toast === 'function') toast('Demo-data laden…');
  // Spelers — krijgen beoordelingen+advies van hun MEEST RECENTE rapport
  try {
    const latestByPlayer = {};
    __SH_DEMO_REPORTS.forEach(r => {
      const prev = latestByPlayer[r.player_id];
      if(!prev || (r.datum || '') > (prev.datum || '')) latestByPlayer[r.player_id] = r;
    });
    for(const p of __SH_DEMO_PLAYERS){
      const rep = latestByPlayer[p.id];
      const rec = rep ? {...p, beoordelingen: rep.beoordelingen, advies: rep.advies} : {...p};
      try { await savePlayer(rec); okP++; } catch(e){ fail++; console.error('seed player', e); }
    }
  } catch(e){ console.error('seed players block', e); }
  // Rapport-historie (matchReports)
  try {
    for(const r of __SH_DEMO_REPORTS){
      try { await saveMatchReport({...r}); okR++; } catch(e){ fail++; console.error('seed report', e); }
    }
  } catch(e){ console.error('seed reports block', e); }
  // Wedstrijden (programma)
  try {
    for(const m of __SH_DEMO_MATCHES){
      try { await saveProgrammaItem({...m}); okM++; } catch(e){ fail++; console.error('seed match', e); }
    }
  } catch(e){ console.error('seed matches block', e); }
  // Teams (analyses)
  try {
    for(const t of __SH_DEMO_TEAMS){
      try { await saveAnalysis({...t}); okT++; } catch(e){ fail++; console.error('seed team', e); }
    }
  } catch(e){ console.error('seed teams block', e); }
  // Contacten
  try {
    for(const c of __SH_DEMO_CONTACTS){
      try { await saveContact({...c}); okC++; } catch(e){ fail++; console.error('seed contact', e); }
    }
  } catch(e){ console.error('seed contacts block', e); }
  // Tips
  try {
    for(const tp of __SH_DEMO_TIPS){
      try { await saveTip({...tp}); okTi++; } catch(e){ fail++; console.error('seed tip', e); }
    }
  } catch(e){ console.error('seed tips block', e); }
  // Ritten
  let okRit = 0;
  try {
    for(const rit of __SH_DEMO_RITTEN){
      try { await saveRit({...rit}); okRit++; } catch(e){ fail++; console.error('seed rit', e); }
    }
  } catch(e){ console.error('seed ritten block', e); }

  const msg = `Demo-data geladen: ${okP} spelers, ${okR} rapporten, ${okM} wedstrijden, ${okC} contacten, ${okTi} tips, ${okRit} ritten` + (fail ? ` (${fail} fouten)` : '') + ' — pagina wordt herladen.';
  if(typeof toast === 'function') toast(msg);
  if(typeof __shTrace === 'function') __shTrace('demo-seed-done', {okP, okR, okM, okT, okC, okTi, fail});
  // s-seed-fix: pagina herladen zodat caches volledig worden vernieuwd
  setTimeout(() => location.reload(), 1800);
}
window.__shSeedDemoToFirestore = __shSeedDemoToFirestore;
// Wire seed-knop wanneer DOM klaar is
setTimeout(() => {
  const btn = document.getElementById('settings-seed-demo');
  if(btn && !btn.__shWired){
    btn.__shWired = true;
    btn.addEventListener('click', __shSeedDemoToFirestore);
  }
}, 2500);

// s35ax: AUTO-SEED bij allereerste demo-login
// Wacht 5s zodat Firestore-listeners zeker eerste snapshot hebben geleverd.
// Als playersCache dan ECHT leeg is voor demo-user, seed automatisch.
// Vlag in localStorage voorkomt herhalen na refresh in dezelfde sessie.
let __shAutoSeedDone = false;
setTimeout(async () => {
  try {
    if(__shAutoSeedDone) return;
    if(typeof currentUser === 'undefined' || !currentUser || !currentUser.email) return;
    if(currentUser.email.toLowerCase() !== 'demo@scoutinghub.nl') return;
    // Firestore moet leeg zijn EN we mogen niet eerder geseed hebben deze sessie
    const seenKey = 'sh_demo_autoseed_' + currentUser.uid;
    if(localStorage.getItem(seenKey)) return;
    if(Array.isArray(playersCache) && playersCache.length > 0
       && playersCache.some(p => !p.id || !p.id.startsWith('demo_'))) {
      // Er staat al echte data — niks doen
      return;
    }
    if(Array.isArray(playersCache) && playersCache.length > 0) {
      // Caches gevuld met demo-IDs maar mogelijk alleen in-memory; seed alsnog
    }
    if(typeof __shTrace === 'function') __shTrace('demo-autoseed-start', {uid: currentUser.uid});
    let okP=0, okR=0, okM=0, okT=0, okC=0, okTi=0, fail=0;
    // s35cx: meest-recente rapport per speler bepalen
    const latestByPlayer = {};
    __SH_DEMO_REPORTS.forEach(r => {
      const prev = latestByPlayer[r.player_id];
      if(!prev || (r.datum || '') > (prev.datum || '')) latestByPlayer[r.player_id] = r;
    });
    for(const p of __SH_DEMO_PLAYERS){
      const rep = latestByPlayer[p.id];
      const rec = rep ? {...p, beoordelingen: rep.beoordelingen, advies: rep.advies} : {...p};
      try { await savePlayer(rec); okP++; } catch(e){ fail++; }
    }
    for(const r of __SH_DEMO_REPORTS){
      try { await saveMatchReport({...r}); okR++; } catch(e){ fail++; }
    }
    for(const m of __SH_DEMO_MATCHES){
      try { await saveProgrammaItem({...m}); okM++; } catch(e){ fail++; }
    }
    for(const t of __SH_DEMO_TEAMS){
      try { await saveAnalysis({...t}); okT++; } catch(e){ fail++; }
    }
    for(const c of __SH_DEMO_CONTACTS){
      try { await saveContact({...c}); okC++; } catch(e){ fail++; }
    }
    for(const tp of __SH_DEMO_TIPS){
      try { await saveTip({...tp}); okTi++; } catch(e){ fail++; }
    }
    let okRit = 0;
    for(const rit of __SH_DEMO_RITTEN){
      try { await saveRit({...rit}); okRit++; } catch(e){ fail++; }
    }
    localStorage.setItem(seenKey, new Date().toISOString());
    __shAutoSeedDone = true;
    if(typeof __shTrace === 'function') __shTrace('demo-autoseed-done', {okP, okR, okM, okT, okC, okTi, fail});
    if(typeof toast === 'function') toast(`Demo-data geladen (${okP} spelers, ${okR} rapporten, ${okM} wedstrijden, ${okT} teams, ${okC} contacten, ${okTi} tips, ${okRit} ritten)`);
  } catch(e){
    console.error('auto-seed error:', e);
  }
}, 5000);

// ============ s35cq: DEMO MIGRATIE — BVO/divisie-strings -> A/B/C/D ============
// Demo-account is eerder geseed met BVO-strings; nieuwe seed re-runt niet
// door localStorage-vlag. Deze migratie loopt eenmalig per demo-login en
// herschrijft bestaande records naar de huidige A/B/C/D + numeriek advies.
const __SH_NIV_MAP = {
  'Top BVO':                 'A',
  'BVO Eredivisie':          'B',
  'BVO Eerste Divisie':      'C',
  'BVO Tweede Divisie':      'C',
  'Amateur Hoofdklasse':     'D',
  'Amateur Eerste Klasse':   'D',
  'Amateur Tweede Klasse':   'D',
  'Amateur Tweede Divisie':  'D',
  'Amateur Derde Divisie':   'D'
};
const __SH_ADV_MAP = {
  'Top-talent — direct doorstromen': '4',
  'Top-talent - direct doorstromen': '4',
  'Direct contracteren':              '4',
  'Op proef uitnodigen':              '3',
  'Periodiek monitoren':              '2',
  'Volgen — nog laat-rijp':           '2',
  'Volgen - nog laat-rijp':           '2',
  'Volgen':                            '2',
  'Geen vervolgstap':                  '1'
};
function __shMapNiveau(v){
  if(!v || typeof v !== 'string') return v;
  if(/^[ABCD]$/.test(v)) return v;
  if(__SH_NIV_MAP[v]) return __SH_NIV_MAP[v];
  if(/^Top\b/i.test(v)) return 'A';
  if(/Eredivisie/i.test(v)) return /^BVO/i.test(v) ? 'B' : 'C';
  if(/BVO/i.test(v)) return 'C';
  if(/Amateur|Hoofdklasse|Tweede Klasse|Derde Klasse/i.test(v)) return 'D';
  return v;
}
function __shMapAdvies(v){
  if(v == null) return v;
  const s = String(v);
  if(/^[1-4]$/.test(s)) return s;
  if(__SH_ADV_MAP[s]) return __SH_ADV_MAP[s];
  return s;
}
let __shDemoMigrateDone = false;
setTimeout(async () => {
  try {
    if(__shDemoMigrateDone) return;
    if(!__shIsDemoUser()) return;
    const flagKey = 'sh_demo_niveau_migrate_v1_' + (currentUser && currentUser.uid || 'anon');
    if(localStorage.getItem(flagKey)) return;
    if(!Array.isArray(playersCache) || playersCache.length === 0) return;
    let fixed = 0;
    for(const p of playersCache){
      const oldH = p.huidig_niveau, oldP = p.potentieel_niveau, oldA = p.advies;
      const newH = __shMapNiveau(oldH);
      const newP = __shMapNiveau(oldP);
      const newA = __shMapAdvies(oldA);
      if(newH !== oldH || newP !== oldP || newA !== oldA){
        try {
          await savePlayer({...p, huidig_niveau: newH, potentieel_niveau: newP, advies: newA});
          fixed++;
        } catch(e){ console.warn('migrate fail', p.id, e); }
      }
    }
    localStorage.setItem(flagKey, new Date().toISOString());
    __shDemoMigrateDone = true;
    if(typeof __shTrace === 'function') __shTrace('demo-niveau-migrate-done', {fixed, total: playersCache.length});
    if(fixed > 0 && typeof toast === 'function') toast(`Demo-data bijgewerkt (${fixed} spelers)`);
  } catch(e){ console.error('demo-migrate error:', e); }
}, 8000);

let currentAnalysisId = null;
let unsubPlayers = null;
let unsubAnalyses = null;
let unsubContacts = null;
let unsubMatchReports = null;
let unsubTips = null;
let inactivityTimer = null;
let selectedPitchPos = null;
let sortKey = 'datum';
let sortAsc = false;
let appInitialized = false;
let geoState = {level:'map', city:null, club:null, team:null};

/* =============== UTILS =============== */
function uid(){ return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function $(s, p=document){ return p.querySelector(s); }
function $$(s, p=document){ return Array.from(p.querySelectorAll(s)); }
function initials(name){
  return (name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join('');
}
function formatDate(iso){
  if(!iso) return '—';
  try { return new Date(iso).toLocaleDateString('nl-NL', {day:'2-digit',month:'short',year:'numeric'}); }
  catch(e){ return iso; }
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
// ── Modal dirty-guard (s91) ─────────────────────────────────────────────────
// Toont een bevestiging als de gebruiker een formulier-modal wegklikt terwijl
// er niet-opgeslagen inhoud is. Gebruik _shMarkDirty(key) op input/change,
// _shResetDirty(key) bij openen of succesvolle opslag, en vervang de backdrop-
// click-handler door _shGuardClose(key, closeFn).
const _shDirtyFlags = {};
function _shMarkDirty(k){ _shDirtyFlags[k] = true; }
function _shResetDirty(k){ _shDirtyFlags[k] = false; }
function _shGuardClose(k, closeFn){
  if(_shDirtyFlags[k]){
    if(!confirm('Je hebt niet-opgeslagen wijzigingen. Toch sluiten?')) return;
  }
  _shResetDirty(k);
  closeFn();
}
// ────────────────────────────────────────────────────────────────────────────

// ── Gemini AI helper ─────────────────────────────────────────────────────────
const _GEMINI_KEYS = [
  ['AIzaSyDH58cAtoWrl','bpmu0MdbyrlsPgcQ','YduRV4'].join(''),
  ['AIzaSyBDeLaGfzM1','PN8Cl8E6nlIe8Fxx','xXLwRyY'].join('') // fallback
];
async function callGemini(prompt, { temperature=0.3, maxTokens=512 }={}){
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens }
  });
  for(const key of _GEMINI_KEYS){
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
      const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body });
      if(!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if(text) return text.trim();
    } catch(_){}
  }
  throw new Error('Gemini niet beschikbaar');
}
window.callGemini = callGemini;


function toast(msg, isError=false){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(()=>t.classList.remove('show'), 2200);
}
function setSync(state){
  const dot = $('#sync-dot');
  const txt = $('#sync-text');
  if(!dot) return;
  dot.classList.remove('syncing','offline');
  if(state === 'syncing'){ dot.classList.add('syncing'); txt.textContent = 'Bezig met synchroniseren...'; }
  else if(state === 'offline'){ dot.classList.add('offline'); txt.textContent = 'Geen verbinding'; }
  else {
    txt.textContent = 'Cloud gesynchroniseerd';
    window.__lastSyncMs = Date.now();
  }
  // s35ar (#224): UID-6 + project + relatieve laatste-sync tijd
  try {
    const uidEl = document.getElementById('sync-detail-uid');
    const tEl   = document.getElementById('sync-detail-time');
    if(uidEl){
      const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : '';
      uidEl.textContent = uid ? ('UID: ' + uid.slice(0,6) + ' / database-scouting') : 'niet ingelogd';
    }
    if(tEl){
      if(state === 'offline'){
        tEl.textContent = 'offline';
      } else if(window.__lastSyncMs){
        const sec = Math.max(1, Math.round((Date.now() - window.__lastSyncMs) / 1000));
        if(sec < 60) tEl.textContent = 'net nu';
        else if(sec < 3600) tEl.textContent = Math.round(sec/60) + ' min geleden';
        else if(sec < 86400) tEl.textContent = Math.round(sec/3600) + ' uur geleden';
        else tEl.textContent = Math.round(sec/86400) + ' dag(en) geleden';
      } else {
        tEl.textContent = '—';
      }
    }
  } catch(_){}
}
// s35ar (#224): refresh "x min geleden" elke 30s + klik = detail-dialog
if(!window.__syncRefreshTimer){
  window.__syncRefreshTimer = setInterval(() => {
    try { if(typeof setSync === 'function') setSync(null); } catch(_){}
  }, 30000);
}
document.addEventListener('click', e => {
  const ind = e.target.closest && e.target.closest('#sync-indicator');
  if(!ind) return;
  const uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : '(niet ingelogd)';
  const email = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) ? currentUser.email : '—';
  const last = window.__lastSyncMs ? new Date(window.__lastSyncMs).toLocaleString('nl-NL') : 'nog niet gesynchroniseerd';
  const online = navigator.onLine ? 'ja' : 'NEE (geen verbinding)';
  alert('Sync-details\n\n' +
        'Account: ' + email + '\n' +
        'UID: ' + uid + '\n' +
        'Project: database-scouting\n' +
        'Online: ' + online + '\n' +
        'Laatste sync: ' + last + '\n\n' +
        'App en laptop moeten op hetzelfde UID inloggen om data te delen.\n' +
        'Sync gebeurt automatisch zodra je verbinding hebt.');
});

/* =============== DATA LAYER (Firestore) =============== */
function playersCol(){ return collection(db, 'users', currentUser.uid, 'players'); }
function analysesCol(){ return collection(db, 'users', currentUser.uid, 'analyses'); }
function contactsCol(){ return collection(db, 'users', currentUser.uid, 'contacts'); }
function matchReportsCol(){ return collection(db, 'users', currentUser.uid, 'match_reports'); }
function tipsCol(){ return collection(db, 'users', currentUser.uid, 'tips'); }
function programmaCol(){ return collection(db, 'users', currentUser.uid, 'programma'); }
function rittenCol(){ return collection(db, 'users', currentUser.uid, 'ritten'); }

// s35m: vul plaats/adres/postcode op rapport/wedstrijd vanuit findClubInfo
// (thuisspelende ploeg = bron). opts.force=true overschrijft ook bestaande
// afwijkende waarden — adresboek is leidend.
// Retourneert: {changed, aangevuld, gecorrigeerd, gematcht, homeKey, rec}.
function enrichRecordFromHomeClub(rec, opts){
  const force = !!(opts && opts.force);
  const empty = {changed:false, aangevuld:false, gecorrigeerd:false, gematcht:false, homeKey:'', rec};
  if(!rec || typeof window.findClubInfo !== 'function') return empty;
  const homeKey = ((rec.wedstrijd && rec.wedstrijd.thuis) || rec.thuis || rec.club || '').trim();
  if(!homeKey) return empty;
  const info = window.findClubInfo(homeKey);
  if(!info) return {...empty, homeKey};
  let aangevuld = false;
  let gecorrigeerd = false;
  const out = {...rec};
  const apply = (field) => {
    const v = (info[field]||'').trim();
    if(!v) return;
    const cur = (out[field]||'').toString().trim();
    if(!cur){
      out[field] = v; aangevuld = true;
    } else if(force && cur.toLowerCase() !== v.toLowerCase()){
      out[field] = v; gecorrigeerd = true;
    }
  };
  apply('plaats');
  apply('adres');
  apply('postcode');
  const changed = aangevuld || gecorrigeerd;
  return {changed, aangevuld, gecorrigeerd, gematcht:true, homeKey, rec: out};
}
window.enrichRecordFromHomeClub = enrichRecordFromHomeClub;

// s35m: walk alle rapporten + wedstrijden, force:true, en sla op.
// Retourneert promise van {aangevuldR, gecorrigeerdR, aangevuldM, gecorrigeerdM, nietGematcht:[], totaalR, totaalM}.
async function syncAllAddressesFromAdresboek(){
  const result = {
    aangevuldR: 0, gecorrigeerdR: 0, aangevuldM: 0, gecorrigeerdM: 0,
    nietGematcht: [], totaalR: 0, totaalM: 0
  };
  const niet = new Set();
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const matches = (typeof loadMatchReports === 'function') ? loadMatchReports() : [];
  result.totaalR = players.length;
  result.totaalM = matches.length;
  const playerWrites = [];
  for(const p of players){
    const r = enrichRecordFromHomeClub(p, {force:true});
    if(!r.gematcht && r.homeKey) niet.add(r.homeKey);
    if(r.aangevuld) result.aangevuldR++;
    if(r.gecorrigeerd) result.gecorrigeerdR++;
    if(r.changed) playerWrites.push(savePlayer(r.rec).catch(()=>{}));
  }
  const matchWrites = [];
  for(const m of matches){
    const r = enrichRecordFromHomeClub(m, {force:true});
    if(!r.gematcht && r.homeKey) niet.add(r.homeKey);
    if(r.aangevuld) result.aangevuldM++;
    if(r.gecorrigeerd) result.gecorrigeerdM++;
    if(r.changed) matchWrites.push(saveMatchReport(r.rec).catch(()=>{}));
  }
  await Promise.all([...playerWrites, ...matchWrites]);
  result.nietGematcht = Array.from(niet).sort((a,b)=>a.localeCompare(b,'nl'));
  return result;
}
window.syncAllAddressesFromAdresboek = syncAllAddressesFromAdresboek;

function loadPlayers(){ return playersCache; }
function loadAnalyses(){ return analysesCache; }
function loadContacts(){ return contactsCache; }
function loadMatchReports(){ return matchReportsCache; }
function loadTips(){ return tipsCache; }
function loadProgramma(){ return programmaCache; }
function getAnalysis(id){ return analysesCache.find(a => a.id === id); }
function currentAnalysis(){ return currentAnalysisId ? getAnalysis(currentAnalysisId) : null; }

function subscribeData(){
  let datumMigrationDone = false;
  let geoPlayersMigrationDone = false;  // s35l
  unsubPlayers = onSnapshot(playersCol(), snap=>{
    playersCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    if(!datumMigrationDone){
      datumMigrationDone = true;
      const toFix = playersCache.filter(p => p.wedstrijd && p.wedstrijd.datum && p.datum !== p.wedstrijd.datum);
      if(toFix.length){
        Promise.all(toFix.map(p => savePlayer({...p, datum: p.wedstrijd.datum}).catch(()=>{})))
          .then(()=> toast(`${toFix.length} rapportdatum${toFix.length===1?'':'s'} bijgewerkt naar wedstrijddatum`));
      }
    }
    if(!geoPlayersMigrationDone){
      geoPlayersMigrationDone = true;
      // s35m: backfill + correct plaats/adres/postcode via thuisclub (force).
      const enriched = playersCache
        .map(p => enrichRecordFromHomeClub(p, {force:true}))
        .filter(r => r.changed)
        .map(r => r.rec);
      if(enriched.length){
        Promise.all(enriched.map(p => savePlayer(p).catch(()=>{})))
          .then(()=> toast(`${enriched.length} rapport${enriched.length===1?'':'en'} bijgewerkt vanuit adresboek`));
      }
    }
    if(currentView === 'dashboard') renderDashboard();
    if(currentView === 'database') applyFilters();
    try { shUpdateDatabaseNavBadge(); } catch(_){}
    if(currentView === 'pitch' && currentAnalysisId) renderPitchInfo();
    setSync('ok');
  }, err=>{
    console.error('Players sync error:', err);
    setSync('offline');
  });

  unsubAnalyses = onSnapshot(analysesCol(), snap=>{
    analysesCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    if(currentView === 'dashboard') renderDashboard();
    if(currentView === 'pitch'){
      if(currentAnalysisId && getAnalysis(currentAnalysisId)) renderAnalysisDetail();
      else renderAnalysesList();
    }
    setSync('ok');
  }, err=>{
    console.error('Analyses sync error:', err);
    setSync('offline');
  });

  unsubContacts = onSnapshot(contactsCol(), snap=>{
    contactsCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    if(currentView === 'contacts') renderContacts();
    setSync('ok');
  }, err=>{
    console.error('Contacts sync error:', err);
    setSync('offline');
  });

  let geoMatchesMigrationDone = false;  // s35l
  unsubMatchReports = onSnapshot(matchReportsCol(), snap=>{
    matchReportsCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    if(!geoMatchesMigrationDone){
      geoMatchesMigrationDone = true;
      // s35m: backfill + correct plaats/adres/postcode via thuisclub (force).
      const enriched = matchReportsCache
        .map(m => enrichRecordFromHomeClub(m, {force:true}))
        .filter(r => r.changed)
        .map(r => r.rec);
      if(enriched.length){
        Promise.all(enriched.map(m => saveMatchReport(m).catch(()=>{})))
          .then(()=> toast(`${enriched.length} wedstrijd${enriched.length===1?'':'en'} bijgewerkt vanuit adresboek`));
      }
    }
    if(currentView === 'matches') renderMatches();
    setSync('ok');
  }, err=>{
    console.error('Match reports sync error:', err);
    setSync('offline');
  });

  unsubTips = onSnapshot(tipsCol(), snap=>{
    tipsCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    if(currentView === 'tips') renderTips();
    setSync('ok');
  }, err=>{
    console.error('Tips sync error:', err);
    setSync('offline');
  });

  unsubRitten = onSnapshot(rittenCol(), snap=>{
    rittenCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    if(currentView === 'ritten') renderRitten();
    setSync('ok');
  }, err=>{
    console.error('Ritten sync error:', err);
    setSync('offline');
  });

  unsubProgramma = onSnapshot(programmaCol(), snap=>{
    programmaCache = snap.docs.map(d => ({...d.data(), id: d.id}));
    // s35bm: skip dashboard re-render zolang een snel-notitie open staat — anders
    // verdwijnt het formulier vanzelf na elke autosave (firestore -> snapshot -> render).
    const hasOpenSnelForm = !!document.querySelector(
      '.sa-snel-form[style*="display: block"], .sa-snel-wstr-form[style*="display: block"]'
    );
    // s35cv: forceer ook een tweede render via rAF zodat de PWA-DOM
    //        de eerste snapshot zeker oppikt (was: blank agenda in app).
    if(currentView === 'programma'){
      renderProgramma();
      requestAnimationFrame(() => { try{ renderProgramma(); }catch(_){ } });
    }
    if(currentView === 'agenda') renderAgenda();
    if(currentView === 'dashboard' && !hasOpenSnelForm){
      renderDashboardAgenda();
    }
    setSync('ok');
  }, err=>{
    console.error('Programma sync error:', err);
    setSync('offline');
  });

}

function unsubscribeData(){
  if(unsubPlayers){ unsubPlayers(); unsubPlayers = null; }
  if(unsubAnalyses){ unsubAnalyses(); unsubAnalyses = null; }
  if(unsubContacts){ unsubContacts(); unsubContacts = null; }
  if(unsubMatchReports){ unsubMatchReports(); unsubMatchReports = null; }
  if(unsubTips){ unsubTips(); unsubTips = null; }
  if(unsubProgramma){ unsubProgramma(); unsubProgramma = null; }
  if(unsubRitten){ unsubRitten(); unsubRitten = null; }
  playersCache = [];
  analysesCache = [];
  contactsCache = [];
  matchReportsCache = [];
  tipsCache = [];
  programmaCache = [];
  rittenCache = [];
}

async function savePlayer(player){
  setSync('syncing');
  try {
    // s35l: verrijk plaats/adres/postcode uit thuisclub vóór opslaan
    const enriched = (typeof enrichRecordFromHomeClub === 'function')
      ? enrichRecordFromHomeClub(player).rec
      : player;
    const id = enriched.id;
    const {id: _drop, ...data} = enriched;
    await setDoc(doc(playersCol(), id), data);
  } catch(e){
    console.error('Save player error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deletePlayer(id){
  setSync('syncing');
  try { await deleteDoc(doc(playersCol(), id)); }
  catch(e){
    console.error('Delete player error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}

async function saveContact(contact){
  setSync('syncing');
  try {
    const id = contact.id;
    const {id: _drop, ...data} = contact;
    await setDoc(doc(contactsCol(), id), data);
  } catch(e){
    console.error('Save contact error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deleteContact(id){
  setSync('syncing');
  try { await deleteDoc(doc(contactsCol(), id)); }
  catch(e){
    console.error('Delete contact error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}

async function saveMatchReport(report){
  setSync('syncing');
  try {
    // s35l: verrijk plaats/adres/postcode uit thuisclub vóór opslaan
    const enriched = (typeof enrichRecordFromHomeClub === 'function')
      ? enrichRecordFromHomeClub(report).rec
      : report;
    const id = enriched.id;
    const {id: _drop, ...data} = enriched;
    await setDoc(doc(matchReportsCol(), id), data);
  } catch(e){
    console.error('Save match report error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deleteMatchReport(id){
  setSync('syncing');
  try { await deleteDoc(doc(matchReportsCol(), id)); }
  catch(e){
    console.error('Delete match report error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}

async function saveTip(tip){
  setSync('syncing');
  try {
    const id = tip.id;
    const {id: _drop, ...data} = tip;
    await setDoc(doc(tipsCol(), id), data);
  } catch(e){
    console.error('Save tip error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deleteTip(id){
  setSync('syncing');
  try { await deleteDoc(doc(tipsCol(), id)); }
  catch(e){
    console.error('Delete tip error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}

async function saveProgrammaItem(item){
  setSync('syncing');
  try {
    const id = item.id;
    const {id: _drop, _targetScoutUid, ...data} = item;
    /* s35cg: coordinator kan een wedstrijd voor een andere scout inplannen.
       Als _targetScoutUid is gezet (en niet de huidige user), schrijf in
       users/{scoutUid}/programma/{id} i.p.v. eigen subcollectie.            */
    const targetUid = (_targetScoutUid && _targetScoutUid !== currentUser.uid)
      ? _targetScoutUid : currentUser.uid;
    if(targetUid !== currentUser.uid){
      /* Cross-scout: schrijf naar users/{targetUid}/programma/{id}.
         Mark wie het geplanned heeft voor audit.                            */
      data.planned_by = currentUser.uid;
      data.planned_by_email = currentUser.email || '';
      await setDoc(doc(db, 'users', targetUid, 'programma', id), data);
    } else {
      await setDoc(doc(programmaCol(), id), data);
    }
  } catch(e){
    console.error('Save programma error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deleteProgrammaItem(id){
  setSync('syncing');
  try { await deleteDoc(doc(programmaCol(), id)); }
  catch(e){
    console.error('Delete programma error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}

/* =============== s35di: RITTEN =============== */
async function saveRit(rit){
  setSync('syncing');
  try {
    const id = rit.id;
    const {id: _drop, ...data} = rit;
    await setDoc(doc(rittenCol(), id), data);
  } catch(e){
    console.error('Save rit error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deleteRit(id){
  setSync('syncing');
  try { await deleteDoc(doc(rittenCol(), id)); }
  catch(e){
    console.error('Delete rit error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}

function _ritFmtDatum(iso){
  if(!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return iso;
  return d.toLocaleDateString('nl-NL', {day:'2-digit', month:'short'});
}
function _ritFmtKm(km){
  const n = Number(km);
  if(!isFinite(n)) return '0';
  return n.toFixed(1).replace('.', ',');
}
function _ritGebruikerAdressen(){
  const set = new Set();
  (rittenCache||[]).forEach(r => {
    if(r.vertrekAdres) set.add(r.vertrekAdres.trim());
    if(r.aankomstAdres) set.add(r.aankomstAdres.trim());
  });
  return Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b,'nl'));
}

function renderRitten(){
  const list = document.getElementById('ritten-list');
  const empty = document.getElementById('ritten-empty');
  if(!list) return;

  const van = (document.getElementById('rit-filter-van')||{}).value || '';
  const tot = (document.getElementById('rit-filter-tot')||{}).value || '';

  let items = (rittenCache||[]).slice().sort((a,b)=>{
    const ka = (a.datum||'') + 'T' + (a.tijd||'00:00');
    const kb = (b.datum||'') + 'T' + (b.tijd||'00:00');
    return kb.localeCompare(ka);
  });
  if(van) items = items.filter(r => (r.datum||'') >= van);
  if(tot) items = items.filter(r => (r.datum||'') <= tot);

  const totKm = items.reduce((s,r)=> s + (Number(r.km)||0), 0);
  const kpiAantal = document.getElementById('rit-kpi-aantal');
  const kpiKm = document.getElementById('rit-kpi-km');
  const kpiPer = document.getElementById('rit-kpi-periode');
  if(kpiAantal) kpiAantal.textContent = items.length;
  if(kpiKm) kpiKm.textContent = _ritFmtKm(totKm);
  if(kpiPer){
    if(van && tot) kpiPer.textContent = _ritFmtDatum(van) + ' – ' + _ritFmtDatum(tot);
    else if(van) kpiPer.textContent = 'vanaf ' + _ritFmtDatum(van);
    else if(tot) kpiPer.textContent = 't/m ' + _ritFmtDatum(tot);
    else kpiPer.textContent = items.length ? 'alle ritten' : '—';
  }

  if(!items.length){
    list.innerHTML = '';
    if(empty) empty.style.display = '';
    return;
  }
  if(empty) empty.style.display = 'none';

  list.innerHTML = items.map(r => {
    const datum = _ritFmtDatum(r.datum) + (r.tijd ? '<br><span style="font-size:11px;color:var(--text-3);">' + r.tijd + '</span>' : '');
    const route = (r.vertrekAdres || '—') + '<span class="rit-arrow">→</span>' + (r.aankomstAdres || '—');
    const doel = r.doel ? '<div class="rit-doel">' + escapeHtml(r.doel) + '</div>' : '';
    return '<div class="rit-row" data-id="' + r.id + '">' +
      '<div class="rit-datum">' + datum + '</div>' +
      '<div><div class="rit-route">' + escapeHtml(route).replace('&lt;span class=&quot;rit-arrow&quot;&gt;→&lt;/span&gt;','<span class="rit-arrow">→</span>') + '</div>' + doel + '</div>' +
      '<div class="rit-km">' + _ritFmtKm(r.km) + ' km</div>' +
      '<div class="rit-actions"><button data-act="edit">Bewerken</button><button data-act="terug" title="Retourrit aanmaken">&#x21a9; Terug</button></div>' +
      '</div>';
  }).join('');

  list.querySelectorAll('.rit-row').forEach(row => {
    row.querySelector('[data-act="edit"]').addEventListener('click', () => {
      const id = row.dataset.id;
      const rit = rittenCache.find(r => r.id === id);
      if(rit) openRitModal(rit);
    });
    // s35dj: retourrit — swap vertrek/aankomst, zelfde km, doel "Terug — ..."
    const terugBtn = row.querySelector('[data-act="terug"]');
    if(terugBtn) terugBtn.addEventListener('click', () => {
      const id = row.dataset.id;
      const r = rittenCache.find(x => x.id === id);
      if(!r) return;
      const today = new Date();
      openRitModal({
        // geen id → nieuwe rit
        datum: today.toISOString().slice(0,10),
        tijd:  today.toTimeString().slice(0,5),
        vertrekAdres:  r.aankomstAdres || '',
        aankomstAdres: r.vertrekAdres  || '',
        vertrekLat:  r.aankomstLat,  vertrekLon:  r.aankomstLon,
        aankomstLat: r.vertrekLat,   aankomstLon: r.vertrekLon,
        km:   r.km || '',
        doel: r.doel ? 'Terug — ' + r.doel : 'Terug'
      });
    });
  });
}

// s36l: aankomst-suggesties vanuit programma — alle items komende 14 dagen + vorige 2 dagen
function _ritShowProgChips(chipsEl){
  if(!chipsEl) return;
  chipsEl.innerHTML = '';
  chipsEl.style.display = 'none';
  try {
    const today = new Date();
    const relevant = (typeof programmaCache !== 'undefined' ? programmaCache : [])
      .filter(p => {
        if(!p || !p.datum) return false;
        const diff = (new Date(p.datum) - today) / 86400000;
        return diff >= -2 && diff <= 14;
      })
      .sort((a,b) => a.datum.localeCompare(b.datum));
    if(!relevant.length) return;
    const dayLabel = (d) => {
      if(d === dates[0]) return 'Gisteren';
      if(d === dates[1]) return 'Vandaag';
      return 'Morgen';
    };
    chipsEl.innerHTML = '<div class="rm-prog-chips-label">Aankomst uit Programma:</div>' +
      relevant.map(p => {
        const loc  = (p.locatie || p.sportpark || p.adres || '').trim();
        const naam = p.thuis || p.toernooi_naam || p.naam || '';
        const label = [dayLabel(p.datum), naam, loc].filter(Boolean).join(' · ');
        const doel  = naam ? (p.thuis ? 'Wedstrijd ' + p.thuis : naam) : 'Programma';
        const tijd  = p.tijd || p.tijdstip || '';
        return '<button type="button" class="rm-prog-chip"' +
          ' data-adres="' + (loc.replace(/"/g,'&quot;')) + '"' +
          ' data-doel="' + (doel.replace(/"/g,'&quot;')) + '"' +
          ' data-datum="' + (p.datum||'') + '"' +
          ' data-tijd="' + (tijd||'') + '">' +
          label.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</button>';
      }).join('');
    chipsEl.style.display = '';
    chipsEl.querySelectorAll('.rm-prog-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const adres = btn.dataset.adres;
        const doel  = btn.dataset.doel;
        const datum = btn.dataset.datum;
        const tijd  = btn.dataset.tijd;
        const aankomstEl = document.getElementById('rit-aankomst');
        const doelEl  = document.getElementById('rit-doel');
        const datumEl = document.getElementById('rit-datum');
        const tijdEl  = document.getElementById('rit-tijd');
        if(aankomstEl && adres){ aankomstEl.value = adres; }
        if(doelEl && doel && !doelEl.value){ doelEl.value = doel; }
        if(datumEl && datum){ datumEl.value = datum; }
        if(tijdEl && tijd){ tijdEl.value = tijd; }
        // Probeer coords: eerst club-adresboek, dan Nominatim
        if(adres){
          const clubMatches = typeof _ritSearchClubs === 'function' ? _ritSearchClubs(adres) : [];
          const clubHit = clubMatches.find(c => isFinite(c.lat) && isFinite(c.lon));
          if(clubHit){
            const latEl = document.getElementById('rit-aankomst-lat');
            const lonEl = document.getElementById('rit-aankomst-lon');
            if(latEl) latEl.value = String(clubHit.lat);
            if(lonEl) lonEl.value = String(clubHit.lon);
            _ritAddrCoords.set(adres, {lat:clubHit.lat, lon:clubHit.lon});
            _ritTryAutoKm();
          } else if(typeof _ritNominatimSearch === 'function'){
            _ritNominatimSearch(adres).then(results => {
              if(results && results.length){
                const r = results[0];
                const latEl = document.getElementById('rit-aankomst-lat');
                const lonEl = document.getElementById('rit-aankomst-lon');
                if(latEl) latEl.value = String(r.lat);
                if(lonEl) lonEl.value = String(r.lon);
                _ritAddrCoords.set(adres, {lat:r.lat, lon:r.lon});
                _ritTryAutoKm();
              }
            }).catch(()=>{});
          }
        }
      });
    });
  } catch(_){}
}


// s36l: programma-picker voor ritten — toont alle programma-items in een popup
function _ritOpenProgPicker(items){
  // Verwijder bestaande picker
  const old = document.getElementById('rit-prog-picker');
  if(old) old.remove();

  const today = new Date().toISOString().slice(0,10);
  const filtered = (items || []).filter(p => p.datum >= today).slice(0, 30);
  if(!filtered.length){ toast('Geen aankomende programma-items gevonden'); return; }

  const picker = document.createElement('div');
  picker.id = 'rit-prog-picker';
  picker.style.cssText = [
    'position:fixed; inset:0; z-index:9000; background:rgba(0,0,0,.6)',
    'display:flex; align-items:flex-end; justify-content:center; padding:12px'
  ].join(';');

  const dayNames = ['zo','ma','di','wo','do','vr','za'];
  const rows = filtered.map(p => {
    const d = new Date(p.datum + 'T12:00:00');
    const dag = dayNames[d.getDay()] + ' ' + d.getDate() + '-' + (d.getMonth()+1);
    const naam = p.thuis || p.naam || p.toernooi_naam || p.type || 'Item';
    const loc  = (p.locatie || p.sportpark || p.adres || '').trim();
    const tijd = p.tijd || p.tijdstip || '';
    const sub  = [loc, tijd].filter(Boolean).join(' · ');
    return `<div class="rpp-row" data-datum="${p.datum}" data-tijd="${tijd}" data-loc="${(loc||'').replace(/"/g,'&quot;')}" data-doel="${naam.replace(/"/g,'&quot;')}">
      <span class="rpp-dag">${dag}</span>
      <span class="rpp-naam">${naam.replace(/</g,'&lt;')}</span>
      ${sub ? `<span class="rpp-sub">${sub.replace(/</g,'&lt;')}</span>` : ''}
    </div>`;
  }).join('');

  picker.innerHTML = `<div style="background:var(--panel,#181b28);border:1px solid var(--border,#2a2d3e);border-radius:16px 16px 0 0;width:100%;max-width:520px;max-height:70vh;overflow-y:auto;">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px 10px;position:sticky;top:0;background:var(--panel,#181b28);border-bottom:1px solid var(--border,#2a2d3e);">
      <span style="font-weight:700;font-size:15px;">Kies een programma-item</span>
      <button id="rpp-close" style="background:none;border:none;color:var(--text-3,#9aa3b7);font-size:20px;cursor:pointer;padding:0 4px;">&times;</button>
    </div>
    <div id="rpp-list" style="padding:8px 0;">${rows}</div>
  </div>`;

  document.body.appendChild(picker);

  picker.querySelector('#rpp-close').onclick = () => picker.remove();
  picker.addEventListener('click', e => { if(e.target === picker) picker.remove(); });
  picker.querySelectorAll('.rpp-row').forEach(row => {
    row.addEventListener('click', () => {
      const datum = row.dataset.datum;
      const tijd  = row.dataset.tijd;
      const loc   = row.dataset.loc;
      const doel  = row.dataset.doel;
      const datumEl = document.getElementById('rit-datum');
      const tijdEl  = document.getElementById('rit-tijd');
      const aanEl   = document.getElementById('rit-aankomst');
      const doelEl  = document.getElementById('rit-doel');
      if(datumEl && datum) datumEl.value = datum;
      if(tijdEl && tijd)   tijdEl.value  = tijd;
      if(aanEl && loc)     aanEl.value   = loc;
      if(doelEl && doel && !doelEl.value) doelEl.value = doel;
      picker.remove();
      // Probeer km te berekenen
      if(loc) try{ aanEl.dispatchEvent(new Event('input',{bubbles:true})); }catch(_){}
    });
  });
}

function openRitModal(rit){
  const modal = document.getElementById('rit-modal');
  if(!modal) return;
  // s35dj: isNew ook als rit een template is zonder id (retourrit / pre-fill)
  const isNew = !rit || !rit.id;
  const today = new Date();
  const isoDate = today.toISOString().slice(0,10);
  const isoTime = today.toTimeString().slice(0,5);

  document.getElementById('rit-modal-title').textContent = isNew ? 'Nieuwe rit' : 'Rit bewerken';
  document.getElementById('rit-id').value = (rit && rit.id) || '';
  document.getElementById('rit-datum').value = (rit && rit.datum) || isoDate;
  document.getElementById('rit-tijd').value = (rit && rit.tijd) || isoTime;
  document.getElementById('rit-vertrek').value = (rit && rit.vertrekAdres) || '';
  document.getElementById('rit-aankomst').value = (rit && rit.aankomstAdres) || '';
  document.getElementById('rit-km').value = (rit && rit.km != null && rit.km !== '') ? rit.km : '';
  document.getElementById('rit-doel').value = (rit && rit.doel) || '';
  document.getElementById('rit-vertrek-lat').value = (rit && rit.vertrekLat) || '';
  document.getElementById('rit-vertrek-lon').value = (rit && rit.vertrekLon) || '';
  document.getElementById('rit-aankomst-lat').value = (rit && rit.aankomstLat) || '';
  document.getElementById('rit-aankomst-lon').value = (rit && rit.aankomstLon) || '';
  document.getElementById('rit-delete-btn').style.display = isNew ? 'none' : '';
  modal.classList.add('active');

  // s36l: bij nieuwe rit → auto-GPS vertrek + programma-knop + chips
  const chips = document.getElementById('rit-prog-chips');
  const pickBtn = document.getElementById('rit-prog-pick-btn');
  if(isNew){
    const vertrekEl = document.getElementById('rit-vertrek');
    if(vertrekEl && !vertrekEl.value){
      setTimeout(() => { try { _ritGeoLocation('vertrek'); } catch(_){} }, 200);
    }
    // Toon "Kies uit programma" knop als er items zijn
    const progItems = (typeof programmaCache !== 'undefined' ? programmaCache : [])
      .filter(p => p && p.datum)
      .sort((a,b) => a.datum.localeCompare(b.datum));
    if(pickBtn){
      pickBtn.style.display = progItems.length ? '' : 'none';
      pickBtn.onclick = () => _ritOpenProgPicker(progItems);
    }
    if(chips) _ritShowProgChips(chips);
  } else {
    if(chips){ chips.innerHTML = ''; chips.style.display = 'none'; }
    if(pickBtn) pickBtn.style.display = 'none';
  }
}
function closeRitModal(){
  const modal = document.getElementById('rit-modal');
  if(modal) modal.classList.remove('active');
}

async function saveRitFromForm(){
  const id = document.getElementById('rit-id').value || ('rit_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
  const vLat = parseFloat(document.getElementById('rit-vertrek-lat').value);
  const vLon = parseFloat(document.getElementById('rit-vertrek-lon').value);
  const aLat = parseFloat(document.getElementById('rit-aankomst-lat').value);
  const aLon = parseFloat(document.getElementById('rit-aankomst-lon').value);
  const rit = {
    id,
    datum: document.getElementById('rit-datum').value || '',
    tijd: document.getElementById('rit-tijd').value || '',
    vertrekAdres: document.getElementById('rit-vertrek').value.trim(),
    aankomstAdres: document.getElementById('rit-aankomst').value.trim(),
    vertrekLat: isFinite(vLat) ? vLat : null,
    vertrekLon: isFinite(vLon) ? vLon : null,
    aankomstLat: isFinite(aLat) ? aLat : null,
    aankomstLon: isFinite(aLon) ? aLon : null,
    km: Number(document.getElementById('rit-km').value) || 0,
    doel: document.getElementById('rit-doel').value.trim(),
    createdAt: Date.now()
  };
  if(!rit.vertrekAdres || !rit.aankomstAdres){
    toast('Vul vertrek- en aankomstadres in', true);
    return;
  }
  try {
    await saveRit(rit);
    closeRitModal();
    toast('Rit opgeslagen');
  } catch(_){}
}

async function deleteRitFromForm(){
  const id = document.getElementById('rit-id').value;
  if(!id) return;
  if(!confirm('Deze rit verwijderen?')) return;
  try {
    await deleteRit(id);
    closeRitModal();
    toast('Rit verwijderd');
  } catch(_){}
}

/* Geolocatie + reverse-geocode via Nominatim */
// s35dj: generiek voor vertrek én aankomst
async function _ritGeoLocation(kind){
  kind = kind || 'vertrek';
  if(!navigator.geolocation){ toast('Geolocatie niet ondersteund', true); return; }
  const btnId = (kind === 'vertrek') ? 'rit-geo-vertrek' : 'rit-geo-aankomst';
  const adresId = 'rit-' + kind;
  const latId   = 'rit-' + kind + '-lat';
  const lonId   = 'rit-' + kind + '-lon';
  const btn     = document.getElementById(btnId);
  const adresEl = document.getElementById(adresId);
  if(btn){ btn.disabled = true; btn.textContent = 'Locatie ophalen…'; }
  if(adresEl && !adresEl.value) adresEl.placeholder = 'Locatie ophalen…';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const {latitude, longitude} = pos.coords;
    let adres = '';
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'nl' } });
      const json = await res.json();
      const a = json.address || {};
      const straat = [a.road, a.house_number].filter(Boolean).join(' ');
      const plaats = a.city || a.town || a.village || a.municipality || '';
      adres = [straat, plaats].filter(Boolean).join(', ') || json.display_name || '';
    } catch(e){
      // Altijd een leesbaar adres proberen — geen rauwe coordinaten tonen
      try {
        const fb = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, { headers: { 'Accept-Language': 'nl' } });
        const fj = await fb.json();
        adres = fj.display_name || (latitude.toFixed(4) + ', ' + longitude.toFixed(4));
      } catch(_){ adres = latitude.toFixed(4) + ', ' + longitude.toFixed(4); }
    }
    if(adresEl){ adresEl.value = adres; adresEl.placeholder = 'Adres of plaats'; }
    const latEl = document.getElementById(latId);
    const lonEl = document.getElementById(lonId);
    if(latEl) latEl.value = String(latitude);
    if(lonEl) lonEl.value = String(longitude);
    if(adres) _ritAddrCoords.set(adres, {lat:latitude, lon:longitude});
    if(btn){ btn.disabled = false; btn.textContent = '📍 Mijn huidige locatie'; }
    _ritTryAutoKm();
  }, () => {
    toast('Kon locatie niet bepalen', true);
    if(btn){ btn.disabled = false; btn.textContent = '📍 Mijn huidige locatie'; }
    if(adresEl && adresEl.placeholder === 'Locatie ophalen…') adresEl.placeholder = 'Adres of plaats';
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
}
// Backwards-compat wrapper
function _ritGeoMyLocation(){ return _ritGeoLocation('vertrek'); }

/* Adres-suggest: combineer eigen historie + live OSM (Nominatim NL).
   Onthoud coords per gekozen suggestie, en trigger auto-km. */
const _ritAddrCoords = new Map(); // adres -> {lat, lon}
const _ritSearchCache = new Map(); // q -> [{label, lat, lon}]
let _ritSearchSeq = 0;

function _ritFormatNomItem(it){
  const a = it.address || {};
  const straat = [a.road, a.house_number].filter(Boolean).join(' ');
  const plaats = a.city || a.town || a.village || a.municipality || a.suburb || '';
  const primary = [straat, plaats].filter(Boolean).join(', ');
  return primary || it.display_name || '';
}

async function _ritNominatimSearch(q){
  q = (q||'').trim();
  if(q.length < 3) return [];
  if(_ritSearchCache.has(q)) return _ritSearchCache.get(q);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=nl&limit=6&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'nl' } });
    if(!res.ok) return [];
    const arr = await res.json();
    const out = (arr||[]).map(it => ({
      label: _ritFormatNomItem(it),
      lat: parseFloat(it.lat),
      lon: parseFloat(it.lon)
    })).filter(x => x.label && _ritCoordsValid(x.lat, x.lon));
    _ritSearchCache.set(q, out);
    return out;
  } catch(_){ return []; }
}

/* Club-adresboek doorzoeken voor rit-suggesties */
function _ritSearchClubs(q){
  q = (q||'').trim().toLowerCase();
  if(q.length < 2) return [];
  const results = [];
  const seen = new Set();
  const addResult = (naam, ci) => {
    if(!ci || seen.has(naam)) return;
    seen.add(naam);
    // label = sportpark of naam, plus plaats
    const label = [ci.sportpark || ci.naam || naam, ci.plaats].filter(Boolean).join(', ');
    if(!label) return;
    if(isFinite(ci.lat) && isFinite(ci.lon)){
      results.push({ label, lat: Number(ci.lat), lon: Number(ci.lon), fromClub: true });
    } else if(ci.adres){
      results.push({ label, lat: NaN, lon: NaN, adres: ci.adres, fromClub: true });
    }
  };
  // Zoek in CLUB_ADRESSEN (handmatig geverifieerd, heeft lat/lon)
  try {
    if(typeof CLUB_ADRESSEN !== 'undefined'){
      for(const [k,v] of Object.entries(CLUB_ADRESSEN)){
        const naam = v.naam || k;
        if(k.includes(q) || naam.toLowerCase().includes(q) ||
           (v.sportpark||'').toLowerCase().includes(q) ||
           (v.aliassen||[]).some(a => a.toLowerCase().includes(q))){
          addResult(naam, v);
        }
      }
    }
  } catch(_){}
  // Zoek in HV_CLUB_ADRESSEN (grote lijst)
  try {
    if(typeof HV_CLUB_ADRESSEN !== 'undefined'){
      for(const [k,v] of Object.entries(HV_CLUB_ADRESSEN)){
        const naam = v.naam || k;
        if(k.toLowerCase().includes(q) || naam.toLowerCase().includes(q) ||
           (v.sportpark||'').toLowerCase().includes(q)){
          addResult(naam, v);
          if(results.length >= 6) break;
        }
      }
    }
  } catch(_){}
  return results.slice(0,6);
}

function _ritSetupSuggest(inputId, boxId, kind){
  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  if(!input || !box) return;
  const latInp = document.getElementById('rit-' + kind + '-lat');
  const lonInp = document.getElementById('rit-' + kind + '-lon');
  let debounce = null;

  const render = (matches) => {
    if(!matches.length){ box.classList.remove('open'); box.innerHTML = ''; return; }
    box.innerHTML = matches.map((m,i) =>
      '<div class="rm-suggest-item" data-i="' + i + '">' + escapeHtml(m.label) + '</div>'
    ).join('');
    box.classList.add('open');
    box.querySelectorAll('.rm-suggest-item').forEach((el) => {
      el.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        const m = matches[Number(el.dataset.i)];
        input.value = m.label;
        if(isFinite(m.lat) && isFinite(m.lon)){
          if(latInp) latInp.value = String(m.lat);
          if(lonInp) lonInp.value = String(m.lon);
          _ritAddrCoords.set(m.label, {lat:m.lat, lon:m.lon});
          box.classList.remove('open');
          _ritTryAutoKm();
        } else if(m.adres && typeof _ritNominatimSearch === 'function'){
          // Club zonder coords — geocodeer het adres
          box.classList.remove('open');
          _ritNominatimSearch(m.adres).then(res => {
            if(res && res.length){
              if(latInp) latInp.value = String(res[0].lat);
              if(lonInp) lonInp.value = String(res[0].lon);
              _ritAddrCoords.set(m.label, {lat:res[0].lat, lon:res[0].lon});
              _ritTryAutoKm();
            }
          }).catch(()=>{});
        } else {
          if(latInp) latInp.value = '';
          if(lonInp) lonInp.value = '';
          box.classList.remove('open');
          _ritTryAutoKm();
        }
      });
    });
  };

  const fill = async () => {
    const q = (input.value||'').trim();
    // Reset coords zodra gebruiker handmatig typt (anders blijven oude coords aan nieuw adres hangen)
    if(latInp) latInp.value = '';
    if(lonInp) lonInp.value = '';

    // Club-adresboek eerst (snelst, geen netwerk)
    const clubs = _ritSearchClubs(q);

    const local = _ritGebruikerAdressen()
      .filter(a => !q || a.toLowerCase().includes(q.toLowerCase()))
      .slice(0,3)
      .map(a => {
        const c = _ritAddrCoords.get(a) || {};
        return { label: a, lat: c.lat, lon: c.lon };
      });

    // Clubs hebben prioriteit, dan lokale historie
    const seen0 = new Set(clubs.map(x => x.label.toLowerCase()));
    const combined = clubs.concat(local.filter(l => !seen0.has(l.label.toLowerCase())));
    render(combined);

    if(q.length < 3) return;
    const mySeq = ++_ritSearchSeq;
    if(debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const remote = await _ritNominatimSearch(q);
      if(mySeq !== _ritSearchSeq) return; // race
      // dedup — clubs + lokaal voor Nominatim
      const seen = new Set(combined.map(x => x.label.toLowerCase()));
      const merged = combined.concat(remote.filter(r => !seen.has(r.label.toLowerCase()))).slice(0,8);
      render(merged);
    }, 280);
  };
  input.addEventListener('focus', fill);
  input.addEventListener('input', fill);
  input.addEventListener('blur', () => { setTimeout(()=> box.classList.remove('open'), 180); });
}

/* Haversine -> hemelsbreed (km) */
function _ritHaversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* Coördinatenvalidatie — Nederland: lat 50.5-53.7, lon 3.2-7.4 */
function _ritCoordsValid(lat, lon){
  return isFinite(lat) && isFinite(lon)
    && lat >= 50.5 && lat <= 53.7
    && lon >= 3.2  && lon <= 7.4;
}

/* OSRM route, met fallback naar Haversine * 1.3 */
async function _ritRouteKm(lat1, lon1, lat2, lon2){
  // Sanity check: coördinaten moeten binnen Nederland liggen
  if(!_ritCoordsValid(lat1, lon1) || !_ritCoordsValid(lat2, lon2)){
    console.warn('_ritRouteKm: coördinaten buiten Nederland', {lat1,lon1,lat2,lon2});
    return null; // null = kan niet berekenen
  }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url);
    if(res.ok){
      const data = await res.json();
      const m = data && data.routes && data.routes[0] && data.routes[0].distance;
      if(isFinite(m) && m > 0 && m < 800000) return m / 1000; // max 800 km
    }
  } catch(_){}
  const hav = _ritHaversineKm(lat1, lon1, lat2, lon2) * 1.3;
  return hav < 800 ? hav : null; // sanity cap
}

let _ritKmBusy = false;
async function _ritTryAutoKm(force){
  if(_ritKmBusy) return;
  const kmInp = document.getElementById('rit-km');
  if(!kmInp) return;
  const cur = (kmInp.value||'').trim();
  if(!force && cur && Number(cur) > 0) return; // gebruiker heeft zelf iets ingevuld
  const vLat = parseFloat((document.getElementById('rit-vertrek-lat')||{}).value);
  const vLon = parseFloat((document.getElementById('rit-vertrek-lon')||{}).value);
  const aLat = parseFloat((document.getElementById('rit-aankomst-lat')||{}).value);
  const aLon = parseFloat((document.getElementById('rit-aankomst-lon')||{}).value);
  // Als coords ontbreken: geocode de adrestekst via Nominatim
  let _vLat = vLat, _vLon = vLon, _aLat = aLat, _aLon = aLon;

  if(!isFinite(_vLat) || !isFinite(_vLon)){
    const vtxt = (document.getElementById('rit-vertrek')||{}).value||'';
    if(vtxt.trim()){
      try{
        const hits = await _nominatimSearch(vtxt.trim() + ', Nederland');
        if(hits && hits[0]){ _vLat = parseFloat(hits[0].lat); _vLon = parseFloat(hits[0].lon); }
      }catch(_){}
    }
  }
  if(!isFinite(_aLat) || !isFinite(_aLon)){
    const atxt = (document.getElementById('rit-aankomst')||{}).value||'';
    if(atxt.trim()){
      try{
        const hits = await _nominatimSearch(atxt.trim() + ', Nederland');
        if(hits && hits[0]){ _aLat = parseFloat(hits[0].lat); _aLon = parseFloat(hits[0].lon); }
      }catch(_){}
    }
  }
  if(![_vLat,_vLon,_aLat,_aLon].every(isFinite)){ return; }

  _ritKmBusy = true;
  const prev = kmInp.placeholder;
  kmInp.placeholder = 'Berekenen…';
  try {
    const km = await _ritRouteKm(_vLat, _vLon, _aLat, _aLon);
    if(km !== null && isFinite(km) && km > 0){
      kmInp.value = km.toFixed(1);
      // Sla gevonden coords op in hidden fields voor volgende keer
      const setHidden = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
      setHidden('rit-vertrek-lat', _vLat); setHidden('rit-vertrek-lon', _vLon);
      setHidden('rit-aankomst-lat', _aLat); setHidden('rit-aankomst-lon', _aLon);
    } else {
      kmInp.value = '';
      kmInp.placeholder = 'Vul handmatig in';
    }
  } finally {
    kmInp.placeholder = prev || '0';
    _ritKmBusy = false;
  }
}

/* CSV-export */
function _ritExportCsv(){
  const van = (document.getElementById('rit-filter-van')||{}).value || '';
  const tot = (document.getElementById('rit-filter-tot')||{}).value || '';
  let items = (rittenCache||[]).slice().sort((a,b)=> ((a.datum||'')+ 'T' + (a.tijd||'')).localeCompare((b.datum||'') + 'T' + (b.tijd||'')));
  if(van) items = items.filter(r => (r.datum||'') >= van);
  if(tot) items = items.filter(r => (r.datum||'') <= tot);
  if(!items.length){ toast('Geen ritten in deze periode'); return; }
  const head = ['Datum','Tijd','Vertrek','Aankomst','Km','Doel'];
  const rows = items.map(r => [r.datum||'', r.tijd||'', r.vertrekAdres||'', r.aankomstAdres||'', String(r.km||0).replace('.', ','), r.doel||'']);
  const escapeCsv = (s) => {
    s = String(s);
    if(/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csv = [head, ...rows].map(r => r.map(escapeCsv).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = 'ritten-' + (van||'alles') + '_' + (tot||stamp) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

/* Init listeners — éénmalig na DOM ready */
function _ritInitListeners(){
  if(window.__ritInited) return;
  window.__ritInited = true;
  const $ = (id) => document.getElementById(id);
  const bind = (id, ev, fn) => { const el = $(id); if(el) el.addEventListener(ev, fn); };

  bind('rit-new-btn', 'click', () => openRitModal(null));
  bind('rit-cancel-btn', 'click', closeRitModal);
  bind('rit-save-btn', 'click', saveRitFromForm);
  bind('rit-delete-btn', 'click', deleteRitFromForm);
  bind('rit-geo-vertrek', 'click', () => _ritGeoLocation('vertrek'));
  // s35dj: doel-chips
  const doelChips = document.querySelectorAll('.rm-doel-chips [data-doel]');
  doelChips.forEach(btn => {
    btn.addEventListener('click', () => {
      const d = document.getElementById('rit-doel');
      if(d) d.value = btn.dataset.doel;
    });
  });
  bind('rit-filter-van', 'change', renderRitten);
  bind('rit-filter-tot', 'change', renderRitten);
  bind('rit-filter-reset', 'click', () => {
    const v = $('rit-filter-van'); const t = $('rit-filter-tot');
    if(v) v.value = ''; if(t) t.value = ''; renderRitten();
  });
  bind('rit-export-csv', 'click', _ritExportCsv);

  const modal = $('rit-modal');
  if(modal) modal.addEventListener('click', (e) => { if(e.target === modal) closeRitModal(); });

  _ritSetupSuggest('rit-vertrek', 'rit-vertrek-suggest', 'vertrek');
  _ritSetupSuggest('rit-aankomst', 'rit-aankomst-suggest', 'aankomst');
  // s35dj: km herberekening via de ⟳ knop (dblclick uitgefaseerd)
}
if(typeof document !== 'undefined'){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _ritInitListeners);
  } else {
    _ritInitListeners();
  }
}
window.renderRitten = renderRitten;
window.openRitModal = openRitModal;


/* =============== CONTACTS RENDERING =============== */
function formatNLPhone(val){
  let digits = String(val||'').replace(/\D/g, '');
  if(digits.startsWith('0031')) digits = digits.slice(4);
  else if(digits.startsWith('31')) digits = digits.slice(2);
  if(digits.startsWith('06')) digits = '6' + digits.slice(2);
  else if(digits.startsWith('0')) digits = digits.slice(1);
  if(!digits.startsWith('6')) digits = '6' + digits;
  digits = digits.slice(1, 9);
  const pairs = digits.match(/.{1,2}/g) || [];
  return '(+316)' + (pairs.length ? ' ' + pairs.join(' ') : '');
}
function nlPhoneToTelHref(val){
  return '+316' + String(val||'').replace(/\D/g, '').replace(/^0031/, '').replace(/^31/, '').replace(/^06/, '6').replace(/^0/, '').replace(/^6/, '').slice(0,8);
}
function contactInitials(naam){
  const parts = (naam || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '?';
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function renderContacts(){
  const list = $('#contacts-list');
  const empty = $('#contacts-empty');
  const sub = $('#contacts-sub');
  if(!list) return;

  const search = ($('#contact-search')?.value || '').toLowerCase().trim();
  const sortMode = $('#contact-sort')?.value || 'naam';

  let items = contactsCache.slice();

  if(search){
    items = items.filter(c =>
      (c.naam || '').toLowerCase().includes(search) ||
      (c.club || '').toLowerCase().includes(search) ||
      (c.functie || '').toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search) ||
      (c.tel || '').toLowerCase().includes(search)
    );
  }

  const cmp = (a,b,k)=> (a[k]||'').toString().localeCompare((b[k]||'').toString(), 'nl', {sensitivity:'base'});
  if(sortMode === 'naam')         items.sort((a,b)=> cmp(a,b,'naam'));
  else if(sortMode === 'club')    items.sort((a,b)=> cmp(a,b,'club') || cmp(a,b,'naam'));
  else if(sortMode === 'functie') items.sort((a,b)=> cmp(a,b,'functie') || cmp(a,b,'naam'));
  else if(sortMode === 'nieuwste')items.sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));

  const total = contactsCache.length;
  if(sub) sub.textContent = total === 0
    ? 'Nog geen contacten — voeg je eerste contact toe'
    : `${total} contact${total===1?'':'en'}${search ? ` · ${items.length} gevonden` : ''}`;

  if(!items.length){
    list.innerHTML = '';
    if(empty){
      empty.style.display = '';
      empty.innerHTML = total === 0
        ? '<div style="padding:40px 20px; text-align:center; color:var(--text-2);"><div style="font-size:48px; margin-bottom:12px;">👥</div><div style="font-size:16px; margin-bottom:4px;">Nog geen contacten</div><div style="font-size:13px;">Klik op <strong>Nieuw contact</strong> om je eerste contact toe te voegen.</div></div>'
        : '<div style="padding:40px 20px; text-align:center; color:var(--text-2);">Geen resultaten voor je zoekopdracht.</div>';
    }
    return;
  }
  if(empty) empty.style.display = 'none';

  const esc = s => (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  list.innerHTML = items.map(c => {
    const initials = esc(contactInitials(c.naam));
    const naam = esc(c.naam || '(zonder naam)');
    const functie = c.functie ? `<div class="contact-functie">${esc(c.functie)}</div>` : '';
    const club = c.club ? `<span class="contact-club">${esc(c.club)}</span>` : '';
    const tel = c.tel ? `<div class="contact-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><a href="tel:${esc(c.tel)}" onclick="event.stopPropagation()">${esc(c.tel)}</a></div>` : '';
    const email = c.email ? `<div class="contact-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><a href="mailto:${esc(c.email)}" onclick="event.stopPropagation()">${esc(c.email)}</a></div>` : '';
    return `
      <div class="contact-card" data-id="${esc(c.id)}">
        <div class="contact-avatar">${initials}</div>
        <div style="flex:1; min-width:0;">
          <div class="contact-name">${naam}</div>
          ${functie}
          ${club ? `<div style="margin-top:6px;">${club}</div>` : ''}
          ${(tel || email) ? `<div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">${tel}${email}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.contact-card').forEach(card => {
    card.addEventListener('click', ()=> openContactModal(card.dataset.id));
  });
}

/* ====== ADRESBOEK ====== */
/* v70h-s23: alfabetbalk + provincie-filter. */

/* Postcode (PC4) → provincie. Benadering op basis van PostNL/CBS-ranges. */
function pcToProvince(postcode){
  if(!postcode) return null;
  const m = String(postcode).match(/(\d{4})/);
  if(!m) return null;
  const pc = parseInt(m[1], 10);
  if(pc < 1000) return null;
  if(pc <= 1299) return 'Noord-Holland';
  if(pc <= 1379) return 'Flevoland';
  if(pc <= 1383) return 'Flevoland';        // Almere
  if(pc <= 1424) return 'Noord-Holland';
  if(pc <= 1429) return 'Utrecht';          // Vinkeveen/Wilnis
  if(pc <= 2158) return 'Noord-Holland';
  if(pc <= 2164) return 'Zuid-Holland';     // Hillegom/Lisse
  if(pc <= 2182) return 'Noord-Holland';
  if(pc <= 3299) return 'Zuid-Holland';
  if(pc <= 3399) return 'Zuid-Holland';
  if(pc <= 3799) return 'Utrecht';
  if(pc <= 3899) return 'Utrecht';
  if(pc <= 4199) return 'Gelderland';
  if(pc <= 4299) return 'Zuid-Holland';
  if(pc <= 4699) return 'Zeeland';
  if(pc <= 5999) return 'Noord-Brabant';
  if(pc <= 6499) return 'Limburg';
  if(pc <= 7399) return 'Gelderland';
  if(pc <= 7699) return 'Overijssel';
  if(pc <= 7999) return 'Drenthe';
  if(pc <= 8199) return 'Overijssel';
  if(pc <= 8299) return 'Flevoland';
  if(pc <= 8388) return 'Flevoland';
  if(pc <= 9299) return 'Friesland';
  if(pc <= 9499) return 'Drenthe';
  if(pc <= 9999) return 'Groningen';
  return null;
}

/* Eerste letter (A-Z) van een naam — voor alfabet-filter. */
function _alphaKey(s){
  if(!s) return '';
  const c = s.trim().charAt(0).toUpperCase();
  if(c >= 'A' && c <= 'Z') return c;
  // diacritics
  const map = {'À':'A','Á':'A','Â':'A','Ä':'A','Å':'A','È':'E','É':'E','Ê':'E','Ë':'E','Ì':'I','Í':'I','Î':'I','Ï':'I','Ò':'O','Ó':'O','Ô':'O','Ö':'O','Ù':'U','Ú':'U','Û':'U','Ü':'U','Ñ':'N','Ç':'C'};
  if(map[c]) return map[c];
  return '#'; // overige (cijfers, apostrof, etc.)
}

/* Bouwt de complete club-lijst eenmalig en cachet hem. */
let _adresboekClubsCache = null;
function _getAdresboekClubs(){
  if(_adresboekClubsCache) return _adresboekClubsCache;
  const dedupe = new Map();
  try {
    if(typeof HV_CLUBS !== 'undefined' && Array.isArray(HV_CLUBS)){
      HV_CLUBS.forEach(c => {
        if(!c || !c.naam) return;
        const k = c.naam.toLowerCase().trim();
        if(!dedupe.has(k)){
          const adresFull = [c.adres, c.postcode, c.plaats].filter(Boolean).join(', ');
          dedupe.set(k, {
            naam: c.naam,
            plaats: c.plaats || '',
            adres: adresFull,
            sportpark: c.sportpark || '',
            postcode: c.postcode || '',
            provincie: pcToProvince(c.postcode) || ''
          });
        }
      });
    }
  } catch(_){}
  _adresboekClubsCache = Array.from(dedupe.values());
  return _adresboekClubsCache;
}

/* Rendert de alfabetbalk en zet active-state. */
let _adresboekLetter = 'A';
let _adresboekProvincie = ''; // v70h-s24: '' = Alle
function renderAdresboekAlphabet(){
  const bar = document.getElementById('adresboek-alphabet');
  if(!bar) return;
  const clubs = _getAdresboekClubs();
  // Welke letters hebben minstens 1 club? (binnen huidige provincie-scope)
  const scope = _adresboekProvincie
    ? clubs.filter(c => c.provincie === _adresboekProvincie)
    : clubs;
  const haveLetter = new Set(scope.map(c => _alphaKey(c.naam)));
  const letters = ['Alle','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
  bar.innerHTML = letters.map(l => {
    const active = (l === _adresboekLetter) ? ' active' : '';
    const disabled = (l !== 'Alle' && !haveLetter.has(l)) ? ' disabled' : '';
    return `<button type="button" class="alphabet-letter${active}${disabled}" data-letter="${l}">${l}</button>`;
  }).join('');
}

/* v70h-s24: provincie-chips met aantal clubs per provincie. */
const _NL_PROVINCIES = [
  'Groningen','Friesland','Drenthe','Overijssel','Flevoland','Gelderland',
  'Utrecht','Noord-Holland','Zuid-Holland','Zeeland','Noord-Brabant','Limburg'
];
function renderAdresboekProvincies(){
  const bar = document.getElementById('adresboek-provincies');
  if(!bar) return;
  const clubs = _getAdresboekClubs();
  const counts = {};
  for(const c of clubs){
    const p = c.provincie || '';
    if(!p) continue;
    counts[p] = (counts[p] || 0) + 1;
  }
  const chips = [{name:'', label:'Alle', count: clubs.length}];
  for(const p of _NL_PROVINCIES){
    chips.push({name: p, label: p, count: counts[p] || 0});
  }
  bar.innerHTML = chips.map(p => {
    const active = (p.name === _adresboekProvincie) ? ' active' : '';
    const disabled = (p.name && p.count === 0) ? ' disabled' : '';
    return `<button type="button" class="province-chip${active}${disabled}" data-prov="${p.name}">${p.label}<span class="count">${p.count}</span></button>`;
  }).join('');
}

function renderAdresboek(){
  const list  = $('#adresboek-list');
  const empty = $('#adresboek-empty');
  const sub   = $('#adresboek-sub');
  if(!list) return;

  renderAdresboekAlphabet();
  renderAdresboekProvincies();

  const search   = ($('#adresboek-search')?.value || '').toLowerCase().trim();
  const sortMode = $('#adresboek-sort')?.value || 'naam';

  let items = _getAdresboekClubs().slice();
  const total = items.length;

  // s35i: zoek alleen op clubnaam (niet meer op plaats/provincie — anders
  // matcht "utrecht" ook alle clubs uit de provincie Utrecht).
  if(search){
    items = items.filter(c => c.naam.toLowerCase().includes(search));
  } else {
    if(_adresboekProvincie){
      items = items.filter(c => c.provincie === _adresboekProvincie);
    }
    if(_adresboekLetter && _adresboekLetter !== 'Alle'){
      items = items.filter(c => _alphaKey(c.naam) === _adresboekLetter);
    }
  }

  const cmp = (a,b,k)=> (a[k]||'').toString().localeCompare((b[k]||'').toString(), 'nl', {sensitivity:'base'});
  if(sortMode === 'naam')         items.sort((a,b)=> cmp(a,b,'naam'));
  else if(sortMode === 'plaats')  items.sort((a,b)=> cmp(a,b,'plaats')    || cmp(a,b,'naam'));
  else if(sortMode === 'provincie') items.sort((a,b)=> cmp(a,b,'provincie') || cmp(a,b,'plaats') || cmp(a,b,'naam'));

  if(sub){
    const parts = [];
    if(search) parts.push(`${items.length} gevonden`);
    else {
      if(_adresboekProvincie) parts.push(_adresboekProvincie);
      if(_adresboekLetter && _adresboekLetter !== 'Alle') parts.push(`letter ${_adresboekLetter}`);
      else if(!_adresboekProvincie) parts.push('alle letters');
      parts.push(`${items.length} clubs`);
    }
    const scope = parts.length ? `· ${parts.join(' · ')}` : '';
    sub.textContent = total === 0
      ? 'Geen clubs in databank.'
      : `${total} clubs in databank ${scope} — klik op een kaart voor route in Google Maps`;
  }

  if(!items.length){
    if(total === 0){
      list.innerHTML = '';
      if(empty) empty.style.display = '';
    } else {
      if(empty) empty.style.display = 'none';
      let msg;
      if(search) msg = 'Geen resultaten voor je zoekopdracht.';
      else if(_adresboekProvincie && _adresboekLetter !== 'Alle') msg = `Geen clubs in ${_adresboekProvincie} met letter ${_adresboekLetter}.`;
      else if(_adresboekProvincie) msg = `Geen clubs in ${_adresboekProvincie}.`;
      else msg = `Geen clubs met letter ${_adresboekLetter}.`;
      list.innerHTML = `<div style="grid-column:1/-1; padding:40px 20px; text-align:center; color:var(--text-2);">${msg}</div>`;
    }
    return;
  }
  if(empty) empty.style.display = 'none';

  const esc = s => (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pinSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  list.innerHTML = items.map(c => {
    const naam      = esc(c.naam);
    const plaats    = c.plaats ? esc(c.plaats) : '';
    const adres     = c.adres ? esc(c.adres) : '(adres onbekend)';
    const sportpark = c.sportpark ? esc(c.sportpark) : '';
    const provincie = c.provincie ? esc(c.provincie) : '';
    const query  = encodeURIComponent(c.adres ? c.adres : c.naam + (c.plaats ? ' ' + c.plaats : ''));
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    return `
      <div class="contact-card" style="position:relative; cursor:default;">
        <div class="contact-avatar">${pinSvg}</div>
        <div style="flex:1; min-width:0;">
          <div class="contact-name">${naam}</div>
          ${plaats ? `<div class="contact-functie">${plaats}${provincie ? ` · ${provincie}` : ''}</div>` : ''}
          ${sportpark ? `<div style="margin-top:4px; font-size:11px; color:var(--text-3);">${sportpark}</div>` : ''}
          <div class="contact-row" style="margin-top:8px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${adres}</span>
          </div>
          <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
            <a class="btn btn-sm" href="${mapsUrl}" target="_blank" rel="noopener" style="text-decoration:none;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Route
            </a>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* === Adres handmatig bewerken === */
function openAdresEditModal(key, club, huidigAdres){
  const nieuw = prompt(
    `Adres voor ${club}\n\nLaat leeg om te wissen, of typ het juiste adres:\n(bv. "Stadionlaan 1, 7606 JZ Almelo")`,
    huidigAdres || ''
  );
  if(nieuw === null) return; // user cancelled
  const trimmed = nieuw.trim();
  if(trimmed){
    _clubAddrCache[key] = trimmed;
  } else {
    delete _clubAddrCache[key];
  }
  saveClubAddrCache();
  toast(trimmed ? 'Adres bijgewerkt' : 'Adres gewist');
  renderAdresboek();
}

/* === Bulk-refresh alle adressen via Nominatim === */
async function refreshAllAdressen(){
  const btn = document.getElementById('adresboek-refresh');
  if(btn && btn.dataset.busy === '1') return;
  if(btn){ btn.dataset.busy = '1'; btn.disabled = true; }

  // Verzamel unieke clubs uit alle spelers
  const players = loadPlayers();
  const clubMap = new Map();
  for(const p of players){
    const club = (p.club || '').trim();
    if(!club) continue;
    const k = club.toLowerCase();
    if(!clubMap.has(k)) clubMap.set(k, club);
  }
  const total = clubMap.size;
  if(!total){
    if(btn){ btn.dataset.busy = '0'; btn.disabled = false; btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML; }
    toast('Geen clubs om te verwerken', true);
    return;
  }

  const sub = document.getElementById('adresboek-sub');
  const originalSub = sub ? sub.textContent : '';
  let done = 0;

  // Wis cache voor alle clubs zodat lookupClubCity opnieuw doet
  for(const k of clubMap.keys()){
    delete _clubAddrCache[k];
    delete _clubCache[k];
  }
  saveClubAddrCache();
  saveClubCache();

  for(const [k, clubNaam] of clubMap){
    done++;
    if(sub) sub.textContent = `Adres ${done} van ${total} ophalen: ${clubNaam}...`;
    try { await lookupClubCity(clubNaam); } catch(_){}
  }

  if(sub) sub.textContent = originalSub;
  if(btn){ btn.dataset.busy = '0'; btn.disabled = false; }
  toast(`${total} clubs vernieuwd`);
  renderAdresboek();
}

function openContactModal(id){
  _shResetDirty('contact'); // s91
  const bd = $('#contact-backdrop');
  const titleEl = $('#contact-modal-title');
  const delBtn = $('#contact-delete');
  const c = id ? contactsCache.find(x => x.id === id) : null;

  $('#c-id').value      = c ? c.id : '';
  $('#c-naam').value    = c ? (c.naam || '')    : '';
  $('#c-tel').value     = c ? formatNLPhone(c.tel || '') : '(+316) ';
  $('#c-email').value   = c ? (c.email || '')   : '';
  $('#c-club').value    = c ? (c.club || '')    : '';
  $('#c-functie').value = c ? (c.functie || '') : '';
  $('#c-notes').value   = c ? (c.notes || '')   : '';

  if(titleEl) titleEl.textContent = c ? 'Contact bewerken' : 'Nieuw contact';
  if(delBtn)  delBtn.style.display = c ? '' : 'none';

  bd.classList.add('open');
  setTimeout(()=> $('#c-naam').focus(), 50);
}

function closeContactModal(){
  _shResetDirty('contact'); // s91
  $('#contact-backdrop').classList.remove('open');
}

async function submitContactForm(e){
  e.preventDefault();
  const naam = $('#c-naam').value.trim();
  if(!naam){ toast('Naam is verplicht', true); $('#c-naam').focus(); return; }

  const id = $('#c-id').value || ('c_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  const existing = contactsCache.find(x => x.id === id);

  const contact = {
    id,
    naam,
    tel:     $('#c-tel').value.trim(),
    email:   $('#c-email').value.trim(),
    club:    $('#c-club').value.trim(),
    functie: $('#c-functie').value.trim(),
    notes:   $('#c-notes').value.trim(),
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await saveContact(contact);
    closeContactModal();
    toast(existing ? 'Contact bijgewerkt' : 'Contact opgeslagen');
  } catch(_) { /* error toast already shown */ }
}

/* =============== MATCH-REPORT MODAL =============== */
function openMatchReportModal(id){
  _shResetDirty('mreport'); // s91
  const bd = $('#mreport-backdrop');
  const titleEl = $('#mreport-modal-title');
  const delBtn = $('#mreport-delete');
  const ageSel = $('#mr-leeftijd');
  if(ageSel && !ageSel.dataset.filled){
    ageSel.innerHTML = '<option value="">Kies leeftijd...</option>' +
      LEEFTIJD_OPTIONS.map(o => `<option value="${o}">${o}</option>`).join('');
    ageSel.dataset.filled = '1';
  }
  const r = id ? matchReportsCache.find(x => x.id === id) : null;

  $('#mr-id').value        = r ? r.id : '';
  $('#mr-datum').value     = r ? (r.datum || todayISO()) : todayISO();
  $('#mr-leeftijd').value  = r ? (r.leeftijd || '') : '';
  try{ const s=document.getElementById('mr-leeftijd'); if(s && s._syncAC) s._syncAC(); }catch(_){}
  $('#mr-thuis').value     = r ? (r.thuis || '')    : '';
  $('#mr-uit').value       = r ? (r.uit || '')      : '';
  $('#mr-opmerking').value = r ? (r.opmerking || ''): '';
  $('#mr-also-player').checked = false;

  if(titleEl) titleEl.textContent = r ? 'Wedstrijdrapport bewerken' : 'Wedstrijd rapporteren';
  if(delBtn)  delBtn.style.display = r ? '' : 'none';

  bd.classList.add('open');
  // v70h-s35a: auto-fill plaats + adres uit findClubInfo zodra mr-thuis gevuld wordt.
  (function(){
    const thuis = $('#mr-thuis');
    const plaats = $('#mr-plaats');
    const adres = $('#mr-adres');
    if(!thuis || (!plaats && !adres)) return;
    function tryFill(){
      if(typeof window.findClubInfo !== 'function') return;
      const ci = window.findClubInfo(thuis.value);
      if(!ci) return;
      const pl = ci.plaats || '';
      const parts = [ci.sportpark, ci.adres, ci.postcode].filter(Boolean);
      const ad = parts.join(' \u00b7 ');
      if(plaats && pl){
        const curP = plaats.value.trim();
        if(!curP || plaats.dataset.autofill === '1'){
          plaats.value = pl;
          plaats.dataset.autofill = '1';
        }
      }
      if(adres && ad){
        const curA = adres.value.trim();
        if(!curA || adres.dataset.autofill === '1'){
          adres.value = ad;
          adres.dataset.autofill = '1';
        }
      }
    }
    if(plaats) plaats.addEventListener('input', () => { plaats.dataset.autofill = '0'; });
    if(adres)  adres.addEventListener('input',  () => { adres.dataset.autofill  = '0'; });
    thuis.addEventListener('change', tryFill);
    thuis.addEventListener('blur', tryFill);
    thuis.addEventListener('input', tryFill);
    tryFill();
  })();
  setTimeout(()=> $('#mr-thuis').focus(), 50);
}

function closeMatchReportModal(){
  _shResetDirty('mreport'); // s91
  $('#mreport-backdrop').classList.remove('open');
}

async function submitMatchReportForm(e){
  e.preventDefault();
  const thuis = $('#mr-thuis').value.trim();
  const uit = $('#mr-uit').value.trim();
  const opmerking = $('#mr-opmerking').value.trim();
  if(!thuis || !uit){ toast('Thuis- en uitspelende ploeg zijn verplicht', true); return; }
  if(!opmerking){ toast('Opmerking is verplicht', true); $('#mr-opmerking').focus(); return; }

  const id = $('#mr-id').value || ('mr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  const existing = matchReportsCache.find(x => x.id === id);
  const alsoPlayer = $('#mr-also-player').checked;

  const report = {
    id,
    datum:     $('#mr-datum').value || todayISO(),
    leeftijd:  $('#mr-leeftijd').value || '',
    thuis,
    uit,
    opmerking,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await saveMatchReport(report);
    closeMatchReportModal();
    toast(existing ? 'Wedstrijdrapport bijgewerkt' : 'Wedstrijd opgeslagen');
    if(alsoPlayer){
      go('report');
      setTimeout(()=>{
        try {
          $('#f-w-datum').value = report.datum || '';
          $('#f-w-thuis').value = report.thuis || '';
          $('#f-w-uit').value = report.uit || '';
          $('#f-w-context').value = report.opmerking || '';
          if(report.leeftijd) $('#f-leeftijd').value = report.leeftijd;
        } catch(_){}
      }, 80);
    }
  } catch(_) { /* error toast already shown */ }
}

/* =============== TIPS RENDERING =============== */
const TIP_STATUS_COLORS = {
  'Nog te bekijken':     '#9ca3af',
  'Wedstrijd ingepland': '#3b82f6',
  'Bekeken':             '#a855f7',
  'Gerapporteerd':       '#10b981',
  'Afgevallen':          '#ef4444'
};
const TIP_PRIORITY_COLORS = {
  'Hoog':   '#ef4444',
  'Midden': '#f59e0b',
  'Laag':   '#9ca3af'
};
const TIP_PRIORITY_ORDER = { 'Hoog':0, 'Midden':1, 'Laag':2 };

function renderTips(){
  const list = $('#tips-list');
  const empty = $('#tips-empty');
  const sub = $('#tips-sub');
  if(!list) return;

  const search = ($('#tip-search')?.value || '').toLowerCase().trim();
  const sortMode = $('#tip-sort')?.value || 'nieuwste';
  const statusFilter = $('#tip-filter-status')?.value || '';

  let items = tipsCache.slice();

  if(search){
    items = items.filter(t =>
      (t.speler || '').toLowerCase().includes(search) ||
      (t.elftal || '').toLowerCase().includes(search) ||
      (t.tipgever || '').toLowerCase().includes(search) ||
      (t.bijzonderheden || '').toLowerCase().includes(search) ||
      (t.regio || '').toLowerCase().includes(search) ||
      (t.positie || '').toLowerCase().includes(search)
    );
  }
  if(statusFilter){
    items = items.filter(t => (t.status || 'Nog te bekijken') === statusFilter);
  }

  const cmp = (a,b,k)=> (a[k]||'').toString().localeCompare((b[k]||'').toString(), 'nl', {sensitivity:'base'});
  if(sortMode === 'nieuwste')        items.sort((a,b)=> (b.datum||'').localeCompare(a.datum||'') || (b.created_at||'').localeCompare(a.created_at||''));
  else if(sortMode === 'prioriteit') items.sort((a,b)=> (TIP_PRIORITY_ORDER[a.prioriteit||'Midden'] - TIP_PRIORITY_ORDER[b.prioriteit||'Midden']) || (b.datum||'').localeCompare(a.datum||''));
  else if(sortMode === 'status')     items.sort((a,b)=> cmp(a,b,'status') || (b.datum||'').localeCompare(a.datum||''));
  else if(sortMode === 'speler')     items.sort((a,b)=> cmp(a,b,'speler'));
  else if(sortMode === 'leeftijd')   items.sort((a,b)=> cmp(a,b,'leeftijd') || cmp(a,b,'speler'));

  const total = tipsCache.length;
  if(sub) sub.textContent = total === 0
    ? 'Nog geen tips — voeg je eerste tip toe'
    : `${total} tip${total===1?'':'s'}${(search||statusFilter) ? ` · ${items.length} gevonden` : ''}`;

  if(!items.length){
    list.innerHTML = '';
    if(empty){
      empty.style.display = '';
      empty.innerHTML = total === 0
        ? '<div style="padding:40px 20px; text-align:center; color:var(--text-2);"><div style="font-size:48px; margin-bottom:12px;">💡</div><div style="font-size:16px; margin-bottom:4px;">Nog geen tips</div><div style="font-size:13px;">Klik op <strong>Nieuwe tip</strong> om je eerste tip toe te voegen.</div></div>'
        : '<div style="padding:40px 20px; text-align:center; color:var(--text-2);">Geen resultaten voor je zoekopdracht.</div>';
    }
    return;
  }
  if(empty) empty.style.display = 'none';

  const esc = s => (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  list.innerHTML = items.map(t => {
    const speler = esc(t.speler || '(zonder naam)');
    const elftal = t.elftal ? `<span class="contact-club">${esc(t.elftal)}</span>` : '';
    const leeftijd = t.leeftijd ? `<span class="contact-club" style="background:#1f2937; color:#93c5fd;">${esc(t.leeftijd)}</span>` : '';
    const positie = t.positie ? `<span class="contact-club" style="background:#1f2937; color:#fbbf24;">${esc(t.positie)}</span>` : '';
    const regio = t.regio ? `<div class="contact-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(t.regio)}</div>` : '';
    const tipgever = `<div class="contact-row"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><strong>Tip van:</strong>&nbsp;${esc(t.tipgever || '—')}</div>`;
    const status = t.status || 'Nog te bekijken';
    const statusColor = TIP_STATUS_COLORS[status] || '#9ca3af';
    const prio = t.prioriteit || 'Midden';
    const prioColor = TIP_PRIORITY_COLORS[prio] || '#f59e0b';
    const datum = t.datum ? formatDate(t.datum) : '—';
    const bijz = t.bijzonderheden ? `<div style="margin-top:10px; padding:8px 10px; background:rgba(255,255,255,0.03); border-left:3px solid #f59e0b; border-radius:4px; font-size:13px; color:var(--text-2); line-height:1.4;">${esc(t.bijzonderheden)}</div>` : '';
    return `
      <div class="contact-card" data-id="${esc(t.id)}">
        <div class="contact-avatar" style="background:linear-gradient(135deg, #f59e0b, #d97706); color:#000;">💡</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div class="contact-name">${speler}</div>
            <span style="font-size:11px; padding:2px 8px; border-radius:10px; background:${prioColor}22; color:${prioColor}; border:1px solid ${prioColor}55;">${esc(prio)}</span>
            <span style="font-size:11px; padding:2px 8px; border-radius:10px; background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}55;">${esc(status)}</span>
          </div>
          <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">${elftal}${leeftijd}${positie}</div>
          <div style="margin-top:10px; display:flex; flex-direction:column; gap:6px;">${tipgever}${regio}<div class="contact-row" style="color:var(--text-3); font-size:12px;">${datum}</div></div>
          ${bijz}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.contact-card').forEach(card => {
    card.addEventListener('click', ()=> openTipModal(card.dataset.id));
  });
}

function fillTipDropdowns(){
  const leeftijdSel = $('#t-leeftijd');
  if(leeftijdSel && !leeftijdSel.dataset.filled){
    leeftijdSel.innerHTML = '<option value="">— Onbekend —</option>' +
      LEEFTIJD_OPTIONS.map(o => `<option value="${o}">${o}</option>`).join('');
    leeftijdSel.dataset.filled = '1';
  }
  const positieSel = $('#t-positie');
  if(positieSel && !positieSel.dataset.filled){
    positieSel.innerHTML = '<option value="">— Onbekend —</option>' +
      ALL_POSITIONS.map(p => `<option value="${p.code}">${p.code} — ${p.label}</option>`).join('');
    positieSel.dataset.filled = '1';
  }
}

function openTipModal(id){
  fillTipDropdowns();
  const bd = $('#tip-backdrop');
  const titleEl = $('#tip-modal-title');
  const delBtn = $('#tip-delete');
  const t = id ? tipsCache.find(x => x.id === id) : null;

  $('#t-id').value             = t ? t.id : '';
  $('#t-datum').value          = t ? (t.datum || todayISO()) : todayISO();
  $('#t-tipgever').value       = t ? (t.tipgever || '') : '';
  $('#t-tipgever-contact').value = t ? (t.tipgever_contact || '') : '';
  $('#t-speler').value         = t ? (t.speler || '') : '';
  $('#t-elftal').value         = t ? (t.elftal || '') : '';
  $('#t-leeftijd').value       = t ? (t.leeftijd || '') : '';
  try{ const s=document.getElementById('t-leeftijd'); if(s && s._syncAC) s._syncAC(); }catch(_){}
  $('#t-positie').value        = t ? (t.positie || '') : '';
  $('#t-regio').value          = t ? (t.regio || '') : '';
  $('#t-prioriteit').value     = t ? (t.prioriteit || 'Midden') : 'Midden';
  $('#t-status').value         = t ? (t.status || 'Nog te bekijken') : 'Nog te bekijken';
  $('#t-bijzonderheden').value = t ? (t.bijzonderheden || '') : '';

  if(titleEl) titleEl.textContent = t ? 'Tip bewerken' : 'Nieuwe tip';
  if(delBtn)  delBtn.style.display = t ? '' : 'none';

  bd.classList.add('open');
  setTimeout(()=> $('#t-tipgever').focus(), 50);
}

function closeTipModal(){
  $('#tip-backdrop').classList.remove('open');
}

async function submitTipForm(e){
  e.preventDefault();
  const tipgever = $('#t-tipgever').value.trim();
  const speler   = $('#t-speler').value.trim();
  const bijz     = $('#t-bijzonderheden').value.trim();
  if(!tipgever){ toast('Tipgever is verplicht', true); $('#t-tipgever').focus(); return; }
  if(!speler){   toast('Spelernaam is verplicht', true); $('#t-speler').focus(); return; }
  if(!bijz){     toast('Bijzonderheden zijn verplicht', true); $('#t-bijzonderheden').focus(); return; }

  const id = $('#t-id').value || ('t_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
  const existing = tipsCache.find(x => x.id === id);

  const tip = {
    id,
    datum:            $('#t-datum').value || todayISO(),
    tipgever,
    tipgever_contact: $('#t-tipgever-contact').value.trim(),
    speler,
    elftal:           $('#t-elftal').value.trim(),
    leeftijd:         $('#t-leeftijd').value,
    positie:          $('#t-positie').value,
    regio:            $('#t-regio').value.trim(),
    prioriteit:       $('#t-prioriteit').value || 'Midden',
    status:           $('#t-status').value || 'Nog te bekijken',
    bijzonderheden:   bijz,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await saveTip(tip);
    closeTipModal();
    toast(existing ? 'Tip bijgewerkt' : 'Tip opgeslagen');
  } catch(_) { /* error toast already shown */ }
}

function blankAnalysisSlots(formation){
  const out = {};
  (FORMATIONS[formation] || FORMATIONS[DEFAULT_FORMATION]).forEach(s=>{
    out[s.key] = { huidig:'', gewenst:'', gap:false,
                   huidige_speler_1:'', huidige_speler_2:'',
                   gezochte_speler:'', missende:'',
                   linked_huidig: [], linked_kandidaat: [] };
  });
  return out;
}
function blankAnalysis(){
  const formation = DEFAULT_FORMATION;
  return {
    id: 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8),
    club: '',
    leeftijd: '',
    seizoen: '',
    datum: todayISO(),
    formation: formation,
    slots: blankAnalysisSlots(formation),
    createdAt: new Date().toISOString()
  };
}
function normalizeSlot(s){
  // Backwards compat: migrate old shape (nu_situatie, huidige_speler, linked) → new shape
  if(!s) return {huidig:'', gewenst:'', gap:false, huidige_speler_1:'', huidige_speler_2:'', gezochte_speler:'', missende:'', linked_huidig:[], linked_kandidaat:[]};
  return {
    huidig: s.huidig || '',
    gewenst: s.gewenst || '',
    gap: !!s.gap,
    huidige_speler_1: s.huidige_speler_1 != null ? s.huidige_speler_1 : (s.huidige_speler || s.nu_situatie || ''),
    huidige_speler_2: s.huidige_speler_2 || '',
    gezochte_speler: s.gezochte_speler || '',
    missende: s.missende || '',
    linked_huidig: Array.isArray(s.linked_huidig) ? s.linked_huidig : (Array.isArray(s.linked) ? s.linked : []),
    linked_kandidaat: Array.isArray(s.linked_kandidaat) ? s.linked_kandidaat : []
  };
}
async function saveAnalysis(analysis){
  setSync('syncing');
  try {
    const id = analysis.id;
    const {id: _drop, ...data} = analysis;
    await setDoc(doc(analysesCol(), id), data);
  } catch(e){
    console.error('Save analysis error:', e);
    toast('Opslaan mislukt — controleer je verbinding', true);
    setSync('offline');
    throw e;
  }
}
async function deleteAnalysis(id){
  setSync('syncing');
  try { await deleteDoc(doc(analysesCol(), id)); }
  catch(e){
    console.error('Delete analysis error:', e);
    toast('Verwijderen mislukt', true);
    setSync('offline');
    throw e;
  }
}
async function patchAnalysis(patch){
  const a = currentAnalysis();
  if(!a) return;
  const merged = {...a, ...patch};
  // Update local cache immediately for snappy UI
  const idx = analysesCache.findIndex(x => x.id === a.id);
  if(idx >= 0) analysesCache[idx] = merged;
  await saveAnalysis(merged);
}
async function patchSlot(slotKey, slotPatch){
  const a = currentAnalysis();
  if(!a) return;
  const slots = {...(a.slots || {})};
  slots[slotKey] = {...normalizeSlot(slots[slotKey]), ...slotPatch};
  await patchAnalysis({slots});
}

/* =============== AUTH =============== */
function resetInactivity(){
  if(inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(()=>{ doLogout(true); }, AUTO_LOGOUT_MS);
}
async function doLogout(auto){
  if(inactivityTimer) clearTimeout(inactivityTimer);
  if(auto) toast('Sessie verlopen — log opnieuw in', true);
  try { await signOut(auth); } catch(e){ console.error(e); }
}
function authErrorNL(code){
  const map = {
    'auth/invalid-email': 'Ongeldig e-mailadres.',
    'auth/invalid-credential': 'E-mail of wachtwoord onjuist.',
    'auth/wrong-password': 'E-mail of wachtwoord onjuist.',
    'auth/user-not-found': 'Geen account met dit e-mailadres.',
    'auth/email-already-in-use': 'Dit e-mailadres is al in gebruik.',
    'auth/weak-password': 'Wachtwoord moet minimaal 6 tekens zijn.',
    'auth/too-many-requests': 'Te veel pogingen — probeer later opnieuw.',
    'auth/network-request-failed': 'Geen internetverbinding.',
    'auth/unauthorized-domain': 'Dit domein is niet toegestaan in Firebase. Voeg msteeman.github.io toe aan Authorized Domains in de Firebase Console.'
  };
  return map[code] || `Er ging iets mis (${code}). Probeer opnieuw.`;
}
window.tryLogin = async function tryLogin(){
  const btn = $('#login-btn');
  const email = $('#login-email').value.trim();
  const pw = $('#login-pw').value;
  const err = $('#login-error');
  err.textContent = '';
  if(!email || !pw){ err.textContent = 'Vul e-mail en wachtwoord in.'; return; }
  btn.disabled = true; btn.textContent = 'Bezig...';
  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch(e){
    err.textContent = authErrorNL(e.code);
    $('#login-pw').value = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Inloggen';
  }
}
// Fallback: toon login na 8s ook als onAuthStateChanged niet vuurt (bv. CDN timeout)
let _loginShown = false;
setTimeout(() => {
  if(!_loginShown && !document.getElementById('app')?.style?.display?.includes('block')){
    console.warn('Login fallback timer triggered');
    showLogin();
  }
}, 8000);

function showLogin(){
  _loginShown = true;
  const _ld = document.getElementById('loader');
  const _lo = document.getElementById('login-overlay');
  const _ap = document.getElementById('app');
  if(_ld) _ld.style.display = 'none';
  if(_lo) _lo.style.display = 'flex';
  if(_ap) _ap.style.display = 'none';
  setTimeout(()=>{ const e = document.getElementById('login-email'); if(e) e.focus(); }, 100);
}
function showApp(){
  $('#loader').style.display = 'none';
  $('#login-overlay').style.display = 'none';
  $('#app').style.display = 'block';
  // v70h-s30: email nu in Instellingen-modal i.p.v. sidebar
  const _se = document.getElementById('settings-email');
  if(_se) _se.textContent = currentUser.email || '\u2014';
  resetInactivity();
  ['mousemove','keydown','click','scroll','touchstart'].forEach(ev=>{
    document.addEventListener(ev, resetInactivity, {passive:true});
  });
}

/* =============== CONCEPT DEBUG (s35ad) =============== */
// s35ae: eenmalige cleanup van demo-modus localStorage-residue
(function _shCleanupDemoResidue(){
  try {
    localStorage.removeItem('sh-demo-mode');
    localStorage.removeItem('sh-demo-banner-hidden');
  } catch(_){ }
})();
// s35af: flush pending autosave bij tab-verbergen of pagina-sluiten
(function _shFlushOnHide(){
  function flush(reason){
    if(typeof window.__shFlushAutosave === 'function'){
      try { window.__shFlushAutosave(reason); } catch(_){ }
    }
  }
  window.addEventListener('pagehide', () => flush('pagehide'));
  window.addEventListener('beforeunload', () => flush('beforeunload'));
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') flush('vis-hidden');
  });
})();

/* s35cv — PWA agenda fix: re-render Programma als de app weer zichtbaar wordt.
   In standalone-modus (home-screen app) blijft de DOM tussen sessies hangen.
   Als programmaCache pas binnenkomt nadat de gebruiker al op Programma stond
   krijg je een leeg grid totdat hij hard scrolt of switcht. Deze re-render
   triggert op visibility-resume én op pageshow (iOS bfcache). */
(function(){
  function refreshProgrammaIfVisible(){
    try{
      if(typeof currentView !== 'undefined' && currentView === 'programma'
         && typeof renderProgramma === 'function'){
        renderProgramma();
      }
      if(typeof currentView !== 'undefined' && currentView === 'agenda'
         && typeof renderAgenda === 'function'){
        renderAgenda();
      }
    }catch(_){ }
  }
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') refreshProgrammaIfVisible();
  });
  window.addEventListener('pageshow', refreshProgrammaIfVisible);
  // Tweede defensieve re-render 800ms na DOMContentLoaded zodat de
  // eerste firestore-snapshot zeker binnen is voordat de gebruiker tikt.
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(refreshProgrammaIfVisible, 800);
    setTimeout(refreshProgrammaIfVisible, 2200);
  });
  window.__shRefreshProgramma = refreshProgrammaIfVisible;
})();
function openConceptDebug(){
  const m = document.getElementById('debug-modal');
  if(!m) return;
  m.classList.add('is-open');
  renderConceptDebug();
}
function closeConceptDebug(){
  const m = document.getElementById('debug-modal');
  if(m) m.classList.remove('is-open');
}
window.openConceptDebug = openConceptDebug;
window.closeConceptDebug = closeConceptDebug;
function _shTsOf(p){
  const t = (p && (p.updated_at || (p._meta && p._meta.ts) || p.ts)) || '';
  return t || '';
}
function renderConceptDebug(){
  const body = document.getElementById('debug-modal-body');
  const sub  = document.getElementById('debug-modal-sub');
  if(!body) return;
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const concepts = players.filter(p => p && p.concept === true);
  // groepeer op programma_link key voor duplicaat-detectie
  const groups = {};
  concepts.forEach(p => {
    const k = (p.programma_link && (p.programma_link.progId+'|'+p.programma_link.spelerKey)) || '(geen link)';
    (groups[k] = groups[k] || []).push(p);
  });
  const dupCount = Object.values(groups).filter(g => g.length > 1).length;
  const emptyCount = concepts.filter(p => {
    const ctx = (p.wedstrijd && p.wedstrijd.context) || '';
    return !ctx.trim();
  }).length;
  if(sub){
    sub.textContent = concepts.length + ' concept-records, '
      + dupCount + ' slot(s) met duplicaten, '
      + emptyCount + ' zonder wedstrijdcontext';
  }
  if(!concepts.length){
    body.innerHTML = '<div class="debug-empty">Geen concept-records gevonden.</div>';
    return;
  }
  // sorteer per groep nieuwste eerst
  function tsNum(p){ const n = Date.parse(_shTsOf(p)); return isNaN(n) ? 0 : n; }
  Object.keys(groups).forEach(k => groups[k].sort((a,b) => tsNum(b) - tsNum(a)));
  const rows = [];
  rows.push('<table class="debug-table"><thead><tr>'
    + '<th>ID</th><th>Naam</th><th>Programma-link</th><th>Wedstrijdcontext</th><th>Timestamp</th><th>Status</th><th>Actie</th>'
    + '</tr></thead><tbody>');
  const esc = s => String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  Object.keys(groups).sort().forEach(key => {
    const grp = groups[key];
    grp.forEach((p, idx) => {
      const ctx = (p.wedstrijd && p.wedstrijd.context) || '';
      const isEmpty = !ctx.trim();
      const isDup = grp.length > 1;
      const isNewest = idx === 0;
      const naam = p.naam || [p.voornaam, p.achternaam].filter(Boolean).join(' ') || '(geen naam)';
      const link = p.programma_link ? (p.programma_link.progId + ' / ' + p.programma_link.spelerKey) : '(geen)';
      let status = isNewest ? 'NIEUWSTE' : 'OUDERE DUP';
      if(isEmpty) status += ' • LEEG';
      const cls = [];
      if(isEmpty) cls.push('empty-row');
      else if(isDup && !isNewest) cls.push('dup-row');
      rows.push('<tr class="' + cls.join(' ') + '">'
        + '<td class="mono">' + esc(p.id) + '</td>'
        + '<td>' + esc(naam) + '</td>'
        + '<td class="mono">' + esc(link) + '</td>'
        + '<td>' + esc(ctx || '(leeg)') + '</td>'
        + '<td class="mono">' + esc(_shTsOf(p)) + '</td>'
        + '<td>' + esc(status) + '</td>'
        + '<td><button type="button" class="debug-row-btn" data-debug-del="' + esc(p.id) + '">Verwijder</button></td>'
        + '</tr>');
    });
  });
  rows.push('</tbody></table>');
  body.innerHTML = rows.join('');
}
// Verwijder concept-record
async function deleteConceptRecord(id){
  if(!id) return;
  if(!confirm('Concept-record \'' + id + '\' definitief verwijderen?')) return;
  try {
    if(typeof deletePlayer === 'function'){
      await deletePlayer(id);
    } else {
      const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
      const filtered = players.filter(p => p.id !== id);
      if(typeof savePlayers === 'function') await savePlayers(filtered);
      else localStorage.setItem('playersCache', JSON.stringify(filtered));
      if(Array.isArray(window.playersCache)) window.playersCache = filtered;
    }
  } catch(e){ console.warn('deleteConceptRecord faalde:', e); }
  renderConceptDebug();
}
// Verwijder ALLE lege duplicaten (concept-records zonder wedstrijdcontext
// waarvoor in dezelfde programma-slot een gevulde versie bestaat)
async function deleteEmptyDuplicates(){
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const concepts = players.filter(p => p && p.concept === true);
  const groups = {};
  concepts.forEach(p => {
    if(!p.programma_link) return;
    const k = p.programma_link.progId + '|' + p.programma_link.spelerKey;
    (groups[k] = groups[k] || []).push(p);
  });
  const toDel = [];
  Object.values(groups).forEach(grp => {
    if(grp.length < 2) return;
    const hasFilled = grp.some(p => ((p.wedstrijd && p.wedstrijd.context) || '').trim());
    if(!hasFilled) return;
    grp.forEach(p => {
      const ctx = (p.wedstrijd && p.wedstrijd.context) || '';
      if(!ctx.trim()) toDel.push(p.id);
    });
  });
  if(!toDel.length){ alert('Geen lege duplicaten gevonden.'); return; }
  if(!confirm(toDel.length + ' lege duplicaat-record(s) verwijderen?')) return;
  for(const id of toDel){
    try {
      if(typeof deletePlayer === 'function') await deletePlayer(id);
    } catch(e){ console.warn('delete', id, 'faalde:', e); }
  }
  renderConceptDebug();
}
// s35ag: trace download + copy + clear
function _shTraceFilename(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return 'sh-trace_' + d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate())
    + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.txt';
}
async function _shTraceCopy(){
  const raw = (typeof __shTraceDump === 'function') ? __shTraceDump() : '[]';
  let pretty = raw;
  try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch(_){ }
  let copied = false;
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(pretty);
      copied = true;
    }
  } catch(_){ }
  // Altijd OOK een download triggeren — sommige browsers geven geen clipboard
  try {
    const blob = new Blob([pretty], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = _shTraceFilename();
    document.body.appendChild(a); a.click();
    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch(_){ } }, 200);
  } catch(_){ }
  if(typeof toast === 'function'){
    toast(copied ? 'Trace gekopieerd & gedownload' : 'Trace gedownload (klembord niet beschikbaar)');
  } else {
    alert(copied ? 'Trace gekopieerd & gedownload' : 'Trace gedownload');
  }
}
function _shTraceClearUI(){
  if(!confirm('Trace-log wissen?')) return;
  if(typeof __shTraceClear === 'function') __shTraceClear();
  if(typeof toast === 'function') toast('Trace gewist');
}
// Bindings
document.addEventListener('click', (e) => {
  if(!e.target) return;
  if(e.target.id === 'settings-debug-open'){ openConceptDebug(); return; }
  if(e.target.id === 'debug-close'){ closeConceptDebug(); return; }
  if(e.target.id === 'debug-refresh'){ renderConceptDebug(); return; }
  if(e.target.id === 'debug-delete-empty'){ deleteEmptyDuplicates(); return; }
  if(e.target.id === 'settings-trace-copy'){ _shTraceCopy(); return; }
  if(e.target.id === 'settings-trace-clear'){ _shTraceClearUI(); return; }
  const delId = e.target.getAttribute && e.target.getAttribute('data-debug-del');
  if(delId){ deleteConceptRecord(delId); return; }
});
// Toetsen-shortcut Ctrl+Shift+D + Ctrl+Shift+T (s35ag: trace dump)
document.addEventListener('keydown', (e) => {
  if(e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')){
    e.preventDefault();
    openConceptDebug();
  } else if(e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')){
    e.preventDefault();
    if(typeof _shTraceCopy === 'function') _shTraceCopy();
  } else if(e.key === 'Escape'){
    const m = document.getElementById('debug-modal');
    if(m && m.classList.contains('is-open')) closeConceptDebug();
  }
});

/* =============== DIRTY FORM TRACKING =============== */
let formDirty = false;
function setDirty(v){ formDirty = !!v; }
function confirmDiscard(){
  // v70a: autosave bewaart alles als concept — geen onderbrekende prompt meer
  setDirty(false);
  return true;
}
/* v70a: beforeunload weggehaald — concept blijft staan in localStorage */

/* =============== NAVIGATION =============== */
/* ── Stagger helper: voeg sh-stagger class + --si index toe aan kinderen ── */
function shStagger(containerSelector, childSelector){
  try {
    const host = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector) : containerSelector;
    if(!host) return;
    const items = childSelector ? host.querySelectorAll(childSelector) : host.children;
    [...items].forEach((el, i) => {
      el.classList.remove('sh-stagger');
      void el.offsetWidth; // force reflow
      el.style.setProperty('--si', i);
      el.classList.add('sh-stagger');
    });
  } catch(_){}
}
window.shStagger = shStagger;

// ── Floating "terug naar boven" knop ──
(function _shBackToTop(){
  const btn = document.getElementById('sh-back-to-top');
  if(!btn) return;
  const scrollEl = document.querySelector('.main') || window;
  const getScroll = () => scrollEl === window ? window.scrollY : scrollEl.scrollTop;
  const onScroll = () => {
    if(getScroll() > 300) btn.classList.add('visible');
    else btn.classList.remove('visible');
  };
  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  btn.addEventListener('click', () => {
    if(scrollEl === window) window.scrollTo({ top: 0, behavior: 'smooth' });
    else scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
  });
  onScroll();
})();



/* ── C1: 3D tilt op kaarten met class sh-tilt-card (desktop only) ── */
(function(){
  if(window.matchMedia('(hover:none)').matches) return; // geen tilt op touch
  let _rAF = null;
  document.addEventListener('mousemove', e => {
    const card = e.target.closest('.sh-tilt-card');
    if(!card) return;
    if(_rAF) cancelAnimationFrame(_rAF);
    _rAF = requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width  - 0.5; // -0.5..0.5
      const ny = (e.clientY - r.top)  / r.height - 0.5;
      card.style.setProperty('--tilt-y',  (nx *  8) + 'deg');
      card.style.setProperty('--tilt-x',  (ny * -6) + 'deg');
    });
  }, { passive: true });
  document.addEventListener('mouseleave', e => {
    const card = e.target.closest && e.target.closest('.sh-tilt-card');
    if(!card) return;
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
  }, true);
})();

function go(view){
  // v70h-s1.2: guard tegen falsy view (bv. nav-item zonder data-view)
  if(!view || typeof view !== 'string') return;
  if(currentView === 'report' && view !== 'report'){
    // s35af: flush pending autosave VOORDAT we de view verlaten,
    // zodat een snelle wegklik (<300ms debounce) niet je tekst kwijtraakt.
    if(typeof window.__shTrace === 'function') __shTrace('go-leave-report', { to: view });
    if(typeof window.__shFlushAutosave === 'function'){
      try { window.__shFlushAutosave('go-leave-report'); } catch(_){ }
    }
    if(!confirmDiscard()) return;
  }
  currentView = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-'+view));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $$('#bottom-nav .bn-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  if(view === 'dashboard') renderDashboard();
  if(view === 'database')  renderDatabase();
  if(view === 'compare')   { renderCompare(); shUpdateCmpUI(); }
  if(view === 'elftallen') renderElftallen();
  if(view === 'matches')   renderMatches();
  if(view === 'pitch')     renderPitch();
  if(view === 'report')    {
    resetReportForm();
    // v70e: concept-banner opnieuw evalueren bij elke navigatie naar rapport
    setTimeout(() => { if(typeof window.__shTryRestore === 'function') window.__shTryRestore(); }, 50);
  }
  if(view === 'contacts')  renderContacts();
  if(view === 'programma') renderProgramma();
  if(view === 'agenda')    renderAgenda();
  if(view === 'adresboek') {
    // v70h-s24: reset filters bij elke navigatie naar adresboek
    _adresboekLetter = 'A';
    _adresboekProvincie = '';
    const _sEl = document.getElementById('adresboek-search');
    if(_sEl) _sEl.value = '';
    renderAdresboek();
  }
  if(view === 'tips')      renderTips();
  if(view === 'ritten')    renderRitten();
  if(view === 'player')    renderPlayer();
  // s35cr: privacy + voorwaarden zijn statische views — geen render-functie nodig
  window.scrollTo({top:0});
}

// v70h-s8: expose module functies op window zodat gewone <script>-blokken
// (zoals het dropdown-menu) ze kunnen aanroepen. Module-scope is anders
// onbereikbaar voor andere script-tags.
window.go = go;
window.openMatchReportModal = openMatchReportModal;
window.openProgMatchModal = openProgMatchModal;
window.isoDateStr = isoDateStr;

// s35ah: bridge voor doSave (leeft in een gewoon <script>-blok en kan
// savePlayer/playersCache niet zien). Mutateert playersCache SYNCHROON
// VOOR de async Firestore-write, zodat findSlotConcept de record meteen ziet.
window.__shScoutingSave = function(player){
  if(!player || !player.id){
    if(typeof __shTrace === 'function') __shTrace('module-save-bad-arg', { has_player: !!player });
    return Promise.reject(new Error('player.id ontbreekt'));
  }
  try {
    const idx = playersCache.findIndex(p => p && p.id === player.id);
    const before = playersCache.length;
    if(idx >= 0) playersCache[idx] = player;
    else playersCache.push(player);
    if(typeof __shTrace === 'function'){
      __shTrace('module-cache-upsert', {
        id: player.id,
        cache_before: before,
        cache_after: playersCache.length,
        replaced: idx >= 0,
        has_link: !!player.programma_link,
        concept_flag: player.concept === true
      });
    }
  } catch(e){
    if(typeof __shTrace === 'function') __shTrace('module-cache-error', { msg: String(e) });
  }
  return savePlayer(player);
};

/* =============== s35s: BEZIG MET SCOUTEN =============== */
// KNVB-duur per leeftijdscategorie (in minuten ná aftrap):
// 2x speeltijd + rust + time-outs (pupillen) + blessuretijd-buffer + 15 min navullen
//   O8/O9:  2x20 + 10 rust + 4 time-out + 5 bl + 15 buf  = ~75
//   O10:    2x25 + 10 rust + 4 time-out + 5 bl + 15 buf  = ~85
//   O11/12: 2x30 + 10 rust + 4 time-out + 5 bl + 15 buf  = ~95
//   O13:    2x30 + 15 rust + 5 bl + 15 buf               = ~95
//   O14/15: 2x35 + 15 rust + 5 bl + 15 buf               = ~105
//   O16/17: 2x40 + 15 rust + 5 bl + 15 buf               = ~115
//   O18/19/23: 2x45 + 15 rust + 5 bl + 15 buf            = ~125
const KNVB_DUUR_MIN = {
  // s35bk: officiele KNVB-speeltijden (2x speelhelft + rust, totale duur indicatie)
  'O.8':50,  'O.9':50,  'O.10':60, 'O.11':75, 'O.12':75,
  'O.13':75, 'O.14':85, 'O.15':85, 'O.16':95, 'O.17':95,
  'O.18':105,'O.19':105,'O.21':105,'O.23':105
};
function getMatchDurationMin(leeftijd){
  if(!leeftijd) return 120;
  const k = String(leeftijd).trim().toUpperCase();
  // s35bx: 'O.8-9' (elftal 9 van O.8) -> 'O.8'. Ook 'JO8'/'MO13-2' -> 'O.8'/'O.13'.
  const baseMatch = k.match(/\b[JM]?O\.?(\d{1,2})\b/);
  if(baseMatch){
    const norm = 'O.' + baseMatch[1];
    if(KNVB_DUUR_MIN[norm]) return KNVB_DUUR_MIN[norm];
  }
  return KNVB_DUUR_MIN[k] || 120;
}
// s35bk: pre-window 5 min vóór aftrap (startend), post-window = duur + 5 min (zojuist afgelopen)
const SCOUTING_PRE_MIN = 5;
const SCOUTING_POST_MIN = 5;
function getMatchWindow(prog){
  if(!prog || !prog.datum || !prog.tijd) return null;
  const [hh,mm] = String(prog.tijd).split(':').map(n=>parseInt(n,10));
  if(isNaN(hh) || isNaN(mm)) return null;
  const [Y,M,D] = String(prog.datum).split('-').map(n=>parseInt(n,10));
  if(!Y||!M||!D) return null;
  const kick = new Date(Y, M-1, D, hh, mm, 0, 0);
  const start = new Date(kick.getTime() - SCOUTING_PRE_MIN*60000);
  // s35dg-hotfix2: prog.leeftijd is op nieuwere items vaak leeg; pak dan
  // thuis_elftal/uit_elftal (bv. 'O.16'). Zonder fallback rekent de window
  // op default 120 min en blijft de 'Bezig'-tile tot +135 min hangen.
  const lf = (prog.leeftijd && String(prog.leeftijd).trim())
          || (prog.thuis_elftal && String(prog.thuis_elftal).trim())
          || (prog.uit_elftal && String(prog.uit_elftal).trim())
          || '';
  const end   = new Date(kick.getTime() + (getMatchDurationMin(lf) + SCOUTING_POST_MIN)*60000);
  return { kick, start, end };
}
function isMatchInWindow(prog, now){
  const w = getMatchWindow(prog);
  if(!w) return false;
  const t = (now || new Date()).getTime();
  return t >= w.start.getTime() && t <= w.end.getTime();
}
// s35ca-1: een wedstrijd is 'op slot' zodra fluitje+15 verstreken is.
// Vanaf dat moment zijn snel-notities en spelersrapport-edits op het
// dashboard read-only — bewerken kan alleen nog via tab Wedstrijden.
// Nog niet afgedwongen; lock-routes komen in s35ca-2.
function _shIsMatchLocked(prog, now){
  const w = getMatchWindow(prog);
  if(!w) return false;
  const t = (now || new Date()).getTime();
  return t > w.end.getTime();
}
window._shIsMatchLocked = _shIsMatchLocked;
// 3-traps speler-matching tegen playersCache.
// Retourneert { player, mode } waarbij mode = 'exact'|'club'|'naam'|null
// s35x: zoek bestaand concept voor een specifieke programma-slot.
// spelerKey = stable sp.id (genId('progsp')).
function findSlotConcept(progId, spelerKey){
  if(!progId || !spelerKey){
    if(typeof __shTrace === 'function') __shTrace('findslot-bad-args', { progId, spelerKey });
    return null;
  }
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  // s35ad: meerdere matches mogelijk (duplicaten uit s35ab) -> nieuwste winnen.
  const hits = players.filter(p => p && p.concept === true && p.programma_link
    && p.programma_link.progId === progId
    && p.programma_link.spelerKey === spelerKey);
  if(typeof __shTrace === 'function'){
    __shTrace('findslot', {
      progId, spelerKey,
      cache_size: players.length,
      hits: hits.length,
      hit_ids: hits.map(h => h && h.id).filter(Boolean)
    });
  }
  if(!hits.length) return null;
  function tsOf(p){
    const t = (p && (p.updated_at || p._meta && p._meta.ts || p.ts)) || '';
    const n = Date.parse(t);
    return isNaN(n) ? 0 : n;
  }
  hits.sort((a,b) => tsOf(b) - tsOf(a));
  return hits[0];
}
window.findSlotConcept = findSlotConcept;

function findPlayerMatch(speler){
  if(!speler) return { player:null, mode:null };
  // s35x: concept-records uitsluiten — die zijn slot-specifiek
  const allPlayers = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const players = allPlayers.filter(p => !p.concept);
  if(!players.length) return { player:null, mode:null };
  const norm = s => String(s||'').trim().toLowerCase();
  const vn = norm(speler.voornaam);
  const an = norm(speler.achternaam);
  const gb = norm(speler.geboorte);
  const cl = norm(speler.club);
  const naam = norm(speler.naam);
  // Splits naam wanneer voornaam/achternaam ontbreken
  let _vn = vn, _an = an;
  if((!_vn || !_an) && naam && typeof splitNaam === 'function'){
    const s = splitNaam(naam);
    if(!_vn) _vn = norm(s.voornaam);
    if(!_an) _an = norm(s.achternaam);
  }
  function playerNamen(p){
    let pvn = norm(p.voornaam), pan = norm(p.achternaam);
    if((!pvn || !pan) && p.naam && typeof splitNaam === 'function'){
      const s = splitNaam(p.naam);
      if(!pvn) pvn = norm(s.voornaam);
      if(!pan) pan = norm(s.achternaam);
    }
    return { pvn, pan };
  }
  // Tier 1: voornaam + achternaam + geboorte
  if(_vn && _an && gb){
    const hits = players.filter(p => {
      const {pvn, pan} = playerNamen(p);
      return pvn===_vn && pan===_an && norm(p.geboorte)===gb;
    });
    if(hits.length === 1) return { player: hits[0], mode:'exact' };
  }
  // Tier 2: voornaam + achternaam + club
  if(_vn && _an && cl){
    const hits = players.filter(p => {
      const {pvn, pan} = playerNamen(p);
      return pvn===_vn && pan===_an && norm(p.club)===cl;
    });
    if(hits.length === 1) return { player: hits[0], mode:'club' };
  }
  // Tier 3: volledige naam
  if(naam){
    const hits = players.filter(p => norm(p.naam) === naam ||
      (norm(p.voornaam)+' '+norm(p.achternaam)).trim() === naam);
    if(hits.length === 1) return { player: hits[0], mode:'naam' };
  }
  // Tier 2b: voornaam + achternaam zonder andere criteria
  if(_vn && _an){
    const hits = players.filter(p => {
      const {pvn, pan} = playerNamen(p);
      return pvn===_vn && pan===_an;
    });
    if(hits.length === 1) return { player: hits[0], mode:'naam' };
  }
  return { player:null, mode:null };
}
window.findPlayerMatch = findPlayerMatch;

/* s35dg Fase B: strikte match op voornaam+achternaam(+geboorte) — uitsluitend echte spelers (geen concepten).
   Retourneert {player, mode} of {player:null, mode:null}.
   - mode 'exact'  = vn+an+gb match
   - mode 'naam'   = vn+an match (zonder gb of niet ingevuld)
*/
function findExistingPlayer(voornaam, achternaam, geboorte){
  const norm = s => String(s||'').trim().toLowerCase();
  const vn = norm(voornaam), an = norm(achternaam), gb = norm(geboorte);
  if(!vn || !an) return { player:null, mode:null };
  const allPlayers = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const players = allPlayers.filter(p => !p.concept);
  function namen(p){
    let pvn = norm(p.voornaam), pan = norm(p.achternaam);
    if((!pvn || !pan) && p.naam && typeof splitNaam === 'function'){
      const s = splitNaam(p.naam);
      if(!pvn) pvn = norm(s.voornaam);
      if(!pan) pan = norm(s.achternaam);
    }
    return { pvn, pan };
  }
  if(gb){
    const hits = players.filter(p => {
      const {pvn, pan} = namen(p);
      return pvn===vn && pan===an && norm(p.geboorte)===gb;
    });
    if(hits.length === 1) return { player: hits[0], mode:'exact' };
    if(hits.length > 1) return { player: hits[0], mode:'exact' };
  }
  const hits = players.filter(p => {
    const {pvn, pan} = namen(p);
    return pvn===vn && pan===an;
  });
  if(hits.length === 1) return { player: hits[0], mode:'naam' };
  return { player:null, mode:null };
}
window.findExistingPlayer = findExistingPlayer;

// Auto-create wedstrijdrapport voor een wedstrijd in venster (idempotent).
// ID = mr_prog_<progId>. Bestaat 'm al? Niets doen.
async function ensureActiveMatchReport(prog){
  if(!prog) return null;
  const mrId = 'mr_prog_' + prog.id;
  const existing = (matchReportsCache||[]).find(r => r.id === mrId);
  if(existing) return existing;
  // s35dj: elftal = leeftijdscategorie uit thuis_elftal/uit_elftal
  const _mrElftal = (prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim();
  const _mrThuis  = prog.thuis ? `${prog.thuis}${prog.thuis_elftal?' '+prog.thuis_elftal:''}`.trim() : '';
  const _mrUit    = prog.uit   ? `${prog.uit}${prog.uit_elftal?' '+prog.uit_elftal:''}`.trim()       : '';
  const report = {
    id: mrId,
    datum: prog.datum || todayISO(),
    leeftijd: _mrElftal,
    thuis: _mrThuis,
    uit:   _mrUit,
    sportpark: prog.locatie || '',
    veld: prog.veld || '',
    methode: prog.methode || '',
    opmerking: prog.notities || '',
    auto_from_programma: true,
    programma_id: prog.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  try {
    await saveMatchReport(report);
    return report;
  } catch(e){
    console.error('ensureActiveMatchReport faalde:', e);
    return null;
  }
}

// Open spelersrapport in concept-modus voor scouting-tile klik.
// matchedPlayer (optioneel) = bestaande speler uit playersCache (3-traps).
// progSp = speler-object uit programma. prog = wedstrijd.
function openScoutingPlayerForm(prog, progSp, matchedPlayer, slotConceptHint){
  if(!prog || !progSp){
    if(typeof __shTrace === 'function') __shTrace('openform-bad-args', {
      has_prog: !!prog, has_sp: !!progSp
    });
    return;
  }
  if(typeof __shTrace === 'function') __shTrace('openform-entry', {
    progId: prog.id, spelerKey: progSp.id,
    sp_naam: progSp.naam || '',
    has_hint: !!slotConceptHint,
    has_matched: !!matchedPlayer
  });
  // s35al (#8): SYNCHROON flush van een eventuele lopende autosave-timer
  // VOORDAT we de pending-flag/ctx wisselen. Zonder dit kan een saveTimer
  // met de OUDE spelerKey nog vuren nadat ctx al naar de NIEUWE speler is
  // gezet — dat veroorzaakt lege duplicate concept-records (zie #8).
  try {
    if(typeof window.__shFlushAutosave === 'function'){
      window.__shFlushAutosave('open-scouting-form');
    }
  } catch(_){ }
  // s35y: pending-vlag SYNCHROON zodat tryRestore (+50ms) banner skipt.
  // resetReportForm wist alleen __shScoutingCtx, niet __shScoutingPending.
  window.__shScoutingPending = { progId: prog.id, spelerKey: progSp.id };
  go('report');
  setTimeout(() => {
    try {
      resetReportForm();
      // s35x: zet scouting-context voor autosave (concept-record).
      window.__shScoutingCtx = { progId: prog.id, spelerKey: progSp.id };
      window.__shScoutingPending = null;
      // s35y: belt-and-suspenders — verberg eventuele localStorage-banner
      const dbanner = document.getElementById('report-draft-banner');
      if(dbanner) dbanner.classList.add('hidden');
      // s35aa: hint van de aanroeper (sa-tile render heeft 'm al gevonden) is
      // betrouwbaarder dan opnieuw zoeken — anders kan cache-timing voor verschil zorgen.
      let slotConcept = slotConceptHint || null;
      if(!slotConcept){
        slotConcept = (typeof findSlotConcept === 'function')
          ? findSlotConcept(prog.id, progSp.id) : null;
      }
      if(slotConcept){
        loadIntoForm(slotConcept);
        const dispNaam = slotConcept.naam
          || [slotConcept.voornaam, slotConcept.achternaam].filter(Boolean).join(' ')
          || 'speler';
        if($('#report-title')) $('#report-title').textContent = 'Concept — ' + dispNaam;
        // Wedstrijdcontext eventueel synchroniseren met huidig programma
        if($('#f-w-datum') && !$('#f-w-datum').value) $('#f-w-datum').value = prog.datum || '';
        if($('#f-w-thuis') && !$('#f-w-thuis').value) $('#f-w-thuis').value = prog.thuis || '';
        if($('#f-w-uit') && !$('#f-w-uit').value) $('#f-w-uit').value = prog.uit || '';
        try { const _s = document.getElementById('rep-prog-autofill-strip'); if(_s) _s.hidden = false; } catch(_){}
        injectScoutingBanner(prog, progSp, matchedPlayer);
        return;
      }
      if(matchedPlayer){
        // s35w: gekoppelde speler -> identity-velden uit playersCache prefillen,
        // MAAR f-id leeg laten zodat opslaan een NIEUW rapport aanmaakt
        // (oude rapporten van deze speler blijven bestaan).
        const mp = matchedPlayer;
        // Splits naam wanneer voornaam/achternaam ontbreken
        let mvn = mp.voornaam || '', man = mp.achternaam || '';
        if((!mvn || !man) && mp.naam && typeof splitNaam === 'function'){
          const s = splitNaam(mp.naam);
          if(!mvn) mvn = s.voornaam;
          if(!man) man = s.achternaam;
        }
        if($('#f-voornaam')) $('#f-voornaam').value = mvn;
        if($('#f-achternaam')) $('#f-achternaam').value = man;
        if($('#f-naam')) $('#f-naam').value = mp.naam || [mvn, man].filter(Boolean).join(' ');
        if(typeof syncNaamHidden === 'function') syncNaamHidden('f');
        if($('#f-geboorte')) $('#f-geboorte').value = mp.geboorte || '';
        if($('#f-club')) $('#f-club').value = mp.club || '';
        if($('#f-plaats')) $('#f-plaats').value = mp.plaats || '';
        if($('#f-adres')) $('#f-adres').value = mp.adres || '';
        if($('#f-rugnummer')) $('#f-rugnummer').value = mp.rugnummer || '';
        if($('#f-elftal')){ $('#f-elftal').value = mp.elftal || ''; try{document.getElementById('f-elftal')._syncAC && document.getElementById('f-elftal')._syncAC();}catch(_){} }
        if($('#f-been')) $('#f-been').value = mp.been || '';
        if($('#f-tweebenig')) $('#f-tweebenig').value = mp.tweebenig || '';
        if($('#f-linie')) $('#f-linie').value = mp.linie || '';
        if(typeof refreshPositionDropdowns === 'function') refreshPositionDropdowns();
        if($('#f-positie')) $('#f-positie').value = mp.positie || '';
        if($('#f-beoogd')) $('#f-beoogd').value = mp.beoogd || '';
        // s35dj: leeftijd uit elftal-velden als fallback
        const _sfElftal = (prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim();
        if($('#f-leeftijd')) $('#f-leeftijd').value = mp.leeftijd || _sfElftal;
        if($('#f-elftal') && !$('#f-elftal').value){ $('#f-elftal').value = mp.elftal || progSp.elftal || _sfElftal; try{document.getElementById('f-elftal')._syncAC && document.getElementById('f-elftal')._syncAC();}catch(_){} }
        if($('#f-bouw')) $('#f-bouw').value = mp.bouw || '';
        if($('#f-lengte')) $('#f-lengte').value = mp.lengte || '';
        // Title aanpassen: NIEUW rapport, niet bewerken
        const dispNaam = mp.naam || [mvn, man].filter(Boolean).join(' ') || 'speler';
        if($('#report-title')) $('#report-title').textContent = 'Nieuw rapport — ' + dispNaam;
      } else {
        // Nieuwe speler -> prefill basis uit programma
        if($('#f-voornaam')) $('#f-voornaam').value = progSp.voornaam || '';
        if($('#f-achternaam')) $('#f-achternaam').value = progSp.achternaam || '';
        if($('#f-naam')) $('#f-naam').value = progSp.naam ||
          [progSp.voornaam, progSp.achternaam].filter(Boolean).join(' ');
        if(typeof syncNaamHidden === 'function') syncNaamHidden('f');
        if(progSp.geboorte && $('#f-geboorte')) $('#f-geboorte').value = progSp.geboorte;
        if(progSp.club && $('#f-club')) $('#f-club').value = progSp.club;
        if(progSp.rugnummer && $('#f-rugnummer')) $('#f-rugnummer').value = progSp.rugnummer;
        if(progSp.positie && $('#f-positie')) $('#f-positie').value = progSp.positie;
        // s35dj: leeftijdscategorie uit thuis_elftal als primaire bron
        const _sfElftalNew = (prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim();
        if(_sfElftalNew && $('#f-leeftijd')) $('#f-leeftijd').value = _sfElftalNew;
        if(_sfElftalNew && $('#f-elftal') && !$('#f-elftal').value) $('#f-elftal').value = progSp.elftal || _sfElftalNew;
        // Club: gebruik club van speler, anders thuisclub als hint
        if(!progSp.club && prog.thuis && $('#f-club') && !$('#f-club').value) $('#f-club').value = prog.thuis;
      }
      // Wedstrijdcontext invullen vanuit programma
      // s35ao (#4 demo): alleen NA aftrap auto-invullen (vóór aftrap is wedstrijd nog niet gespeeld)
      let __sh_autofill_ok = true;
      try {
        if(prog && prog.datum){
          const t = (prog.tijd && /^\d{1,2}:\d{2}$/.test(prog.tijd)) ? prog.tijd : '00:00';
          const ts = new Date(prog.datum + 'T' + t).getTime();
          if(!isNaN(ts) && Date.now() < ts) __sh_autofill_ok = false;
        }
      } catch(_){}
      if(__sh_autofill_ok){
        // s35dj: thuis/uit inclusief elftal-suffix voor leesbaarheid in rapport
        const _sfThuis = prog.thuis ? `${prog.thuis}${prog.thuis_elftal?' '+prog.thuis_elftal:''}`.trim() : '';
        const _sfUit   = prog.uit   ? `${prog.uit}${prog.uit_elftal?' '+prog.uit_elftal:''}`.trim()       : '';
        if($('#f-w-datum')) $('#f-w-datum').value = prog.datum || '';
        if($('#f-w-thuis')) $('#f-w-thuis').value = _sfThuis;
        if($('#f-w-uit'))   $('#f-w-uit').value   = _sfUit;
        /* s35dg Fase H: plaats/sportpark/veld/methode doortrekken uit programma */
        try {
          const __sp = (prog.locatie || '').trim();
          const __vd = (prog.veld || '').trim();
          let __pl = '';
          if(typeof window.findClubInfo === 'function' && prog.thuis){
            const __ci = window.findClubInfo(prog.thuis);
            if(__ci && __ci.plaats) __pl = __ci.plaats;
          }
          if($('#f-w-sportpark') && !$('#f-w-sportpark').value) $('#f-w-sportpark').value = __sp;
          if($('#f-w-veld')      && !$('#f-w-veld').value)      $('#f-w-veld').value      = __vd;
          if($('#f-w-plaats')    && !$('#f-w-plaats').value)    $('#f-w-plaats').value    = __pl;
          if($('#f-w-context')   && !$('#f-w-context').value && prog.methode)
            $('#f-w-context').value = prog.methode;
        } catch(_){}
      }
      // s35ak (#4): markeer wedstrijd-velden visueel als auto-ingevuld vanuit programma
      try {
        if(!__sh_autofill_ok) throw new Error('skip-autofill-marking');
        const strip = document.getElementById('rep-prog-autofill-strip');
        if(strip) strip.hidden = false;
        let __pl2 = '';
        try {
          if(typeof window.findClubInfo === 'function' && prog.thuis){
            const __ci2 = window.findClubInfo(prog.thuis);
            if(__ci2 && __ci2.plaats) __pl2 = __ci2.plaats;
          }
        } catch(_){}
        const _amThuis = prog.thuis ? `${prog.thuis}${prog.thuis_elftal?' '+prog.thuis_elftal:''}`.trim() : '';
        const _amUit   = prog.uit   ? `${prog.uit}${prog.uit_elftal?' '+prog.uit_elftal:''}`.trim()       : '';
        const autoMap = {
          'f-w-datum':     prog.datum||'',
          'f-w-thuis':     _amThuis,
          'f-w-uit':       _amUit,
          /* s35dg Fase H */
          'f-w-plaats':    __pl2,
          'f-w-sportpark': prog.locatie||'',
          'f-w-veld':      prog.veld||''
        };
        Object.keys(autoMap).forEach(id => {
          const inp = document.getElementById(id); if(!inp) return;
          const fld = inp.closest('.field'); if(fld) fld.classList.add('rep-auto-field');
          inp.dataset.repOrig = autoMap[id];
          if(!inp.dataset.repAutoBound){
            inp.dataset.repAutoBound = '1';
            inp.addEventListener('input', () => {
              const f = inp.closest('.field'); if(!f) return;
              if((inp.value||'') !== (inp.dataset.repOrig||'')) f.classList.add('rep-auto-edited');
              else f.classList.remove('rep-auto-edited');
            });
          }
        });
      } catch(_){}
      // einde s35ak
      // s35ad: s35ab synchroon-schrijf verwijderd — die maakte duplicaten.
      // doSave() (autosave 800ms) zorgt nu zelf voor uid + initiele save.

      // ── Snelnotitie terms → rapport-velden ──────────────────────────────
      // Zoek de snelnotitie voor deze speler en vul per-onderdeel tekstvelden
      try {
        const _snMap = {
          'techniek':     'f-tekst-techniek',
          'inzicht':      'f-tekst-inzicht',
          'mentaliteit':  'f-tekst-grit',
          'explosiviteit':'f-tekst-explosiviteit',
          'sprinten':     'f-tekst-sprinten',
          'duelleren':    'f-tekst-duelleren',
          'wendbaarheid': 'f-tekst-wendbaarheid',
          'algemeen':     'f-notities'
        };
        const _parseSNTerm = (tekst, term) => {
          if(!tekst) return '';
          const re = new RegExp('^\\s*' + term + '\\s*:\\s*(.*)', 'mi');
          const m2 = tekst.match(re);
          return (m2 && m2[1]) ? m2[1].trim() : '';
        };
        // Haal snelnotitie op: eerst via spelerKey, dan via concept.opmerkingen
        let _snTekst = '';
        if(Array.isArray(prog.snelnotities)){
          const _sn = prog.snelnotities.find(s => s && s.spelerKey === progSp.id);
          if(_sn && _sn.tekst) _snTekst = _sn.tekst;
        }
        // Fallback: als concept al opmerkingen heeft, gebruik die
        if(!_snTekst && slotConceptHint && slotConceptHint.opmerkingen)
          _snTekst = slotConceptHint.opmerkingen;
        if(_snTekst){
          Object.entries(_snMap).forEach(([term, fid]) => {
            const val = _parseSNTerm(_snTekst, term);
            if(val){
              const el = document.getElementById(fid);
              if(el && !el.value) el.value = val;
            }
          });
        }
      } catch(_snErr){ console.warn('sn-map', _snErr); }
      // ────────────────────────────────────────────────────────────────────

      // Banner met concept-status
      injectScoutingBanner(prog, progSp, matchedPlayer);
      // s35am (#6): voor-rapport (progSp.voor_notities) read-only bovenaan rapport.
      /* s35bg: voor-rapport-block uitgeschakeld (blauw blok ongewenst) */
    } catch(e){ console.error('openScoutingPlayerForm error:', e); }
  }, 80);
}
window.openScoutingPlayerForm = openScoutingPlayerForm;

/* ================================================================
   s102: OBSERVATIE RAPPORT — vereenvoudigd rapport voor opgevallen spelers
   ================================================================ */
const _OBS_TERMS = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
const _OBS_TERM_PH = {techniek:'bv. scherp, snel',inzicht:'bv. leest spel goed',mentaliteit:'bv. werkt hard',explosiviteit:'bv. eerste 5m sterk',sprinten:'bv. topsnelheid hoog',duelleren:'bv. wint 1-op-1',wendbaarheid:'bv. soepel, lichtvoetig',algemeen:'bv. interessante speler'};

function _obsParseTermFromTekst(tekst, term){
  const re = new RegExp('^\\s*' + term + '\\s*:\\s*(.*)', 'mi');
  const m = (tekst||'').match(re);
  return (m && m[1]) ? m[1].trim() : '';
}

function openObservatieForm(prog, sn){
  const bd = document.getElementById('obs-backdrop');
  if(!bd) return;
  // Pre-fill terms from snelnotitie tekst
  const termsEl = document.getElementById('obs-terms');
  if(termsEl){
    termsEl.innerHTML = _OBS_TERMS.map(t => `
      <div class="obs-term-row">
        <span class="obs-term-label">${t}</span>
        <input class="obs-term-in" data-term="${t}" type="text" placeholder="${escapeHtml(_OBS_TERM_PH[t]||'')}" value="${escapeHtml(_obsParseTermFromTekst(sn && sn.tekst, t))}" />
      </div>`).join('');
  }
  // Pre-fill player info from snelnotitie
  const setV = (id, v) => { const el = document.getElementById(id); if(el && v) el.value = v; else if(el) el.value = ''; };
  setV('obs-naam', sn && (sn.naam||''));
  setV('obs-rug', sn && (sn.rugnummer||''));
  setV('obs-omschrijving', '');
  setV('obs-positie', sn && (sn.positie||''));
  setV('obs-club', sn && (sn.club || (prog && (prog.uit||prog.thuis)||'')));
  // elftal: uit snelnotitie, anders uit programma
  const _obsElftal = (sn && sn.elftal) || (prog && ((prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim())) || '';
  setV('obs-elftal', _obsElftal);
  // Hersluit knoppen bij elke open (voorkomt z-index/focus problemen)
  const _obsCloseEl = document.getElementById('obs-modal-close');
  const _obsCancelEl = document.getElementById('obs-cancel');
  if(_obsCloseEl) _obsCloseEl.onclick = _obsClose;
  if(_obsCancelEl) _obsCancelEl.onclick = _obsClose;
  setV('obs-niveau', '');
  setV('obs-advies', '');
  // Wire club autocomplete
  const clubIn = document.getElementById('obs-club');
  if(clubIn && typeof shWireClubAC === 'function' && !clubIn._obsAcWired){
    clubIn._obsAcWired = true;
    shWireClubAC(clubIn);
  }
  const elftIn = document.getElementById('obs-elftal');
  if(elftIn && typeof shWireLeeftijdAC === 'function' && !elftIn._obsAcWired){
    elftIn._obsAcWired = true;
    shWireLeeftijdAC(elftIn);
  }
  // Wedstrijd context
  const ctxEl = document.getElementById('obs-wedstrijd-ctx');
  if(ctxEl && prog){
    ctxEl.style.display = '';
    ctxEl.innerHTML = `<div class="obs-wstr-info"><span>${escapeHtml(prog.datum||'')} · ${escapeHtml(prog.thuis||'?')} vs ${escapeHtml(prog.uit||'?')}${prog.leeftijd?' · '+escapeHtml(prog.leeftijd):''}</span></div>`;
  }
  // Sub-title
  const sub = document.getElementById('obs-modal-sub');
  if(sub) sub.textContent = prog ? `${prog.thuis||''} vs ${prog.uit||''} — ${prog.datum||''}` : 'Opgevallen speler';
  // Store context for submit
  bd._obsContext = { prog, sn };

  // Auto-save naar obs-draft snelnotitie als dit een draft is (heropenbaar tijdens wedstrijd)
  const _isObsDraft = sn && sn.obs_draft === true && prog;
  if(_isObsDraft){
    const _obsAutoSave = () => {
      try {
        const _d = (prog.snelnotities||[]).find(s => s && s.id === sn.id);
        if(!_d) return;
        _d.naam = (document.getElementById('obs-naam')?.value||'').trim();
        const _termIns2 = Array.from(document.querySelectorAll('.obs-term-in'));
        const _tekst2 = (window._OBS_TERMS||[]).map(t => { const el = _termIns2.find(x => x.dataset.term === t); return t + ':' + (el && el.value.trim() ? ' ' + el.value.trim() : ''); }).join('\n');
        _d.tekst = _tekst2;
        _d.club   = (document.getElementById('obs-club')?.value||'').trim();
        _d.positie= (document.getElementById('obs-positie')?.value||'').trim();
        _d.elftal = (document.getElementById('obs-elftal')?.value||'').trim();
        _d.rugnummer = (document.getElementById('obs-rug')?.value||'').trim();
        _d.modified = Date.now();
        if(typeof saveProgrammaItem === 'function') saveProgrammaItem(prog).catch(()=>{});
      } catch(_){}
    };
    // Wire auto-save op alle invoervelden (debounced 800ms)
    let _obsAsTm;
    const _obsInputs = document.querySelectorAll('#obs-form input, #obs-form select, #obs-form textarea');
    _obsInputs.forEach(el => {
      el.removeEventListener('input', el._obsAutoSaveHandler||null);
      el._obsAutoSaveHandler = () => { clearTimeout(_obsAsTm); _obsAsTm = setTimeout(_obsAutoSave, 800); };
      el.addEventListener('input', el._obsAutoSaveHandler);
    });
  }

  bd.style.display = 'flex';
  setTimeout(() => { const n = document.getElementById('obs-naam'); if(n) n.focus(); }, 80);
}
window.openObservatieForm = openObservatieForm;

function _obsClose(){
  const bd = document.getElementById('obs-backdrop');
  if(bd) bd.style.display = 'none';
}

async function _obsSubmit(e){
  if(e) e.preventDefault();
  const btn = document.getElementById('obs-submit');
  if(btn){ btn.disabled = true; btn.textContent = 'Opslaan...'; }
  try {
    const bd = document.getElementById('obs-backdrop');
    const ctx = bd && bd._obsContext ? bd._obsContext : {};
    const prog = ctx.prog;
    const sn = ctx.sn;
    const naam = (document.getElementById('obs-naam')?.value||'').trim();
    const omschrijving = (document.getElementById('obs-omschrijving')?.value||'').trim();
    const rug = (document.getElementById('obs-rug')?.value||'').trim();
    const positie = (document.getElementById('obs-positie')?.value||'').trim();
    const elftal = (document.getElementById('obs-elftal')?.value||'').trim();
    const club = (document.getElementById('obs-club')?.value||'').trim();
    const niveau = document.getElementById('obs-niveau')?.value||'';
    const advies = document.getElementById('obs-advies')?.value||'';
    // Compose tekst from term inputs
    const termIns = Array.from(document.querySelectorAll('.obs-term-in'));
    const tekst = _OBS_TERMS.map(t => { const el = termIns.find(x => x.dataset.term === t); return t + ':' + (el && el.value.trim() ? ' ' + el.value.trim() : ''); }).join('\n');
    // Split naam into voornaam/achternaam
    let voornaam = '', achternaam = '';
    if(naam){
      const parts = naam.split(/\s+/);
      voornaam = parts[0] || '';
      achternaam = parts.slice(1).join(' ');
    }
    const displayNaam = naam || omschrijving || 'Onbekende speler';
    const rec = {
      id: 'obs_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      naam: displayNaam,
      voornaam, achternaam,
      naam_onbekend: !naam,
      omschrijving: naam ? '' : omschrijving,
      club, positie, elftal,
      rugnummer: rug,
      notities: tekst,
      huidig_niveau: niveau,
      potentieel_niveau: '',
      advies: advies,
      rapport_type: 'observatie',
      concept: false,
      status: 'observatie',
      is_opvallend: sn && sn.is_opvallend ? true : false,
      wedstrijd_datum: prog && prog.datum ? prog.datum : '',
      wedstrijd_thuis: prog && prog.thuis ? prog.thuis : '',
      wedstrijd_uit: prog && prog.uit ? prog.uit : '',
      wedstrijd_leeftijd: prog && prog.leeftijd ? prog.leeftijd : '',
      created: Date.now(),
      modified: Date.now(),
      scout: (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.displayName || currentUser.email || '') : '',
    };
    if(typeof savePlayer === 'function') await savePlayer(rec);
    // Verwijder/markeer obs-draft als ingediend in prog.snelnotities
    const _ctx4 = bd && bd._obsContext;
    if(_ctx4 && _ctx4.prog && _ctx4.sn && _ctx4.sn.obs_draft){
      const _prog4 = _ctx4.prog;
      const _sn4   = _ctx4.sn;
      const idx4   = (_prog4.snelnotities||[]).findIndex(s => s && s.id === _sn4.id);
      if(idx4 >= 0){
        _prog4.snelnotities[idx4].obs_draft = false;
        _prog4.snelnotities[idx4].ingediend = true;
        _prog4.snelnotities[idx4].player_id = rec.id;
        _prog4.modified = Date.now();
        if(typeof saveProgrammaItem === 'function') saveProgrammaItem(_prog4).catch(()=>{});
      }
    }
    _obsClose();
    if(typeof toast === 'function') toast('Observatie opgeslagen ✓');
    // Herlaad enkel het dashboard als we in de dashboard-view zitten
    if(typeof renderDashboardAgenda === 'function') setTimeout(renderDashboardAgenda, 250);
  } catch(err){
    console.error('obs submit error', err);
    if(typeof toast === 'function') toast('Fout bij opslaan', true);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = 'Opslaan als observatie'; }
  }
}

// Wire observatie modal buttons (one-time)
(function _wireObsModal(){
  document.addEventListener('DOMContentLoaded', () => {
    const close = document.getElementById('obs-modal-close');
    const cancel = document.getElementById('obs-cancel');
    const form = document.getElementById('obs-form');
    const bd = document.getElementById('obs-backdrop');
    if(close) close.addEventListener('click', _obsClose);
    if(cancel) cancel.addEventListener('click', _obsClose);
    if(bd) bd.addEventListener('click', e => { if(e.target === bd) _obsClose(); });
    if(form) form.addEventListener('submit', _obsSubmit);
  });
})();

// ── Observatie AI aanvullen ──────────────────────────────────────────────────
(function _wireObsAI(){
  function bindAI(){
    const btn = document.getElementById('obs-ai-btn');
    if(!btn || btn._aiWired) return;
    btn._aiWired = true;
    btn.addEventListener('click', async () => {
      const hint = document.getElementById('obs-ai-hint');
      const naam = (document.getElementById('obs-naam')?.value || '').trim();
      const omschr = (document.getElementById('obs-omschrijving')?.value || '').trim();
      const club = (document.getElementById('obs-club')?.value || '').trim();
      const positie = (document.getElementById('obs-positie')?.value || '').trim();
      const rug = (document.getElementById('obs-rug')?.value || '').trim();
      // Collect already-filled terms
      const _OBS_TERMS_LIST = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
      const filled = {};
      _OBS_TERMS_LIST.forEach(t => {
        const el = document.getElementById('obs-term-' + t);
        if(el && el.value.trim()) filled[t] = el.value.trim();
      });
      const filledCount = Object.keys(filled).length;
      const missing = _OBS_TERMS_LIST.filter(t => !filled[t]);
      if(!missing.length){ if(hint) hint.textContent = 'Alle termen zijn al ingevuld.'; return; }

      btn.disabled = true;
      btn.textContent = '⏳ Bezig...';
      if(hint) hint.textContent = '';

      const prompt = `Je bent een voetbalscout-assistent. Geef korte, bondige Nederlandse scouting-aantekeningen (1-2 zinnen per term) voor de volgende speler.

Speler: ${naam || omschr || 'Naam onbekend'}${rug ? ` (nr ${rug})` : ''}
Club: ${club || 'Onbekend'}
Positie: ${positie || 'Onbekend'}
${filledCount > 0 ? 'Al ingevuld:\n' + Object.entries(filled).map(([k,v])=>`- ${k}: ${v}`).join('\n') : ''}

Geef suggesties voor de volgende termen (alleen de ontbrekende): ${missing.join(', ')}

Geef je antwoord als JSON object met alleen de ontbrekende termen als keys, bijv:
{"techniek": "...", "inzicht": "..."}

Gebruik ALLEEN de volgende keys: ${missing.join(', ')}
Houd elke waarde onder 120 tekens.`;

      try {
        const raw = await callGemini(prompt, { temperature: 0.4, maxTokens: 600 });
        // Parse JSON from response (may have markdown code blocks)
        const jsonStr = raw.replace(/```json|```/g,'').trim();
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        if(start < 0 || end < 0) throw new Error('Geen JSON in antwoord');
        const obj = JSON.parse(jsonStr.slice(start, end+1));
        let filled_count = 0;
        missing.forEach(t => {
          if(obj[t]){
            const el = document.getElementById('obs-term-' + t);
            if(el && !el.value.trim()){ el.value = obj[t]; filled_count++; }
          }
        });
        if(hint) hint.textContent = `✓ ${filled_count} term${filled_count===1?'':'s'} aangevuld`;
      } catch(err){
        if(hint) hint.textContent = '⚠ AI niet beschikbaar';
        console.warn('Gemini obs error:', err);
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ AI aanvullen';
      }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindAI);
  else bindAI();
})();

// s35ca-1: injectVoorRapportBlock verwijderd — voor-rapport UI uitgeschakeld

function injectScoutingBanner(prog, progSp, matchedPlayer){
  let banner = document.getElementById('scouting-active-banner');
  if(banner) banner.remove();
  banner = document.createElement('div');
  banner.id = 'scouting-active-banner';
  banner.style.cssText = 'background:rgba(239,68,68,0.10); border:1px solid rgba(239,68,68,0.4); border-radius:10px; padding:12px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;';
  const naam = progSp.naam || [progSp.voornaam, progSp.achternaam].filter(Boolean).join(' ') || 'speler';
  const teams = `${prog.thuis||'?'} — ${prog.uit||'?'}`;
  // s36c: ALTIJD de spelersdatabase checken — niet alleen vertrouwen op de
  // vooraf doorgegeven match (bug: bekende speler toonde "eerste rapport").
  let _mp = matchedPlayer;
  if(!_mp && progSp){
    let _vn = progSp.voornaam || '', _an = progSp.achternaam || '';
    if((!_vn || !_an) && progSp.naam && typeof splitNaam === 'function'){
      const _s = splitNaam(progSp.naam);
      if(!_vn) _vn = _s.voornaam;
      if(!_an) _an = _s.achternaam;
    }
    try {
      const _m = findExistingPlayer(_vn, _an, progSp.geboorte || '');
      if(_m && _m.player) _mp = _m.player;
    } catch(_){}
  }
  let _nReports = 0;
  if(_mp){ try { _nReports = (reportsForPlayer(_mp.id) || []).length; } catch(_){} }
  const _nthTxt = 'dit wordt rapport #' + (_nReports + 1) + (_nReports > 0 ? ' (' + _nReports + ' eerder)' : '');
  // s35w: duidelijk maken dat het ALTIJD een nieuw rapport is
  const link = _mp
    ? `<span style="color:#34d399;">● bekende speler — ${_nthTxt}</span>`
    : `<span style="color:#f5c518;">● nieuwe speler — eerste rapport voor deze speler</span>`;
  // s35x: history-knop bij matched speler
  const histBtn = _mp
    ? `<button type="button" class="scouting-history-btn" id="scouting-history-open">📋 Eerdere rapporten</button>`
    : '';
  banner.innerHTML = `
    <div style="font-size:13px; line-height:1.4; display:flex; flex-direction:column; gap:6px;">
      <div><strong style="color:#ef4444;">● Live wedstrijd-modus</strong> — ${escapeHtml(naam)} bij ${escapeHtml(teams)}</div>
      <div style="font-size:11.5px; color:var(--text-3);">${link}</div>
      ${histBtn}
    </div>
    <button type="button" class="btn" id="scouting-back-dash">Terug naar dashboard</button>
  `;
  const form = document.getElementById('view-report');
  if(form) form.insertBefore(banner, form.firstChild.nextSibling);
  const backBtn = document.getElementById('scouting-back-dash');
  if(backBtn) backBtn.addEventListener('click', () => {
    banner.remove();
    if(typeof go === 'function') go('dashboard');
  });
  // s35x: history-knop opent speler-detail van gekoppelde speler
  if(_mp){
    const hb = document.getElementById('scouting-history-open');
    if(hb) hb.addEventListener('click', () => {
      if(typeof openDetail === 'function') openDetail(_mp.id);
    });
  }
}

function renderActiveScouting(){
  const wrap = document.getElementById('scouting-active-wrap');
  if(!wrap) return;
  // s35bb: skip rerender als gebruiker actief in een snel-notitie-form aan het typen is
  // (anders gooit elke autosave de open form weg en verdwijnt het keyboard)
  try {
    const openForm = wrap.querySelector('.sa-snel-form[style*="display: block"], .sa-snel-form[style*="display:block"]');
    if(openForm){
      const act = document.activeElement;
      if(act && openForm.contains(act)){
        return; // bewaar de form-state
      }
    }
  } catch(_){}
  if(typeof programmaCache === 'undefined' || !Array.isArray(programmaCache) || programmaCache.length === 0){
    wrap.style.display = 'none'; wrap.innerHTML = ''; return;
  }
  const now = new Date();
  const active = programmaCache
    .filter(p => p && p.datum && p.tijd && isMatchInWindow(p, now))
    .sort((a,b) => (a.tijd||'99:99').localeCompare(b.tijd||'99:99'));
  if(active.length === 0){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

  // Auto-create match_reports (fire and forget — UI updateet via onSnapshot)
  active.forEach(prog => { ensureActiveMatchReport(prog); });

  const cards = active.map(prog => {
    const w = getMatchWindow(prog);
    const kickT  = w ? w.kick.getTime() : null;
    const matchDur = w ? getMatchDurationMin(
      (prog.leeftijd && String(prog.leeftijd).trim())
      || (prog.thuis_elftal && String(prog.thuis_elftal).trim())
      || (prog.uit_elftal  && String(prog.uit_elftal).trim())  || ''
    ) : 120;
    const endT   = kickT ? kickT + matchDur * 60000 : null;
    // Vier fases: voorbereiding → live → afgelopen → afgesloten (kaart weg)
    let status = 'live', statusLabel = '● Live';
    if(kickT && now.getTime() < kickT){
      // Fase 1: voorbereiding (pre-window, max 5 min voor aftrap)
      status = 'warmup';
      const min = Math.round((kickT - now.getTime()) / 60000);
      statusLabel = '⏱ Voorbereiding — aftrap over ' + min + ' min';
    } else if(endT && now.getTime() > endT){
      // Fase 3: afgelopen (post-window, max 15 min na einde)
      status = 'ended';
      const min = Math.round((now.getTime() - endT) / 60000);
      statusLabel = '✓ Afgelopen — ' + min + ' min geleden gestopt';
    } else if(kickT){
      // Fase 2: live (aftrap t/m einde speeltijd)
      // s82: 1e helft / rust / 2e helft op basis van leeftijdscategorie
      const minElapsed = Math.round((now.getTime() - kickT) / 60000);
      const halfDur    = Math.round(matchDur / 2);
      const breakEst   = 10; // geschatte rustduur in minuten
      if(minElapsed < halfDur){
        statusLabel = '● 1e helft — ' + minElapsed + "'";
      } else if(minElapsed < halfDur + breakEst){
        statusLabel = '⏸ Rust';
      } else {
        const m2 = Math.max(1, minElapsed - halfDur - breakEst);
        statusLabel = '● 2e helft — ' + m2 + "'";
      }
    }
    // s35bd: titel-format 'Club Elftal — Club Elftal'
    const teams = `${escapeHtml(prog.thuis||'?')}${prog.thuis_elftal?' '+escapeHtml(prog.thuis_elftal):''} — ${escapeHtml(prog.uit||'?')}${prog.uit_elftal?' '+escapeHtml(prog.uit_elftal):''}`;
    const metaParts = [];
    if(prog.tijd) metaParts.push('<b>Aftrap</b> ' + escapeHtml(prog.tijd));
    if(prog.leeftijd) metaParts.push('<b>Elftal</b> ' + escapeHtml(prog.leeftijd));
    if(prog.methode) metaParts.push(escapeHtml(prog.methode));
    if(prog.locatie) metaParts.push('📍 ' + escapeHtml(prog.locatie));
    const spelers = Array.isArray(prog.spelers) ? prog.spelers : [];
    let tilesHtml = '';
    if(spelers.length === 0){
      tilesHtml = '<div class="sa-empty-players">Nog geen spelers gepland voor deze wedstrijd.</div>';
    } else {
      tilesHtml = spelers.map((sp, i) => {
        const { player, mode } = findPlayerMatch(sp);
        // s35x: detecteer slot-concept voor deze tile
        const concept = (typeof findSlotConcept === 'function')
          ? findSlotConcept(prog.id, sp.id) : null;
        let cls;
        if(concept) cls = 'sa-tile concept';
        else if(player) cls = 'sa-tile linked';
        else cls = 'sa-tile draft';
        const naam = sp.naam || [sp.voornaam, sp.achternaam].filter(Boolean).join(' ') || '(geen naam)';
        const meta = [
          sp.rugnummer ? '#' + sp.rugnummer : '',
          sp.positie || '',
          sp.club || ''
        ].filter(Boolean).join(' · ');
        const conceptTag = concept ? `<div class="sa-tile-concept-tag">concept</div>` : '';
        // s83: zoek bestaande snelnotitie voor inline panel
        const existingSn = (prog.snelnotities || []).find(s => s && s.spelerKey === sp.id);
        const snelTekst  = existingSn ? (existingSn.tekst || '') : '';
        const isOpvallend = existingSn ? !!existingSn.is_opvallend : false;
        const matchedId = player ? player.id : '';
        // s92: inline panel — structured 8-field form (same terms as sa-snel-form)
        const _TILE_TERMS = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
        const _TILE_TERM_PH = {techniek:'bv. scherp, snel',inzicht:'bv. leest spel goed',mentaliteit:'bv. werkt hard, leidt',explosiviteit:'bv. eerste 5m sterk',sprinten:'bv. topsnelheid hoog',duelleren:'bv. wint 1-op-1',wendbaarheid:'bv. soepel, lichtvoetig',algemeen:'bv. interessante speler'};
        const _parseTileTerm = (tekst, term) => {
          const re = new RegExp('^\\s*' + term + '\\s*:\\s*(.*)$', 'mi');
          const m = tekst.match(re);
          if(!m || !m[1]) return '';
          const v = m[1].trim();
          if(_TILE_TERMS.indexOf(v.toLowerCase().replace(/:\s*$/, '')) >= 0) return '';
          return v;
        };
        const panelHtml = `
          <div class="sa-tile-terms">
            ${_TILE_TERMS.map(t => `<div class="sa-snel-term-row"><span class="sa-snel-term-label">${t}</span><input class="sa-tile-term-in" data-term="${t}" type="text" placeholder="${escapeHtml(_TILE_TERM_PH[t]||'')}" value="${escapeHtml(_parseTileTerm(snelTekst, t))}" /></div>`).join('')}
          </div>
          <div class="sa-tile-save-status"></div>
          <div class="sa-tile-acts-row">
            <button type="button" class="sa-tile-opvallend-btn${isOpvallend ? ' is-opvallend' : ''}" data-tile-act="toggle-opvallend">
              ${isOpvallend ? '⭐ Opgevallen' : '☆ Opvallend'}
            </button>
            ${matchedId ? `<button type="button" class="sa-tile-prof-btn" data-tile-act="open-player" data-player-id="${escapeHtml(matchedId)}">Profiel</button>` : ''}
          </div>`;
        return `<div class="${cls}${isOpvallend ? ' tile-opvallend' : ''}" data-prog-id="${escapeHtml(prog.id)}" data-sp-idx="${i}" data-player-id="${matchedId ? escapeHtml(matchedId) : ''}" title="Klik om uit te klappen">
          <button type="button" class="sa-tile-close" data-tile-act="close" aria-label="Sluiten" style="display:none">×</button>
          <div class="sa-tile-name">${escapeHtml(naam)}${isOpvallend ? '<span class="sa-tile-star" aria-hidden="true">⭐</span>' : ''}</div>
          ${meta ? `<div class="sa-tile-meta">${escapeHtml(meta)}</div>` : ''}
          ${conceptTag}
          <div class="sa-tile-panel">
            ${panelHtml}
          </div>
        </div>`;
      }).join('');
    }
    return `
      <div class="sa-card is-live-card" data-prog-id="${escapeHtml(prog.id)}">
        <div class="sa-header" data-sa-collapse="1">
          <div style="flex:1; min-width:0;">
            <div class="sa-title"><span class="sa-pulse"></span> Bezig met scouten — ${teams}</div>
            <div class="sa-meta">${metaParts.join('<span style=\"opacity:.3\">|</span>')}</div>
          </div>
          <div class="sa-header-right">
            <div class="sa-status ${status}">${statusLabel}</div>
            <div class="sa-header-acts">
              <button class="sa-live-btn sa-live-btn-obs sa-trigger-obs" data-sa-act="add-observatie" data-progid="${escapeHtml(prog.id)}" title="Opvallende speler noteren">
                <span class="sa-live-btn-icon">👁</span><span class="sa-live-btn-label">Opgevallen speler</span>
              </button>
              <button class="sa-live-btn sa-live-btn-wstr sa-trigger-wstr" data-sa-act="add-snel-wstr" data-progid="${escapeHtml(prog.id)}" title="Wedstrijdnotitie toevoegen">
                <span class="sa-live-btn-icon">📋</span><span class="sa-live-btn-label">Wedstrijdnotitie</span>
              </button>
            </div>
          </div>
          <span class="sa-collapse-chev" aria-hidden="true">&#9662;</span>
        </div>
        <div class="sa-players-title">Spelers (${spelers.length})</div>
        <div class="sa-tiles">${tilesHtml}</div>
        <div class="sa-snel-form" data-progid="${escapeHtml(prog.id)}" style="display:none;">
          <!-- s35bg: heading werkt als sluit-knop -->
          <div class="sa-snel-form-header">
            <div class="sa-snel-close-head" data-progid="${escapeHtml(prog.id)}" title="Klik om te sluiten">Spelersnotitie &times;</div>
            <div class="sa-snel-status" data-progid="${escapeHtml(prog.id)}">&nbsp;</div>
          </div>
          <div class="sa-snel-form-body">
          <div class="sa-snel-field-row">
            <input class="sa-snel-naam" type="text" placeholder="Naam speler" />
            <input class="sa-snel-rug" type="text" placeholder="#nr" />
          </div>
          <div>
            <select class="sa-snel-positie">
              <option value="">Positie (optioneel)</option>
              <option value="GK">GK — Keeper</option>
              <option value="LB">LB — Linksback</option>
              <option value="LCV">LCV — Linker centrale verdediger</option>
              <option value="CV">CV — Centrale verdediger</option>
              <option value="RCV">RCV — Rechter centrale verdediger</option>
              <option value="RB">RB — Rechtsback</option>
              <option value="VM">VM — Verdedigende middenvelder</option>
              <option value="CM">CM — Centrale middenvelder</option>
              <option value="AM">AM — Aanvallende middenvelder</option>
              <option value="LM">LM — Linker middenvelder</option>
              <option value="RM">RM — Rechter middenvelder</option>
              <option value="LV">LV — Linksbuiten</option>
              <option value="CS">CS — Centrumspits</option>
              <option value="RV">RV — Rechtsbuiten</option>
            </select>
          </div>
          <!-- s35be: structured snel-notitie — 8 vaste termen, labels staan vast -->
          <div class="sa-snel-terms">
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">techniek</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="techniek" type="text" placeholder="bv. scherp, snel" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">inzicht</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="inzicht" type="text" placeholder="bv. leest spel goed" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">mentaliteit</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="mentaliteit" type="text" placeholder="bv. werkt hard, leidt" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">explosiviteit</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="explosiviteit" type="text" placeholder="bv. eerste 5m sterk" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">sprinten</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="sprinten" type="text" placeholder="bv. topsnelheid hoog" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">duelleren</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="duelleren" type="text" placeholder="bv. wint 1-op-1" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">wendbaarheid</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="wendbaarheid" type="text" placeholder="bv. soepel, lichtvoetig" /></div>
            <div class="sa-snel-term-row"><span class="sa-snel-term-label">algemeen</span><span class="sa-snel-term-chev">&rsaquo;</span><input class="sa-snel-term-input" data-term="algemeen" type="text" placeholder="bv. interessante speler" /></div>
          </div>
          <!-- hidden tekst-store voor backwards compat met handler/exports -->
          <textarea class="sa-snel-tekst" style="display:none;" aria-hidden="true"></textarea>
          </div><!-- /sa-snel-form-body -->
        </div>
        ${(prog.wedstrijdnotities && prog.wedstrijdnotities.length) ? `
        <div class="sa-wstrnotities-wrap" style="margin-top:10px; border-top:1px solid var(--border,#2a2f3a); padding-top:8px;">
          <div class="sa-wstr-toggle-row" data-sa-act="toggle-wstr" data-progid="${escapeHtml(prog.id)}" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; padding:4px 0;">
            <span style="font-size:11px; color:var(--muted,#9aa3b7); text-transform:uppercase; letter-spacing:.6px; font-weight:600;">Wedstrijdnotities (${prog.wedstrijdnotities.length})</span>
            <span class="sa-wstr-chev" style="color:var(--muted,#9aa3b7); font-size:12px; transition:transform .2s;">&#9656;</span>
          </div>
          <div class="sa-wstrnotities" data-progid="${escapeHtml(prog.id)}" style="display:none; margin-top:6px;">
            ${prog.wedstrijdnotities.map((wn, idx) => `
            <div class="sa-wstrnotitie-row" data-sa-act="edit-snel-wstr" data-progid="${escapeHtml(prog.id)}" data-wnidx="${idx}" style="background:rgba(255,107,107,0.06); border:1px solid rgba(255,107,107,0.20); border-radius:8px; padding:8px 10px; margin-bottom:6px; font-size:12.5px; display:flex; justify-content:space-between; align-items:flex-start; gap:8px; cursor:pointer;" title="Klik om te bewerken">
              <div style="flex:1; min-width:0; display:flex; align-items:flex-start; gap:8px;">
                <span style="color:#ff6b6b; font-size:11px; line-height:1.3; flex-shrink:0;">&#9656;</span>
                <div style="color:var(--text,#e5e9f5); white-space:pre-wrap; overflow:hidden; line-height:1.45; flex:1;">${escapeHtml((wn.tekst||'').slice(0, 140))}${(wn.tekst||'').length > 140 ? '…' : ''}</div>
              </div>
              <button class="btn-ghost" data-sa-act="del-snel-wstr" data-progid="${escapeHtml(prog.id)}" data-wnidx="${idx}" style="padding:3px 8px; font-size:11px; flex-shrink:0;" title="Verwijderen">×</button>
            </div>`).join('')}
          </div>
        </div>` : ''}
        <div class="sa-snel-wstr-form" data-progid="${escapeHtml(prog.id)}" style="display:none;">
          <!-- s35bg: heading werkt als sluit-knop -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:10px;">
            <div class="sa-snel-wstr-close-head" data-progid="${escapeHtml(prog.id)}" style="font-size:11px; color:#ff8189; text-transform:uppercase; letter-spacing:.6px; font-weight:700; cursor:pointer; user-select:none;" title="Klik om te sluiten">+ Wedstrijdrapport — sluiten &times;</div>
            <div class="sa-snel-wstr-status" style="font-size:11px; color:var(--text-3,#8b93a8); font-style:italic;">&nbsp;</div>
          </div>
          <textarea class="sa-snel-wstr-tekst" placeholder="Tactiek, score, weer, opvallende momenten..."></textarea>
          <!-- s35bg: onderaan-instructie weg (heading is nu close-trigger) -->
        </div>
        ${(()=>{
          // s92: toon opgeslagen snelnotities van ongekoppelde spelers
          const _linkedKeys = new Set((prog.spelers||[]).map(s => s && s.id).filter(Boolean));
          const _unsaved = (prog.snelnotities||[]).filter(sn => sn && sn.naam && !_linkedKeys.has(sn.spelerKey));
          if(!_unsaved.length) return '';
          return `<div class="sa-saved-sns" style="margin-top:10px; border-top:1px solid var(--border,#2a2f3a); padding-top:8px;" data-progid="${escapeHtml(prog.id)}">
            <div class="sa-saved-sns-hdr" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; margin-bottom:0;">
              <span style="font-size:10.5px; color:var(--text-3,#8b93a8); text-transform:uppercase; letter-spacing:.6px; font-weight:700;">Opgeslagen notities (${_unsaved.length})</span>
              <span class="sa-saved-sns-chev" style="color:var(--muted,#9aa3b7); font-size:12px; transition:transform .2s;">&#9656;</span>
            </div>
            <div class="sa-saved-sns-body" style="display:none; margin-top:6px;">
            ${_unsaved.map(sn => {
              const _snNaam = escapeHtml(sn.naam||'?') + (sn.rugnummer ? ` <span style="color:var(--text-3)">#${escapeHtml(String(sn.rugnummer))}</span>` : '') + (sn.positie ? ` <span style="color:var(--text-3)">· ${escapeHtml(sn.positie)}</span>` : '');
              const _snTekst = (sn.tekst||'').replace(/^[a-z]+:\s*/gmi, '').replace(/\n+/g,' · ').trim();
              const _EDIT_TERMS = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
              const _parseSNTerm = (tekst, term) => { const re = new RegExp('^\\s*' + term + '\\s*:\\s*(.*)', 'mi'); const mv = tekst.match(re); return (mv && mv[1]) ? mv[1].trim() : ''; };
              const _termFields = _EDIT_TERMS.map(t => `<div class="sa-snel-term-row"><span class="sa-snel-term-label">${t}</span><input class="sn-edit-term-in" data-term="${t}" type="text" value="${escapeHtml(_parseSNTerm(sn.tekst||'', t))}" /></div>`).join('');
              return `<div class="sa-saved-sn-row" data-sn-id="${escapeHtml(sn.id||'')}" data-prog-id="${escapeHtml(prog.id)}" style="background:rgba(245,200,66,0.06); border:1px solid rgba(245,200,66,0.18); border-radius:8px; padding:7px 10px; margin-bottom:5px;">
                <div class="sn-row-header" style="display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer;">
                  <div style="flex:1; min-width:0;">
                    <div style="font-size:12.5px; font-weight:700; color:var(--text-1,#e5e9f5);">${_snNaam}</div>
                    ${_snTekst ? `<div class="sn-row-preview" style="font-size:11.5px; color:var(--text-3,#8b93a8); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(_snTekst.slice(0,80))}</div>` : ''}
                  </div>
                  <span style="font-size:14px; flex-shrink:0;">${sn.is_opvallend ? '⭐' : ''}&#9656;</span>
                </div>
                <div class="sn-row-edit" style="display:none; margin-top:8px;">
                  <div class="sa-tile-terms">${_termFields}</div>
                  <div class="sn-edit-status" style="font-size:10.5px; color:var(--text-3); margin-top:3px; min-height:14px;"></div>
                  <!-- Observatie-knop verwijderd: gebruik Wedstrijden-tab → → Observatie -->
                </div>
              </div>`;
            }).join('')}
            </div>
          </div>`;
        })()}
      </div>`;
  }).join('');

  wrap.innerHTML = cards;
  wrap.style.display = '';

  // ===== s35bl: sa-card inklapbaar op mobiel (header = toggle) =====
  try {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    wrap.querySelectorAll('.sa-card').forEach(card => {
      const progId = card.dataset.progId;
      const stateKey = 'sa_collapsed_' + (progId || 'x');
      // default state: mobiel = collapsed tenzij gebruiker al expliciet open zette
      let collapsed = isMobile;
      try {
        const saved = localStorage.getItem(stateKey);
        if(saved === '1') collapsed = true;
        else if(saved === '0') collapsed = false;
      } catch(_){}
      if(collapsed) card.classList.add('sa-collapsed');
      const hdr = card.querySelector('.sa-header[data-sa-collapse="1"]');
      if(hdr){
        hdr.style.cursor = 'pointer';
        hdr.addEventListener('click', (e) => {
          if(e.target.closest('button, a, input')) return;
          const willCollapse = !card.classList.contains('sa-collapsed');
          card.classList.toggle('sa-collapsed', willCollapse);
          try { localStorage.setItem(stateKey, willCollapse ? '1' : '0'); } catch(_){}
        });
      }
    });
  } catch(e){ console.warn('sa-collapse', e); }

  // s92: opgeslagen notities toggle (collapsible)
  wrap.querySelectorAll('.sa-saved-sns-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const sns = hdr.closest('.sa-saved-sns');
      if(!sns) return;
      const body = sns.querySelector('.sa-saved-sns-body');
      const chev = sns.querySelector('.sa-saved-sns-chev');
      const isOpen = body && body.style.display !== 'none';
      if(body) body.style.display = isOpen ? 'none' : '';
      if(chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : '';
      sns.classList.toggle('sn-collapsed', isOpen);
    });
  });

  // s101: opgeslagen notitie inline bewerken
  wrap.querySelectorAll('.sa-saved-sn-row').forEach(row => {
    const hdr = row.querySelector('.sn-row-header');
    const editDiv = row.querySelector('.sn-row-edit');
    const preview = row.querySelector('.sn-row-preview');
    if(!hdr || !editDiv) return;
    hdr.addEventListener('click', () => {
      const isOpen = editDiv.style.display !== 'none';
      editDiv.style.display = isOpen ? 'none' : '';
      hdr.querySelector('span:last-child').innerHTML = isOpen ? (row.dataset.opvallend === '1' ? '⭐' : '') + '&#9656;' : (row.dataset.opvallend === '1' ? '⭐' : '') + '&#9660;';
      if(!isOpen && !editDiv._wired){
        editDiv._wired = true;
        const snId = row.dataset.snId;
        const progId = row.dataset.progId;
        const termIns = Array.from(editDiv.querySelectorAll('.sn-edit-term-in'));
        const statusEl = editDiv.querySelector('.sn-edit-status');
        const _TERMS_EDIT = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
        const composeTekst = () => _TERMS_EDIT.map(t => { const el = termIns.find(x => x.dataset.term === t); return t + ':' + (el && el.value.trim() ? ' ' + el.value.trim() : ''); }).join('\n');
        let saveTm;
        const doSave = async () => {
          try {
            const prog = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
            if(!prog) return;
            const sns = prog.snelnotities || [];
            const idx = sns.findIndex(s => s && s.id === snId);
            if(idx < 0) return;
            const newTekst = composeTekst();
            sns[idx] = { ...sns[idx], tekst: newTekst, modified: Date.now() };
            prog.snelnotities = sns;
            if(typeof saveProgramma === 'function') await saveProgramma(prog);
            if(statusEl){ statusEl.textContent = 'opgeslagen'; setTimeout(() => { if(statusEl) statusEl.textContent = ''; }, 1500); }
            // Update preview
            const newPrev = newTekst.replace(/^[a-z]+:\s*/gmi,'').replace(/\n+/g,' · ').trim();
            if(preview) preview.textContent = newPrev.slice(0,80);
          } catch(e){ if(statusEl) statusEl.textContent = 'fout bij opslaan'; }
        };
        termIns.forEach(el => {
          el.addEventListener('input', () => { clearTimeout(saveTm); saveTm = setTimeout(doSave, 900); });
        });
        editDiv.addEventListener('focusout', (ev) => {
          if(!ev.relatedTarget) return; // klik op label/span — niet sluiten
          if(!editDiv.contains(ev.relatedTarget)){ clearTimeout(saveTm); doSave(); }
        });
        // s102: → Observatie knop
        const obsBtn = editDiv.querySelector('[data-sn-obs]');
        if(obsBtn){
          obsBtn.addEventListener('click', () => {
            clearTimeout(saveTm);
            doSave();
            const prog2 = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
            const sn2 = prog2 && prog2.snelnotities ? prog2.snelnotities.find(s => s && s.id === snId) : null;
            if(typeof openObservatieForm === 'function') openObservatieForm(prog2, sn2 || { id: snId, tekst: composeTekst() });
          });
        }
        setTimeout(() => { if(termIns[0]) termIns[0].focus(); }, 50);
      }
    });
  });

  // s35ap (#2): tile-klik -> inline uitklappen (toont voor-rapport + acties)
  function __saOpenReport(tile){
    const progId = tile.dataset.progId;
    const spIdx = parseInt(tile.dataset.spIdx, 10);
    const playerId = tile.dataset.playerId;
    const prog = programmaCache.find(p => p.id === progId);
    if(!prog) return;
    const sp = (prog.spelers||[])[spIdx];
    if(!sp) return;
    let matched = null;
    if(playerId){
      const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
      matched = players.find(p => p.id === playerId) || null;
    }
    const slotConcept = (typeof findSlotConcept === 'function')
      ? findSlotConcept(prog.id, sp.id) : null;
    openScoutingPlayerForm(prog, sp, matched, slotConcept);
  }
  // s35dg Fase C+D: open snel-notitie voor deze tile-speler
  // s35dg-hotfix4: één notitie per speler (spelerKey), volledige form-reset bij open,
  // bestaande notitie via __shFillFromSn herladen ipv nieuwe maken.
  function __saOpenSnelForPlayer(tile){
    const progId = tile.dataset.progId;
    const spIdx = parseInt(tile.dataset.spIdx, 10);
    const prog = programmaCache.find(p => p.id === progId);
    if(!prog) return;
    const sp = (prog.spelers||[])[spIdx];
    if(!sp) return;
    const card = tile.closest('.sa-card');
    if(!card) return;
    const form = card.querySelector(`.sa-snel-form[data-progid="${progId}"]`);
    if(!form) return;
    // Trigger open via bestaande handler (zet wiring + click-outside)
    const trigger = card.querySelector(`.sa-trigger-snel[data-progid="${progId}"]`);
    if(trigger) trigger.click();
    // Pre-fill / herladen na een tick zodat handler form heeft geopend
    setTimeout(() => {
      try {
        const naamIn = form.querySelector('.sa-snel-naam');
        const rugIn  = form.querySelector('.sa-snel-rug');
        const posIn  = form.querySelector('.sa-snel-positie');
        const termIns = form.querySelectorAll('.sa-snel-term-input');
        const txtIn  = form.querySelector('.sa-snel-tekst');
        // ALTIJD eerst volledig leegmaken — voorkomt dat regels van een vorige speler blijven staan
        if(naamIn) naamIn.value = '';
        if(rugIn)  rugIn.value  = '';
        if(posIn)  posIn.value  = '';
        termIns.forEach(el => { el.value = ''; });
        // savedSnId resetten via __shReset state mag NIET (die triggert autosave) —
        // ipv reset gebruiken we __shFillFromSn met een leeg of bestaand record.
        // Markeer de form met de speler-id zodat save logic spelerKey kan zetten
        form.dataset.spelerKey = sp.id || '';
        // Zoek bestaande snel-notitie voor deze speler
        const existing = (prog.snelnotities || []).find(s => s && s.spelerKey === sp.id);
        if(existing && typeof form.__shFillFromSn === 'function'){
          form.__shFillFromSn(existing);
        } else {
          // Geen bestaande notitie — fill alleen naam/rug/pos vanuit speler-data
          const naam = sp.naam || [sp.voornaam, sp.achternaam].filter(Boolean).join(' ') || '';
          if(naamIn) naamIn.value = naam;
          if(rugIn && sp.rugnummer) rugIn.value = sp.rugnummer;
          if(posIn && sp.positie)   posIn.value = sp.positie;
          // Reset savedSnId zodat nieuwe save een nieuw record maakt met spelerKey
          if(typeof form.__shSetSavedSnId === 'function') form.__shSetSavedSnId(null);
          // Trigger input event zodat auto-save de prefill oppikt
          if(naamIn && naam) naamIn.dispatchEvent(new Event('input', {bubbles:true}));
        }
        // Focus op eerste term-input
        const firstTerm = form.querySelector('.sa-snel-term-input');
        if(firstTerm) firstTerm.focus();
        try { form.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_){}
      } catch(_){}
    }, 60);
  }
  wrap.querySelectorAll('.sa-tile').forEach(tile => {
    tile.addEventListener('click', (e) => {
      // klik op actie-knop binnen panel
      const actBtn = e.target.closest('[data-tile-act]');
      if(actBtn){
        e.stopPropagation();
        const act = actBtn.dataset.tileAct;
        if(act === 'close'){
          tile.classList.remove('open');
          const x = tile.querySelector('.sa-tile-close');
          if(x) x.style.display = 'none';
          return;
        }
        if(act === 'open-report'){
          __saOpenReport(tile);
          return;
        }
        if(act === 'new-snel-notitie'){
          __saOpenSnelForPlayer(tile);
          return;
        }
        if(act === 'open-player'){
          const pid = actBtn.dataset.playerId;
          if(pid && typeof openDetail === 'function') openDetail(pid);
          return;
        }
        // s83: toggle-opvallend — sla is_opvallend flag op in snelnotitie
        if(act === 'toggle-opvallend'){
          const progId2 = tile.dataset.progId;
          const spIdx2  = parseInt(tile.dataset.spIdx, 10);
          const prog2   = programmaCache.find(p => p.id === progId2);
          if(!prog2) return;
          const sp2 = (prog2.spelers||[])[spIdx2];
          if(!sp2) return;
          if(!Array.isArray(prog2.snelnotities)) prog2.snelnotities = [];
          let sn2 = prog2.snelnotities.find(s => s && s.spelerKey === sp2.id);
          if(!sn2){
            const _ta2terms = Array.from(tile.querySelectorAll('.sa-tile-term-in'));
            const _TTMS = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
            const _ta2tekst = _TTMS.map(t => { const el = _ta2terms.find(x => x.dataset.term === t); return t + ':' + (el && el.value.trim() ? ' ' + el.value.trim() : ''); }).join('\n');
            sn2 = { id: 'sn_'+(sp2.id||Date.now()), naam: sp2.naam||[sp2.voornaam,sp2.achternaam].filter(Boolean).join(' ')||'', rugnummer: sp2.rugnummer||'', positie: sp2.positie||'', tekst: _ta2tekst, spelerKey: sp2.id, created: Date.now() };
            prog2.snelnotities.push(sn2);
          }
          sn2.is_opvallend = !sn2.is_opvallend;
          prog2.modified = Date.now();
          // Update knop + tile klasse + ster in naam
          if(sn2.is_opvallend){
            actBtn.textContent = '⭐ Opgevallen';
            actBtn.classList.add('is-opvallend');
            tile.classList.add('tile-opvallend');
          } else {
            actBtn.textContent = '☆ Opvallend';
            actBtn.classList.remove('is-opvallend');
            tile.classList.remove('tile-opvallend');
          }
          const nameEl2 = tile.querySelector('.sa-tile-name');
          if(nameEl2){
            const star2 = nameEl2.querySelector('.sa-tile-star');
            if(sn2.is_opvallend && !star2) nameEl2.insertAdjacentHTML('beforeend','<span class="sa-tile-star" aria-hidden="true">⭐</span>');
            else if(!sn2.is_opvallend && star2) star2.remove();
          }
          if(typeof saveProgrammaItem === 'function') saveProgrammaItem(prog2).catch(()=>{});
          return;
        }
        // s35ca-1: 'edit-voorrap' handler verwijderd — voor-rapport flow weg
        return;
      }
      // tile zelf: toggle uitklappen — alleen via naam-balk, niet via panel-inhoud
      if(e.target.matches('input, textarea, select')) return;
      if(e.target.closest('.sa-tile-panel')) return;  // klik in content panel → niet sluiten
      const isOpen = tile.classList.contains('open');
      // sluit andere tiles in dezelfde sa-card
      const card = tile.closest('.sa-card');
      if(card){
        card.querySelectorAll('.sa-tile.open').forEach(t => {
          if(t !== tile){
            t.classList.remove('open');
            const x = t.querySelector('.sa-tile-close');
            if(x) x.style.display = 'none';
          }
        });
      }
      tile.classList.toggle('open', !isOpen);
      const x = tile.querySelector('.sa-tile-close');
      if(x) x.style.display = isOpen ? 'none' : '';
      // s92: wire structured term inputs auto-save bij eerste keer openen
      if(!isOpen){
        const tileTermIns = Array.from(tile.querySelectorAll('.sa-tile-term-in'));
        if(tileTermIns.length && !tileTermIns[0]._wired){
          tileTermIns.forEach(el => el._wired = true);
          let saveTm;
          const saveStatus = tile.querySelector('.sa-tile-save-status');
          const _TERMS3 = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
          const composeTileTekst = () => _TERMS3.map(t => { const el = tileTermIns.find(x => x.dataset.term === t); return t + ':' + (el && el.value.trim() ? ' ' + el.value.trim() : ''); }).join('\n');
          const doTileSave = async () => {
            const pid3 = tile.dataset.progId;
            const spi3 = parseInt(tile.dataset.spIdx, 10);
            const pr3  = programmaCache.find(p => p.id === pid3);
            if(!pr3) return;
            const sp3 = (pr3.spelers||[])[spi3];
            if(!sp3) return;
            // s92: respect lock — no writes after match ends + 5 min
            if(typeof _shIsMatchLocked === 'function' && _shIsMatchLocked(pr3)){
              if(saveStatus){ saveStatus.textContent = 'op slot'; saveStatus.style.color = '#fbbf24'; }
              return;
            }
            if(!Array.isArray(pr3.snelnotities)) pr3.snelnotities = [];
            let sn3 = pr3.snelnotities.find(s => s && s.spelerKey === sp3.id);
            const tekst3 = composeTileTekst();
            if(!sn3){
              sn3 = { id: 'sn_'+(sp3.id||Date.now()), naam: sp3.naam||[sp3.voornaam,sp3.achternaam].filter(Boolean).join(' ')||'', rugnummer: sp3.rugnummer||'', positie: sp3.positie||'', tekst: tekst3, spelerKey: sp3.id, created: Date.now() };
              pr3.snelnotities.push(sn3);
            } else {
              sn3.tekst = tekst3;
            }
            pr3.modified = Date.now();
            try {
              if(typeof saveProgrammaItem === 'function') await saveProgrammaItem(pr3);
              if(saveStatus){ saveStatus.textContent = '✓'; saveStatus.style.color = '#4ade80'; }
              setTimeout(() => { if(saveStatus) saveStatus.textContent = ''; }, 1200);
            } catch(_){
              if(saveStatus){ saveStatus.textContent = '!'; saveStatus.style.color = '#ef4444'; }
            }
          };
          tileTermIns.forEach(el => {
            el.addEventListener('input', () => {
              if(saveStatus){ saveStatus.textContent = '…'; saveStatus.style.color = '#9aa3b7'; }
              clearTimeout(saveTm);
              saveTm = setTimeout(doTileSave, 700);
            });
          });
          tile.addEventListener('focusout', (ev) => {
            if(!ev.relatedTarget) return; // klik op niet-focusbaar element (label/span) — niet sluiten
            if(!tile.contains(ev.relatedTarget)){
              clearTimeout(saveTm);
              doTileSave();
            }
          }, { once: false });
        }
        if(tileTermIns[0]) setTimeout(() => tileTermIns[0].focus(), 60);
      }
    });
  });

  // Wedstrijd-actie buttons
  wrap.querySelectorAll('[data-sa-act]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const act = btn.dataset.saAct;
      const progId = btn.dataset.progid;
      if(!progId) return;
      // s35ca-2: lock dashboard-routes na fluitje+15. Bewerken kan dan
      // alleen via tab Wedstrijden.
      if(act === 'add-snel-notitie' || act === 'edit-snel-notitie' ||
         act === 'add-snel-wstr' || act === 'edit-snel-wstr' || act === 'del-snel-wstr' ||
         act === 'add-observatie' ||
         act === 'convert-snel-to-rapport'){
        const __lockProg = programmaCache.find(p => p.id === progId);
        if(__lockProg && typeof _shIsMatchLocked === 'function' && _shIsMatchLocked(__lockProg)){
          if(typeof toast === 'function') toast('Wedstrijd is op slot — bewerk via tab Wedstrijden', true);
          else alert('Deze wedstrijd is op slot.\nBewerk via tab Wedstrijden.');
          return;
        }
      }
      if(act === 'toggle-wstr'){
        const wstrWrap = btn.closest('.sa-card');
        if(!wstrWrap) return;
        const wstrBody = wstrWrap.querySelector(`.sa-wstrnotities[data-progid="${progId}"]`);
        const wstrChev = wstrWrap.querySelector('.sa-wstr-toggle-row .sa-wstr-chev');
        if(wstrBody){
          const isOpen = wstrBody.style.display !== 'none';
          wstrBody.style.display = isOpen ? 'none' : '';
          if(wstrChev) wstrChev.style.transform = isOpen ? '' : 'rotate(90deg)';
        }
        return;
      } else if(act === 'add-player'){
        if(typeof openProgPlayerModal === 'function') openProgPlayerModal(progId, null);
      } else if(act === 'open-match'){
        if(typeof openProgMatchDetailModal === 'function') openProgMatchDetailModal(progId);
      } else if(act === 'add-snel-notitie' || act === 'edit-snel-notitie'){
        // s35be: open snel-spelersnotitie form, sync 8 termen <-> hidden textarea,
        // auto-save, click-outside. s35bm: trigger-toggle verwijderd.
        const card = btn.closest('.sa-card');
        if(!card) return;
        const form = card.querySelector(`.sa-snel-form[data-progid="${progId}"]`);
        if(!form) return;
        // s35bm: re-klikken op trigger terwijl form open is = no-op (voorkomt scroll-naar-boven)
        if(act === 'add-snel-notitie' && form.style.display === 'block'){
          return;
        }
        form.style.display = 'block';
        const naamIn = form.querySelector('.sa-snel-naam');
        const rugIn  = form.querySelector('.sa-snel-rug');
        const posIn  = form.querySelector('.sa-snel-positie');
        const txtIn  = form.querySelector('.sa-snel-tekst');
        const termIns = Array.from(form.querySelectorAll('.sa-snel-term-input'));
        const statusEl = form.querySelector('.sa-snel-status');
        // s35bg: heading-click = close trigger (eenmalig per form)
        if(!form.__shHeadCloseWired){
          form.__shHeadCloseWired = true;
          const closeHead = form.querySelector('.sa-snel-close-head');
          if(closeHead){
            closeHead.addEventListener('click', (ev) => {
              ev.stopPropagation();
              form.style.display = 'none';
              if(typeof form.__shReset === 'function') form.__shReset();
            });
          }
        }
        // Auto-save wiring (eenmalig per form-element)
        if(!form.__shAutoWired){
          form.__shAutoWired = true;
          let debTimer = null;
          let savedSnId = null;
          const TERMS = ['techniek','inzicht','mentaliteit','explosiviteit','sprinten','duelleren','wendbaarheid','algemeen'];
          const defaultTekst = TERMS.map(t => t + ':').join('\n');
          // Compose: 8 inputs -> tekst-string (backwards-compat formaat)
          const composeTekst = () => {
            return TERMS.map(t => {
              const el = termIns.find(x => x.dataset.term === t);
              const v = el ? el.value.trim() : '';
              return t + ':' + (v ? ' ' + v : '');
            }).join('\n');
          };
          // Parse: tekst-string -> 8 inputs (regex per term)
          // s35dg-hotfix5: sanitize waarden die per ongeluk een andere TERM-naam bevatten
          // (legacy data uit een vorige patch waarin sprinten→duelleren, duelleren→wendbaarheid enz. zijn opgeslagen)
          const isShiftedJunk = (v) => {
            if(!v) return false;
            const stripped = v.trim().replace(/:\s*$/, '').toLowerCase();
            return TERMS.indexOf(stripped) >= 0;
          };
          const parseTekstIntoInputs = (tekst) => {
            const src = tekst || '';
            TERMS.forEach(t => {
              const el = termIns.find(x => x.dataset.term === t);
              if(!el) return;
              const re = new RegExp('^\\s*' + t + '\\s*:\\s*(.*)$', 'mi');
              const m = src.match(re);
              let val = (m && m[1]) ? m[1].trim() : '';
              if(isShiftedJunk(val)) val = '';
              el.value = val;
            });
          };
          // Sync term-inputs -> hidden textarea on every input
          const syncTerms = () => { if(txtIn) txtIn.value = composeTekst(); };
          const doAutoSave = async () => {
            syncTerms();
            const naam = naamIn.value.trim();
            const rug  = rugIn.value.trim();
            const pos  = posIn ? posIn.value.trim() : '';
            const tekstRaw = txtIn ? txtIn.value : '';
            // Termen leeg? Check of inhoud meer is dan alleen labels
            const hasTermContent = termIns.some(el => el.value.trim().length > 0);
            if(!naam && !pos && !hasTermContent){
              if(statusEl){ statusEl.textContent = '\u00a0'; }
              return;
            }
            const prog = programmaCache.find(p => p.id === progId);
            if(!prog) return;
            // s35ca-2: failsafe — wedstrijd op slot, niet meer schrijven
            if(typeof _shIsMatchLocked === 'function' && _shIsMatchLocked(prog)){
              if(statusEl){ statusEl.textContent = 'op slot — bewerk via Wedstrijden'; statusEl.style.color = '#fbbf24'; }
              return;
            }
            if(!Array.isArray(prog.snelnotities)) prog.snelnotities = [];
            const tekst = tekstRaw;
            // s35dg-hotfix4: spelerKey leidend — één snel-notitie per gekoppelde speler.
            // Match-prio: (1) spelerKey, (2) genormaliseerde naam, (3) rugnummer.
            const spelerKey = form.dataset.spelerKey || null;
            const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
            const findDup = () => {
              const nNaam = norm(naam);
              const nRug = String(rug||'').trim();
              // 1. spelerKey-match (sterkste signaal voor gekoppelde speler)
              if(spelerKey){
                const byKey = prog.snelnotities.find(s => s && s.spelerKey === spelerKey && (!savedSnId || s.id !== savedSnId));
                if(byKey) return byKey;
              }
              if(!naam && !rug) return null;
              return prog.snelnotities.find(s => {
                if(!s) return false;
                if(savedSnId && s.id === savedSnId) return false;
                // sla records met andere spelerKey over zodat we geen records "stelen"
                if(spelerKey && s.spelerKey && s.spelerKey !== spelerKey) return false;
                if(nRug && String(s.rugnummer||'').trim() === nRug) return true;
                if(nNaam && norm(s.naam) === nNaam) return true;
                return false;
              }) || null;
            };
            if(savedSnId){
              const existing = prog.snelnotities.find(s => s.id === savedSnId);
              if(existing){
                existing.naam = naam;
                existing.rugnummer = rug;
                existing.positie = pos;
                existing.tekst = tekst;
                if(spelerKey && !existing.spelerKey) existing.spelerKey = spelerKey;
              } else {
                const dup = findDup();
                if(dup){
                  savedSnId = dup.id;
                  dup.naam = naam; dup.rugnummer = rug; dup.positie = pos; dup.tekst = tekst;
                  if(spelerKey && !dup.spelerKey) dup.spelerKey = spelerKey;
                } else {
                  savedSnId = 'sn_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
                  prog.snelnotities.push({ id: savedSnId, naam, rugnummer: rug, positie: pos, tekst, spelerKey, created: Date.now() });
                }
              }
            } else {
              const dup = findDup();
              if(dup){
                savedSnId = dup.id;
                dup.naam = naam; dup.rugnummer = rug; dup.positie = pos; dup.tekst = tekst;
                if(spelerKey && !dup.spelerKey) dup.spelerKey = spelerKey;
                if(statusEl){ statusEl.textContent = 'bestaande notitie geopend'; statusEl.style.color = '#fbbf24'; }
              } else {
                savedSnId = 'sn_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
                prog.snelnotities.push({ id: savedSnId, naam, rugnummer: rug, positie: pos, tekst, spelerKey, created: Date.now() });
              }
            }
            prog.modified = Date.now();
            try {
              if(typeof saveProgrammaItem === 'function') await saveProgrammaItem(prog);
              if(statusEl){ statusEl.textContent = '\u2713 auto-opgeslagen'; statusEl.style.color = '#4ade80'; }
              setTimeout(() => { if(statusEl){ statusEl.style.color = ''; statusEl.textContent = 'auto-opgeslagen'; } }, 1500);
            } catch(err){
              if(statusEl){ statusEl.textContent = 'fout bij opslaan'; statusEl.style.color = '#ef4444'; }
            }
          };
          const onInput = () => {
            syncTerms();
            if(statusEl){ statusEl.textContent = 'bezig met opslaan\u2026'; statusEl.style.color = ''; }
            if(debTimer) clearTimeout(debTimer);
            debTimer = setTimeout(doAutoSave, 700);
          };
          [naamIn, rugIn, posIn].forEach(el => el && el.addEventListener('input', onInput));
          termIns.forEach(el => el.addEventListener('input', onInput));
          if(posIn) posIn.addEventListener('change', onInput);
          // s-blur-save: direct opslaan als gebruiker het formulier verlaat (wegklikt)
          form.addEventListener('focusout', (e) => {
            if(!e.relatedTarget) return; // klik op label/span — niet sluiten
            if(form.contains(e.relatedTarget)) return;
            if(debTimer){ clearTimeout(debTimer); debTimer = null; }
            doAutoSave();
          });
          // Helper: form vullen vanuit bestaande snel-notitie (parse tekst -> inputs)
          form.__shFillFromSn = (sn) => {
            naamIn.value = sn.naam || '';
            rugIn.value  = sn.rugnummer || '';
            if(posIn) posIn.value = sn.positie || '';
            parseTekstIntoInputs(sn.tekst || '');
            syncTerms();
            savedSnId    = sn.id || null;
            if(statusEl){ statusEl.textContent = 'bewerken'; statusEl.style.color = ''; }
          };
          // s35dg-hotfix4: helper om savedSnId van buitenaf te resetten (voor speler-switch)
          form.__shSetSavedSnId = (id) => { savedSnId = id || null; };
          // Reset state wanneer form sluit
          form.__shReset = () => {
            if(debTimer){ clearTimeout(debTimer); debTimer = null; }
            doAutoSave().then(() => {
              naamIn.value = ''; rugIn.value = '';
              if(posIn) posIn.value = '';
              termIns.forEach(el => el.value = '');
              if(txtIn) txtIn.value = defaultTekst;
              savedSnId = null;
              if(statusEl){ statusEl.textContent = '\u00a0'; statusEl.style.color = ''; }
              if(typeof renderDashboardAgenda === 'function') renderDashboardAgenda();
            });
          };
        }
        // Click-outside-to-close (eenmalig globaal)
        if(!window.__shSnelOutsideWired){
          window.__shSnelOutsideWired = true;
          document.addEventListener('mousedown', (ev) => {
            const openForms = document.querySelectorAll('.sa-snel-form');
            openForms.forEach(f => {
              if(f.style.display !== 'block') return;
              if(f.contains(ev.target)) return;
              if(ev.target.closest('[data-sa-act="add-snel-notitie"]')) return;
              if(ev.target.closest('[data-sa-act="edit-snel-notitie"]')) return;
              f.style.display = 'none';
              if(typeof f.__shReset === 'function') f.__shReset();
            });
          });
        }
        // Edit-mode: form vullen vanuit bestaande snel-notitie
        if(act === 'edit-snel-notitie'){
          const snidx = parseInt(btn.dataset.snidx, 10);
          const prog = programmaCache.find(p => p.id === progId);
          const sn = (prog && Array.isArray(prog.snelnotities)) ? prog.snelnotities[snidx] : null;
          if(sn && typeof form.__shFillFromSn === 'function'){
            form.__shFillFromSn(sn);
          }
          try { form.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_){}
        }
        if(naamIn) naamIn.focus();
      } else if(act === 'add-observatie'){
        // Observatieformulier voor opgevallen speler — aanmaken als obs-draft in snelnotities
        const _obsProg = programmaCache && programmaCache.find(p => p && p.id === progId);
        if(_obsProg && typeof openObservatieForm === 'function'){
          // Maak/zoek obs-draft snelnotitie zodat het persistent is tijdens de wedstrijd
          if(!Array.isArray(_obsProg.snelnotities)) _obsProg.snelnotities = [];
          // Zoek een openstaande (niet-ingediende) obs-draft
          let _obsDraft = _obsProg.snelnotities.find(s => s && s.rapport_type === 'observatie' && s.obs_draft === true);
          if(!_obsDraft){
            _obsDraft = { id: 'obs_' + Date.now() + '_' + Math.random().toString(36).slice(2,5), rapport_type: 'observatie', obs_draft: true, naam: '', tekst: '', created: Date.now() };
            _obsProg.snelnotities.push(_obsDraft);
            if(typeof saveProgrammaItem === 'function') saveProgrammaItem(_obsProg).catch(()=>{});
          }
          openObservatieForm(_obsProg, _obsDraft);
        }
      } else if(act === 'add-snel-wstr'){
        // s35be: snel wedstrijdnotitie (vrije tekst — tactiek/score/weer).
        // s35bm: trigger-toggle verwijderd, no-op bij re-click.
        const card = btn.closest('.sa-card');
        if(!card) return;
        const form = card.querySelector(`.sa-snel-wstr-form[data-progid="${progId}"]`);
        if(!form) return;
        if(form.style.display === 'block'){
          return;
        }
        form.style.display = 'block';
        const txtIn = form.querySelector('.sa-snel-wstr-tekst');
        const statusEl = form.querySelector('.sa-snel-wstr-status');
        // s35bg: heading-click = close trigger voor wstr-form (eenmalig)
        if(!form.__shWstrHeadCloseWired){
          form.__shWstrHeadCloseWired = true;
          const closeHead = form.querySelector('.sa-snel-wstr-close-head');
          if(closeHead){
            closeHead.addEventListener('click', (ev) => {
              ev.stopPropagation();
              form.style.display = 'none';
              if(typeof form.__shReset === 'function') form.__shReset();
            });
          }
        }
        if(!form.__shWstrWired){
          form.__shWstrWired = true;
          let debTimer = null;
          let savedWnId = null;
          const doAutoSave = async () => {
            const tekst = txtIn.value.trim();
            if(!tekst){
              if(statusEl){ statusEl.textContent = '\u00a0'; }
              return;
            }
            const prog = programmaCache.find(p => p.id === progId);
            if(!prog) return;
            // s35ca-2: failsafe — wedstrijd op slot, niet meer schrijven
            if(typeof _shIsMatchLocked === 'function' && _shIsMatchLocked(prog)){
              if(statusEl){ statusEl.textContent = 'op slot — bewerk via Wedstrijden'; statusEl.style.color = '#fbbf24'; }
              return;
            }
            if(!Array.isArray(prog.wedstrijdnotities)) prog.wedstrijdnotities = [];
            if(savedWnId){
              const ex = prog.wedstrijdnotities.find(w => w.id === savedWnId);
              if(ex) ex.tekst = tekst;
              else {
                savedWnId = 'wn_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
                prog.wedstrijdnotities.push({ id: savedWnId, tekst, created: Date.now() });
              }
            } else {
              savedWnId = 'wn_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
              prog.wedstrijdnotities.push({ id: savedWnId, tekst, created: Date.now() });
            }
            prog.modified = Date.now();
            try {
              if(typeof saveProgrammaItem === 'function') await saveProgrammaItem(prog);
              if(statusEl){ statusEl.textContent = '\u2713 auto-opgeslagen'; statusEl.style.color = '#4ade80'; }
              setTimeout(() => { if(statusEl){ statusEl.style.color = ''; statusEl.textContent = 'auto-opgeslagen'; } }, 1500);
            } catch(err){
              if(statusEl){ statusEl.textContent = 'fout bij opslaan'; statusEl.style.color = '#ef4444'; }
            }
          };
          txtIn.addEventListener('input', () => {
            if(statusEl){ statusEl.textContent = 'bezig met opslaan\u2026'; statusEl.style.color = ''; }
            if(debTimer) clearTimeout(debTimer);
            debTimer = setTimeout(doAutoSave, 700);
          });
          form.__shFillFromWn = (wn) => {
            txtIn.value = wn.tekst || '';
            savedWnId = wn.id || null;
            if(statusEl){ statusEl.textContent = 'bewerken'; statusEl.style.color = ''; }
          };
          form.__shReset = () => {
            if(debTimer){ clearTimeout(debTimer); debTimer = null; }
            doAutoSave().then(() => {
              txtIn.value = '';
              savedWnId = null;
              if(statusEl){ statusEl.textContent = '\u00a0'; statusEl.style.color = ''; }
              if(typeof renderDashboardAgenda === 'function') renderDashboardAgenda();
            });
          };
        }
        // Click-outside wiring (eenmalig globaal)
        if(!window.__shWstrOutsideWired){
          window.__shWstrOutsideWired = true;
          document.addEventListener('click', (ev) => {
            const openForms = document.querySelectorAll('.sa-snel-wstr-form');
            openForms.forEach(f => {
              if(f.style.display !== 'block') return;
              if(f.contains(ev.target)) return;
              if(ev.target.closest('[data-sa-act="add-snel-wstr"]')) return;
              if(ev.target.closest('[data-sa-act="edit-snel-wstr"]')) return;
              if(ev.target.closest('.sa-snel-close-head')) return;
              // Alleen sluiten als buiten de kaart geklikt
              if(ev.target.closest('.sa-card') === f.closest('.sa-card')) return;
              f.style.display = 'none';
              if(typeof f.__shReset === 'function') f.__shReset();
            });
          });
        }
        if(txtIn) txtIn.focus();
      } else if(act === 'edit-snel-wstr'){
        // s35be: open wstr-form en vul met bestaande notitie.
        // s35bm: form was mogelijk al open (no-op zou edit blokkeren) — sluit eerst.
        const card = btn.closest('.sa-card');
        if(!card) return;
        const form = card.querySelector(`.sa-snel-wstr-form[data-progid="${progId}"]`);
        if(!form) return;
        const idx = parseInt(btn.dataset.wnidx, 10);
        const prog = programmaCache.find(p => p.id === progId);
        const wn = (prog && Array.isArray(prog.wedstrijdnotities)) ? prog.wedstrijdnotities[idx] : null;
        if(form.style.display === 'block'){ form.style.display = 'none'; }
        const triggerBtn = card.querySelector('.sa-trigger-wstr[data-progid="' + progId + '"]');
        if(triggerBtn) triggerBtn.click();
        if(wn && typeof form.__shFillFromWn === 'function') form.__shFillFromWn(wn);
        try { form.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_){}
      } else if(act === 'del-snel-wstr'){
        const idx = parseInt(btn.dataset.wnidx, 10);
        const prog = programmaCache.find(p => p.id === progId);
        if(!prog || !Array.isArray(prog.wedstrijdnotities)) return;
        if(idx < 0 || idx >= prog.wedstrijdnotities.length) return;
        if(!confirm('Wedstrijdnotitie verwijderen?')) return;
        prog.wedstrijdnotities.splice(idx, 1);
        prog.modified = Date.now();
        try {
          if(typeof saveProgrammaItem === 'function') await saveProgrammaItem(prog);
          if(typeof renderDashboardAgenda === 'function') renderDashboardAgenda();
        } catch(err){}
      } else if(act === 'convert-snel-to-rapport'){
        // s35be: snel-notitie -> volledig spelersrapport. Open speler-modal
        // met prefill (naam, rugnummer, positie, tekst als voor_notities).
        const snidx = parseInt(btn.dataset.snidx, 10);
        const prog = programmaCache.find(p => p.id === progId);
        const sn = (prog && Array.isArray(prog.snelnotities)) ? prog.snelnotities[snidx] : null;
        if(!sn) return;
        if(typeof openProgPlayerModal === 'function'){
          openProgPlayerModal(progId, null);
          // Prefill in next tick (modal moet eerst DOM populaten)
          setTimeout(() => {
            try {
              const fullNaam = (sn.naam || '').trim();
              let vn = '', an = '';
              if(fullNaam){
                if(typeof splitNaam === 'function'){
                  const s = splitNaam(fullNaam);
                  vn = s.voornaam || ''; an = s.achternaam || '';
                } else {
                  const parts = fullNaam.split(/\s+/);
                  vn = parts[0] || '';
                  an = parts.slice(1).join(' ');
                }
              }
              const ppVn = document.getElementById('pp-voornaam');
              const ppAn = document.getElementById('pp-achternaam');
              const ppNa = document.getElementById('pp-naam');
              const ppRu = document.getElementById('pp-rugnummer');
              const ppPo = document.getElementById('pp-positie');
              const ppNo = document.getElementById('pp-notities');
              if(ppVn) ppVn.value = vn;
              if(ppAn) ppAn.value = an;
              if(ppNa) ppNa.value = [vn, an].filter(Boolean).join(' ');
              if(ppRu) ppRu.value = sn.rugnummer || '';
              if(ppPo) ppPo.value = sn.positie || '';
              if(ppNo) ppNo.value = sn.tekst || '';
              // Marker voor latere stappen — bewaar snel-notitie id
              window.__shConvertingFromSnId = sn.id || null;
              window.__shConvertingFromProgId = progId;
            } catch(_){}
          }, 60);
          if(typeof toast === 'function') toast('Snel-notitie geladen — vul aanvullende info in');
        }
      } else if(act === 'del-snel-notitie'){
        const idx = parseInt(btn.dataset.snidx, 10);
        const prog = programmaCache.find(p => p.id === progId);
        if(!prog || !Array.isArray(prog.snelnotities)) return;
        if(idx < 0 || idx >= prog.snelnotities.length) return;
        if(!confirm('Snel notitie verwijderen?')) return;
        prog.snelnotities.splice(idx, 1);
        prog.modified = Date.now();
        try {
          if(typeof saveProgrammaItem === 'function') await saveProgrammaItem(prog);
          if(typeof renderDashboardAgenda === 'function') renderDashboardAgenda();
        } catch(err){
          if(typeof toast === 'function') toast('Fout bij verwijderen', true);
        }
      }
    });
  });
}
window.renderActiveScouting = renderActiveScouting;

// Periodieke refresh — elke 60s zodat het venster automatisch opent/sluit
let __scoutingTimer = null;
function startScoutingTimer(){
  if(__scoutingTimer) return;
  __scoutingTimer = setInterval(() => {
    if(typeof currentView !== 'undefined' && currentView === 'dashboard'){
      // s35ba: niet rerenderen als snel-notitie open is en gebruiker bezig
      const active = document.activeElement;
      if(active && active.classList && (active.classList.contains('sa-snel-tekst') || active.classList.contains('sa-snel-naam') || active.classList.contains('sa-snel-rug'))) return;
      const openForm = document.querySelector('.sa-snel-form[style*="display: block"], .sa-snel-form[style*="display:block"]');
      if(openForm && openForm.matches(':hover')) return;
      renderDashboardAgenda();
    }
  }, 60000);
}
// Start timer zodra de pagina klaar is
if(document.readyState === 'complete' || document.readyState === 'interactive'){
  setTimeout(startScoutingTimer, 100);
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(startScoutingTimer, 100));
}

/* =============== DASHBOARD =============== */
function renderTodayMatches(){
  const wrap = document.getElementById('today-matches-wrap');
  if(!wrap) return;
  if(typeof programmaCache === 'undefined' || !Array.isArray(programmaCache) || programmaCache.length === 0){
    wrap.style.display = 'none'; wrap.innerHTML = ''; return;
  }
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const today = `${yyyy}-${mm}-${dd}`;
  // s35ba: filter active wedstrijd (bezig of warmup) — die staat al boven in geel
  // s91: verberg ook wedstrijden waarvan het window al voorbij is (afgelopen)
  const __nowF = new Date();
  const items = programmaCache.filter(p => {
    if(!p || p.datum !== today) return false;
    if(typeof isMatchInWindow === 'function' && isMatchInWindow(p, __nowF)) return false;
    // Verberg afgelopen wedstrijden: window bestaat én is al voorbij
    if(typeof getMatchWindow === 'function'){
      const w = getMatchWindow(p);
      if(w && w.end < __nowF) return false;
    }
    return true;
  });
  if(items.length === 0){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  items.sort((a,b) => (a.tijd||'99:99').localeCompare(b.tijd||'99:99'));
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const expandedId = wrap.dataset.expandedId || '';

  function chipsHtml(spelers, extra){
    if(!spelers || !spelers.length) return '';
    return spelers.map(sp => {
      const pid = sp.spelerId || sp.id;
      const naam = sp.naam || '?';
      const inDB = pid && players.find(p => p.id === pid);
      if(extra){
        // Expanded modus: action buttons per speler
        const opts = inDB
          ? `<button class="td-chip-act" data-act="open-player" data-pid="${pid}">Open speler</button>`
          : `<span class="td-chip-note">(niet in database)</span>`;
        return `
          <div class="td-player-row">
            <div class="td-player-name">${escapeHtml(naam)}${sp.rugnummer ? ` <span class="td-player-num">#${escapeHtml(String(sp.rugnummer))}</span>` : ''}${sp.positie ? ` <span class="td-player-pos">${escapeHtml(sp.positie)}</span>` : ''}</div>
            <div class="td-player-acts">
              ${opts}
            </div>
          </div>`;
      }
      return inDB
        ? `<span class="today-player-chip" data-player-id="${pid}">${escapeHtml(naam)}</span>`
        : `<span class="today-player-chip" data-no-id="1">${escapeHtml(naam)}</span>`;
    }).join('');
  }

  const cards = items.map(it => {
    // s35bd: titel-format 'Club Elftal — Club Elftal'
    const teams = `${escapeHtml(it.thuis||'?')}${it.thuis_elftal?' '+escapeHtml(it.thuis_elftal):''} — ${escapeHtml(it.uit||'?')}${it.uit_elftal?' '+escapeHtml(it.uit_elftal):''}`;
    const tijd = it.tijd || '—';
    // s35bk: countdown-badge — wedstrijden binnen scouting-window zitten al in
    // de actieve gele tegel (renderActiveScouting), dus hier alleen pre-/post-states.
    let cdHtml = '';
    if(it.tijd){
      const [h,m] = it.tijd.split(':').map(n=>parseInt(n,10));
      if(!isNaN(h) && !isNaN(m)){
        const kick = new Date(); kick.setHours(h,m,0,0);
        const diffMin = Math.round((kick - now) / 60000);
        if(diffMin > 0){
          const hh = Math.floor(diffMin/60), mm2 = diffMin%60;
          cdHtml = `<span class="today-match-countdown">over ${hh? hh+'u ' : ''}${mm2}m</span>`;
        } else {
          cdHtml = `<span class="today-match-countdown">afgelopen</span>`;
        }
      }
    }
    const club = (typeof CLUB_ADRESSEN !== 'undefined' && it.thuis)
      ? CLUB_ADRESSEN[it.thuis.toLowerCase().trim()]
      : null;
    // s35bd: maps-url eenmaal vaststellen; locatie wordt klikbaar (confirm -> open)
    let mapsUrl = '';
    let locHtml = '';
    const locLabel = it.locatie || (club && club.sportpark) || '';
    if(club && club.lat && club.lon){
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${club.lat},${club.lon}`;
    } else if(club && club.adres){
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(club.adres)}`;
    } else if(it.locatie){
      mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.locatie)}`;
    }
    if(locLabel){
      if(mapsUrl){
        locHtml = `<span class="td-loc-nav" data-maps-url="${escapeAttr(mapsUrl)}" data-loc-label="${escapeAttr(locLabel)}" title="Klik om te navigeren">📍 ${escapeHtml(locLabel)}</span>`;
      } else {
        locHtml = `<span>📍 ${escapeHtml(locLabel)}</span>`;
      }
    }
    const spelers = (it.spelers || []).map(s => ({...s, __progId: it.id}));
    const chipsCompact = chipsHtml(spelers, false);
    const isOpen = (expandedId === it.id);
    let detailsHtml = '';
    if(isOpen){
      const meta = [
        it.leeftijd ? `<span class="td-meta-tag">${escapeHtml(it.leeftijd)}</span>` : '',
        it.info ? `<span class="td-meta-tag">${escapeHtml(it.info)}</span>` : '',
        it.methode ? `<span class="td-meta-tag">${escapeHtml(it.methode)}</span>` : '',
        club && club.adres ? `<span class="td-meta-tag" title="${escapeHtml(club.adres)}">📌 ${escapeHtml(club.adres)}</span>` : ''
      ].filter(Boolean).join('');
      const playerRows = chipsHtml(spelers, true) || '<div class="td-empty">Geen spelers toegevoegd.</div>';
      detailsHtml = `
        <div class="td-details">
          ${meta ? `<div class="td-meta-row">${meta}</div>` : ''}
          <div class="td-section-title">Notities</div>
          <textarea class="td-notes" data-prog-id="${it.id}" rows="2" placeholder="Snelle notitie tijdens de wedstrijd...">${escapeHtml(it.notities||'')}</textarea>
          <div class="td-section-title">Spelers (${spelers.length})</div>
          <div class="td-players">${playerRows}</div>
          <div class="td-actions">
            <button class="btn-ghost" data-act="add-player" data-progid="${it.id}">+ Speler toevoegen</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="today-match-card${isOpen ? ' open' : ''}" data-prog-id="${it.id}">
        <div class="today-match-row1">
          <div class="today-match-teams">${teams}</div>
          <div class="today-match-time">${escapeHtml(tijd)}</div>
        </div>
        <div class="today-match-meta">
          ${cdHtml}
          ${locHtml}
          <span class="td-toggle">${isOpen ? '▾ Inklappen' : '▸ Klik voor details'}</span>
        </div>
        ${detailsHtml}
      </div>
    `;
  }).join('');

  // s35cy: inklapbaar via titel-klik (zelfde patroon als upcoming-matches)
  const collapsedPref = (function(){ try { return localStorage.getItem('todayMatchesCollapsed') === '1'; } catch(_){ return false; } })();
  const cls = collapsedPref ? 'today-matches collapsed' : 'today-matches';
  const chev = '<span class="today-matches-chev" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  wrap.innerHTML = `
    <div class="${cls}">
      <div class="today-matches-head" data-toggle-today="1">
        <div class="today-matches-title">Wedstrijden vandaag</div>
        <div class="today-matches-right">
          <div class="today-matches-count">${items.length} ingepland</div>
          ${chev}
        </div>
      </div>
      <div class="today-matches-body">
        ${cards}
      </div>
    </div>
  `;
  // s35cy: header-klik = toggle collapsed; alleen wanneer NIET op een kaart of knop geklikt
  const headEl = wrap.querySelector('.today-matches-head[data-toggle-today]');
  const blockEl = wrap.querySelector('.today-matches');
  if(headEl && blockEl){
    headEl.style.cursor = 'pointer';
    headEl.addEventListener('click', (e) => {
      if(e.target.closest('button, a, input')) return;
      const nowCollapsed = blockEl.classList.toggle('collapsed');
      try { localStorage.setItem('todayMatchesCollapsed', nowCollapsed ? '1' : '0'); } catch(_){}
    });
  }
  wrap.style.display = 'block';

  // Card click: toggle expand (negeer klikken op chips, links, knoppen, textarea).
  wrap.querySelectorAll('.today-match-card').forEach(card => {
    card.addEventListener('click', e => {
      if(e.target.closest('a, button, .today-player-chip, textarea, .td-details, .td-loc-nav')) return;
      const pid = card.dataset.progId;
      if(!pid) return;
      wrap.dataset.expandedId = (wrap.dataset.expandedId === pid) ? '' : pid;
      renderDashboardAgenda();
    });
  });
  // Speler-chip compact (alleen wanneer kaart dicht is): open speler-detail.
  wrap.querySelectorAll('.today-player-chip[data-player-id]').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const pid = chip.dataset.playerId;
      if(pid && typeof openDetail === 'function') openDetail(pid);
    });
  });
  // s35bd: klikbaar adres -> confirm-dialog -> Google Maps openen
  wrap.querySelectorAll('.td-loc-nav').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const url = el.dataset.mapsUrl;
      const label = el.dataset.locLabel || 'deze locatie';
      if(!url) return;
      if(confirm(`Wil je navigeren naar ${label}?`)){
        window.open(url, '_blank', 'noopener');
      }
    });
  });
  // Actie-knoppen in uitgeklapte view.
  wrap.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const act = btn.dataset.act;
      if(act === 'edit-match'){
        const id = btn.dataset.progid;
        // s35r: open edit-modal direct; gebruiker blijft op dashboard na sluiten.
        if(typeof openProgMatchModal === 'function') openProgMatchModal(id);
      } else if(act === 'add-player'){
        const id = btn.dataset.progid;
        if(typeof openProgPlayerModal === 'function') openProgPlayerModal(id, null);
      } else if(act === 'open-player'){
        const pid = btn.dataset.pid;
        if(pid && typeof openDetail === 'function') openDetail(pid);
      } else if(act === 'open-prog-player'){
        // s35ar (#222): direct naar spelersrapport, geen tussen-modal
        const progid = btn.dataset.progid;
        const spid = btn.dataset.spid;
        const prog = programmaCache.find(p => p.id === progid);
        if(!prog){
          if(typeof openProgPlayerModal === 'function') openProgPlayerModal(progid, spid || null);
          return;
        }
        const sp = (prog.spelers||[]).find(s => s && s.id === spid);
        if(!sp){
          if(typeof openProgPlayerModal === 'function') openProgPlayerModal(progid, spid || null);
          return;
        }
        let matched = null;
        if(sp.player_id){
          const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
          matched = players.find(p => p.id === sp.player_id) || null;
        }
        const slotConcept = (typeof findSlotConcept === 'function')
          ? findSlotConcept(prog.id, sp.id) : null;
        if(typeof openScoutingPlayerForm === 'function'){
          openScoutingPlayerForm(prog, sp, matched, slotConcept);
        } else if(typeof openProgPlayerModal === 'function'){
          openProgPlayerModal(progid, spid || null);
        }
      }
    });
  });
  // Notities auto-save (debounced) via saveProgrammaItem.
  wrap.querySelectorAll('.td-notes').forEach(ta => {
    let timer = null;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      const id = ta.dataset.progId;
      timer = setTimeout(async () => {
        const it = programmaCache.find(p => p.id === id);
        if(!it) return;
        it.notities = ta.value;
        it.modified = Date.now();
        try { await saveProgrammaItem(it); } catch(e){}
      }, 600);
    });
    ta.addEventListener('click', e => e.stopPropagation());
  });
}

function bindUpcomingToggle(wrap){
  // s35ct: maak header klikbaar om hele blok in/uit te klappen
  const head = wrap.querySelector('.upcoming-matches-head[data-toggle-upcoming]');
  const block = wrap.querySelector('.upcoming-matches');
  if(!head || !block) return;
  head.style.cursor = 'pointer';
  head.addEventListener('click', (e) => {
    if(e.target.closest('button, a, input')) return;
    const nowCollapsed = block.classList.toggle('collapsed');
    try { localStorage.setItem('upcomingMatchesCollapsed', nowCollapsed ? '1' : '0'); } catch(_){}
  });
}

function renderUpcomingMatches(){
  const wrap = document.getElementById('upcoming-matches-wrap');
  if(!wrap) return;
  const collapsedPref = (function(){ try { const v = localStorage.getItem('upcomingMatchesCollapsed'); return v === null ? true : v === '1'; } catch(_){ return true; } })();
  const cls = collapsedPref ? 'upcoming-matches collapsed' : 'upcoming-matches';
  const chev = '<span class="upcoming-matches-chev" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2 4 L6 8 L10 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Programma-items: horizon +3 dagen
  const horizon3 = new Date(today.getTime() + 4*24*3600*1000);
  const progItems = (Array.isArray(programmaCache) ? programmaCache : []).filter(p => {
    if(!p || !p.datum) return false;
    const d = new Date(p.datum + 'T00:00:00');
    return d > today && d < horizon3;
  });

  const hasNothing = !progItems.length;

  if(hasNothing && (!Array.isArray(programmaCache) || !programmaCache.length)){
    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="${cls}">
        <div class="upcoming-matches-head" data-toggle-upcoming="1">
          <div class="upcoming-matches-title">Aankomend</div>
          <div class="upcoming-matches-right"><div class="upcoming-matches-count">geen ingepland</div>${chev}</div>
        </div>
        <div class="upcoming-matches-body">
          <div class="up-empty">Plan een wedstrijd in via Programma of via "+ Nieuw rapport".</div>
        </div>
      </div>`;
    bindUpcomingToggle(wrap);
    return;
  }
  if(hasNothing){ wrap.style.display='none'; wrap.innerHTML=''; return; }

  const weekdays = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  function dayLabel(dateStr){
    const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    if(diff === 0) return 'Vandaag';
    if(diff === 1) return 'Morgen';
    if(diff === 2) return 'Overmorgen';
    return `${weekdays[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  progItems.sort((a,b) => ((a.datum||'')+' '+(a.tijd||'99:99')).localeCompare((b.datum||'')+' '+(b.tijd||'99:99')));

  // --- programma-rijen ---
  const progLines = progItems.map(it => {
    const teams = `${escapeHtml(it.thuis||'?')}${it.thuis_elftal?' '+escapeHtml(it.thuis_elftal):''} — ${escapeHtml(it.uit||'?')}${it.uit_elftal?' '+escapeHtml(it.uit_elftal):''}`;
    const tijd = it.tijd ? escapeHtml(it.tijd) : '';
    const club = (typeof CLUB_ADRESSEN !== 'undefined' && it.thuis) ? CLUB_ADRESSEN[it.thuis.toLowerCase().trim()] : null;
    let mapsUrl = '';
    if(club && club.lat && club.lon) mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${club.lat},${club.lon}`;
    else if(club && club.adres) mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(club.adres)}`;
    else if(it.locatie) mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.locatie)}`;
    const routeHtml = mapsUrl ? `<a class="up-route" href="${mapsUrl}" target="_blank" rel="noopener" title="Route via Google Maps">🗺️</a>` : '';
    const leef = it.leeftijd ? `<span class="up-tag">${escapeHtml(it.leeftijd)}</span>` : '';
    return `
      <div class="up-row" data-prog-id="${it.id}">
        <div class="up-when">
          <span class="up-day">${dayLabel(it.datum)}</span>
          ${tijd ? `<span class="up-time">${tijd}</span>` : ''}
        </div>
        <div class="up-teams">${teams}</div>
        <div class="up-meta">${leef}${routeHtml}</div>
      </div>`;
  }).join('');

  const totalCount = progItems.length;
  const countLabel = totalCount === 1 ? '1 item' : `${totalCount} aankomend`;

  wrap.innerHTML = `
    <div class="${cls}">
      <div class="upcoming-matches-head" data-toggle-upcoming="1">
        <div class="upcoming-matches-title">Aankomend</div>
        <div class="upcoming-matches-right">
          <div class="upcoming-matches-count">${countLabel}</div>
          ${chev}
        </div>
      </div>
      <div class="upcoming-matches-body">
        ${progLines}
      </div>
    </div>
  `;
  wrap.style.display = 'block';
  bindUpcomingToggle(wrap);

  // Klik programma-rij → programma
  wrap.querySelectorAll('.up-row[data-prog-id]').forEach(row => {
    row.addEventListener('click', e => {
      if(e.target.closest('a')) return;
      const pid = row.dataset.progId;
      if(!pid) return;
      try { progExpandedId = pid; } catch(_){ window.progExpandedId = pid; }
      if(typeof go === 'function') go('programma');
      setTimeout(() => {
        const el = document.querySelector(`.prog-detail-card[data-prog-detail-id="${pid}"]`) || document.querySelector('.prog-detail-card');
        if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
      }, 140);
    });
  });
}

// s35dj: Unified dashboard agenda — één sectie met 4 staten.
// Coördineert renderActiveScouting + renderTodayMatches + renderUpcomingMatches
// en past zichtbaarheid aan op de huidige match-staat.
/* s19: Vandaag banner — prominente melding bovenaan dashboard bij wedstrijd vandaag met spelers */
function renderVandaagBanner(){
  const wrap = document.getElementById('dash-vandaag-banner');
  if(!wrap) return;
  if(typeof programmaCache === 'undefined' || !Array.isArray(programmaCache)){
    wrap.innerHTML = ''; wrap.style.display = 'none'; return;
  }
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  // Wedstrijden vandaag met minstens 1 speler
  // s19: toon elk programma-item van vandaag (ook zonder spelers)
  const items = programmaCache.filter(p => p && p.datum === today && (p.thuis || p.uit));
  if(items.length === 0){ wrap.innerHTML = ''; wrap.style.display = 'none'; return; }

  items.sort((a,b) => (a.tijd||'99:99').localeCompare(b.tijd||'99:99'));
  const cards = items.map(it => {
    const thuisClean = it.thuis_elftal ? `${it.thuis} ${it.thuis_elftal}` : (it.thuis || '?');
    const uitClean   = it.uit_elftal   ? `${it.uit} ${it.uit_elftal}`     : (it.uit   || '?');
    const n = Array.isArray(it.spelers) ? it.spelers.length : 0;
    // spelersLabel was unused + had temporal dead zone bug — gebruik n direct in template
    const tijdLabel = it.tijd ? `<span class="dvb-tijd">${escapeHtml(it.tijd)}</span>` : '';
    const ageLabel = it.leeftijd ? `<span class="dvb-tag">${escapeHtml(it.leeftijd)}</span>` : '';
    return `
      <div class="dvb-card" data-dvb-progid="${escapeHtml(it.id)}">
        <div class="dvb-left">
          <span class="dvb-dot"></span>
          <div class="dvb-info">
            <div class="dvb-teams">${escapeHtml(thuisClean)} <span class="dvb-vs">—</span> ${escapeHtml(uitClean)}</div>
            <div class="dvb-meta">${tijdLabel}${ageLabel}<span class="dvb-spelers">${n} speler${n===1?'':'s'}</span></div>
          </div>
        </div>
        <button class="dvb-cta" data-dvb-progid="${escapeHtml(it.id)}">Bekijk →</button>
      </div>`;
  }).join('');

  // s92: herstel collapse-staat uit localStorage
  let dvbCollapsed = false;
  try { dvbCollapsed = localStorage.getItem('dvb_collapsed') === '1'; } catch(_){}

  wrap.innerHTML = `
    <div class="dash-vandaag-banner${dvbCollapsed ? ' dvb-collapsed' : ''}">
      <div class="dvb-header">
        <span style="display:flex; align-items:center; gap:7px; flex:1;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Vandaag op het programma (${items.length})
        </span>
        <button class="dvb-collapse-btn" title="${dvbCollapsed ? 'Uitklappen' : 'Inklappen'}">&#9660;</button>
      </div>
      <div class="dvb-body">
        ${cards}
      </div>
    </div>`;
  wrap.style.display = 'block';

  // Collapse toggle
  const dvbBanner = wrap.querySelector('.dash-vandaag-banner');
  const dvbBtn = wrap.querySelector('.dvb-collapse-btn');
  if(dvbBtn && dvbBanner){
    dvbBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = dvbBanner.classList.toggle('dvb-collapsed');
      try { localStorage.setItem('dvb_collapsed', collapsed ? '1' : '0'); } catch(_){}
    });
  }

  // Klik op "Bekijk →" → ga naar programma-tab en open het item
  wrap.querySelectorAll('[data-dvb-progid]').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.dvbProgid;
      if(typeof go === 'function') go('programma');
      setTimeout(() => {
        const card = document.querySelector(`[data-prog-id="${pid}"]`);
        if(card){ card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('highlight-flash'); setTimeout(() => card.classList.remove('highlight-flash'), 1200); }
      }, 350);
    });
  });
}

function renderDashboardAgenda(){
  const now = new Date();

  // Bepaal of er een actieve (live of warmup) wedstrijd is
  let hasActive = false;
  if(typeof programmaCache !== 'undefined' && Array.isArray(programmaCache)){
    hasActive = programmaCache.some(p => p && typeof isMatchInWindow === 'function' && isMatchInWindow(p, now));
  }

  // Render de drie sub-secties
  if(typeof renderVandaagBanner  === 'function') renderVandaagBanner();
  if(typeof renderActiveScouting === 'function') renderActiveScouting();
  if(typeof renderTodayMatches   === 'function') renderTodayMatches();
  if(typeof renderUpcomingMatches=== 'function') renderUpcomingMatches();

  // Fase-logica: bij live match vandaag + aankomend inklapten / verbergen
  const todayWrap    = document.getElementById('today-matches-wrap');
  const upcomingWrap = document.getElementById('upcoming-matches-wrap');

  if(hasActive){
    // Live: zet vandaag en aankomend in de achtergrond
    if(todayWrap){
      const block = todayWrap.querySelector('.today-matches');
      if(block && !block.classList.contains('collapsed')){
        block.classList.add('collapsed');
        try { localStorage.setItem('todayMatchesCollapsed','1'); } catch(_){}
      }
    }
    if(upcomingWrap) upcomingWrap.style.display = 'none';
  } else {
    // Geen live match: aankomend mag weer zichtbaar worden (eigen voorkeur bepaalt collapsed-staat)
    // today-matches toont zichzelf al op basis van items
  }
}
window.renderDashboardAgenda = renderDashboardAgenda;

function renderDashboard(){
  renderDashboardAgenda(); // s35dj: unified agenda widget

  const players = loadPlayers();
  $('#dashboard-date').textContent =
    new Date().toLocaleDateString('nl-NL',{weekday:'long', day:'numeric', month:'long', year:'numeric'});

  const total = players.length;
  const last7 = players.filter(p => p.datum && (Date.now() - new Date(p.datum).getTime()) < 7*24*3600*1000).length;
  const topPotential = players.filter(p => p.potentieel_niveau === 'A').length;
  const advice1 = players.filter(p => String(p.advies) === '4').length;

  $('#kpi-grid').innerHTML = `
    <div class="kpi-card" data-kpi="all" title="Toon alle spelers">
      <div class="kpi-label">Totaal spelers</div>
      <div class="kpi-value" data-count-to="${total}">0</div>
      <div class="kpi-sub">in database</div>
    </div>
    <div class="kpi-card blue" data-kpi="week" title="Toon rapporten van deze week">
      <div class="kpi-label">Deze week</div>
      <div class="kpi-value" data-count-to="${last7}">0</div>
      <div class="kpi-sub">nieuwe rapporten</div>
    </div>
    <div class="kpi-card green" data-kpi="top" title="Toon toptalenten (potentieel A)">
      <div class="kpi-label">Toptalenten</div>
      <div class="kpi-value" data-count-to="${topPotential}">0</div>
      <div class="kpi-sub">kan doorgroeien naar top</div>
    </div>
    <div class="kpi-card yellow" data-kpi="admit" title="Toon spelers met advies Direct contracteren">
      <div class="kpi-label">Direct contracteren</div>
      <div class="kpi-value" data-count-to="${advice1}">0</div>
      <div class="kpi-sub">hoogste advies</div>
    </div>
  `;
  // B1: count-up animatie
  setTimeout(() => {
    document.querySelectorAll('#kpi-grid .kpi-value[data-count-to]').forEach(el => {
      const target = parseInt(el.dataset.countTo, 10) || 0;
      if(target === 0){ el.textContent = '0'; return; }
      const dur = 600, start = performance.now();
      el.classList.add('counting');
      function tick(now){
        const t = Math.min(1, (now - start) / dur);
        const ease = t < .5 ? 2*t*t : -1+(4-2*t)*t;
        el.textContent = Math.round(ease * target);
        if(t < 1) requestAnimationFrame(tick);
        else { el.textContent = target; el.classList.remove('counting'); }
      }
      requestAnimationFrame(tick);
    });
  }, 80);

  $$('#kpi-grid .kpi-card').forEach(card=>{
    card.addEventListener('click', ()=>{
      const kind = card.dataset.kpi;
      $('#filter-search').value = '';
      $('#filter-position').value = '';
      $('#filter-current').value = '';
      $('#filter-potential').value = '';
      $('#filter-advies').value = '';
      $('#filter-period').value = '';
      if(kind === 'week')  $('#filter-period').value = '7';
      if(kind === 'top')   $('#filter-potential').value = 'A';
      if(kind === 'admit') $('#filter-advies').value = '4';
      go('database');
    });
  });

  const empty = $('#dash-empty');
  const content = $('#dash-content');
  if(!players.length){
    content.style.display = 'none';
    empty.style.display = 'block';
    empty.innerHTML = `
      <div class="dash-empty-state">
        <div class="icon">○</div>
        <h3>Nog geen rapporten</h3>
        <p>Zodra je rapporten invult verschijnen hier visualisaties: verdeling, open posities, top talenten, advies-mix en positiedekking.</p>
        <button class="btn btn-primary" data-go="report">+ Eerste rapport maken</button>
      </div>`;
    empty.querySelector('[data-go]').addEventListener('click', ()=> go('report'));
    renderGeo();
    return;
  }
  empty.style.display = 'none';
  content.style.display = 'block';

  const recent = [...players].sort((a,b)=> new Date(b.datum||0) - new Date(a.datum||0)).slice(0,6);
  const list = $('#recent-list');
  list.innerHTML = recent.map(p => `
    <div class="recent-item sh-tilt-card" data-id="${p.id}">
      <div class="recent-avatar">${initials(p.naam)}</div>
      <div class="recent-info">
        <div class="recent-name">${escapeHtml(p.naam)}</div>
        <div class="recent-meta">${escapeHtml(positionLabel(p.positie))} · ${formatDate(p.datum)}</div>
      </div>
      <div class="recent-grades">
        <span class="grade ${p.huidig_niveau||'D'}">${p.huidig_niveau||'-'}</span>
        <span class="grade outline ${p.potentieel_niveau||'D'}">${p.potentieel_niveau||'-'}</span>
      </div>
    </div>
  `).join('');
  $$('.recent-item', list).forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });

  const distCurrent  = countByGrade(players, 'huidig_niveau');
  const distPotential = countByGrade(players, 'potentieel_niveau');
  // B2: animated segmentbalken
  $('#dist-current').innerHTML  = renderDistSegment(distCurrent, false);
  $('#dist-potential').innerHTML = renderDistSegment(distPotential, true);
  setTimeout(() => {
    ['#dist-current','#dist-potential'].forEach(sel => {
      document.querySelectorAll(`${sel} .dist-segment-fill`).forEach(el => {
        el.style.width = el.dataset.targetW;
      });
    });
  }, 60);

  renderDashGaps();
  renderDashAdvies(players);
  renderDashTop(players);
  renderDashClubs(players);
  renderDashFollowUp(players);
  renderGeo();
  renderDashCategories(players);
}

/* ---- Extra dashboard widgets ---- */
function gradeFromScore(s){
  if(s >= 3.5) return 'A';
  if(s >= 2.5) return 'B';
  if(s >= 1.5) return 'C';
  return 'D';
}
function avgGradeNum(players, key){
  const map = {A:4, B:3, C:2, D:1};
  const vals = players.map(p => map[p.beoordelingen?.[key]] || 0).filter(v => v>0);
  if(!vals.length) return null;
  return vals.reduce((a,b)=>a+b,0) / vals.length;
}
function renderDashGaps(){
  const analyses = [...loadAnalyses()].sort((a,b)=>{
    const da = a.datum || a.createdAt || '';
    const db = b.datum || b.createdAt || '';
    return db.localeCompare(da);
  });
  const wrap = $('#dash-gaps');
  if(!analyses.length){
    wrap.innerHTML = `
      <div class="gap-empty">
        <div class="icon">○</div>
        <div>Nog geen elftal analyses.</div>
        <div style="margin-top:8px;"><button class="btn btn-sm" id="dash-gaps-open">Nieuwe analyse maken</button></div>
      </div>`;
    $('#dash-gaps-open').addEventListener('click', ()=> go('pitch'));
    return;
  }
  const top = analyses.slice(0, 6);
  const totalGaps = analyses.reduce((n,a)=> n + Object.values(a.slots||{}).filter(s => s && s.gap).length, 0);
  wrap.innerHTML = `
    <div style="font-size:11px; color:var(--text-3); margin-bottom:10px;">${analyses.length} analyse${analyses.length===1?'':'s'} · ${totalGaps} open positie${totalGaps===1?'':'s'} totaal</div>
    <div class="gap-grid">
      ${top.map(a=>{
        const slots = a.slots || {};
        const gapCount = Object.values(slots).filter(s => s && s.gap).length;
        const linkedCount = Object.values(slots).reduce((n,s)=>{
          if(!s) return n;
          const lh = (s.linked_huidig || []).length;
          const lk = (s.linked_kandidaat || []).length;
          const lold = (Array.isArray(s.linked) && !s.linked_huidig) ? s.linked.length : 0;
          return n + lh + lk + lold;
        }, 0);
        const title = [a.club, a.leeftijd].filter(Boolean).join(' · ') || 'Nieuwe analyse';
        return `
          <div class="gap-card" data-id="${a.id}">
            <div class="gap-card-title">${escapeHtml(title)}</div>
            <div class="gap-card-sub">
              ${escapeHtml(a.formation||DEFAULT_FORMATION)} · ${gapCount} gap${gapCount===1?'':'s'} · ${linkedCount} rapport${linkedCount===1?'':'en'}
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
  $$('.gap-card', wrap).forEach(el=>{
    el.addEventListener('click', ()=>{
      currentAnalysisId = el.dataset.id;
      selectedPitchPos = null;
      go('pitch');
    });
  });
}
function renderDashAdvies(players){
  const labels = {'4':'Direct contracteren','3':'Op proef uitnodigen','2':'Periodiek monitoren','1':'Geen vervolgstap'};
  const colors = {'4':'var(--grade-a)','3':'var(--grade-b)','2':'var(--grade-c)','1':'var(--grade-d)'};
  const counts = {'4':0,'3':0,'2':0,'1':0};
  players.forEach(p=>{ if(counts[p.advies] !== undefined) counts[p.advies]++; });
  const max = Math.max(1, ...Object.values(counts));
  $('#dash-advies').innerHTML = ['4','3','2','1'].map(k=>{
    const pct = (counts[k] / max) * 100;
    return `
      <div class="advies-row">
        <div class="advies-label">${labels[k]}</div>
        <div class="advies-bar"><div class="advies-fill" style="width:${pct}%; background:${colors[k]};">${counts[k]>0?counts[k]:''}</div></div>
        <div class="advies-count">${counts[k]}</div>
      </div>`;
  }).join('');
}
function renderDashTop(players){
  const gradeScore = {A:4, B:3, C:2, D:1};
  const scored = players
    .filter(p => p.potentieel_niveau === 'A' || p.potentieel_niveau === 'B')
    .map(p => {
      const pot    = gradeScore[p.potentieel_niveau] || 0;
      const huidig = gradeScore[p.huidig_niveau]     || 0;
      return { p, score: (pot * 0.65) + (huidig * 0.35) };
    })
    .sort((a,b) => b.score - a.score || a.p.naam.localeCompare(b.p.naam, 'nl'))
    .slice(0, 6);
  const wrap = $('#dash-top');
  if(!scored.length){
    wrap.innerHTML = '<div class="gap-empty"><div class="icon">○</div><div>Nog geen spelers met potentieel A of B.</div></div>';
    return;
  }
  wrap.innerHTML = `
    <div class="top-grid">
      ${scored.map((x,idx)=>`
        <div class="top-row" data-id="${x.p.id}">
          <div class="top-rank">${idx+1}</div>
          <div class="top-info">
            <div class="top-name">${escapeHtml(x.p.naam)}</div>
            <div class="top-meta">${escapeHtml(positionLabel(x.p.positie))}${x.p.club?' · '+escapeHtml(x.p.club):''}${x.p.elftal?' · '+escapeHtml(x.p.elftal):''}</div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
            <span class="grade ${x.p.huidig_niveau||'D'}">${x.p.huidig_niveau||'?'}</span>
            <span class="grade outline ${x.p.potentieel_niveau||'D'}">${x.p.potentieel_niveau||'?'}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  $$('.top-row', wrap).forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });
}
function renderDashClubs(players){
  // Club-overzicht: top 8 clubs, balk opgesplitst per potentieel-niveau
  const clubMap = {};
  players.forEach(p => {
    const club = p.club || 'Onbekend';
    if(!clubMap[club]) clubMap[club] = {total:0, A:0, B:0, C:0, D:0};
    clubMap[club].total++;
    const pot = p.potentieel_niveau || 'D';
    if(clubMap[club][pot] !== undefined) clubMap[club][pot]++;
  });
  const sorted = Object.entries(clubMap)
    .sort((a,b) => b[1].total - a[1].total)
    .slice(0, 8);
  const max = sorted[0]?.[1]?.total || 1;
  const wrap = $('#dash-clubs');
  if(!sorted.length){
    wrap.innerHTML = '<div class="gap-empty"><div class="icon">○</div><div>Nog geen spelers in database.</div></div>';
    return;
  }
  // Legenda
  const legend = ['A','B','C','D'].map(g =>
    `<span class="club-legend-dot" style="background:var(--grade-${g.toLowerCase()})"></span>${g}`
  ).join('');
  wrap.innerHTML = `
    <div class="club-legend">${legend}</div>
    <div class="club-grid">
      ${sorted.map(([club, data]) => {
        const tot = data.total;
        const segs = ['A','B','C','D']
          .filter(g => data[g] > 0)
          .map(g => `<div class="club-seg" style="width:${(data[g]/tot)*100}%;background:var(--grade-${g.toLowerCase()})" title="${data[g]}× pot. ${g}"></div>`)
          .join('');
        return `
          <div class="club-row" data-club="${escapeHtml(club)}">
            <div class="club-name">${escapeHtml(club)}</div>
            <div class="club-bar-wrap">
              <div class="club-bar">${segs}</div>
            </div>
            <div class="club-count">${tot}</div>
          </div>`;
      }).join('')}
    </div>
  `;
  $$('.club-row', wrap).forEach(el=>{
    el.addEventListener('click', ()=>{
      go('database');
      setTimeout(()=>{
        const s = $('#filter-search');
        if(s){ s.value = el.dataset.club; applyFilters(); }
      }, 50);
    });
  });
}
function renderDashCategories(players){
  const cats = [
    {key:'techniek_huidig', label:'Techniek'},
    {key:'inzicht_huidig', label:'Spelinzicht'},
    {key:'grit_huidig', label:'GRIT / Attitude'},
    {key:'explosiviteit_huidig', label:'Explosiviteit'},
    {key:'sprinten_huidig', label:'Sprinten'},
    {key:'duelleren_huidig', label:'Duelleren'},
    {key:'wendbaarheid_huidig', label:'Wendbaarheid'}
  ];
  $('#dash-categories').innerHTML = `
    <div class="cat-grid">
      ${cats.map(c=>{
        const avg = avgGradeNum(players, c.key);
        if(avg == null){
          return `
            <div class="cat-card">
              <div class="cat-card-name">${c.label}</div>
              <div class="cat-card-row">
                <div class="cat-card-grade" style="color:var(--text-3)">—</div>
                <div class="cat-card-score">geen data</div>
              </div>
              <div class="cat-card-bar"><div class="cat-card-fill" style="width:0%;"></div></div>
            </div>`;
        }
        const grade = gradeFromScore(avg);
        const pct = (avg / 4) * 100;
        const color = `var(--grade-${grade.toLowerCase()})`;
        return `
          <div class="cat-card">
            <div class="cat-card-name">${c.label}</div>
            <div class="cat-card-row">
              <div class="cat-card-grade" style="color:${color}">${grade}</div>
              <div class="cat-card-score">${avg.toFixed(2)} / 4.00</div>
            </div>
            <div class="cat-card-bar"><div class="cat-card-fill" style="width:${pct}%; background:${color};"></div></div>
          </div>`;
      }).join('')}
    </div>
  `;
}

/* ---- Follow-up nodig widget ---- */
function renderDashFollowUp(players){
  const wrap = $('#dash-followup');
  if(!wrap) return;
  const DAYS = 60;
  const cutoff = Date.now() - DAYS * 24 * 3600 * 1000;
  // Periodiek monitoren (2) of Op proef uitnodigen (3) maar al lang niet gezien
  const needsVisit = players.filter(p => {
    const adv = String(p.advies || '');
    if(adv !== '2' && adv !== '3') return false;
    if(!p.datum) return true; // geen datum = nog nooit bezocht
    return new Date(p.datum).getTime() < cutoff;
  }).sort((a,b) => {
    const da = a.datum ? new Date(a.datum).getTime() : 0;
    const db = b.datum ? new Date(b.datum).getTime() : 0;
    return da - db; // oudste eerst
  });
  if(!needsVisit.length){
    wrap.innerHTML = `<div class="followup-empty">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Geen spelers die follow-up nodig hebben — alles up-to-date.
    </div>`;
    return;
  }
  const daysSince = p => {
    if(!p.datum) return null;
    return Math.floor((Date.now() - new Date(p.datum).getTime()) / (24*3600*1000));
  };
  const advLabel = adv => adv === '3' ? 'Op proef' : 'Monitoren';
  const advClass = adv => adv === '3' ? 'B' : 'C';
  wrap.innerHTML = `
    <div class="followup-meta">
      ${needsVisit.length} speler${needsVisit.length===1?'':'s'} — langer dan ${DAYS} dagen niet bezocht
    </div>
    <div class="followup-list">
      ${needsVisit.slice(0,6).map(p => {
        const days = daysSince(p);
        const daysStr = days == null ? 'Nooit bezocht' : `${days} dagen geleden`;
        return `<div class="followup-row" data-id="${p.id}">
          <div class="followup-avatar">${initials(p.naam)}</div>
          <div class="followup-info">
            <div class="followup-naam">${escapeHtml(p.naam)}</div>
            <div class="followup-meta-row">${escapeHtml(positionLabel(p.positie))}${p.club?' · '+escapeHtml(p.club):''}</div>
          </div>
          <div class="followup-right">
            <span class="grade ${advClass(p.advies)}" style="font-size:10px;padding:2px 7px;">${advLabel(p.advies)}</span>
            <div class="followup-days">${daysStr}</div>
          </div>
        </div>`;
      }).join('')}
      ${needsVisit.length > 6 ? `<div class="followup-more">+ ${needsVisit.length-6} meer spelers</div>` : ''}
    </div>
    <button class="btn btn-sm followup-cta" id="followup-cta-btn">
      Toon alle ${needsVisit.length} in spelersbase →
    </button>`;
  const ctaBtn = document.getElementById('followup-cta-btn');
  if(ctaBtn) ctaBtn.addEventListener('click', () => {
    go('database');
    setTimeout(() => {
      try {
        $('#filter-advies').value = '2';
        applyFilters();
      } catch(_){}
    }, 60);
  });
  wrap.querySelectorAll('.followup-row').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
}

/* ---- Geo widget (Leaflet, regio Utrecht + Veluwe) ---- */
let _leafletMap = null;
let _leafletLayer = null;
let _leafletReadyPromise = null;

function ensureLeafletReady(){
  if(_leafletReadyPromise) return _leafletReadyPromise;
  _leafletReadyPromise = new Promise((resolve)=>{
    const check = ()=>{
      if(window.L && document.getElementById('geo-leaflet-map')){
        resolve(window.L);
      } else {
        setTimeout(check, 80);
      }
    };
    check();
  });
  return _leafletReadyPromise;
}

async function ensureMap(){
  const L = await ensureLeafletReady();
  if(_leafletMap){
    setTimeout(()=> { try { _leafletMap.invalidateSize(); } catch(_){} }, 30);
    return _leafletMap;
  }
  const mapEl = document.getElementById('geo-leaflet-map');
  if(!mapEl) return null;
  _leafletMap = L.map(mapEl, {
    center: REGION_CENTER,
    zoom: REGION_ZOOM,
    minZoom: 7,
    maxZoom: 16,
    zoomControl: true,
    attributionControl: true,
    maxBounds: L.latLngBounds([50.5, 3.0], [54.0, 8.0]),
    maxBoundsViscosity: 0.6
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(_leafletMap);
  _leafletLayer = L.layerGroup().addTo(_leafletMap);
  setTimeout(()=> { try { _leafletMap.invalidateSize(); } catch(_){} }, 60);
  return _leafletMap;
}

function clearMarkers(){
  if(_leafletLayer) _leafletLayer.clearLayers();
}

function buildMarkerIcon(L, label, count, kind){
  const html = `
    <div class="scout-marker-inner">
      <div class="scout-marker-dot">${count}</div>
      <div class="scout-marker-label">${escapeHtml(label)}</div>
    </div>`;
  return L.divIcon({
    className: 'scout-marker ' + (kind || ''),
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
}

function renderGeo(){
  renderGeoBreadcrumb();
  const lvl = geoState.level;
  ensureMap().then(()=>{
    if(lvl === 'team' && geoState.city && geoState.club && geoState.team) renderGeoTeam(geoState.city, geoState.club, geoState.team);
    else if(lvl === 'club' && geoState.city && geoState.club) renderGeoClub(geoState.city, geoState.club);
    else if(lvl === 'city' && geoState.city) renderGeoCity(geoState.city);
    else { geoState = {level:'map', city:null, club:null, team:null}; renderGeoMap(); }
  });
}

function renderGeoBreadcrumb(){
  const bc = $('#geo-breadcrumb');
  if(!bc) return;
  // s35ab: 'Regio'-root verwijderd. Lege breadcrumb is verborgen; bij
  // drill-down (stad/club/team) tonen we '← Terug' + crumbs.
  const parts = [];
  if(geoState.city) parts.push({label:geoState.city, level:'city'});
  if(geoState.club) parts.push({label:geoState.club, level:'club'});
  if(geoState.team) parts.push({label:geoState.team, level:'team'});
  if(parts.length === 0){
    bc.innerHTML = '';
    bc.style.display = 'none';
    return;
  }
  bc.style.display = '';
  const back = '<span class="geo-crumb geo-crumb-back" data-level="map">← Terug</span>';
  const crumbs = parts.map((p, i)=>{
    const isLast = i === parts.length - 1;
    return `<span class="geo-crumb-sep">›</span><span class="geo-crumb ${isLast?'current':''}" data-level="${p.level}">${escapeHtml(p.label)}</span>`;
  }).join('');
  bc.innerHTML = back + crumbs;
  $$('.geo-crumb', bc).forEach(el=>{
    if(el.classList.contains('current')) return;
    el.addEventListener('click', ()=>{
      const lvl = el.dataset.level;
      if(lvl === 'map') geoState = {level:'map', city:null, club:null, team:null};
      else if(lvl === 'city') geoState = {level:'city', city:geoState.city, club:null, team:null};
      else if(lvl === 'club') geoState = {level:'club', city:geoState.city, club:geoState.club, team:null};
      renderGeo();
    });
  });
}

async function renderGeoMap(){
  const L = window.L;
  const map = _leafletMap;
  if(!L || !map) return;
  clearMarkers();
  const players = loadPlayers();
  const byCity = {};
  players.forEach(p=>{
    const c = cityForPlayer(p);
    if(!c) return;
    if(!byCity[c]) byCity[c] = [];
    byCity[c].push(p);
  });
  const cities = Object.keys(byCity).sort((a,b)=> byCity[b].length - byCity[a].length);

  if(!cities.length){
    $('#geo-list-title').textContent = 'Steden';
    $('#geo-list-items').innerHTML = '<div class="geo-empty-text">Nog geen rapporten met plaatsgegevens. Vul club of plaats in bij rapporten.</div>';
    map.fitBounds(REGION_BOUNDS);
    return;
  }

  /* Plaats markers, geocode onbekende steden in achtergrond.
     Buitenlandse clubs (Malmö (SE), Turnhout (BE)) blijven buiten de regiokaart
     omdat REGION_BOUNDS Utrecht + Veluwe afdekt. */
  const SKIP_CITIES = new Set(['Malmö (SE)','Malmo (SE)','Turnhout (BE)','Malmö','Malmo']);
  cities.forEach(city=>{
    if(SKIP_CITIES.has(city)) return;
    const coords = coordsForCity(city);
    if(!coords){
      lookupCityCoords(city).then(c=>{ if(c) scheduleGeoRerender(); });
      return;
    }
    const n = byCity[city].length;
    const icon = buildMarkerIcon(L, city, n, '');
    const marker = L.marker([coords.lat, coords.lng], { icon }).addTo(_leafletLayer);
    marker.on('click', ()=>{
      geoState = {level:'city', city, club:null, team:null};
      renderGeo();
    });
  });
  map.fitBounds(REGION_BOUNDS, { padding: [20, 20] });

  const visibleCities = cities.filter(c => !SKIP_CITIES.has(c));
  $('#geo-list-title').textContent = `Steden (${visibleCities.length})`;
  $('#geo-list-items').innerHTML = visibleCities.map(city=>{
    const n = byCity[city].length;
    return `
      <div class="geo-list-item" data-city="${escapeHtml(city)}">
        <div class="geo-list-item-icon">${escapeHtml(city[0]||'?')}</div>
        <div class="geo-list-item-info">
          <div class="geo-list-item-name">${escapeHtml(city)}</div>
          <div class="geo-list-item-meta">${n} rapport${n===1?'':'en'}</div>
        </div>
        <div class="geo-list-item-count">${n}</div>
      </div>`;
  }).join('');
  $$('.geo-list-item', $('#geo-list-items')).forEach(el=>{
    el.addEventListener('click', ()=>{
      geoState = {level:'city', city:el.dataset.city, club:null, team:null};
      renderGeo();
    });
  });
}

async function renderGeoCity(city){
  const L = window.L;
  const map = _leafletMap;
  if(!L || !map) return;
  clearMarkers();
  const players = loadPlayers().filter(p => cityForPlayer(p) === city);
  const byClub = {};
  players.forEach(p=>{
    const club = (p.club || 'Onbekend').trim() || 'Onbekend';
    if(!byClub[club]) byClub[club] = [];
    byClub[club].push(p);
  });
  const clubs = Object.keys(byClub).sort((a,b)=> byClub[b].length - byClub[a].length);
  const coords = coordsForCity(city) || (await lookupCityCoords(city));
  if(coords){
    const icon = buildMarkerIcon(L, city, players.length, '');
    L.marker([coords.lat, coords.lng], { icon }).addTo(_leafletLayer);
    map.flyTo([coords.lat, coords.lng], 12, { duration: 0.6 });
  }
  $('#geo-list-title').textContent = `Clubs in ${city} (${clubs.length})`;
  if(!clubs.length){
    $('#geo-list-items').innerHTML = '<div class="geo-empty-text">Geen clubs gevonden.</div>';
    return;
  }
  $('#geo-list-items').innerHTML = clubs.map(club=>{
    const n = byClub[club].length;
    return `
      <div class="geo-list-item" data-club="${escapeHtml(club)}">
        <div class="geo-list-item-icon">${escapeHtml(initials(club))}</div>
        <div class="geo-list-item-info">
          <div class="geo-list-item-name">${escapeHtml(club)}</div>
          <div class="geo-list-item-meta">${n} rapport${n===1?'':'en'}</div>
        </div>
        <div class="geo-list-item-count">${n}</div>
      </div>`;
  }).join('');
  $$('.geo-list-item', $('#geo-list-items')).forEach(el=>{
    el.addEventListener('click', ()=>{
      geoState = {level:'club', city, club:el.dataset.club, team:null};
      renderGeo();
    });
  });
}

async function renderGeoClub(city, club){
  // s35j: elftal-tussenstap (vaak alleen "Algemeen") overslaan — toon direct rapporten.
  const L = window.L;
  const map = _leafletMap;
  if(!L || !map) return;
  clearMarkers();
  const players = loadPlayers()
    .filter(p => cityForPlayer(p) === city && (p.club || 'Onbekend').trim() === club)
    .sort((a,b)=> new Date(b.datum||0) - new Date(a.datum||0));
  const coords = coordsForCity(city) || (await lookupCityCoords(city));
  if(coords){
    const icon = buildMarkerIcon(L, club, players.length, 'club');
    L.marker([coords.lat, coords.lng], { icon }).addTo(_leafletLayer);
    map.flyTo([coords.lat, coords.lng], 13, { duration: 0.6 });
  }
  $('#geo-list-title').textContent = `Rapporten ${club} (${players.length})`;
  if(!players.length){
    $('#geo-list-items').innerHTML = '<div class="geo-empty-text">Geen rapporten gevonden.</div>';
    return;
  }
  $('#geo-list-items').innerHTML = players.map(p=>`
    <div class="geo-list-item" data-id="${p.id}">
      <div class="geo-list-item-icon">${escapeHtml(initials(p.naam))}</div>
      <div class="geo-list-item-info">
        <div class="geo-list-item-name">${escapeHtml(p.naam)}</div>
        <div class="geo-list-item-meta">${escapeHtml(positionLabel(p.positie))} · ${formatDate(p.datum)}</div>
      </div>
      <div class="geo-list-item-grades">
        <span class="grade ${p.huidig_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.huidig_niveau||'-'}</span>
        <span class="grade outline ${p.potentieel_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.potentieel_niveau||'-'}</span>
      </div>
    </div>
  `).join('');
  $$('.geo-list-item', $('#geo-list-items')).forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });
}

async function renderGeoTeam(city, club, team){
  const L = window.L;
  const map = _leafletMap;
  if(!L || !map) return;
  clearMarkers();
  const players = loadPlayers()
    .filter(p => cityForPlayer(p) === city && (p.club || 'Onbekend').trim() === club && teamForPlayer(p) === team)
    .sort((a,b)=> new Date(b.datum||0) - new Date(a.datum||0));
  const coords = coordsForCity(city) || (await lookupCityCoords(city));
  if(coords){
    const icon = buildMarkerIcon(L, team, players.length, 'team');
    L.marker([coords.lat, coords.lng], { icon }).addTo(_leafletLayer);
    map.flyTo([coords.lat, coords.lng], 14, { duration: 0.6 });
  }
  $('#geo-list-title').textContent = `Rapporten ${team} (${players.length})`;
  if(!players.length){
    $('#geo-list-items').innerHTML = '<div class="geo-empty-text">Geen rapporten gevonden.</div>';
    return;
  }
  $('#geo-list-items').innerHTML = players.map(p=>`
    <div class="geo-list-item" data-id="${p.id}">
      <div class="geo-list-item-icon">${escapeHtml(initials(p.naam))}</div>
      <div class="geo-list-item-info">
        <div class="geo-list-item-name">${escapeHtml(p.naam)}</div>
        <div class="geo-list-item-meta">${escapeHtml(positionLabel(p.positie))} · ${formatDate(p.datum)}</div>
      </div>
      <div class="geo-list-item-grades">
        <span class="grade ${p.huidig_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.huidig_niveau||'-'}</span>
        <span class="grade outline ${p.potentieel_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.potentieel_niveau||'-'}</span>
      </div>
    </div>
  `).join('');
  $$('.geo-list-item', $('#geo-list-items')).forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });
}

function countByGrade(arr, key){
  const out = {A:0,B:0,C:0,D:0};
  arr.forEach(p=>{ if(out[p[key]] !== undefined) out[p[key]]++; });
  return out;
}
function renderDist(dist, outline){
  const total = Object.values(dist).reduce((a,b)=>a+b,0) || 1;
  return GRADES.map(g=>{
    const pct = (dist[g]/total)*100;
    const color = `var(--grade-${g.toLowerCase()})`;
    return `
      <div class="dist-row">
        <div class="dist-label"><span class="grade ${outline?'outline ':''}${g}">${g}</span></div>
        <div class="dist-bar"><div class="dist-fill" style="width:${pct}%; background:${color}; ${outline?'opacity:.6;':''}"></div></div>
        <div class="dist-count">${dist[g]}</div>
      </div>`;
  }).join('');
}

/* B2: geanimeerde segmentbalk — vervangt renderDist in dashboard */
const _GRADE_COLORS = { A:'#c9a227', B:'#60a5fa', C:'#fbbf24', D:'#e30613' };
function renderDistSegment(dist, outline){
  const total = Object.values(dist).reduce((a,b)=>a+b,0) || 1;
  return `<div class="dist-segment-wrap">` + GRADES.map(g => {
    const pct = Math.round((dist[g]/total)*100);
    const col = _GRADE_COLORS[g] || '#888';
    const style = outline ? `opacity:.7` : '';
    return `
      <div class="dist-segment-row">
        <div class="dist-segment-label"><span class="grade ${outline?'outline ':' '}${g}">${g}</span></div>
        <div class="dist-segment-track">
          <div class="dist-segment-fill" data-target-w="${pct}%" style="background:${col};width:0;${style}"></div>
        </div>
        <div class="dist-segment-count">${dist[g]}</div>
      </div>`;
  }).join('') + `</div>`;
}

/* ── G2: Bubblechart spelerdatabase ── */
let _dbBubbleView = false;

function renderBubbleChart(players){
  const wrap = document.getElementById('db-bubble-wrap');
  if(!wrap) return;
  if(!players || !players.length){
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);">Geen spelers om te tonen.</div>';
    return;
  }
  const W = 900, H = 520;
  const GRADE_COLOR = { A:'#c9a227', B:'#60a5fa', C:'#fbbf24', D:'#e30613' };
  const GRADE_SCORE = { A:4, B:3, C:2, D:1 };

  // Positie spelers op een grid met lichte jitter
  const rMax = 38, rMin = 14;
  const cols = Math.ceil(Math.sqrt(players.length * 1.6));
  const rows = Math.ceil(players.length / cols);
  const cellW = W / (cols + 1), cellH = H / (rows + 1);

  const placed = players.map((p, i) => {
    const col = (i % cols) + 1;
    const row = Math.floor(i / cols) + 1;
    const jx = (Math.random() - .5) * cellW * .35;
    const jy = (Math.random() - .5) * cellH * .35;
    const reports = reportsForPlayer ? reportsForPlayer(p.id) : [];
    const rptCount = reports.length || 1;
    const r = Math.max(rMin, Math.min(rMax, rMin + (rptCount - 1) * 6));
    const grade = p.huidig_niveau || 'D';
    const color = GRADE_COLOR[grade] || '#888';
    return { p, x: col * cellW + jx, y: row * cellH + jy, r, grade, color, rptCount };
  });

  const bubbles = placed.map(b => {
    const firstName = (b.p.naam||'?').split(/\s+/)[0];
    const labelSize = b.r >= 26 ? 11 : 9;
    return `
      <g class="bubble-player" data-id="${escapeAttr(b.p.id)}" role="button" tabindex="0" aria-label="${escapeAttr(b.p.naam||'?')}">
        <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="${b.r}"
          fill="${b.color}" fill-opacity=".22" stroke="${b.color}" stroke-width="1.5"
          style="transition:r .3s,fill-opacity .2s"/>
        <circle cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}" r="3"
          fill="${b.color}" opacity=".9"/>
        ${b.r >= 20 ? `<text class="bubble-label" x="${b.x.toFixed(1)}" y="${(b.y + labelSize*.38).toFixed(1)}"
          fill="rgba(229,233,245,.95)" font-size="${labelSize}" text-anchor="middle"
          font-family="-apple-system,Segoe UI,sans-serif" font-weight="600">${escapeHtml(firstName)}</text>` : ''}
        <title>${escapeHtml(b.p.naam||'?')} · ${b.grade} · ${b.rptCount} rapport${b.rptCount===1?'':'en'}</title>
      </g>`;
  }).join('');

  // Legend
  const legend = Object.entries(GRADE_COLOR).map(([g, c]) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;">
      <svg width="10" height="10"><circle cx="5" cy="5" r="5" fill="${c}" fill-opacity=".8"/></svg>
      <span style="font-size:11px;color:var(--text-2);">${g}</span>
     </span>`).join('');
  const sizeLegend = `<span style="font-size:11px;color:var(--text-3);margin-left:8px;">Grootte = aantal rapporten</span>`;

  wrap.innerHTML = `
    <div style="font-size:12px;margin-bottom:10px;display:flex;align-items:center;flex-wrap:wrap;">${legend}${sizeLegend}</div>
    <svg id="db-bubble-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         style="border-radius:14px;background:var(--bg-2);border:1px solid var(--border);">${bubbles}</svg>`;

  // Click op bubble → open detail
  wrap.querySelectorAll('.bubble-player').forEach(el => {
    const open = () => { if(typeof openDetail === 'function') openDetail(el.dataset.id); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') open(); });
    // Hover highlight
    el.addEventListener('mouseenter', () => { el.querySelector('circle').setAttribute('fill-opacity','.45'); });
    el.addEventListener('mouseleave', () => { el.querySelector('circle').setAttribute('fill-opacity','.22'); });
  });
}

function toggleDbView(view){
  _dbBubbleView = (view === 'bubble');
  const tableWrap  = document.getElementById('db-table-wrap');
  const bubbleWrap = document.getElementById('db-bubble-wrap');
  const toggleBtns = document.querySelectorAll('.db-view-btn[data-db-view]');
  if(tableWrap)  tableWrap.style.display  = _dbBubbleView ? 'none' : '';
  if(bubbleWrap) bubbleWrap.style.display = _dbBubbleView ? 'block' : 'none';
  toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.dbView === view));
  if(_dbBubbleView){
    const players = loadPlayers ? loadPlayers() : [];
    renderBubbleChart(players);
  }
}

// Wire view-toggle
document.addEventListener('click', e => {
  const btn = e.target.closest('.db-view-btn[data-db-view]');
  if(btn) toggleDbView(btn.dataset.dbView);
});

/* =============== DATABASE =============== */
// s35ar (#226): "Verwijder dit concept" onderaan rapport-form
document.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('#report-delete-concept');
  if(!btn) return;
  e.preventDefault();
  const ok = confirm('Weet je zeker dat je dit concept wil verwijderen?\n\nAlles wat je hier hebt ingevuld gaat weg en kun je niet meer terughalen.');
  if(!ok) return;
  try {
    if(typeof window.__shDropDraft === 'function') window.__shDropDraft();
    try { localStorage.removeItem('sh_report_draft_v1'); } catch(_){}
    // huidig formulier ook leegmaken zodat er niks blijft hangen
    const form = document.getElementById('report-form');
    if(form && typeof form.reset === 'function') form.reset();
    if(typeof toast === 'function') toast('Concept verwijderd');
    if(typeof go === 'function') go('dashboard');
    if(typeof applyFilters === 'function') applyFilters();
  } catch(err){
    if(typeof toast === 'function') toast('Fout bij verwijderen', true);
  }
});

function wireDraftCard(){
  // s35ar (#225): meerdere resume-knoppen — class-based + route per concept
  document.querySelectorAll('.db-draft-resume-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isLoose = btn.dataset.loose === '1';
      if(isLoose){
        go('report');
        setTimeout(() => {
          const loadBtn = document.getElementById('report-draft-load');
          if(loadBtn) loadBtn.click();
        }, 200);
        return;
      }
      const progid = btn.dataset.progid;
      const spid   = btn.dataset.spid;
      const pid    = btn.dataset.pid;
      try {
        const prog = programmaCache.find(p => p.id === progid);
        if(!prog){ go('report'); return; }
        const sp = (prog.spelers||[]).find(s => s && s.id === spid);
        if(!sp){ go('report'); return; }
        const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
        const matched = sp.player_id ? (players.find(p => p.id === sp.player_id) || null) : null;
        const concept = pid ? (players.find(p => p.id === pid) || null) : null;
        if(typeof openScoutingPlayerForm === 'function'){
          openScoutingPlayerForm(prog, sp, matched, concept);
        } else {
          go('report');
        }
      } catch(_){
        go('report');
      }
    });
  });
}
// Wire obs-filter knop (eenmalig)
(function _wireObsFilterBtn(){
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('db-obs-filter-btn');
    if(!btn) return;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      if(typeof applyFilters === 'function') applyFilters();
    });
  });
})();

function renderDatabase(){
  const players = loadPlayers();
  $('#db-count').textContent = `${players.length} speler${players.length===1?'':'s'}`;

  const posSel = $('#filter-position');
  const cur = posSel.value;
  posSel.innerHTML = '<option value="">Alle posities</option>' +
    ALL_POSITIONS.map(p=>`<option value="${p.code}">${p.label}</option>`).join('');
  posSel.value = cur;

  applyFilters();
}
/* v70h-s25: pagination state */
let _dbPage = 1;
let _dbPageSize = 25;
function buildDbPaginator(totalItems, page, pageSize, position){
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIdx = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, page * pageSize);
  const info = totalItems === 0
    ? 'Geen spelers'
    : `${startIdx}–${endIdx} van ${totalItems}`;
  // Page-number buttons (max ~7 zichtbaar, met ellipsis)
  const pages = [];
  if(totalPages <= 7){
    for(let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if(page > 4) pages.push('...');
    const lo = Math.max(2, page - 1);
    const hi = Math.min(totalPages - 1, page + 1);
    for(let i = lo; i <= hi; i++) pages.push(i);
    if(page < totalPages - 3) pages.push('...');
    pages.push(totalPages);
  }
  const pageBtns = pages.map(p => {
    if(p === '...') return `<span class="pg-ellipsis">…</span>`;
    const active = p === page ? ' active' : '';
    return `<button type="button" class="pg-btn${active}" data-pg-page="${p}">${p}</button>`;
  }).join('');
  const prevDisabled = page <= 1 ? ' disabled' : '';
  const nextDisabled = page >= totalPages ? ' disabled' : '';
  const sizeOpts = [25,50,75,100].map(n =>
    `<option value="${n}"${n === pageSize ? ' selected' : ''}>${n}</option>`
  ).join('');
  return `
    <div class="db-paginator" data-pg-pos="${position}">
      <div class="pg-info">${info}</div>
      <div class="pg-size">
        <span>Toon</span>
        <select class="pg-size-sel" data-pg-size>${sizeOpts}</select>
        <span>per pagina</span>
      </div>
      <div class="pg-nav">
        <button type="button" class="pg-btn${prevDisabled}" data-pg-prev aria-label="Vorige">‹</button>
        ${pageBtns}
        <button type="button" class="pg-btn${nextDisabled}" data-pg-next aria-label="Volgende">›</button>
      </div>
    </div>`;
}
function applyFilters(){
  const players = loadPlayers();
  $('#db-count').textContent = `${players.length} speler${players.length===1?'':'s'}`;
  const q  = $('#filter-search').value.trim().toLowerCase();
  const fp = $('#filter-position').value;
  const fc = $('#filter-current').value;
  const fpot = $('#filter-potential').value;
  const fadv = $('#filter-advies').value;
  const fper = $('#filter-period').value;
  const fobs = document.getElementById('db-obs-filter-btn')?.classList.contains('active') || false;
  const perCutoff = fper ? (Date.now() - parseInt(fper,10)*24*3600*1000) : null;

  let filtered = players.filter(p=>{
    if(fobs && p.rapport_type !== 'observatie') return false;
    if(fp && p.positie !== fp) return false;
    if(fc && p.huidig_niveau !== fc) return false;
    if(fpot && p.potentieel_niveau !== fpot) return false;
    if(fadv && String(p.advies) !== fadv) return false;
    if(perCutoff != null){
      if(!p.datum) return false;
      if(new Date(p.datum).getTime() < perCutoff) return false;
    }
    if(q){
      const hay = `${p.naam||''} ${p.club||''} ${p.elftal||deriveElftalFromReport(p)||''} ${positionLabel(p.positie)}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a,b)=>{
    let av = a[sortKey], bv = b[sortKey];
    if(sortKey === 'datum'){ av = new Date(av||0).getTime(); bv = new Date(bv||0).getTime(); }
    if(av == null) av = '';
    if(bv == null) bv = '';
    if(av < bv) return sortAsc ? -1 : 1;
    if(av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const wrap = $('#db-table-wrap');
  // s35ar (#225): alle concepten ophalen — slot-concepten + losse draft
  const _draftParts = [];
  function _agoOf(ts){
    if(!ts) return '';
    const sec = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if(sec < 60) return sec + ' sec geleden';
    if(sec < 3600) return Math.round(sec/60) + ' min geleden';
    if(sec < 86400) return Math.round(sec/3600) + ' uur geleden';
    return Math.round(sec/86400) + ' dag(en) geleden';
  }
  try {
    if(typeof programmaCache !== 'undefined' && Array.isArray(programmaCache) && typeof findSlotConcept === 'function'){
      programmaCache.forEach(prog => {
        (prog.spelers || []).forEach(sp => {
          if(!sp || !sp.id) return;
          const c = findSlotConcept(prog.id, sp.id);
          if(!c) return;
          const naam = ((c.voornaam||'') + ' ' + (c.achternaam||'')).trim() || sp.naam || 'Onbenoemde speler';
          const club = (c.club || '').trim();
          const tsRaw = c.modified || c.created || (c._meta && c._meta.ts);
          const ts = (typeof tsRaw === 'number') ? tsRaw : (tsRaw && typeof tsRaw.toMillis === 'function' ? tsRaw.toMillis() : 0);
          const ago = _agoOf(ts);
          _draftParts.push(`
            <div class="db-draft-card">
              <div class="info">
                <div class="badge">Concept vanuit wedstrijd</div>
                <div class="title">${escapeHtml(naam)}${club ? ' &middot; ' + escapeHtml(club) : ''}</div>
                <div class="meta">Niet ingediend${ago ? ' &middot; ' + ago : ''}</div>
              </div>
              <div class="actions">
                <button type="button" class="primary db-draft-resume-btn" data-progid="${escapeHtml(prog.id)}" data-spid="${escapeHtml(sp.id)}" data-pid="${escapeHtml(c.id||'')}">Hier ook verder gaan</button>
              </div>
            </div>`);
        });
      });
    }
  } catch(_){}
  // losse draft (localStorage / __shHasMeaningfulDraft) — alleen als hij niet al via slot getoond is
  try {
    const draftSnap = (typeof window.__shHasMeaningfulDraft === 'function') ? window.__shHasMeaningfulDraft() : null;
    if(draftSnap){
      const naam = (draftSnap['f-naam'] || '').trim() || 'Onbenoemde speler';
      const club = (draftSnap['f-club'] || '').trim();
      const ts = draftSnap._meta && draftSnap._meta.ts;
      const ago = _agoOf(ts);
      // dedup: als de losse draft hetzelfde is als al getoond, skip
      const dup = _draftParts.some(h => h.indexOf('>'+escapeHtml(naam)) > -1);
      if(!dup){
        _draftParts.push(`
          <div class="db-draft-card">
            <div class="info">
              <div class="badge">Concept</div>
              <div class="title">${escapeHtml(naam)}${club ? ' &middot; ' + escapeHtml(club) : ''}</div>
              <div class="meta">Niet ingediend${ago ? ' &middot; ' + ago : ''}</div>
            </div>
            <div class="actions">
              <button type="button" class="primary db-draft-resume-btn" data-loose="1">Hier ook verder gaan</button>
            </div>
          </div>`);
      }
    }
  } catch(_){}
  const draftHtml = _draftParts.join('');
  // s35ao: draftHtml naar eigen slot boven filters
  { const slot = document.getElementById('db-draft-slot'); if(slot) slot.innerHTML = draftHtml; }
  if(!filtered.length){
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">○</div><div>Geen spelers gevonden.</div></div>';
    wireDraftCard();
    return;
  }
  const filteredIds = filtered.map(p => p.id);
  dbCheckedIds = dbCheckedIds.filter(id => filteredIds.includes(id));
  const allChecked = filteredIds.length > 0 && filteredIds.every(id => dbCheckedIds.includes(id));
  // v70h-s25: pagination — clamp page, slice
  const _totalPages = Math.max(1, Math.ceil(filtered.length / _dbPageSize));
  if(_dbPage > _totalPages) _dbPage = _totalPages;
  if(_dbPage < 1) _dbPage = 1;
  const _pageStart = (_dbPage - 1) * _dbPageSize;
  const pageItems = filtered.slice(_pageStart, _pageStart + _dbPageSize);
  const _paginatorTop = buildDbPaginator(filtered.length, _dbPage, _dbPageSize, 'top');
  const _paginatorBot = buildDbPaginator(filtered.length, _dbPage, _dbPageSize, 'bot');
  wrap.innerHTML = _paginatorTop + `
    <table>
      <thead>
        <tr>
          <th class="db-check-col"><input type="checkbox" class="db-check-all" id="db-check-all" ${allChecked?'checked':''} aria-label="Selecteer alles"/></th>
          <th class="db-expand-col" aria-label=""></th>
          <th data-sort="naam">Speler</th>
          <th data-sort="positie">Positie</th>
          <th data-sort="club">Club</th>
          <th data-sort="elftal">Elftal</th>
          <th data-sort="huidig_niveau">Huidig</th>
          <th data-sort="potentieel_niveau">Potentieel</th>
          <th data-sort="advies">Advies</th>
          <th data-sort="datum">Datum</th>
        </tr>
      </thead>
      <tbody>
        ${pageItems.map(p=>{
          const _rpts = reportsForPlayer(p.id);
          const _rcount = _rpts.length;
          const _expandCell = (_rcount >= 2)
            ? `<button type="button" class="db-expand-btn" data-id="${escapeAttr(p.id)}" aria-label="Toon ${_rcount} rapporten" aria-expanded="false" title="${_rcount} rapporten"><span class="db-expand-chev">▸</span><span class="db-expand-count">${_rcount}</span></button>`
            : '';
          return `
          <tr data-id="${p.id}" class="${dbCheckedIds.includes(p.id)?'db-row-checked':''} ${p.rapport_type==='observatie'?'db-row-obs':''}">
            <td class="db-check-col"><input type="checkbox" class="db-check" data-id="${escapeAttr(p.id)}" ${dbCheckedIds.includes(p.id)?'checked':''} aria-label="Selecteer ${escapeAttr(p.naam||'speler')}"/></td>
            <td class="db-expand-col">${_expandCell}</td>
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="recent-avatar ${p.rapport_type==='observatie'?'avatar-obs':''}" style="width:30px;height:30px;font-size:11px;">${initials(p.naam)}</div>
                <div>
                  <div style="font-weight:600;">${escapeHtml(p.naam)}${p.rapport_type==='observatie'?'<span class="db-obs-badge">OBS</span>':''}${p.concept ? '<span class="db-concept-badge">● concept</span>' : ''}</div>
                  <div style="font-size:11px; color:var(--text-3);">${p.been||''}</div>
                </div>
              </div>
            </td>
            <td>${escapeHtml(positionLabel(p.positie))}</td>
            <td>${escapeHtml(p.club||'—')}</td>
            <td>${escapeHtml(p.elftal || deriveElftalFromReport(p) || '—')}</td>
            <td><span class="grade ${p.huidig_niveau||'D'}">${p.huidig_niveau||'-'}</span></td>
            <td><span class="grade outline ${p.potentieel_niveau||'D'}">${p.potentieel_niveau||'-'}</span></td>
            <td>${adviesLabel(p.advies)||'—'}</td>
            <td>${formatDate(p.datum)}</td>
          </tr>
        `;}).join('')}
      </tbody>
    </table>
    ${_paginatorBot}
    <div id="db-compare-bar-host"></div>
  `;
  // v70h-s25: paginator click/change delegation
  $$('.db-paginator', wrap).forEach(pg => {
    pg.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.pg-btn');
      if(!btn || btn.classList.contains('disabled')) return;
      if(btn.hasAttribute('data-pg-prev')) {
        if(_dbPage > 1){ _dbPage--; applyFilters(); window.scrollTo({top:0, behavior:'smooth'}); }
        return;
      }
      if(btn.hasAttribute('data-pg-next')) {
        const tp = Math.max(1, Math.ceil(filtered.length / _dbPageSize));
        if(_dbPage < tp){ _dbPage++; applyFilters(); window.scrollTo({top:0, behavior:'smooth'}); }
        return;
      }
      const pNum = parseInt(btn.dataset.pgPage || '0', 10);
      if(pNum > 0 && pNum !== _dbPage){ _dbPage = pNum; applyFilters(); window.scrollTo({top:0, behavior:'smooth'}); }
    });
    const sel = pg.querySelector('[data-pg-size]');
    if(sel){
      sel.addEventListener('change', () => {
        _dbPageSize = parseInt(sel.value, 10) || 25;
        _dbPage = 1;
        applyFilters();
      });
    }
  });
  wireDraftCard();
  setTimeout(() => shStagger(wrap, 'tbody tr:not(.db-expanded-row)'), 0);
  // Row click → detail (but ignore clicks on de checkbox- en expand-kolommen)
  $$('tbody tr', wrap).forEach(tr=>{
    tr.addEventListener('click', (ev)=>{
      if(ev.target.closest('.db-check-col')) return;
      if(ev.target.closest('.db-expand-col')) return;
      if(tr.classList.contains('db-expanded-row')) return;
      openDetail(tr.dataset.id);
    });
  });
  // s35df: expand-arrow → toon rapportenlijst onder de rij
  $$('.db-expand-btn', wrap).forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const pid = btn.dataset.id;
      const tr = btn.closest('tr');
      if(!tr) return;
      const next = tr.nextElementSibling;
      const isOpen = next && next.classList && next.classList.contains('db-expanded-row') && next.dataset.for === pid;
      // Sluit eerst alle andere expansies
      $$('.db-expanded-row', wrap).forEach(r => r.remove());
      $$('.db-expand-btn', wrap).forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.classList.remove('open');
      });
      if(isOpen) return; // klik op open knop = sluiten
      const rpts = reportsForPlayer(pid).slice().sort((a,b)=>{
        const da = (a.datum||a.created_at||0); const db = (b.datum||b.created_at||0);
        return (db>da?1:db<da?-1:0);
      });
      if(!rpts.length) return;
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('open');
      const colCount = tr.children.length;
      const exTr = document.createElement('tr');
      exTr.className = 'db-expanded-row';
      exTr.dataset.for = pid;
      const td = document.createElement('td');
      td.colSpan = colCount;
      td.className = 'db-expanded-cell';
      td.innerHTML = `
        <div class="db-expanded-inner">
          <div class="db-expanded-title">Rapporten (${rpts.length}) — klik om direct te openen</div>
          <div class="db-expanded-list">
            ${rpts.map(r => {
              const dat = formatDate(r.datum || r.created_at || '');
              const tegen = (r.tegenstander || r.opponent || r.match_opponent || '').toString().trim();
              const grade = r.huidig_niveau || r.advies_letter || '';
              const adv = adviesLabel(r.advies) || '';
              return `
                <button type="button" class="db-expanded-row-item" data-pid="${escapeAttr(pid)}" data-rid="${escapeAttr(r.id)}">
                  <span class="db-er-date">${escapeHtml(dat||'—')}</span>
                  <span class="db-er-match">${tegen ? 'vs ' + escapeHtml(tegen) : '<span style="color:var(--text-3);">geen tegenstander</span>'}</span>
                  <span class="db-er-advies">${escapeHtml(adv)}</span>
                  <span class="db-er-grade">${grade ? `<span class="grade ${escapeAttr(grade)}">${escapeHtml(grade)}</span>` : ''}</span>
                  <span class="db-er-chev">›</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>`;
      exTr.appendChild(td);
      tr.parentNode.insertBefore(exTr, tr.nextSibling);
      // Wire report-row clicks
      $$('.db-expanded-row-item', exTr).forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const pidx = item.dataset.pid;
          const ridx = item.dataset.rid;
          if(pidx && ridx) openDetail(pidx, { reportId: ridx });
        });
      });
    });
  });
  // Per-row checkbox — v70h-s29: hard cap op CMP_MAX (6)
  $$('.db-check', wrap).forEach(cb => {
    cb.addEventListener('click', (ev) => ev.stopPropagation());
    cb.addEventListener('change', (ev) => {
      ev.stopPropagation();
      const id = cb.dataset.id;
      if(cb.checked){
        const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
        if(dbCheckedIds.length >= max){
          cb.checked = false;
          alert('Let op: je kunt maximaal ' + max + ' spelers tegelijk vergelijken.\n\nVerwijder eerst iemand uit je selectie voor je een andere kiest.');
          return;
        }
        if(!dbCheckedIds.includes(id)) dbCheckedIds.push(id);
      } else {
        dbCheckedIds = dbCheckedIds.filter(x => x !== id);
      }
      applyFilters();
    });
  });
  // Select-all checkbox — v70h-s29: hard cap op CMP_MAX (6)
  const allCb = $('#db-check-all', wrap);
  if(allCb){
    allCb.addEventListener('click', (ev) => ev.stopPropagation());
    allCb.addEventListener('change', () => {
      if(allCb.checked){
        const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
        const wouldBe = new Set([...dbCheckedIds, ...filteredIds]);
        if(wouldBe.size > max){
          allCb.checked = false;
          alert('Let op: je kunt maximaal ' + max + ' spelers tegelijk vergelijken.\n\nGebruik filters om je lijst te verkleinen, of selecteer spelers \u00e9\u00e9n voor \u00e9\u00e9n.');
          return;
        }
        filteredIds.forEach(id => { if(!dbCheckedIds.includes(id)) dbCheckedIds.push(id); });
      } else {
        dbCheckedIds = dbCheckedIds.filter(id => !filteredIds.includes(id));
      }
      applyFilters();
    });
  }
  // Sortable headers (skip checkbox col)
  $$('thead th[data-sort]', wrap).forEach(th=>{
    th.addEventListener('click', ()=>{
      const k = th.dataset.sort;
      if(sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = true; }
      _dbPage = 1; // v70h-s25: reset bij sort
      applyFilters();
    });
  });
  renderDbCompareBar();
}

/* v70h-s27: sync linker Vergelijken-knop met selectie-staat. */
function updateDbCompareFilterBtn(){
  const btn = document.getElementById('db-compare-filter-btn');
  const cnt = document.getElementById('db-compare-filter-count');
  if(!btn || !cnt) return;
  const n = dbCheckedIds.length;
  cnt.textContent = n;
  if(n >= 2){
    btn.disabled = false;
    btn.title = `Vergelijk ${n} geselecteerde spelers`;
  } else {
    btn.disabled = true;
    btn.title = 'Selecteer minimaal 2 spelers om te vergelijken';
  }
}

function renderDbCompareBar(){
  // v70h-s27: linker knop sync — altijd, ook als bar leeg is.
  updateDbCompareFilterBtn();
  const host = document.getElementById('db-compare-bar-host');
  const n = dbCheckedIds.length;
  const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
  // s35cz: ook altijd de floating-knop in sync houden, ook als host ontbreekt
  _renderDbCompareFloat(n, max);
  if(!host) return;
  if(n === 0){ host.innerHTML = ''; return; }
  const overflow = n > max;
  // v70h-s27: Verwijder-knop weg — bulk delete bestaat niet meer.
  host.innerHTML = `
    <div class="db-compare-bar">
      <div class="db-compare-bar-text">
        ${n} speler${n===1?'':'s'} geselecteerd
        ${overflow ? `<small>Alleen de eerste ${max} worden vergeleken</small>` : (n < 2 ? '<small>Selecteer minimaal 2 om te vergelijken</small>' : '<small>Klaar om te vergelijken</small>')}
      </div>
      <button type="button" class="db-compare-bar-btn ghost" id="db-compare-clear">Wis selectie</button>
      <button type="button" class="db-compare-bar-btn primary" id="db-compare-go" ${n<2?'disabled':''}>Vergelijken &rarr;</button>
    </div>
  `;
  const clearBtn = document.getElementById('db-compare-clear');
  if(clearBtn){
    clearBtn.addEventListener('click', () => {
      dbCheckedIds = [];
      applyFilters();
    });
  }
  const goBtn = document.getElementById('db-compare-go');
  if(goBtn && !goBtn.disabled){
    goBtn.addEventListener('click', () => {
      cmpSelectedIds = dbCheckedIds.slice(0, max);
      shUpdateCmpUI();
      dbCheckedIds = [];
      go('compare');
    });
  }
}

// s35cz: floating Vergelijken-knop — verschijnt zodra 2+ geselecteerd, scrollt naar boven + opent compare
function _renderDbCompareFloat(n, max){
  let btn = document.getElementById('db-compare-float');
  // Alleen tonen op database-view en bij 2+ selectie
  const onDb = document.body.classList.contains('view-database') || (typeof currentView === 'string' && currentView === 'database');
  if(n < 2 || !onDb){
    if(btn) btn.remove();
    return;
  }
  const count = Math.min(n, max);
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'db-compare-float';
    btn.type = 'button';
    btn.className = 'db-compare-float';
    btn.addEventListener('click', () => {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(_){ window.scrollTo(0, 0); }
      const ids = dbCheckedIds.slice(0, max);
      cmpSelectedIds = ids;
      shUpdateCmpUI();
      dbCheckedIds = [];
      // Korte vertraging zodat scroll mooi voelt voordat view wisselt
      setTimeout(() => { try { go('compare'); } catch(_){} }, 180);
    });
    document.body.appendChild(btn);
  }
  btn.innerHTML = `Vergelijk <span class="cmp-count-badge">${count}</span><span class="cmp-arrow">&rarr;</span>`;
}

/* =============== COMPARE VIEW =============== */
const CMP_COLORS = [
  { c: '#e30613', c2: '#ff5d6a' }, // FC Twente rood
  { c: '#4ea1ff', c2: '#7fc0ff' }, // Blauw
  { c: '#22c55e', c2: '#65e090' }, // Groen
  { c: '#f5c518', c2: '#ffe080' }, // Heracles geel
  { c: '#a855f7', c2: '#cf95ff' }, // Paars
  { c: '#fb7185', c2: '#ffadbb' }, // Roze
];
const CMP_MAX = 6;
const CMP_CRITERIA = [
  { key: 'techniek_huidig',    label: 'Techniek',    short: 'Techn.' },
  { key: 'inzicht_huidig',     label: 'Inzicht',     short: 'Inzicht' },
  { key: 'grit_huidig',        label: 'GRIT',        short: 'GRIT' },
  { key: 'explosiviteit_huidig', label: 'Explosief',   short: 'Explos.' },
  { key: 'sprinten_huidig',    label: 'Sprinten',    short: 'Sprint' },
  { key: 'duelleren_huidig',   label: 'Duelleren',   short: 'Duel' },
  { key: 'wendbaarheid_huidig',label: 'Wendbaarh.',  short: 'Wendb.' },
];
const CMP_GRADE_VAL = { A:4, B:3, C:2, D:1 };

let cmpSelectedIds = [];
let cmpSearchQuery = '';
let dbCheckedIds = [];
// s35bs: extra filter-state (compare + edit-mode state vervallen)
let matchStatusFilter = "";  // "", "verwerkt", "toernooi", "info"
// s35br: wedstrijd-verwerken persistent state + helpers
const SH_VERWERK_KEY = "sh_wedstrijd_verwerkt_v1";
function _shLoadVerwerkt(){
  try { return JSON.parse(localStorage.getItem(SH_VERWERK_KEY) || "[]"); }
  catch(_){ return []; }
}
function _shSaveVerwerkt(arr){
  try { localStorage.setItem(SH_VERWERK_KEY, JSON.stringify(arr || [])); } catch(_){}
}
function shIsWedstrijdVerwerkt(matchKey){
  if(!matchKey) return false;
  return _shLoadVerwerkt().indexOf(matchKey) >= 0;
}
function shMarkWedstrijdVerwerkt(matchKey, on){
  if(!matchKey) return;
  const arr = _shLoadVerwerkt();
  const i = arr.indexOf(matchKey);
  if(on && i < 0) arr.push(matchKey);
  if(!on && i >= 0) arr.splice(i, 1);
  _shSaveVerwerkt(arr);
}
function _shMatchKey(m){
  if(!m) return "";
  if(m.kind === "report") return "REPORT|" + (m.id || "");
  if(m.toernooi) return ["TOERNOOI", m.datum, (m.toernooi_naam||"").toLowerCase()].join("|");
  return [m.datum||"", (m.thuis||"").toLowerCase(), (m.uit||"").toLowerCase()].join("|");
}
// Vind programma-items die bij deze wedstrijd horen (datum + thuis/uit match)
function _shFindLinkedPrograms(m){
  const list = (typeof programmaCache !== "undefined" && Array.isArray(programmaCache)) ? programmaCache : [];
  if(!m || !m.datum) return [];
  const datum = m.datum;
  const thuis = (m.thuis || "").toLowerCase().trim();
  const uit = (m.uit || "").toLowerCase().trim();
  return list.filter(p => {
    if((p.datum||"") !== datum) return false;
    const pt = (p.thuis||"").toLowerCase().trim();
    const pu = (p.uit||"").toLowerCase().trim();
    if(thuis && uit) return pt === thuis && pu === uit;
    if(thuis) return pt === thuis;
    if(uit) return pu === uit;
    return false;
  });
}
// Verzamel alle open snel-notities van gekoppelde programma-items
function _shCollectSnelNotities(m){
  const out = [];
  // s35dh: collect spelerKeys die al in prog.spelers zitten (zijn al getoond in Spelersrapporten-sectie)
  const _linkedSpelerIds = new Set();
  _shFindLinkedPrograms(m).forEach(p => {
    (p.spelers || []).forEach(sp => { if(sp && sp.id) _linkedSpelerIds.add(sp.id); });
  });
  _shFindLinkedPrograms(m).forEach(p => {
    (p.snelnotities || []).forEach((sn, idx) => {
      // Skip als notitie voor een gekoppelde speler is
      if(sn && sn.spelerKey && _linkedSpelerIds.has(sn.spelerKey)) return;
      // Skip ingediende obs-drafts (al verwerkt als observatie)
      if(sn && sn.rapport_type === 'observatie' && sn.ingediend === true) return;
      out.push({ progId: p.id, snIdx: idx, sn });
    });
  });
  return out;
}
// s35bu: open Wedstrijdrapport-modal met prefill uit een (snel-)wedstrijdnotitie
function _shConvertWstrNotitieToRapport(progId, wnIdx){
  try {
    const items = (typeof loadProgramma === 'function') ? loadProgramma() : [];
    const p = items.find(x => x && x.id === progId);
    if(!p){ if(typeof toast === 'function') toast('Programma-item niet gevonden', true); return; }
    let tekst = '';
    let title = '';
    if(wnIdx === -1){
      // Programmanotitie (scalar)
      tekst = (p.notities || '').trim();
      title = 'Programmanotitie';
    } else {
      const wns = Array.isArray(p.wedstrijdnotities) ? p.wedstrijdnotities : [];
      const wn = wns[wnIdx];
      if(!wn){ if(typeof toast === 'function') toast('Wedstrijdnotitie niet gevonden', true); return; }
      tekst = ((wn.tekst || wn.notitie) || '').trim();
      title = wn.titel || '';
    }
    // Markers voor consumer in match-rapport save-handler
    window.__shConvertingFromWnIdx = wnIdx;
    window.__shConvertingFromWnProgId = progId;
    // Open lege match-rapport modal en prefill
    if(typeof openMatchReportModal === 'function'){
      openMatchReportModal('');
      setTimeout(() => {
        try {
          const setVal = (id, v) => { const el = document.getElementById(id); if(el && v != null && el.value === '') el.value = v; };
          setVal('mr-datum', p.datum || '');
          setVal('mr-thuis', p.thuis || '');
          setVal('mr-uit',   p.uit   || '');
          setVal('mr-age',   p.leeftijd || '');
          const opm = document.getElementById('mr-opmerking');
          if(opm){
            const prefix = title ? (title + ': ') : '';
            opm.value = (opm.value ? (opm.value + '\n\n') : '') + prefix + tekst;
          }
        } catch(_){}
      }, 60);
    } else {
      if(typeof toast === 'function') toast('Rapport-modal niet beschikbaar', true);
    }
  } catch(err){
    console.warn('convert wstr-notitie failed', err);
    if(typeof toast === 'function') toast('Omzetten mislukt', true);
  }
}

// Verzamel alle wedstrijdnotities (s35bu: ook p.notities scalar)
function _shCollectWedstrijdNotities(m){
  const out = [];
  _shFindLinkedPrograms(m).forEach(p => {
    (p.wedstrijdnotities || []).forEach((wn, idx) => {
      out.push({ progId: p.id, wnIdx: idx, wn });
    });
    // s35bu: programma-veld 'notities' (scalar) is óók een wedstrijdnotitie
    const sc = (p && typeof p.notities === 'string') ? p.notities.trim() : '';
    if(sc){
      out.push({ progId: p.id, wnIdx: -1, wn: { tekst: sc, titel: 'Programmanotitie', _isProgNotities: true } });
    }
  });
  return out;
}
/* s35dg Fase E: na fluitje+15 worden losse notities één keer omgezet naar
   concept-rapporten. `prog.wedstrijdrapport` houdt het concept-wedstrijdrapport
   bij. Idempotent via `__notesConverted` flag. */
function _shCollectWedstrijdTekst(prog){
  if(!prog) return '';
  const parts = [];
  (prog.wedstrijdnotities || []).forEach(wn => {
    const t = ((wn && (wn.tekst || wn.notitie)) || '').trim();
    if(t){
      const titel = (wn && wn.titel) ? (wn.titel + ': ') : '';
      parts.push(titel + t);
    }
  });
  const sc = (prog && typeof prog.notities === 'string') ? prog.notities.trim() : '';
  if(sc) parts.push(sc);
  return parts.join('\n\n');
}
function _shConvertNotesToDrafts(prog){
  if(!prog) return false;
  if(prog.__notesConverted === true) return false;
  // Alleen omzetten als de wedstrijd echt op slot staat (fluitje+15 voorbij).
  if(typeof _shIsMatchLocked === 'function' && !_shIsMatchLocked(prog)) return false;
  const tekst = _shCollectWedstrijdTekst(prog);
  const hasSnel = Array.isArray(prog.snelnotities) && prog.snelnotities.length > 0;
  if(!tekst && !hasSnel) return false;
  let plaats = '';
  try {
    if(typeof findClubInfo === 'function'){
      const info = findClubInfo(prog.thuis || prog.uit || '');
      if(info && info.plaats) plaats = info.plaats;
    }
  } catch(_){}
  const wr = prog.wedstrijdrapport || {};
  // s35dj: elftal als leeftijdscategorie meegeven
  const _wrdElftal = (prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim();
  const _wrdThuis  = prog.thuis ? `${prog.thuis}${prog.thuis_elftal?' '+prog.thuis_elftal:''}`.trim() : (wr.thuis||'');
  const _wrdUit    = prog.uit   ? `${prog.uit}${prog.uit_elftal?' '+prog.uit_elftal:''}`.trim()       : (wr.uit||'');
  prog.wedstrijdrapport = {
    status: 'concept',
    tekst: tekst,
    datum: prog.datum || wr.datum || '',
    leeftijd: _wrdElftal || wr.leeftijd || '',
    methode:  prog.methode || wr.methode || '',
    thuis:    _wrdThuis,
    uit:      _wrdUit,
    plaats:   plaats || wr.plaats || '',
    sportpark: prog.locatie || wr.sportpark || '',
    veld:     prog.veld || wr.veld || '',
    updated_at: Date.now()
  };
  // s35dg-hotfix1: óók losse snel-notities (zonder gekoppelde speler) omzetten
  // naar concept-spelersrapporten in playersCache. Fire-and-forget, idempotent.
  try { _shConvertSnelToConceptPlayers(prog); } catch(e){
    try { if(typeof __shTrace === 'function') __shTrace('hotfix1-convert-fail', { msg: String(e) }); } catch(_){}
  }
  prog.__notesConverted = true;
  prog.modified = Date.now();
  try {
    if(typeof saveProgrammaItem === 'function') saveProgrammaItem(prog);
  } catch(_){}
  return true;
}
window._shConvertNotesToDrafts = _shConvertNotesToDrafts;

// s35dg-hotfix1: zet `prog.snelnotities[]` om naar concept-spelersrapporten in
// playersCache zodat ze in de spelersdatabase verschijnen en het verwerken-blok
// (Fase G) er hard op kan blokkeren. Idempotent: per snel-notitie wordt
// `sn.__convertedToPlayerId` gezet zodra het concept is aangemaakt. Re-runs
// slaan reeds-omgezette notities over en updaten bestaande concept-records
// alleen als de tekst gewijzigd is.
function _shConvertSnelToConceptPlayers(prog){
  if(!prog || !Array.isArray(prog.snelnotities) || !prog.snelnotities.length) return 0;
  const sns = prog.snelnotities;
  let count = 0;
  for(let i=0; i<sns.length; i++){
    const sn = sns[i];
    if(!sn || !sn.id) continue;
    try {
      // Stap 1: kijk of er al een slot-concept bestaat (s35s heeft die mogelijk
      // al gemaakt voor gekoppelde spelers — dan alleen tekst aanvullen).
      const existing = (typeof findSlotConcept === 'function')
        ? findSlotConcept(prog.id, sn.id)
        : null;
      if(existing){
        // Slot-concept bestaat al — alleen opmerkingen aanvullen als nieuwe tekst
        const newTekst = String(sn.tekst || '').trim();
        const curTekst = String(existing.opmerkingen || '').trim();
        if(newTekst && newTekst !== curTekst){
          existing.opmerkingen = newTekst;
          existing.updated_at = new Date().toISOString();
          if(typeof window.__shScoutingSave === 'function'){
            window.__shScoutingSave(existing).catch(()=>{});
          } else if(typeof savePlayer === 'function'){
            savePlayer(existing).catch(()=>{});
          }
        }
        sn.__convertedToPlayerId = existing.id;
        continue;
      }
      // Stap 2: skip als deze notitie eerder al is omgezet
      if(sn.__convertedToPlayerId) continue;
      // Stap 3: bouw nieuw concept-spelersrapport
      const fullNaam = String(sn.naam || '').trim();
      let vn = '', an = '';
      if(fullNaam){
        if(typeof splitNaam === 'function'){
          const s = splitNaam(fullNaam);
          vn = s.voornaam || ''; an = s.achternaam || '';
        } else {
          const parts = fullNaam.split(/\s+/);
          vn = parts[0] || ''; an = parts.slice(1).join(' ');
        }
      }
      // Plaats afleiden uit thuisclub-adresboek (zoals wedstrijdrapport hierboven)
      let plaats = '';
      try {
        if(typeof findClubInfo === 'function'){
          const info = findClubInfo(prog.thuis || prog.uit || '');
          if(info && info.plaats) plaats = info.plaats;
        }
      } catch(_){}
      const detId = 'concept_' + String(prog.id).replace(/[^a-z0-9_-]/gi,'')
                  + '__' + String(sn.id).replace(/[^a-z0-9_-]/gi,'');
      const nowIso = new Date().toISOString();
      // s35dj: elftal/leeftijd meegenomen uit programma
      const _snElftal = (prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim();
      const _snThuis  = prog.thuis ? `${prog.thuis}${prog.thuis_elftal?' '+prog.thuis_elftal:''}`.trim() : '';
      const _snUit    = prog.uit   ? `${prog.uit}${prog.uit_elftal?' '+prog.uit_elftal:''}`.trim()       : '';
      const concept = {
        id: detId,
        concept: true,
        status: 'concept',
        voornaam: vn,
        achternaam: an,
        naam: fullNaam,
        rugnummer: sn.rugnummer || '',
        positie: sn.positie || '',
        elftal: sn.elftal || _snElftal,
        leeftijd: _snElftal,
        club: sn.club || prog.thuis || '',
        opmerkingen: String(sn.tekst || '').trim(),
        rapport: {
          wedstrijd: {
            datum:     prog.datum || '',
            leeftijd:  _snElftal,
            methode:   prog.methode || '',
            thuis:     _snThuis,
            uit:       _snUit,
            plaats:    plaats || '',
            sportpark: prog.locatie || '',
            veld:      prog.veld || ''
          }
        },
        datum: prog.datum || '',
        programma_link: { progId: prog.id, spelerKey: sn.id },
        created_at: nowIso,
        updated_at: nowIso,
        _meta: { ts: Date.now(), source: 's35dg-hotfix1' }
      };
      // Fire-and-forget save via module-bridge (sync cache-upsert + async write).
      if(typeof window.__shScoutingSave === 'function'){
        window.__shScoutingSave(concept).catch(()=>{});
      } else if(typeof savePlayer === 'function'){
        try { playersCache.push(concept); } catch(_){}
        savePlayer(concept).catch(()=>{});
      }
      sn.__convertedToPlayerId = detId;
      count++;
    } catch(err){
      try { if(typeof __shTrace === 'function') __shTrace('hotfix1-snel-fail', { idx: i, msg: String(err) }); } catch(_){}
    }
  }
  return count;
}
window._shConvertSnelToConceptPlayers = _shConvertSnelToConceptPlayers;
// Player heeft concept-status?
function _shPlayerIsConcept(pl){
  return !!(pl && (pl.concept === true || pl.status === "concept"));
}
// s35bs: open Wedstrijd-bewerken modal (full-screen)
function _shOpenEditModal(m){
  const back = document.getElementById("wstr-edit-backdrop");
  if(!back || !m) return;
  window.__shCurrentEditMatch = m;

  const key = _shMatchKey(m);
  const isLocked = shIsWedstrijdVerwerkt(key);

  // Header
  const titleEl = document.getElementById("wstr-edit-title");
  const subEl = document.getElementById("wstr-edit-sub");
  const teamTxt = (m.thuis && m.uit) ? `${m.thuis} — ${m.uit}` : (m.toernooi_naam || "Wedstrijd");
  if(titleEl) titleEl.textContent = teamTxt;
  const subParts = [];
  if(m.datum){
    try {
      const dt = new Date(m.datum);
      if(!isNaN(dt)) subParts.push(`<span class="pill-inline">${dt.toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"long",year:"numeric"})}</span>`);
      else subParts.push(`<span class="pill-inline">${escapeHtml(m.datum)}</span>`);
    } catch(_){ subParts.push(`<span class="pill-inline">${escapeHtml(m.datum)}</span>`); }
  }
  if(m.uitslag) subParts.push(`<span class="pill-inline">⚽ ${escapeHtml(m.uitslag)}</span>`);
  if(m.age) subParts.push(`<span class="pill-inline">${escapeHtml(m.age)}</span>`);
  if(isLocked) subParts.push(`<span class="pill-inline locked">🔒 Verwerkt</span>`);
  if(subEl) subEl.innerHTML = subParts.join("");

  // Verzamel gekoppelde data
  let players = Array.isArray(m.players) ? m.players.slice() : [];
  // Voor report-cards: vind gekoppelde spelers via report-id
  if(m.kind === "report" && players.length === 0){
    try {
      const all = (typeof loadPlayers === "function") ? loadPlayers() : [];
      players = all.filter(p => {
        const rids = Array.isArray(p.match_report_ids) ? p.match_report_ids : [];
        if(rids.indexOf(m.id) >= 0) return true;
        if(p.match_report_id === m.id) return true;
        return false;
      });
    } catch(_){}
  }
  // s35dh: voor programma-kind: zoek concept-spelers gekoppeld via programma_link of wedstrijd-velden
  if((m.kind === 'programma' || m.kind === 'prog') && players.length === 0 && m.progId){
    try {
      const _allEdit = (typeof loadPlayers === 'function') ? loadPlayers() : [];
      const _found = _allEdit.filter(p => {
        if(p.programma_link && p.programma_link.progId === m.progId) return true;
        const _w = (p.wedstrijd) || (p.rapport && p.rapport.wedstrijd) || {};
        return _w.datum === m.datum &&
               (_w.thuis||'').toLowerCase().trim() === (m.thuis||'').toLowerCase().trim() &&
               (_w.uit||'').toLowerCase().trim() === (m.uit||'').toLowerCase().trim();
      });
      _found.forEach(p => players.push(p));
    } catch(_){}
  }
  const sns = _shCollectSnelNotities(m);
  const wns = _shCollectWedstrijdNotities(m);

  // Body opbouwen
  const bodyEl = document.getElementById("wstr-edit-body");
  if(!bodyEl) return;
  let html = "";

  if(m.opmerking){
    html += `<div class="wstr-edit-section">
      <div class="wstr-edit-section-head">
        <div class="wstr-edit-section-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg></div>
        <div class="wstr-edit-section-title">Wedstrijdopmerking</div>
      </div>
      <div style="font-size:13px;color:var(--text-2);line-height:1.5;padding:8px 12px;background:var(--bg-2);border-radius:8px;">${escapeHtml(m.opmerking).replace(/\n/g,"<br>")}</div>
    </div>`;
  }

  // Sectie: Gekoppelde spelers
  html += `<div class="wstr-edit-section">
    <div class="wstr-edit-section-head">
      <div class="wstr-edit-section-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
      <div class="wstr-edit-section-title">Gekoppelde spelers</div>
      <div class="wstr-edit-section-count">${players.length}</div>
    </div>`;
  if(players.length === 0){
    html += `<div class="wstr-edit-empty">Nog géén spelers gekoppeld aan deze wedstrijd.</div>`;
  } else {
    // Zoek bijbehorende snelnotitie via spelerKey (voor preview)
    const _editLinkedProgs = (typeof _shFindLinkedPrograms === 'function') ? _shFindLinkedPrograms(m) : [];
    html += players.map(pl => {
      const initials = (pl.naam || '?').split(/\s+/).map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
      const posLabel = (typeof positionLabel === 'function' ? (positionLabel(pl.positie) || pl.positie || '') : (pl.positie || ''));
      const sub = [posLabel, pl.club].filter(Boolean).join(' • ');
      const isConcept = _shPlayerIsConcept(pl);
      const conceptBadge = isConcept ? `<span class="mdr-concept-badge">Concept</span>` : '';
      // Zoek snelnotitie voor deze speler
      const _spKey = pl.programma_link && pl.programma_link.spelerKey;
      let _snPrev = '';
      if(_spKey){
        const _snProg = _editLinkedProgs.find(p => p.id === (pl.programma_link && pl.programma_link.progId)) || _editLinkedProgs[0];
        const _sn = _snProg && Array.isArray(_snProg.snelnotities) && _snProg.snelnotities.find(s => s && s.spelerKey === _spKey);
        if(_sn && _sn.tekst){
          _snPrev = _sn.tekst.replace(/^[a-z]+:\s*/gmi,'').replace(/\n+/g,' · ').trim().slice(0,120);
        }
      }
      return `<div class="wstr-edit-item${isConcept?' is-concept':''}">
        <div class="wstr-edit-item-avatar">${escapeHtml(initials || '?')}</div>
        <div class="wstr-edit-item-main">
          <div class="wstr-edit-item-name">${escapeHtml(pl.naam || '—')}${conceptBadge}</div>
          ${sub ? `<div class="wstr-edit-item-sub">${escapeHtml(sub)}</div>` : ''}
          ${_snPrev ? `<div class="wstr-edit-item-sn-prev">${escapeHtml(_snPrev)}</div>` : ''}
        </div>
        <div class="wstr-edit-item-actions">
          <button type="button" class="wstr-edit-mini-btn primary" data-edit-player="${escapeHtml(pl.id)}" title="Aanvullen en indienen als spelersrapport">→ Spelersrapport</button>
        </div>
      </div>`;
    }).join('');
  }
  html += `</div>`;

  // Sectie: Nieuwe spelersnotities (s35dg Fase F)
  html += `<div class="wstr-edit-section">
    <div class="wstr-edit-section-head">
      <div class="wstr-edit-section-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.3v1h6v-1c0-1 .3-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg></div>
      <div class="wstr-edit-section-title">Opgevallen spelers</div>
      <div class="wstr-edit-section-count">${sns.length}</div>
    </div>`;
  if(sns.length === 0){
    html += `<div class="wstr-edit-empty">Geen openstaande spelersnotities.</div>`;
  } else {
    html += sns.map(({progId, snIdx, sn}) => {
      const naam = (sn.naam || "Onbenoemde speler").trim();
      const num = sn.rugnummer ? `#${escapeHtml(String(sn.rugnummer))} ` : "";
      const tekst = (sn.tekst || "").trim();
      return `<div class="wstr-edit-note snel">
        <div class="wstr-edit-note-icon">💡</div>
        <div class="wstr-edit-note-main">
          <div class="wstr-edit-note-title">${num}${escapeHtml(naam)}</div>
          ${tekst ? `<div class="wstr-edit-note-text">${escapeHtml(tekst)}</div>` : '<div class="wstr-edit-note-text" style="font-style:italic;opacity:0.7;">(geen tekst)</div>'}
        </div>
        <button type="button" class="wstr-edit-note-action obs" data-edit-snel-obs="${escapeHtml(progId)}" data-edit-snel-obs-idx="${snIdx}">→ Observatie</button>
      </div>`;
    }).join('');
  }
  html += `</div>`;

  // Sectie: Wedstrijdrapport (s35dg Fase F)
  // Bij voorkeur: één concept-record uit prog.wedstrijdrapport. Fallback: ruwe wedstrijdnotities.
  const linkedProgs = (typeof _shFindLinkedPrograms === 'function') ? _shFindLinkedPrograms(m) : [];
  const wrConceptProg = linkedProgs.find(p => p && p.wedstrijdrapport && p.wedstrijdrapport.status === 'concept');
  html += `<div class="wstr-edit-section">
    <div class="wstr-edit-section-head">
      <div class="wstr-edit-section-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
      <div class="wstr-edit-section-title">Wedstrijdrapport</div>
      <div class="wstr-edit-section-count">${wrConceptProg ? 1 : wns.length}</div>
    </div>`;
  if(wrConceptProg){
    const wr = wrConceptProg.wedstrijdrapport || {};
    const tekst = (wr.tekst || "").trim();
    html += `<div class="wstr-edit-note wstr">
      <div class="wstr-edit-note-icon">📝</div>
      <div class="wstr-edit-note-main">
        <div class="wstr-edit-note-title">Concept</div>
        ${tekst ? `<div class="wstr-edit-note-text">${escapeHtml(tekst).replace(/\n/g,'<br>')}</div>` : '<div class="wstr-edit-note-text" style="font-style:italic;opacity:0.7;">(nog geen tekst — open om in te vullen)</div>'}
      </div>
      <button type="button" class="wstr-edit-note-action" data-wr-open-modal="${escapeHtml(wrConceptProg.id)}">Open wedstrijdrapport</button>
    </div>`;
  } else if(wns.length === 0){
    html += `<div class="wstr-edit-empty">Nog geen wedstrijdrapport — voeg notities toe vanuit Programma of dashboard.</div>`;
  } else {
    html += wns.map(({progId, wnIdx, wn}) => {
      const tekst = ((wn && (wn.tekst || wn.notitie)) || "").trim();
      const titel = (wn && wn.titel) ? wn.titel : "Wedstrijdnotitie";
      return `<div class="wstr-edit-note wstr">
        <div class="wstr-edit-note-icon">📝</div>
        <div class="wstr-edit-note-main">
          <div class="wstr-edit-note-title">${escapeHtml(titel)}</div>
          ${tekst ? `<div class="wstr-edit-note-text">${escapeHtml(tekst)}</div>` : '<div class="wstr-edit-note-text" style="font-style:italic;opacity:0.7;">(geen tekst)</div>'}
        </div>
        <button type="button" class="wstr-edit-note-action" data-edit-wstr-prog="${escapeHtml(progId)}" data-edit-wstr-idx="${wnIdx}">Openen</button>
      </div>`;
    }).join('');
  }
  html += `</div>`;

  bodyEl.innerHTML = html;

  // Footer-acties (preserveer class-namen zodat bestaande handlers werken)
  const footEl = document.getElementById("wstr-edit-foot");
  if(footEl){
    const reportId = m.kind === "report" ? m.id : "";
    // s-prog-edit-removed: "Bewerk in Programma" niet in Wedstrijden-modal
    const progEditBtn = '';
    footEl.innerHTML = `
      <button type="button" class="btn btn-secondary match-verwerk-btn" data-match-key="${escapeHtml(key)}" data-report-id="${escapeHtml(reportId)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ${isLocked ? 'Status herzien' : 'Verwerken'}
      </button>
      ${m.kind === "report" ? `
      <button type="button" class="btn btn-secondary match-report-edit" data-report-id="${escapeHtml(m.id)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Rapport bewerken
      </button>
      <button type="button" class="btn btn-ghost match-report-add-player" data-report-id="${escapeHtml(m.id)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        + Speler
      </button>
      <button type="button" class="btn btn-ghost match-report-delete" data-report-id="${escapeHtml(m.id)}" style="color:#ef4444;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Verwijderen
      </button>` : ''}
      ${progEditBtn}
    `;
  }

  // Wire interne acties (binnen modal)
  bodyEl.querySelectorAll('[data-edit-player]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.editPlayer;
      _shCloseEditModal();
      // s35dh fix: open rapport-formulier direct (niet spelersprofiel)
      try {
        const _allP = (typeof loadPlayers === 'function') ? loadPlayers() : [];
        const _pl = _allP.find(x => x.id === pid);
        if(!_pl){ if(typeof openDetail === 'function') openDetail(pid); return; }
        // Concept met programma-link → via openScoutingPlayerForm (behoudt context + live-notities)
        if(_shPlayerIsConcept(_pl) && _pl.programma_link && typeof openScoutingPlayerForm === 'function'){
          const _prog = Array.isArray(programmaCache) ? programmaCache.find(p => p.id === _pl.programma_link.progId) : null;
          const _sp = _prog ? (_prog.spelers||[]).find(s => s && s.id === _pl.programma_link.spelerKey) : null;
          if(_prog && _sp){ openScoutingPlayerForm(_prog, _sp, null, _pl); return; }
        }
        // Ingediend rapport of concept zonder link → rapport-bewerken
        go('report');
        setTimeout(() => { if(typeof loadIntoForm === 'function') loadIntoForm(_pl); }, 80);
      } catch(_){
        if(typeof openDetail === 'function') openDetail(pid);
      }
    });
  });
  bodyEl.querySelectorAll('[data-edit-submit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      _shSubmitConceptPlayer(btn.dataset.editSubmit);
      // Modal hergebruikt: re-open na korte tick
      setTimeout(() => { if(window.__shCurrentEditMatch) _shOpenEditModal(window.__shCurrentEditMatch); }, 220);
    });
  });
  // Nieuwe handler: → Observatie knop (niet-gekoppelde snelnotitie → observatieformulier)
  bodyEl.querySelectorAll('[data-edit-snel-obs]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const progId = btn.dataset.editSnelObs;
      const idx = parseInt(btn.dataset.editSnelObsIdx, 10);
      const prog = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
      const sn = prog && Array.isArray(prog.snelnotities) ? prog.snelnotities[idx] : null;
      _shCloseEditModal();
      if(typeof openObservatieForm === 'function'){
        openObservatieForm(prog, sn || {});
      }
    });
  });
  bodyEl.querySelectorAll('[data-edit-wstr-prog]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const progId = btn.dataset.editWstrProg;
      const wnIdx = parseInt(btn.dataset.editWstrIdx, 10);
      _shCloseEditModal();
      // s35bu: open Wedstrijdrapport-modal met prefill uit (snel-)wedstrijdnotitie
      _shConvertWstrNotitieToRapport(progId, wnIdx);
    });
  });
  // s35dg Fase F: "Open wedstrijdrapport"-knop op concept-record
  bodyEl.querySelectorAll('[data-wr-open-modal]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const progId = btn.dataset.wrOpenModal;
      const prog = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
      if(!prog){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
      // s35dg-hotfix3: direct openen wedstrijdrapport-modal met prefill uit concept
      _shCloseEditModal();
      if(typeof openMatchReportModal === 'function'){
        openMatchReportModal('');
        setTimeout(() => {
          try {
            const wr = prog.wedstrijdrapport || {};
            const setVal = (id, v) => { const el = document.getElementById(id); if(el && v != null && !el.value) el.value = v; };
            setVal('mr-datum', wr.datum || prog.datum || '');
            setVal('mr-thuis', wr.thuis || prog.thuis || '');
            setVal('mr-uit',   wr.uit   || prog.uit   || '');
            // s35dj: elftal als leeftijdscategorie
            const _mrLf = (prog.thuis_elftal||'').trim() || (prog.uit_elftal||'').trim() || (prog.leeftijd||'').trim();
            setVal('mr-leeftijd', wr.leeftijd || _mrLf);
            // Thuis/uit met elftal suffix
            const _mrTh = prog.thuis ? `${prog.thuis}${prog.thuis_elftal?' '+prog.thuis_elftal:''}`.trim() : '';
            const _mrUt = prog.uit   ? `${prog.uit}${prog.uit_elftal?' '+prog.uit_elftal:''}`.trim()       : '';
            if(_mrTh) setVal('mr-thuis', wr.thuis || _mrTh);
            if(_mrUt) setVal('mr-uit',   wr.uit   || _mrUt);
            const opm = document.getElementById('mr-opmerking');
            if(opm && !opm.value){
              const tekst = wr.tekst || '';
              if(tekst) opm.value = tekst;
            }
          } catch(_){}
        }, 60);
      } else {
        // Fallback: open eerste wedstrijdnotitie via bestaande converter
        const wns = Array.isArray(prog.wedstrijdnotities) ? prog.wedstrijdnotities : [];
        if(wns.length > 0){
          _shConvertWstrNotitieToRapport(prog.id, 0);
        } else {
          if(typeof toast === 'function') toast('Geen bewerker beschikbaar', true);
        }
      }
    });
  });

  // Footer-buttons: existing handlers nemen het over via event-delegation
  // Maar omdat ze niet binnen #matches-list zitten, wire ze hier expliciet door:
  if(footEl){
    footEl.querySelectorAll('.match-verwerk-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rid = btn.dataset.reportId;
        const mk = btn.dataset.matchKey;
        if(rid){
          const r = matchReportsCache.find(x => x.id === rid);
          if(r){ _shCloseEditModal(); _shOpenVerwerkModal({ kind:"report", id:r.id, datum:r.datum, thuis:r.thuis, uit:r.uit, opmerking:r.opmerking }); }
        } else if(mk){
          // s-verwerk-fix: zoek eerst in aggregated, dan in programmaCache, dan gebruik huidig open match
          let found = _shFindMatchByKey(mk);
          if(!found && typeof programmaCache !== 'undefined'){
            const pItem = programmaCache.find(p => _shMatchKey(p) === mk || _shMatchKey({...p, kind:'programma'}) === mk);
            if(pItem) found = {...pItem, kind:'programma'};
          }
          if(!found && window.__shCurrentEditMatch && _shMatchKey(window.__shCurrentEditMatch) === mk){
            found = window.__shCurrentEditMatch;
          }
          if(found){ _shCloseEditModal(); _shOpenVerwerkModal(found); }
        }
      });
    });
    footEl.querySelectorAll('.match-report-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rid = btn.dataset.reportId;
        _shCloseEditModal();
        if(typeof openMatchReportModal === "function" && rid) openMatchReportModal(rid);
      });
    });
    footEl.querySelectorAll('.match-report-add-player').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rid = btn.dataset.reportId;
        _shCloseEditModal();
        try {
          window.__shAddPlayerForReportId = rid;
          const newBtn = document.getElementById("add-player-btn") || document.getElementById("player-add-btn");
          if(newBtn) newBtn.click();
        } catch(_){}
      });
    });
    // s35dh: "Bewerk in Programma" knop voor programma-kind
    footEl.querySelectorAll('[data-edit-prog-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = btn.dataset.editProgId;
        _shCloseEditModal();
        if(typeof openProgMatchModal === 'function') openProgMatchModal(pid);
      });
    });
    footEl.querySelectorAll('.match-report-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const rid = btn.dataset.reportId;
        if(!rid) return;
        const r = matchReportsCache.find(x => x.id === rid);
        const naam = r ? `${r.thuis} — ${r.uit}` : "deze wedstrijd";
        if(!confirm(`Wedstrijdrapport "${naam}" definitief verwijderen?\n\nDit kan niet ongedaan worden gemaakt.`)) return;
        try { await deleteMatchReport(rid); _shCloseEditModal(); if(typeof toast==="function") toast("Verwijderd"); }
        catch(err){ console.warn("delete report failed", err); if(typeof toast==="function") toast("Verwijderen mislukt", true); }
      });
    });
  }

  back.classList.add("show");
  document.body.style.overflow = "hidden";
}

function _shCloseEditModal(){
  const back = document.getElementById("wstr-edit-backdrop");
  if(back) back.classList.remove("show");
  document.body.style.overflow = "";
  window.__shCurrentEditMatch = null;
}

// One-time wiring van edit-modal close handlers
(function _shWireEditModalOnce(){
  if(window.__shEditModalWired) return;
  window.__shEditModalWired = true;
  const wire = () => {
    const close = document.getElementById("wstr-edit-close");
    const back = document.getElementById("wstr-edit-backdrop");
    if(close && !close.dataset.wired){ close.dataset.wired="1"; close.addEventListener("click", _shCloseEditModal); }
    if(back && !back.dataset.wired){ back.dataset.wired="1"; back.addEventListener("click", (e) => { if(e.target === back) _shCloseEditModal(); }); }
  };
  document.addEventListener("DOMContentLoaded", wire);
  if(document.readyState !== "loading") setTimeout(wire, 0);
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      const back = document.getElementById("wstr-edit-backdrop");
      if(back && back.classList.contains("show")) _shCloseEditModal();
    }
  });
})();

// s35br: zoek aggregated match terug aan de hand van match-key
function _shFindMatchByKey(key){
  if(!key) return null;
  // Reconstructie via aggregateMatches op players + report-cache
  try {
    const players = (typeof loadPlayers === "function") ? loadPlayers() : [];
    const aggregated = (typeof aggregateMatches === "function") ? aggregateMatches(players) : [];
    for(const m of aggregated){
      m.kind = "aggregated";
      if(_shMatchKey(m) === key) return m;
    }
  } catch(_){}
  return null;
}

// s35br: open spelersrapport-modal met prefill uit een snel-notitie
async function _shConvertSnelToRapport(progId, snIdx){
  try {
    const prog = (typeof programmaCache !== "undefined") ? programmaCache.find(p => p.id === progId) : null;
    const sn = (prog && Array.isArray(prog.snelnotities)) ? prog.snelnotities[snIdx] : null;
    if(!sn){ if(typeof toast === "function") toast("Snel-notitie niet gevonden", true); return; }
    if(typeof openProgPlayerModal === "function"){
      openProgPlayerModal(progId, null);
      setTimeout(() => {
        try {
          const fullNaam = (sn.naam || "").trim();
          let vn = "", an = "";
          if(fullNaam){
            if(typeof splitNaam === "function"){
              const s = splitNaam(fullNaam);
              vn = s.voornaam || ""; an = s.achternaam || "";
            } else {
              const parts = fullNaam.split(/\s+/);
              vn = parts[0] || "";
              an = parts.slice(1).join(" ");
            }
          }
          const setVal = (id, v) => { const el = document.getElementById(id); if(el && v != null) el.value = v; };
          setVal("pp-voornaam", vn);
          setVal("pp-achternaam", an);
          setVal("pp-naam", [vn, an].filter(Boolean).join(" "));
          setVal("pp-rugnummer", sn.rugnummer || "");
          setVal("pp-positie", sn.positie || "");
          setVal("pp-notities", sn.tekst || "");
          // s37: pre-fill club vanuit spelersnotitie of programma
          const _snClub = sn.club || (prog && (prog.uit || prog.thuis)) || "";
          setVal("pp-club", _snClub);
          // s37: sla wedstrijd-context op voor openPpFullForm
          window.__shSnelProgContext = prog ? {
            datum: prog.datum || "",
            thuis: prog.thuis || "",
            uit: prog.uit || "",
            leeftijd: prog.leeftijd || ""
          } : null;
          window.__shConvertingFromSnId = sn.id || null;
          window.__shConvertingFromProgId = progId;
          // s35dg-hotfix3: direct doorklikken naar volledig spelersrapport, geen tussenscherm
          if(typeof openPpFullForm === "function"){
            openPpFullForm();
          }
        } catch(_){}
      }, 80);
      if(typeof toast === "function") toast("Spelersrapport geopend met notitie");
    } else {
      if(typeof toast === "function") toast("Spelersrapport-modal niet beschikbaar", true);
    }
  } catch(err){
    console.warn("[s35br] convert snel failed", err);
    if(typeof toast === "function") toast("Fout bij openen — zie console", true);
  }
}

// s35br: direct concept-speler indienen (zet concept=false en sla op)
async function _shSubmitConceptPlayer(playerId){
  try {
    const players = (typeof loadPlayers === "function") ? loadPlayers() : [];
    const p = players.find(x => x.id === playerId);
    if(!p){ if(typeof toast === "function") toast("Speler niet gevonden", true); return; }
    if(!confirm(`"${p.naam}" indienen als volledig spelersrapport?`)) return;
    p.concept = false;
    if(p.status === "concept") delete p.status;
    p.ingediend_op = Date.now();
    if(typeof savePlayer === "function"){
      await savePlayer(p);
    }
    if(typeof toast === "function") toast(`${p.naam} ingediend`);
    if(typeof renderMatches === "function") renderMatches();
  } catch(err){
    console.warn("[s35br] submit concept failed", err);
    if(typeof toast === "function") toast("Fout bij indienen — zie console", true);
  }
}

// s35br: open verwerken-modal voor een wedstrijd
function _shOpenVerwerkModal(m){
  const back = document.getElementById("wstr-verwerk-backdrop");
  if(!back) return;
  const key = _shMatchKey(m);
  const isLocked = shIsWedstrijdVerwerkt(key);
  let players = (m.players || []).slice();
  // s35dh: voor programma-kind: zoek concept-spelers via programma_link
  if((m.kind === 'programma' || m.kind === 'prog') && players.length === 0 && m.progId){
    try {
      const _allV = (typeof loadPlayers === 'function') ? loadPlayers() : [];
      const _fndV = _allV.filter(p => {
        if(p.programma_link && p.programma_link.progId === m.progId) return true;
        const _wv = (p.wedstrijd) || (p.rapport && p.rapport.wedstrijd) || {};
        return _wv.datum === m.datum &&
               (_wv.thuis||'').toLowerCase().trim() === (m.thuis||'').toLowerCase().trim();
      });
      players = players.concat(_fndV);
    } catch(_){}
  }
  const conceptCount = players.filter(_shPlayerIsConcept).length;
  const ingediendCount = players.length - conceptCount;
  const sns = _shCollectSnelNotities(m);
  const wns = _shCollectWedstrijdNotities(m);

  const rapportenOk = players.length > 0 && conceptCount === 0;
  const snOk = sns.length === 0;
  const wnOk = wns.length > 0; // bestaan en bekeken; alleen waarschuwing als 0

  const titleEl = document.getElementById("wstr-verwerk-title");
  const subEl = document.getElementById("wstr-verwerk-sub");
  const bodyEl = document.getElementById("wstr-verwerk-body");
  const confirmBtn = document.getElementById("wstr-verwerk-confirm");
  if(titleEl) titleEl.textContent = isLocked ? "Wedstrijd-status herzien" : "Wedstrijd verwerken";
  const teamTxt = (m.thuis && m.uit) ? `${m.thuis} — ${m.uit}` : (m.toernooi_naam || "Wedstrijd");
  if(subEl) subEl.textContent = `${teamTxt} · ${m.datum || ""}`;

  const checkSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const warnSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;

  const row = (state, label, detail) => `
    <div class="wstr-check-row ${state}">
      <div class="wstr-check-icon">${state === "ok" ? checkSvg : warnSvg}</div>
      <div class="wstr-check-main">
        <div class="wstr-check-label">${label}</div>
        <div class="wstr-check-detail">${detail}</div>
      </div>
    </div>`;

  let html = "";
  if(isLocked){
    html += `<div class="wstr-verwerk-warn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><div>Deze wedstrijd staat op <strong>verwerkt</strong>. Open status opnieuw om wijzigingen aan te brengen.</div></div>`;
  }

  // 1) Spelersrapporten
  if(m.kind === "report"){
    html += row('warn', "Spelersrapporten ingediend", "Voor dit wedstrijdrapport zijn nog géén spelersrapporten ingediend. Voeg spelers toe via <span class=\"wstr-check-link\" data-act=\"add-player\">+ Speler rapporteren</span>.");
  } else if(rapportenOk){
    html += row('ok', "Spelersrapporten ingediend", `Alle ${players.length} rapport${players.length===1?"":"en"} zijn ingediend.`);
  } else {
    html += row('warn', "Spelersrapporten ingediend", `${ingediendCount} van ${players.length} ingediend — <strong>${conceptCount} nog concept</strong>. Klap de wedstrijd uit en gebruik <span class=\"wstr-check-link\" data-act=\"goto-list\">→ Indienen</span> per speler.`);
  }

  // 2) Snel-notities
  if(snOk){
    html += row('ok', "Snel-notities omgezet", "Geen openstaande snel-notities.");
  } else {
    html += row('warn', "Snel-notities omgezet", `<strong>${sns.length}</strong> open snel-notitie${sns.length===1?"":"s"} — klik op de gele chips bovenaan de wedstrijdkaart om om te zetten naar een volledig rapport.`);
  }

  // 3) Wedstrijdnotities
  if(wnOk){
    html += row('ok', "Wedstrijdnotities bekeken", `${wns.length} wedstrijdnotitie${wns.length===1?"":"s"} aanwezig.`);
  } else {
    html += row('warn', "Wedstrijdnotities bekeken", "Geen wedstrijdnotities — voeg er één toe vanuit Programma als je losse observaties wilt vastleggen.");
  }

  if(bodyEl) bodyEl.innerHTML = html;

  if(confirmBtn){
    confirmBtn.textContent = isLocked ? "Open status opnieuw" : "Markeer als verwerkt";
    confirmBtn.dataset.key = key;
    confirmBtn.dataset.locked = isLocked ? "1" : "0";
    // s35ca-3: concept-count meegeven voor confirm() in _shConfirmVerwerk
    confirmBtn.dataset.concepts = String(conceptCount || 0);
    confirmBtn.dataset.sns = String(sns.length || 0); // s35dh: voor blokkeer-check op open snel-notities
  }

  // s35bu: snelknop 'Alle concepten + markeer verwerkt' als er nog concepten zijn
  try {
    if(!isLocked){
      const players = _shFindLinkedPlayers ? _shFindLinkedPlayers(m) : [];
      const concepts = (players || []).filter(_shPlayerIsConcept);
      if(concepts.length > 0 && confirmBtn && confirmBtn.parentNode){
        let allBtn = document.getElementById('wstr-verwerk-all-concepts');
        if(!allBtn){
          allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.id = 'wstr-verwerk-all-concepts';
          allBtn.className = 'btn btn-secondary';
          allBtn.style.marginRight = '8px';
          confirmBtn.parentNode.insertBefore(allBtn, confirmBtn);
        }
        allBtn.textContent = `Alle ${concepts.length} concept${concepts.length===1?'':'en'} indienen + verwerken`;
        allBtn.onclick = async () => {
          allBtn.disabled = true;
          try {
            for(const pl of concepts){
              try {
                const fresh = (typeof loadPlayers === 'function') ? loadPlayers().find(x => x.id === pl.id) : pl;
                if(!fresh) continue;
                const upd = {...fresh, concept: false, status: 'volledig', modified: Date.now()};
                if(typeof savePlayer === 'function') await savePlayer(upd);
              } catch(_){}
            }
            shMarkWedstrijdVerwerkt(key, true);
            if(typeof toast === 'function') toast(`${concepts.length} concept${concepts.length===1?'':'en'} ingediend en verwerkt`);
            _shCloseVerwerkModal();
            if(typeof renderMatches === 'function') renderMatches();
          } finally {
            allBtn.disabled = false;
          }
        };
      } else {
        const old = document.getElementById('wstr-verwerk-all-concepts');
        if(old) old.remove();
      }
    } else {
      const old = document.getElementById('wstr-verwerk-all-concepts');
      if(old) old.remove();
    }
  } catch(_){}

  back.classList.add("show");
  // Body lokaal: links naar in/uitklappen
  if(bodyEl){
    bodyEl.querySelectorAll('[data-act]').forEach(a => {
      a.addEventListener('click', (e) => {
        const act = a.dataset.act;
        if(act === 'goto-list' || act === 'add-player'){
          _shCloseVerwerkModal();
          // Card uitklappen om Indienen-knoppen te tonen
          try {
            const matchKey = key;
            const card = document.querySelector(`.match-card[data-match-key="${matchKey}"]`);
            if(card){ card.classList.add('open'); card.classList.add('editing'); card.scrollIntoView({behavior:'smooth', block:'center'}); }
          } catch(_){}
        }
      });
    });
  }
}

function _shCloseVerwerkModal(){
  const back = document.getElementById("wstr-verwerk-backdrop");
  if(back) back.classList.remove("show");
}

function _shConfirmVerwerk(){
  const btn = document.getElementById("wstr-verwerk-confirm");
  if(!btn) return;
  const key = btn.dataset.key;
  const wasLocked = btn.dataset.locked === "1";
  if(!key){ _shCloseVerwerkModal(); return; }
  // s35dg Fase G: bij verwerken (niet bij heropenen) HARD blokkeren als er nog concepten zijn
  // Concepten blokkeren verwerken niet meer — gewoon markeren
  // s35dh: double-check bij heropenen van een verwerkte wedstrijd
  if(wasLocked){
    if(!confirm("Wedstrijd heropenen?\n\nDe status 'Verwerkt' wordt verwijderd en de wedstrijd wordt weer bewerkbaar.")) return;
  }
  shMarkWedstrijdVerwerkt(key, !wasLocked);
  if(typeof toast === "function"){
    toast(wasLocked ? "Status opnieuw open" : "Gemarkeerd als verwerkt");
  }
  _shCloseVerwerkModal();
  if(typeof renderMatches === "function") renderMatches();
  try{ shUpdateMatchesNavBadge(); }catch(_){}
}

// One-time wiring van modal-buttons
(function _shWireVerwerkModalOnce(){
  if(window.__shVerwerkModalWired) return;
  window.__shVerwerkModalWired = true;
  document.addEventListener("DOMContentLoaded", () => {
    const close = document.getElementById("wstr-verwerk-close");
    const cancel = document.getElementById("wstr-verwerk-cancel");
    const confirm = document.getElementById("wstr-verwerk-confirm");
    const back = document.getElementById("wstr-verwerk-backdrop");
    if(close) close.addEventListener("click", _shCloseVerwerkModal);
    if(cancel) cancel.addEventListener("click", _shCloseVerwerkModal);
    if(confirm) confirm.addEventListener("click", _shConfirmVerwerk);
    if(back) back.addEventListener("click", (e) => { if(e.target === back) _shCloseVerwerkModal(); });
    document.addEventListener("keydown", (e) => {
      if(e.key === "Escape" && back && back.classList.contains("show")) _shCloseVerwerkModal();
    });
  });
  // Fallback: als DOMContentLoaded al geweest is
  if(document.readyState !== "loading"){
    setTimeout(() => {
      const close = document.getElementById("wstr-verwerk-close");
      const cancel = document.getElementById("wstr-verwerk-cancel");
      const confirm = document.getElementById("wstr-verwerk-confirm");
      const back = document.getElementById("wstr-verwerk-backdrop");
      if(close && !close.dataset.wired){ close.dataset.wired="1"; close.addEventListener("click", _shCloseVerwerkModal); }
      if(cancel && !cancel.dataset.wired){ cancel.dataset.wired="1"; cancel.addEventListener("click", _shCloseVerwerkModal); }
      if(confirm && !confirm.dataset.wired){ confirm.dataset.wired="1"; confirm.addEventListener("click", _shConfirmVerwerk); }
      if(back && !back.dataset.wired){ back.dataset.wired="1"; back.addEventListener("click", (e) => { if(e.target === back) _shCloseVerwerkModal(); }); }
    }, 0);
  }
})();

// Render banner-HTML met spelersnotities + wedstrijdrapport (concept/notitie)
function _shBannerHTML(m){
  // Fase E: trigger auto-conversie notities → concept-wedstrijdrapport bij elke render
  try {
    if(typeof _shConvertNotesToDrafts === 'function'){
      _shFindLinkedPrograms(m).forEach(p => { _shConvertNotesToDrafts(p); });
    }
  } catch(_){}
  const sns = _shCollectSnelNotities(m);
  const wns = _shCollectWedstrijdNotities(m);
  const linked = _shFindLinkedPrograms(m);
  const conceptProg = linked.find(p => p && p.wedstrijdrapport && p.wedstrijdrapport.status === 'concept');
  if(sns.length === 0 && wns.length === 0 && !conceptProg) return "";
  let html = "";
  if(sns.length){
    const chips = sns.map(({progId, snIdx, sn}) => {
      const naam = (sn.naam || "Onbenoemde speler").trim();
      const num = sn.rugnummer ? "#" + escapeHtml(String(sn.rugnummer)) + " " : "";
      return `<button type="button" class="m-snel-chip" data-snel-prog="${escapeHtml(progId)}" data-snel-idx="${snIdx}" title="Open spelersnotitie">`
        + `<span>💡 ${num}${escapeHtml(naam)}</span>`
        + `<span class="m-snel-chip-arrow"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>`
        + `</button>`;
    }).join("");
    html += `<div class="m-snel-banner" onclick="event.stopPropagation()">`
      + `<div class="m-snel-banner-head"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.3v1h6v-1c0-1 .3-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>`
      + `Open spelersnotitie${sns.length===1?"":"s"} (${sns.length}) — klik om naar volledig rapport om te zetten</div>`
      + `<div class="m-snel-chips">${chips}</div>`
      + `</div>`;
  }
  if(conceptProg){
    // s36: vereenvoudigd concept-label — enkel klikbare pill, geen tekst blok
    html += `<button type="button" class="m-concept-pill" data-wr-open="${escapeHtml(conceptProg.id)}" onclick="event.stopPropagation();">`
      + `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
      + ` Wedstrijdrapport (concept) — klik om te openen</button>`;
  } else if(wns.length){
    const txt = wns.map(({wn}) => {
      if(!wn) return "";
      const t = (wn.tekst || wn.notitie || "").trim();
      return t ? escapeHtml(t).replace(/\n/g, "<br>") : "";
    }).filter(Boolean).join("<br><br>");
    if(txt){
      html += `<div class="m-wstrnote-banner" onclick="event.stopPropagation()">`
        + `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`
        + `<div class="m-wstrnote-banner-text"><strong>Wedstrijdnotitie</strong>${txt}</div>`
        + `</div>`;
    }
  }
  return html;
}

function cmpPlayerById(id){
  const p = loadPlayers().find(x => x.id === id);
  if(!p) return null;
  try {
    const reports = reportsForPlayer(id);
    if(!reports.length) return p;
    if(reports.length >= 2) return buildAvgPlayer(p);
    return buildPlayerFromReport(p, reports[0]);
  } catch(_){ return p; }
}
function cmpGradeNum(g){ return CMP_GRADE_VAL[g] || 0; }
function cmpGradeFromNum(n){
  if(n >= 3.5) return 'A';
  if(n >= 2.5) return 'B';
  if(n >= 1.5) return 'C';
  if(n >= 0.5) return 'D';
  return '-';
}
function cmpOverallScore(p){
  const b = p.beoordelingen || {};
  let vals = CMP_CRITERIA.map(c => cmpGradeNum(b[c.key] === 'A' && c.key === 'grit_huidig' && !b[c.key] ? b.drit_huidig : b[c.key])).filter(v => v>0);
  // include final huidig_niveau as a heavier weight signal
  const hn = cmpGradeNum(p.huidig_niveau);
  if(hn) vals.push(hn, hn);
  if(!vals.length) return 0;
  return vals.reduce((a,b)=>a+b,0) / vals.length;
}
function cmpColorFor(idx){ return CMP_COLORS[idx % CMP_COLORS.length]; }

// ── Elftallen zoeken ──────────────────────────────────────────────────────────
function _elfWireClubAC(input){
  if(!input) return;
  input.setAttribute('autocomplete', 'off');
  const box = document.createElement('div');
  box.className = 'sh-ac-box';
  input.parentNode.style.position = 'relative';
  input.insertAdjacentElement('afterend', box);
  let _sel = -1;
  function _close(){ box.classList.remove('open'); box.innerHTML = ''; _sel = -1; }
  function _render(items){
    if(!items.length){ _close(); return; }
    box.innerHTML = items.map((it,i) =>
      `<div class="sh-ac-item" data-idx="${i}">${it.html}</div>`
    ).join('');
    box.classList.add('open');
    _sel = -1;
    box.querySelectorAll('.sh-ac-item').forEach(el => {
      el.addEventListener('mousedown', ev => {
        ev.preventDefault();
        input.value = items[parseInt(el.dataset.idx)].label;
        input.dispatchEvent(new Event('change', {bubbles:true}));
        _close();
      });
    });
  }
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if(!q || q.length < 1){ _close(); return; }
    const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
    const clubs = [...new Set(players.map(p => (p.club||'').trim()).filter(Boolean))];
    const starts = [], contains = [];
    clubs.forEach(cl => {
      const n = cl.toLowerCase();
      if(n.startsWith(q)) starts.push(cl);
      else if(n.includes(q)) contains.push(cl);
    });
    const merged = [...starts, ...contains].slice(0, 10);
    _render(merged.map(cl => ({ label: cl, html: cl })));
  });
  input.addEventListener('keydown', e => {
    const items = box.querySelectorAll('.sh-ac-item');
    if(e.key === 'ArrowDown'){ e.preventDefault(); _sel = Math.min(_sel+1, items.length-1); items.forEach((el,i)=>el.classList.toggle('active',i===_sel)); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); _sel = Math.max(_sel-1, 0); items.forEach((el,i)=>el.classList.toggle('active',i===_sel)); }
    else if(e.key === 'Enter' && _sel >= 0){ e.preventDefault(); items[_sel].dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); }
    else if(e.key === 'Escape'){ _close(); }
  });
  input.addEventListener('blur', () => setTimeout(_close, 150));
}

function renderElftallen(){
  const players = loadPlayers();
  const input = document.getElementById('elf-search-input');
  const chipsEl = document.getElementById('elf-club-chips');
  const resultsEl = document.getElementById('elf-results');
  if(!resultsEl) return;

  if(!input?._elfWired){
    if(input){
      input._elfWired = true;
      // Eigen AC: alleen clubs die al in rapporten voorkomen (niet HV_CLUBS)
      _elfWireClubAC(input);
      const doSearch = () => _elfShowTeamTiles(loadPlayers(), resultsEl, input.value.trim());
      input.addEventListener('input', doSearch);
      input.addEventListener('change', doSearch);
      input.addEventListener('keydown', e => { if(e.key === 'Enter') doSearch(); });
      const btn = document.getElementById('elf-search-btn');
      if(btn){
        btn.textContent = 'Wis';
        btn.addEventListener('click', () => { input.value = ''; _elfShowTeamTiles(loadPlayers(), resultsEl, ''); });
      }
    }
    if(chipsEl) chipsEl.style.display = 'none';
  }

  const q = (input?.value || '').trim();
  _elfShowTeamTiles(players, resultsEl, q);
}

function _elfBuildTeamMap(players){
  const teamMap = new Map();
  players.forEach(p => {
    const club  = (p.club  || 'Onbekende club').trim();
    const elftal = (p.elftal || deriveElftalFromReport(p) || '').trim();
    const key = club + '\x00' + elftal;
    if(!teamMap.has(key)) teamMap.set(key, { club, elftal, players: [] });
    teamMap.get(key).players.push(p);
  });
  return teamMap;
}

function _elfTeamColor(elftal){
  const m = elftal.match(/O\.(\d+)/);
  const age = m ? parseInt(m[1]) : 15;
  if(age <= 10) return 'elf-tile-green';
  if(age <= 13) return 'elf-tile-blue';
  if(age <= 16) return 'elf-tile-purple';
  if(age <= 19) return 'elf-tile-gold';
  return 'elf-tile-red';
}

function _elfShowTeamTiles(players, resultsEl, query){
  if(!resultsEl) return;
  const teamMap = _elfBuildTeamMap(players);
  const q = query.toLowerCase();

  let teams = [...teamMap.values()].filter(t => t.elftal);
  if(q) teams = teams.filter(t => t.club.toLowerCase().includes(q) || t.elftal.toLowerCase().includes(q));
  teams.sort((a,b) => { const cl = a.club.localeCompare(b.club,'nl'); return cl !== 0 ? cl : a.elftal.localeCompare(b.elftal,'nl'); });

  if(!teams.length){
    resultsEl.innerHTML = `<div class="elf-empty">${q ? 'Geen elftallen gevonden voor <strong>'+escapeHtml(query)+'</strong>.' : 'Nog geen spelers gescout.'}</div>`;
    return;
  }

  let html = `<div class="elf-section-label">Elftallen <span class="elf-section-count">${teams.length}</span></div>`;
  html += '<div class="elf-tiles-grid">';
  teams.forEach(t => {
    const nR = t.players.filter(p => p.rapport_type !== 'observatie').length;
    const nO = t.players.filter(p => p.rapport_type === 'observatie').length;
    const col = _elfTeamColor(t.elftal);
    html += `<div class="elf-tile ${col}" data-elf-club="${escapeAttr(t.club)}" data-elf-team="${escapeAttr(t.elftal)}">
  <div class="elf-tile-elftal">${escapeHtml(t.elftal)}</div>
  <div class="elf-tile-club">${escapeHtml(t.club)}</div>
  <div class="elf-tile-footer">
    <span class="elf-tile-players">${t.players.length} speler${t.players.length===1?'':'s'}</span>
    <span class="elf-tile-badges">${nR?'<span class="elf-tbadge elf-tbadge-r">'+nR+'R</span>':''}${nO?'<span class="elf-tbadge elf-tbadge-o">'+nO+'O</span>':''}</span>
  </div>
</div>`;
  });
  html += '</div>';

  const unassigned = players.filter(p => !(p.elftal||deriveElftalFromReport(p)||'').trim());
  if(unassigned.length && !q){
    html += '<div class="elf-unassigned-row" id="elf-unassigned-btn"><span>&#9679; '+unassigned.length+' speler'+(unassigned.length===1?'':'s')+' zonder elftal</span><span class="elf-ua-arrow">›</span></div>';
  }

  resultsEl.innerHTML = html;
  // Event delegation — no inline onclick (avoids escaping issues)
  resultsEl.querySelectorAll('.elf-tile[data-elf-club]').forEach(tile => {
    tile.addEventListener('click', () => _elfOpenTeam(tile.dataset.elfClub, tile.dataset.elfTeam));
  });
  const uaBtn = resultsEl.querySelector('#elf-unassigned-btn');
  if(uaBtn) uaBtn.addEventListener('click', window._elfOpenUnassigned);
}

function _elfOpenTeam(club, elftal){
  window._elfOpenTeam = _elfOpenTeam;
  const ps = loadPlayers().filter(p => {
    const pc = (p.club||'').trim();
    const pe = (p.elftal||deriveElftalFromReport(p)||'').trim();
    return pc === club && pe === elftal;
  });
  _elfShowPlayerTiles(club, elftal, ps);
};

window._elfOpenUnassigned = function(){
  const ps = loadPlayers().filter(p => !(p.elftal||deriveElftalFromReport(p)||'').trim());
  _elfShowPlayerTiles('', 'Zonder elftal', ps);
};

function _elfShowPlayerTiles(club, elftal, players){
  const resultsEl = document.getElementById('elf-results');
  if(!resultsEl) return;
  const NIVEAU = { A:'Toptalent', B:'Belofte', C:'Gemiddeld', D:'Beperkt' };

  let html = `<div class="elf-back-bar">
  <button class="elf-back-btn" onclick="window._elfBackToTiles()">&#8592; Terug</button>
  <div class="elf-back-info">
    <div class="elf-back-elftal">${escapeHtml(elftal)}</div>
    ${club ? `<div class="elf-back-club">${escapeHtml(club)}</div>` : ''}
  </div>
  <div class="elf-back-count">${players.length} speler${players.length===1?'':'s'}</div>
</div>`;

  html += '<div class="elf-player-tiles-grid">';
  players.forEach(p => {
    const naam = p.naam || 'Naam onbekend';
    const pos  = positionLabel(p.positie) || '';
    const hn   = p.huidig_niveau ? (NIVEAU[p.huidig_niveau]||p.huidig_niveau) : '';
    const pn   = p.potentieel_niveau ? (NIVEAU[p.potentieel_niveau]||p.potentieel_niveau) : '';
    const isObs = p.rapport_type === 'observatie';
    const typeClass = isObs ? 'elf-ptile-obs' : 'elf-ptile-rapport';
    const typeLabel = isObs ? 'OBS' : 'Rapport';
    const niveauClass = p.huidig_niveau ? `elf-niv-${p.huidig_niveau.toLowerCase()}` : '';

    html += `<div class="elf-player-tile ${typeClass}" onclick="openDetail(${JSON.stringify(p.id)})">
  <div class="elf-pt-header">
    <span class="elf-pt-naam">${escapeHtml(naam)}</span>
    <span class="elf-pt-type">${typeLabel}</span>
  </div>
  ${pos ? `<div class="elf-pt-pos">${escapeHtml(pos)}</div>` : ''}
  ${hn  ? `<div class="elf-pt-niveau ${niveauClass}">${escapeHtml(hn)}${pn && pn!==hn?' → '+escapeHtml(pn):''}</div>` : ''}
</div>`;
  });
  html += '</div>';
  resultsEl.innerHTML = html;
}

window._elfBackToTiles = function(){
  const input = document.getElementById('elf-search-input');
  const q = (input?.value||'').trim();
  const resultsEl = document.getElementById('elf-results');
  if(resultsEl) _elfShowTeamTiles(loadPlayers(), resultsEl, q);
};

function _elfDoSearch(query){ _elfShowTeamTiles(loadPlayers(), document.getElementById('elf-results'), query); }
window.renderElftallen = renderElftallen;
window.openDetail = openDetail;

function renderCompare(){
  // Default selection: if nothing chosen yet but there is something pending, keep it
  renderComparePicker();
  renderCompareSelected();
  renderCompareResults();
  // Wire events once
  if(!renderCompare._wired){
    renderCompare._wired = true;
    const search = $('#cmp-search');
    if(search){
      search.addEventListener('input', (e) => {
        cmpSearchQuery = (e.target.value || '').toLowerCase().trim();
        renderComparePicker();
        renderCompareSuggest(cmpSearchQuery);
      });
      search.addEventListener('focus', () => {
        if(cmpSearchQuery) renderCompareSuggest(cmpSearchQuery);
      });
      search.addEventListener('keydown', (e) => {
        if(e.key === 'Escape'){
          const box = $('#cmp-suggest');
          if(box){ box.classList.remove('open'); }
          search.value = '';
          cmpSearchQuery = '';
          renderComparePicker();
        }
      });
      document.addEventListener('click', (ev) => {
        const box = $('#cmp-suggest');
        if(!box) return;
        if(box.contains(ev.target) || ev.target === search) return;
        box.classList.remove('open');
      });
    }
    const clearBtn = $('#cmp-clear');
    if(clearBtn){
      clearBtn.addEventListener('click', () => {
        cmpSelectedIds = [];
        shUpdateCmpUI();
        renderCompare();
      });
    }
    // s20: CTA-balk knoppen
    const ctaBack = $('#cmp-cta-back');
    if(ctaBack){
      ctaBack.addEventListener('click', () => { if(typeof go === 'function') go('database'); });
    }
    const ctaPitch = $('#cmp-cta-pitch');
    if(ctaPitch){
      ctaPitch.addEventListener('click', () => { if(typeof go === 'function') go('pitch'); });
    }
    const ctaPdf = $('#cmp-cta-pdf');
    if(ctaPdf){
      ctaPdf.addEventListener('click', () => {
        toast('PDF downloaden — binnenkort beschikbaar');
      });
    }
  }
}


function renderCompareSuggest(query){
  const box = $('#cmp-suggest');
  if(!box) return;
  const q = (query||'').toLowerCase().trim();
  if(!q){ box.classList.remove('open'); box.innerHTML = ''; return; }
  const players = loadPlayers();
  const matches = players
    .filter(p => {
      const hay = `${p.naam||''} ${p.club||''} ${positionLabel(p.positie)||''} ${p.elftal||''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b) => (a.naam||'').localeCompare(b.naam||'', 'nl'))
    .slice(0, 10);
  if(!matches.length){
    box.innerHTML = `<div class="compare-suggest-empty">Geen spelers gevonden voor "${escapeHtml(q)}"</div>`;
    box.classList.add('open');
    return;
  }
  box.innerHTML = matches.map(p => {
    const initialsStr = ((p.naam||'').split(/\s+/).map(s => s[0]||'').slice(0,2).join('') || '?').toUpperCase();
    const meta = [positionLabel(p.positie), p.club].filter(Boolean).join(' · ');
    const grade = p.huidig_niveau || '-';
    const isSel = cmpSelectedIds.includes(p.id);
    return `
      <button type="button" class="compare-suggest-item ${isSel?'selected':''}" data-id="${escapeAttr(p.id)}">
        <div class="compare-suggest-avatar">${escapeHtml(initialsStr)}</div>
        <div class="compare-suggest-body">
          <div class="compare-suggest-name">${escapeHtml(p.naam||'?')}${isSel?' &check;':''}</div>
          <div class="compare-suggest-meta">${escapeHtml(meta||'—')}</div>
        </div>
        <div class="compare-suggest-grade">${escapeHtml(grade)}</div>
      </button>`;
  }).join('');
  box.classList.add('open');
  box.querySelectorAll('.compare-suggest-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const idx = cmpSelectedIds.indexOf(id);
      if(idx >= 0){
        cmpSelectedIds.splice(idx, 1);
        shUpdateCmpUI();
      } else {
        if(cmpSelectedIds.length >= CMP_MAX){
          toast(`Maximaal ${CMP_MAX} spelers tegelijk`);
          return;
        }
        cmpSelectedIds.push(id);
        shUpdateCmpUI();
      }
      renderComparePicker();
      renderCompareSelected();
      renderCompareResults();
      renderCompareSuggest($('#cmp-search').value || '');
    });
  });
}

function renderComparePicker(){
  const wrap = $('#cmp-picker-list');
  if(!wrap) return;
  const players = loadPlayers();
  if(!players.length){
    wrap.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--text-3);font-size:13px;">Nog geen spelers in de database.</div>`;
    return;
  }
  const q = cmpSearchQuery;
  const filtered = players
    .filter(p => {
      if(!q) return true;
      const hay = `${p.naam||''} ${p.club||''} ${positionLabel(p.positie)||''} ${p.elftal||''}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b) => (a.naam||'').localeCompare(b.naam||'', 'nl'));
  if(!filtered.length){
    wrap.innerHTML = `<div style="grid-column:1/-1;padding:18px;text-align:center;color:var(--text-3);font-size:13px;">Geen spelers gevonden voor "${escapeHtml(q)}".</div>`;
    return;
  }
  wrap.innerHTML = filtered.slice(0, 60).map(p => {
    const isSel = cmpSelectedIds.includes(p.id);
    const initials = ((p.naam||'').split(/\s+/).map(s => s[0]||'').slice(0,2).join('') || '?').toUpperCase();
    const grade = p.huidig_niveau || '-';
    const meta = [positionLabel(p.positie), p.club].filter(Boolean).join(' · ');
    return `
      <button class="compare-pick ${isSel?'selected':''}" data-id="${escapeAttr(p.id)}" type="button">
        <div class="compare-pick-avatar">${escapeHtml(initials)}</div>
        <div class="compare-pick-body">
          <div class="compare-pick-name">${escapeHtml(p.naam||'?')}</div>
          <div class="compare-pick-meta">${escapeHtml(meta||'—')}</div>
        </div>
        <div class="compare-pick-grade ${grade}">${escapeHtml(grade)}</div>
      </button>`;
  }).join('');
  wrap.querySelectorAll('.compare-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const idx = cmpSelectedIds.indexOf(id);
      if(idx >= 0){
        cmpSelectedIds.splice(idx, 1);
        shUpdateCmpUI();
      } else {
        if(cmpSelectedIds.length >= CMP_MAX){
          toast(`Maximaal ${CMP_MAX} spelers tegelijk`);
          return;
        }
        cmpSelectedIds.push(id);
        shUpdateCmpUI();
      }
      renderComparePicker();
      renderCompareSelected();
      renderCompareResults();
    });
  });
}

/* ===== v70h-s31: zoek-/filter-modal voor toevoegen van spelers ===== */
let cmpAddModalState = {
  query: '',
  pos: new Set(),
  cur: new Set(),
  pot: new Set(),
  cat: new Set(),       // v70h-s35: leeftijdscategorie O.8..O.19
  prov: '',             // v70h-s35: provincie (single select via dropdown)
  openCat: null,        // v70h-s35: welke categorie-dropdown open is
  wired: false
};

/* v70h-s35: positie-categorieen voor de Vergelijken-modal.
   Volgorde binnen verdediging/middenveld is van rechts naar links zoals op het veld. */
const CMP_POSITION_CATS = {
  KEEPER: [
    { code: 'GK', label: 'Keeper' }
  ],
  VERDEDIGING: [
    { code: 'RB',  label: 'Rechtsback' },
    { code: 'RCV', label: 'Rechter centrale verdediger' },
    { code: 'CV',  label: 'Centrale verdediger' },
    { code: 'LCV', label: 'Linker centrale verdediger' },
    { code: 'LB',  label: 'Linksback' }
  ],
  MIDDENVELD: [
    { code: 'RM', label: 'Rechtermiddenvelder' },
    { code: 'VM', label: 'Verdedigende middenvelder' },
    { code: 'CM', label: 'Centrale middenvelder' },
    { code: 'AM', label: 'Aanvallende middenvelder' },
    { code: 'LM', label: 'Linkermiddenvelder' }
  ],
  AANVAL: [
    { code: 'RV', label: 'Rechtsbuiten' },
    { code: 'CS', label: 'Spits' },
    { code: 'LV', label: 'Linksbuiten' }
  ]
};
const CMP_AGE_CATS = ['O.8','O.9','O.10','O.11','O.12','O.13','O.14','O.15','O.16','O.17','O.18','O.19'];
const CMP_PROVINCIES_SORTED = [
  'Drenthe','Flevoland','Friesland','Gelderland','Groningen','Limburg',
  'Noord-Brabant','Noord-Holland','Overijssel','Utrecht','Zeeland','Zuid-Holland'
];

function openCmpAddModal(){
  const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
  if(cmpSelectedIds.length >= max){
    if(typeof toast === 'function') toast(`Maximaal ${max} spelers tegelijk`);
    else alert(`Maximaal ${max} spelers tegelijk`);
    return;
  }
  const bd = document.getElementById('cmp-add-modal-backdrop');
  if(!bd) return;
  // v70h-s35: categorie-knoppen + leeftijd-rij + provincie-select renderen
  renderCmpAddCategoryButtons();
  renderCmpAddCategoryDropdowns();
  renderCmpAddAgeRow();
  renderCmpAddProvinceSelect();
  wireCmpAddModal();
  bd.classList.add('show');
  document.body.style.overflow = 'hidden';
  renderCmpAddResults();
  setTimeout(() => {
    const inp = document.getElementById('cmp-add-search');
    if(inp){ inp.focus(); inp.select(); }
  }, 30);
}
function closeCmpAddModal(){
  const bd = document.getElementById('cmp-add-modal-backdrop');
  if(!bd) return;
  bd.classList.remove('show');
  document.body.style.overflow = '';
}
window.openCmpAddModal = openCmpAddModal;
window.closeCmpAddModal = closeCmpAddModal;

/* v70h-s35: categorie-knoppen (Keeper/Verdediging/Middenveld/Aanval) renderen. */
function renderCmpAddCategoryButtons(){
  document.querySelectorAll('#cmp-cat-row .cmp-cat-btn').forEach(btn => {
    const cat = btn.dataset.cat;
    let count = 0, anyActive = false;
    if(cat === 'KEEPER'){
      anyActive = cmpAddModalState.pos.has('GK');
      if(anyActive) count = 1;
    } else {
      (CMP_POSITION_CATS[cat] || []).forEach(p => {
        if(cmpAddModalState.pos.has(p.code)){ count++; anyActive = true; }
      });
    }
    btn.classList.toggle('active', anyActive || cmpAddModalState.openCat === cat);
    btn.classList.toggle('has-selection', count > 0);
    const cnt = btn.querySelector('.cmp-cat-count');
    if(cnt) cnt.textContent = String(count);
  });
}

/* v70h-s35: dropdowns per categorie (V/M/A) renderen. */
function renderCmpAddCategoryDropdowns(){
  ['VERDEDIGING','MIDDENVELD','AANVAL'].forEach(cat => {
    const dd = document.getElementById('cmp-cat-dd-' + cat);
    if(!dd) return;
    dd.innerHTML = (CMP_POSITION_CATS[cat] || []).map(p => {
      const active = cmpAddModalState.pos.has(p.code) ? ' active' : '';
      return `<button type="button" class="cmp-cat-opt${active}" data-pos="${escapeAttr(p.code)}">`
        + `<span>${escapeHtml(p.label)}</span>`
        + `<span class="code">${escapeHtml(p.code)}</span>`
        + `</button>`;
    }).join('');
    dd.classList.toggle('show', cmpAddModalState.openCat === cat);
  });
}

/* v70h-s35: O.8 t/m O.19 leeftijd-chips. */
function renderCmpAddAgeRow(){
  const row = document.getElementById('cmp-age-row');
  if(!row) return;
  row.querySelectorAll('.cmp-filter-chip[data-cat]').forEach(c => c.remove());
  CMP_AGE_CATS.forEach(a => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cmp-filter-chip' + (cmpAddModalState.cat.has(a) ? ' active' : '');
    btn.dataset.cat = a;
    btn.textContent = a;
    row.appendChild(btn);
  });
}

/* v70h-s35: alfabetische provincie-dropdown. */
function renderCmpAddProvinceSelect(){
  const sel = document.getElementById('cmp-prov-select');
  if(!sel) return;
  const players = loadPlayers();
  const counts = {};
  players.forEach(p => {
    const prov = _cmpPlayerProvincie(p);
    if(prov) counts[prov] = (counts[prov] || 0) + 1;
  });
  sel.innerHTML = '<option value="">Alle provincies</option>' +
    CMP_PROVINCIES_SORTED.map(prov => {
      const c = counts[prov] || 0;
      const dis = c === 0 ? ' disabled' : '';
      const sl = cmpAddModalState.prov === prov ? ' selected' : '';
      return `<option value="${escapeAttr(prov)}"${sl}${dis}>${escapeHtml(prov)}${c ? ` (${c})` : ''}</option>`;
    }).join('');
}

/* v70h-s34: bepaal provincie van een speler via club + adresboek. */
function _cmpPlayerProvincie(p){
  if(!p || !p.club) return '';
  try {
    const info = (typeof findClubInfo === 'function') ? findClubInfo(p.club) : null;
    const pc = (info && info.postcode) || '';
    if(pc && typeof pcToProvince === 'function'){
      return pcToProvince(pc) || '';
    }
  } catch(_){}
  return '';
}

/* v70h-s35: leeftijdscategorie afleiden uit elftal-veld (O.8..O.19 exact). */
function _cmpPlayerCategorie(p){
  const el = (p && (p.elftal || (typeof deriveElftalFromReport === 'function' ? deriveElftalFromReport(p) : ''))) || '';
  const m = el.match(/O\.?\s*(\d{1,2})/i);
  if(!m) return '';
  return 'O.' + m[1];
}

function wireCmpAddModal(){
  if(cmpAddModalState.wired) return;
  cmpAddModalState.wired = true;

  const bd = document.getElementById('cmp-add-modal-backdrop');
  if(bd){
    bd.addEventListener('click', (ev) => {
      if(ev.target === bd) closeCmpAddModal();
    });
  }
  const closeBtn = document.getElementById('cmp-add-modal-close');
  if(closeBtn) closeBtn.addEventListener('click', closeCmpAddModal);

  const search = document.getElementById('cmp-add-search');
  if(search){
    search.addEventListener('input', (e) => {
      cmpAddModalState.query = (e.target.value || '').toLowerCase().trim();
      renderCmpAddResults();
    });
    search.addEventListener('keydown', (e) => {
      if(e.key === 'Escape'){ closeCmpAddModal(); }
    });
  }

  // v70h-s35: categorie-knoppen, dropdown-opties, chips en provincie-select
  const filters = document.querySelector('.cmp-add-modal-filters');
  if(filters){
    filters.addEventListener('click', (ev) => {
      // Categorie-knop: toggle ALLE posities in die categorie direct in filter
      const catBtn = ev.target.closest('.cmp-cat-btn');
      if(catBtn){
        const cat = catBtn.dataset.cat;
        if(cat === 'KEEPER'){
          toggleSet(cmpAddModalState.pos, 'GK');
          cmpAddModalState.openCat = null;
        } else {
          // s-pos-filter-fix: selecteer/deselecteer alle posities in deze categorie
          const catPositions = (CMP_POSITION_CATS[cat] || []).map(p => p.code);
          const allActive = catPositions.every(code => cmpAddModalState.pos.has(code));
          if(allActive){
            // allemaal aan → allemaal uit
            catPositions.forEach(code => cmpAddModalState.pos.delete(code));
          } else {
            // niet alle aan → zet ze allemaal aan
            catPositions.forEach(code => cmpAddModalState.pos.add(code));
          }
          // dropdown tonen/verbergen als extra visuele hint
          cmpAddModalState.openCat = (cmpAddModalState.openCat === cat) ? null : cat;
        }
        renderCmpAddCategoryButtons();
        renderCmpAddCategoryDropdowns();
        renderCmpAddResults();
        return;
      }
      // Positie-optie in dropdown
      const opt = ev.target.closest('.cmp-cat-opt');
      if(opt){
        toggleSet(cmpAddModalState.pos, opt.dataset.pos);
        renderCmpAddCategoryButtons();
        renderCmpAddCategoryDropdowns();
        renderCmpAddResults();
        return;
      }
      // Chips: grade-cur / grade-pot / age
      const chip = ev.target.closest('.cmp-filter-chip');
      if(chip){
        if(chip.dataset.gradeCur){
          toggleSet(cmpAddModalState.cur, chip.dataset.gradeCur);
        } else if(chip.dataset.gradePot){
          toggleSet(cmpAddModalState.pot, chip.dataset.gradePot);
        } else if(chip.dataset.cat){
          toggleSet(cmpAddModalState.cat, chip.dataset.cat);
        } else { return; }
        chip.classList.toggle('active');
        renderCmpAddResults();
        return;
      }
      if(ev.target.id === 'cmp-filter-clear'){
        cmpAddModalState.pos.clear();
        cmpAddModalState.cur.clear();
        cmpAddModalState.pot.clear();
        cmpAddModalState.cat.clear();
        cmpAddModalState.prov = '';
        cmpAddModalState.openCat = null;
        renderCmpAddCategoryButtons();
        renderCmpAddCategoryDropdowns();
        renderCmpAddAgeRow();
        renderCmpAddProvinceSelect();
        filters.querySelectorAll('.cmp-filter-chip').forEach(c => c.classList.remove('active'));
        renderCmpAddResults();
      }
    });
    // Provincie-select (dropdown change)
    const provSel = document.getElementById('cmp-prov-select');
    if(provSel){
      provSel.addEventListener('change', (e) => {
        cmpAddModalState.prov = e.target.value || '';
        renderCmpAddResults();
      });
    }
  }

  // ESC sluit overal
  document.addEventListener('keydown', (ev) => {
    if(ev.key === 'Escape'){
      const b = document.getElementById('cmp-add-modal-backdrop');
      if(b && b.classList.contains('show')) closeCmpAddModal();
    }
  });
}

function toggleSet(set, value){
  if(set.has(value)) set.delete(value); else set.add(value);
}

function renderCmpAddResults(){
  const grid = document.getElementById('cmp-add-grid');
  const meta = document.getElementById('cmp-add-results-meta');
  const counter = document.getElementById('cmp-add-counter');
  if(!grid) return;
  const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
  if(counter) counter.textContent = `${cmpSelectedIds.length} / ${max}`;

  const q = cmpAddModalState.query;
  const fpos = cmpAddModalState.pos;
  const fcur = cmpAddModalState.cur;
  const fpot = cmpAddModalState.pot;

  let players = loadPlayers().slice();
  if(q){
    players = players.filter(p => {
      const hay = `${p.naam||''} ${p.club||''} ${positionLabel(p.positie)||''} ${p.positie||''} ${p.linie||''} ${p.elftal||''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if(fpos.size > 0) players = players.filter(p => fpos.has((p.positie || '').toUpperCase()));
  if(fcur.size > 0) players = players.filter(p => fcur.has((p.huidig_niveau || '').toUpperCase()));
  if(fpot.size > 0) players = players.filter(p => fpot.has((p.potentieel_niveau || '').toUpperCase()));
  // v70h-s34: AND tussen categorieën, OR binnen
  const fcat = cmpAddModalState.cat;
  const fprov = cmpAddModalState.prov;
  if(fcat && fcat.size > 0){
    players = players.filter(p => fcat.has(_cmpPlayerCategorie(p)));
  }
  if(fprov){
    players = players.filter(p => _cmpPlayerProvincie(p) === fprov);
  }

  players.sort((a,b) => (a.naam||'').localeCompare(b.naam||'', 'nl'));

  if(meta){
    meta.textContent = players.length === 0
      ? 'Geen spelers gevonden met deze filters.'
      : `${players.length} speler${players.length===1?'':'s'} gevonden`;
  }

  if(!players.length){
    grid.innerHTML = `<div class="cmp-add-empty">Pas je zoekterm of filters aan om spelers te vinden.</div>`;
    return;
  }

  const selectedSet = new Set(cmpSelectedIds);
  const atMax = cmpSelectedIds.length >= max;
  grid.innerHTML = players.map(p => {
    const isSel = selectedSet.has(p.id);
    const disabled = atMax && !isSel;
    const initials = ((p.naam||'').split(/\s+/).map(s => s[0]||'').slice(0,2).join('') || '?').toUpperCase();
    const grade = (p.huidig_niveau || '-').toUpperCase();
    const meta2 = [positionLabel(p.positie), p.club].filter(Boolean).join(' \u00b7 ');
    return `
      <button type="button" class="cmp-add-card ${isSel?'selected':''} ${disabled?'disabled':''}" data-id="${escapeAttr(p.id)}" ${disabled?'disabled':''} title="${escapeAttr(p.naam||'')}">
        <div class="cmp-add-avatar">${escapeHtml(initials)}</div>
        <div class="cmp-add-body">
          <div class="cmp-add-name">${escapeHtml(p.naam||'?')}</div>
          <div class="cmp-add-meta">${escapeHtml(meta2||'\u2014')}</div>
        </div>
        <div class="cmp-add-grade ${grade}">${escapeHtml(grade)}</div>
      </button>`;
  }).join('');

  grid.querySelectorAll('.cmp-add-card').forEach(btn => {
    btn.addEventListener('click', () => {
      if(btn.classList.contains('disabled')) return;
      const id = btn.dataset.id;
      const idx = cmpSelectedIds.indexOf(id);
      if(idx >= 0){
        cmpSelectedIds.splice(idx, 1);
        shUpdateCmpUI();
      } else {
        if(cmpSelectedIds.length >= max) return;
        cmpSelectedIds.push(id);
        shUpdateCmpUI();
      }
      // Update slots + results live, modal blijft open zodat je verder kunt
      renderCompareSelected();
      renderCompareResults();
      renderCmpAddResults();
    });
  });
}

function renderCompareSelected(){
  const wrap = $('#cmp-selected');
  if(!wrap) return;
  const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
  const slots = [];
  for(let i = 0; i < max; i++){
    const id = cmpSelectedIds[i];
    if(id){
      const p = cmpPlayerById(id);
      if(!p){
        slots.push(`<div class="compare-slot empty" data-slot-empty><div class="compare-slot-num">#${i+1}</div><div class="compare-slot-add">+</div><div class="compare-slot-add-label">Voeg speler toe</div></div>`);
        continue;
      }
      const col = cmpColorFor(i);
      const initialsStr = ((p.naam||'').split(/\s+/).map(s => s[0]||'').slice(0,2).join('') || '?').toUpperCase();
      const meta = [positionLabel(p.positie), p.club].filter(Boolean).join(' \u00b7 ');
      const grade = (p.huidig_niveau || '-').toUpperCase();
      slots.push(`
        <div class="compare-slot filled" style="--player-color:${col.c};--player-color-2:${col.c2}">
          <div class="compare-slot-num">#${i+1}</div>
          <button type="button" class="compare-slot-remove" data-remove-id="${escapeAttr(id)}" aria-label="Verwijderen">\u00d7</button>
          <div class="compare-slot-avatar">${escapeHtml(initialsStr)}</div>
          <div class="compare-slot-name">${escapeHtml(p.naam||'?')}</div>
          <div class="compare-slot-meta">${escapeHtml(meta||'\u2014')}</div>
          <div class="compare-slot-grade ${grade}">${escapeHtml(grade)}</div>
        </div>`);
    } else {
      slots.push(`<div class="compare-slot empty" data-slot-empty><div class="compare-slot-num">#${i+1}</div><div class="compare-slot-add">+</div><div class="compare-slot-add-label">Voeg speler toe</div></div>`);
    }
  }
  wrap.innerHTML = `<div class="compare-hero">${slots.join('')}</div>`;

  // Subtitle in topbar dynamisch
  const sub = document.querySelector('#view-compare .page-sub');
  if(sub){
    const n = cmpSelectedIds.length;
    if(n === 0)      sub.textContent = `Kies 2 tot ${max} spelers en zie ze direct naast elkaar — radar, balken en details.`;
    else if(n === 1) sub.textContent = `1 speler geselecteerd \u00b7 voeg er minstens \u00e9\u00e9n toe om te vergelijken.`;
    else             sub.textContent = `${n} van ${max} spelers \u00b7 vergelijking actief.`;
  }

  // Empty-state inline tonen bij < 2
  const empty = document.getElementById('cmp-empty');
  if(empty) empty.style.display = (cmpSelectedIds.length < 2) ? 'flex' : 'none';

  // Wire: verwijder-knop
  wrap.querySelectorAll('[data-remove-id]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.removeId;
      cmpSelectedIds = cmpSelectedIds.filter(x => x !== id);
      shUpdateCmpUI();
      renderCompare();
    });
  });
  // v70h-s31: lege slot → open zoek-/filter-modal
  wrap.querySelectorAll('[data-slot-empty]').forEach(s => {
    s.addEventListener('click', () => {
      if(typeof openCmpAddModal === 'function') openCmpAddModal();
    });
  });
}

function renderCompareResults(){
  const empty = $('#cmp-empty');
  const results = $('#cmp-results');
  if(!empty || !results) return;
  if(cmpSelectedIds.length < 2){
    empty.style.display = '';
    results.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  results.style.display = '';
  const players = cmpSelectedIds.map(cmpPlayerById).filter(Boolean);
  renderCompareGauges(players);
  renderCompareRadar(players);
  renderCompareBars(players);
  renderCompareAdvies(players);
  renderCompareStrengths(players);
  renderCompareTable(players);
}

function renderCompareGauges(players){
  const wrap = $('#cmp-gauges');
  if(!wrap) return;
  const html = players.map((p, i) => {
    const col = cmpColorFor(i);
    const score = cmpOverallScore(p);
    const grade = cmpGradeFromNum(score);
    const pct = Math.max(0, Math.min(1, score / 4));
    const R = 46, C = 2 * Math.PI * R;
    const off = C * (1 - pct);
    // Potentieel ring
    const potVal = cmpGradeNum(p.potentieel_niveau);
    const potPct = potVal ? potVal/4 : 0;
    const potOff = C * (1 - potPct);
    const meta = [positionLabel(p.positie), p.club].filter(Boolean).join(' · ');
    return `
      <div class="compare-gauge" data-id="${escapeAttr(p.id)}" style="--player-color:${col.c}">
        <div class="compare-gauge-name">${escapeHtml(p.naam||'?')}</div>
        <div class="compare-gauge-meta">${escapeHtml(meta||'—')}</div>
        <div class="compare-gauge-ring">
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle class="compare-gauge-ring-bg" cx="55" cy="55" r="${R}" fill="none" stroke-width="8"/>
            <circle class="compare-gauge-ring-pot" cx="55" cy="55" r="${R}" fill="none" stroke-width="3"
                    stroke-dasharray="${C}" stroke-dashoffset="${potOff}" stroke-linecap="round"/>
            <circle class="compare-gauge-ring-fg" cx="55" cy="55" r="${R}" fill="none" stroke-width="8"
                    stroke-dasharray="${C}" stroke-dashoffset="${off}" stroke-linecap="round"/>
          </svg>
          <div class="compare-gauge-center">
            <div class="compare-gauge-grade">${escapeHtml(grade)}</div>
            <div class="compare-gauge-score">${score ? score.toFixed(2) : '–'} / 4</div>
          </div>
        </div>
        <div class="compare-gauge-dual">
          <div>Huidig<b>${escapeHtml(p.huidig_niveau||'–')}</b></div>
          <div>Potentieel<b>${escapeHtml(p.potentieel_niveau||'–')}</b></div>
        </div>
      </div>`;
  }).join('');
  // D1: start met gauge-hidden zodat CSS transition de animatie doet
  const hiddenHtml = html.replace(/class="compare-gauge /g, 'class="compare-gauge gauge-hidden ');
  wrap.innerHTML = hiddenHtml;
  // Trigger animate-in na één frame
  requestAnimationFrame(() => {
    wrap.querySelectorAll('.compare-gauge.gauge-hidden').forEach((el, i) => {
      setTimeout(() => el.classList.remove('gauge-hidden'), i * 120);
    });
  });
  wrap.querySelectorAll('.compare-gauge').forEach(el => {
    el.addEventListener('click', () => { if(typeof openDetail === 'function') openDetail(el.dataset.id); });
  });
}

function renderCompareRadar(players){
  const canvas = $('#cmp-radar');
  const legend = $('#cmp-radar-legend');
  if(!canvas || !legend) return;
  const dpr = window.devicePixelRatio || 1;
  const W = 520, H = 520;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  const cx = W/2, cy = H/2 + 8, R = 180;
  const N = CMP_CRITERIA.length;
  const angle = (i) => -Math.PI/2 + (i * 2*Math.PI / N);

  // Background rings (4 levels)
  for(let lvl=1; lvl<=4; lvl++){
    ctx.beginPath();
    for(let i=0;i<N;i++){
      const a = angle(i);
      const r = R * (lvl/4);
      const x = cx + Math.cos(a)*r;
      const y = cy + Math.sin(a)*r;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle = lvl===4 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)';
    ctx.lineWidth = lvl===4 ? 1.2 : 1;
    ctx.stroke();
    if(lvl<4){
      ctx.fillStyle = 'rgba(255,255,255,.02)';
      ctx.fill();
    }
  }
  // Spokes + grade labels at outer ring
  for(let i=0;i<N;i++){
    const a = angle(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a)*R, cy + Math.sin(a)*R);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.stroke();
  }
  // Grade markers on top spoke
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = '10px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ['D','C','B','A'].forEach((g, i) => {
    const r = R * ((i+1)/4);
    ctx.fillText(g, cx + 8, cy - r + 3);
  });

  // Axis labels
  ctx.fillStyle = 'rgba(232,237,245,.9)';
  ctx.font = '600 12.5px -apple-system, Segoe UI, sans-serif';
  for(let i=0;i<N;i++){
    const a = angle(i);
    const lx = cx + Math.cos(a)*(R+24);
    const ly = cy + Math.sin(a)*(R+24);
    ctx.textAlign = Math.abs(Math.cos(a)) < 0.2 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
    ctx.textBaseline = Math.abs(Math.sin(a)) < 0.2 ? 'middle' : (Math.sin(a) > 0 ? 'top' : 'bottom');
    ctx.fillText(CMP_CRITERIA[i].label, lx, ly);
  }

  // D2: pre-compute target points per player
  const playerData = players.map((p, idx) => {
    const col = cmpColorFor(idx);
    const b = p.beoordelingen || {};
    const targets = CMP_CRITERIA.map((c, i) => {
      let v = cmpGradeNum(b[c.key]);
      if(!v && c.key === 'grit_huidig') v = cmpGradeNum(b.drit_huidig);
      return v;
    });
    return { col, targets };
  });

  function drawShape(progress, pData, eased){
    const { col, targets } = pData;
    const points = targets.map((v, i) => {
      const r = R * (v / 4) * eased;
      const a = angle(i);
      return { x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r, v };
    });
    ctx.beginPath();
    points.forEach((pt, i) => { if(i===0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
    ctx.closePath();
    ctx.fillStyle = hexA(col.c, 0.18 * eased);
    ctx.fill();
    ctx.strokeStyle = col.c;
    ctx.lineWidth = 2;
    ctx.globalAlpha = Math.min(1, eased + 0.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if(eased > 0.8){
      points.forEach(pt => {
        if(pt.v <= 0) return;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5 * eased, 0, Math.PI*2);
        ctx.fillStyle = col.c;
        ctx.fill();
        ctx.strokeStyle = 'rgba(11,15,21,.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }

  function redrawStatic(){
    ctx.clearRect(0,0,W,H);
    // Rings
    for(let lvl=1; lvl<=4; lvl++){
      ctx.beginPath();
      for(let i=0;i<N;i++){
        const a=angle(i); const r=R*(lvl/4);
        const x=cx+Math.cos(a)*r; const y=cy+Math.sin(a)*r;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.strokeStyle=lvl===4?'rgba(255,255,255,.18)':'rgba(255,255,255,.08)';
      ctx.lineWidth=lvl===4?1.2:1; ctx.stroke();
      if(lvl<4){ ctx.fillStyle='rgba(255,255,255,.02)'; ctx.fill(); }
    }
    for(let i=0;i<N;i++){
      const a=angle(i);
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R);
      ctx.strokeStyle='rgba(255,255,255,.06)'; ctx.stroke();
    }
    ctx.fillStyle='rgba(255,255,255,.35)'; ctx.font='10px -apple-system,Segoe UI,sans-serif'; ctx.textAlign='center';
    ['D','C','B','A'].forEach((g,i)=>{ const r=R*((i+1)/4); ctx.fillText(g,cx+8,cy-r+3); });
    ctx.fillStyle='rgba(232,237,245,.9)'; ctx.font='600 12.5px -apple-system,Segoe UI,sans-serif';
    for(let i=0;i<N;i++){
      const a=angle(i); const lx=cx+Math.cos(a)*(R+24); const ly=cy+Math.sin(a)*(R+24);
      ctx.textAlign=Math.abs(Math.cos(a))<0.2?'center':(Math.cos(a)>0?'left':'right');
      ctx.textBaseline=Math.abs(Math.sin(a))<0.2?'middle':(Math.sin(a)>0?'top':'bottom');
      ctx.fillText(CMP_CRITERIA[i].label,lx,ly);
    }
    ctx.beginPath(); ctx.arc(cx,cy,2.5,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.4)'; ctx.fill();
  }

  // Animated draw — elke speler 200ms vertraging
  const DUR = 700, DELAY = 200;
  const totalDur = DUR + (players.length - 1) * DELAY;
  const startT = performance.now();
  function frame(now){
    const elapsed = now - startT;
    redrawStatic();
    playerData.forEach((pd, idx) => {
      const t = Math.max(0, Math.min(1, (elapsed - idx * DELAY) / DUR));
      const eased = t < .5 ? 2*t*t : -1+(4-2*t)*t;
      drawShape(elapsed, pd, eased);
    });
    if(elapsed < totalDur) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Legend
  legend.innerHTML = players.map((p, i) => {
    const col = cmpColorFor(i);
    return `<span class="compare-legend-item"><span class="compare-legend-dot" style="background:${col.c}"></span>${escapeHtml(p.naam||'?')}</span>`;
  }).join('');
}

function hexA(hex, alpha){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16);
  const g = parseInt(h.substring(2,4),16);
  const b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderCompareBars(players){
  const wrap = $('#cmp-bars');
  if(!wrap) return;
  const html = CMP_CRITERIA.map(c => {
    // D4: bepaal winner-score per criterium
    const scores = players.map(p => {
      const b = p.beoordelingen || {};
      let g = b[c.key]; if(!g && c.key==='grit_huidig') g = b.drit_huidig;
      return cmpGradeNum(g);
    });
    const best = Math.max(...scores);
    const rows = players.map((p, i) => {
      const col = cmpColorFor(i);
      const b = p.beoordelingen || {};
      let g = b[c.key];
      if(!g && c.key === 'grit_huidig') g = b.drit_huidig;
      const v = cmpGradeNum(g);
      const pct = v ? (v/4)*100 : 0;
      const display = g || '–';
      const firstName = (p.naam||'?').split(/\s+/)[0] || '?';
      const isWinner = best > 0 && v === best;
      // D3: start met bar-init (width:0), JS verwijdert die class na render
      return `
        <div class="compare-bar-row">
          <div class="compare-bar-name" title="${escapeAttr(p.naam||'')}">${escapeHtml(firstName)}</div>
          <div class="compare-bar-track">
            <div class="compare-bar-fill bar-init${isWinner?' is-winner':''}" data-target-w="${pct}" style="width:0;--player-color:${col.c};--player-color-2:${col.c2}"></div>
          </div>
          <div class="compare-bar-grade">${escapeHtml(display)}</div>
        </div>`;
    }).join('');
    return `
      <div class="compare-bar-group">
        <div class="compare-bar-group-title">
          <span>${escapeHtml(c.label)}</span>
          <em>${best ? cmpGradeFromNum(best) : '—'}</em>
        </div>
        <div class="compare-bar-rows">${rows}</div>
      </div>`;
  }).join('');
  wrap.innerHTML = html;
  // D3: trigger fill animatie
  requestAnimationFrame(() => {
    wrap.querySelectorAll('.compare-bar-fill.bar-init').forEach((el, i) => {
      setTimeout(() => {
        el.classList.remove('bar-init');
        el.style.width = el.dataset.targetW + '%';
      }, i * 30);
    });
  });
}

function renderCompareTable(players){
  const tbl = $('#cmp-table');
  if(!tbl) return;
  // Header: empty + one column per player
  const headerCells = players.map((p, i) => {
    const col = cmpColorFor(i);
    return `<th><div class="compare-table-header-cell"><span class="dot" style="background:${col.c}"></span><a class="cmp-name-link" data-id="${escapeAttr(p.id)}">${escapeHtml(p.naam||'?')}</a></div></th>`;
  }).join('');

  const rows = [];
  function row(label, getter){
    const cells = players.map(p => `<td>${getter(p) ?? '<span style="color:var(--text-3)">–</span>'}</td>`).join('');
    rows.push(`<tr><th>${escapeHtml(label)}</th>${cells}</tr>`);
  }
  function rowGrade(label, key){
    // determine winner(s)
    const vals = players.map(p => {
      const b = p.beoordelingen || {};
      let g = b[key]; if(!g && key==='grit_huidig') g = b.drit_huidig;
      return cmpGradeNum(g);
    });
    const max = Math.max(...vals);
    const cells = players.map((p, i) => {
      const b = p.beoordelingen || {};
      let g = b[key]; if(!g && key==='grit_huidig') g = b.drit_huidig;
      if(!g) return `<td><span style="color:var(--text-3)">–</span></td>`;
      const winnerCls = (vals[i] === max && max > 0) ? ' cmp-best' : '';
      return `<td><span class="cmp-cell-grade ${g}${winnerCls}">${escapeHtml(g)}</span></td>`;
    }).join('');
    rows.push(`<tr><th>${escapeHtml(label)}</th>${cells}</tr>`);
  }
  function rowFinalGrade(label, key){
    const vals = players.map(p => cmpGradeNum(p[key]));
    const max = Math.max(...vals);
    const cells = players.map((p, i) => {
      const g = p[key];
      if(!g) return `<td><span style="color:var(--text-3)">–</span></td>`;
      const winnerCls = (vals[i] === max && max > 0) ? ' cmp-best' : '';
      return `<td><span class="cmp-cell-grade ${g}${winnerCls}">${escapeHtml(g)}</span></td>`;
    }).join('');
    rows.push(`<tr><th>${escapeHtml(label)}</th>${cells}</tr>`);
  }

  row('Positie',     p => escapeHtml(positionLabel(p.positie) || ''));
  row('Club',        p => escapeHtml(p.club || ''));
  row('Elftal',      p => escapeHtml(p.elftal || ''));
  row('Geboortejaar',p => escapeHtml(p.geboortejaar || ''));
  row('Voorkeursbeen', p => escapeHtml(p.voorkeursbeen || ''));
  row('Lengte',      p => escapeHtml(p.lengte || ''));
  row('Lichaamsbouw',p => escapeHtml(p.bouw || ''));
  row('Motoriek',    p => escapeHtml(p.motoriek || ''));
  row('Rijping',     p => escapeHtml(p.rijping || ''));
  rowFinalGrade('Huidig niveau', 'huidig_niveau');
  rowFinalGrade('Potentieel', 'potentieel_niveau');
  rowGrade('Techniek', 'techniek_huidig');
  rowGrade('Spelinzicht', 'inzicht_huidig');
  rowGrade('GRIT/Mentaal', 'grit_huidig');
  rowGrade('Explosiviteit', 'explosiviteit_huidig');
  rowGrade('Sprinten', 'sprinten_huidig');
  rowGrade('Duelleren', 'duelleren_huidig');
  rowGrade('Wendbaarheid', 'wendbaarheid_huidig');
  row('Persoonlijk wapen', p => escapeHtml(p.wapen || ''));
  row('Laatst gescout', p => escapeHtml(formatDate(p.datum) || ''));

  tbl.innerHTML = `
    <thead><tr><th></th>${headerCells}</tr></thead>
    <tbody>${rows.join('')}</tbody>`;

  tbl.querySelectorAll('.cmp-name-link').forEach(a => {
    a.addEventListener('click', () => { if(typeof openDetail === 'function') openDetail(a.dataset.id); });
  });
}


/* ── Vergelijken: Advies-widget ── */
function renderCompareAdvies(players){
  const wrap = $('#cmp-advies');
  if(!wrap) return;
  const labels = {'4':'Direct contracteren','3':'Op proef uitnodigen','2':'Periodiek monitoren','1':'Geen vervolgstap'};
  const gradeClass = {'4':'A','3':'B','2':'C','1':'D'};
  wrap.innerHTML = players.map((p, i) => {
    const col = cmpColorFor(i);
    const adv = String(p.advies || '');
    const label = labels[adv] || 'Geen advies';
    const gCls = gradeClass[adv] || '';
    const reports = reportsForPlayer(p.id);
    const cnt = reports.length;
    return `
      <div class="cmp-advies-card" style="border-top:3px solid ${col.c}">
        <div class="cmp-advies-naam" style="color:${col.c}">${escapeHtml((p.naam||'?').split(' ')[0])}</div>
        <div class="cmp-advies-label ${gCls}">${escapeHtml(label)}</div>
        <div class="cmp-advies-meta">${cnt} rapport${cnt===1?'':'en'}</div>
      </div>`;
  }).join('');
}

/* ── Vergelijken: Sterkste punten per speler ── */
function renderCompareStrengths(players){
  const wrap = $('#cmp-strengths');
  if(!wrap) return;
  wrap.innerHTML = players.map((p, i) => {
    const col = cmpColorFor(i);
    const b = p.beoordelingen || {};
    const gradeNum = {A:4,B:3,C:2,D:1};
    // Sorteer criteria op score (hoog→laag)
    const sorted = CMP_CRITERIA
      .map(c => ({ label: c.label, grade: b[c.key] || null, val: gradeNum[b[c.key]] || 0 }))
      .filter(x => x.val > 0)
      .sort((a,b) => b.val - a.val);
    const top3 = sorted.slice(0, 3);
    const bot = sorted.slice(-2).reverse(); // 2 aandachtspunten
    const firstName = (p.naam||'?').split(' ')[0];
    return `
      <div class="cmp-strengths-col">
        <div class="cmp-strengths-head" style="color:${col.c}">${escapeHtml(firstName)}</div>
        ${top3.length ? `
          <div class="cmp-strengths-section">Sterk</div>
          ${top3.map(x => `
            <div class="cmp-strengths-row">
              <span class="cmp-strengths-grade ${x.grade}">${x.grade}</span>
              <span class="cmp-strengths-label">${escapeHtml(x.label)}</span>
            </div>`).join('')}
        ` : '<div class="cmp-strengths-empty">Geen beoordelingen</div>'}
        ${bot.length ? `
          <div class="cmp-strengths-section dev">Aandacht</div>
          ${bot.map(x => `
            <div class="cmp-strengths-row">
              <span class="cmp-strengths-grade ${x.grade}">${x.grade}</span>
              <span class="cmp-strengths-label">${escapeHtml(x.label)}</span>
            </div>`).join('')}
        ` : ''}
        ${p.wapen ? `<div class="cmp-strengths-wapen">⚡ ${escapeHtml(p.wapen)}</div>` : ''}
      </div>`;
  }).join('');
}

/* =============== PLAYER DETAIL (full-page) =============== */
let currentPlayerId = null;
let previousViewBeforePlayer = 'database';
/* s35df: rapport-selectie voor Spelersoverzicht.
   null  = auto (gemiddelde bij ≥2 rapporten, anders spelerrecord)
   '<id>'= toon dit specifieke rapport */
let currentReportSelection = null;

function openDetail(id, opts){
  const players = loadPlayers();
  const p = players.find(x=>x.id===id);
  if(!p) return;
  currentPlayerId = id;
  currentReportSelection = (opts && opts.reportId) ? opts.reportId : null;
  if(currentView !== 'player') previousViewBeforePlayer = currentView || 'database';
  go('player');
}

function renderPlayer(){
  const players = loadPlayers();
  const p = players.find(x=>x.id===currentPlayerId);
  if(!p){
    $('#player-view-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-3);">Speler niet gevonden.</div>';
    return;
  }
  renderDetailOverview(p);
}

function renderDetailOverview(p){
  const meta = [positionLabel(p.positie), p.club, p.elftal||deriveElftalFromReport(p)].filter(Boolean).join(' · ');
  const backLabel = previousViewBeforePlayer === 'compare' ? 'Terug naar vergelijken'
                  : previousViewBeforePlayer === 'dashboard' ? 'Terug naar dashboard'
                  : previousViewBeforePlayer === 'pitch' ? 'Terug naar elftal analyse'
                  : 'Terug naar spelers';
  /* s35df: bepaal modus en bouw "view player" (vp) waarop sub-renders draaien */
  const allReports = reportsForPlayer(p.id);
  const reportCount = allReports.length;
  const selectedReport = currentReportSelection
    ? allReports.find(r => r.id === currentReportSelection)
    : null;
  const mode = selectedReport ? 'single-report'
             : (reportCount >= 2 ? 'average' : 'player-record');
  let vp = p;
  if(mode === 'single-report') vp = buildPlayerFromReport(p, selectedReport);
  else if(mode === 'average')  vp = buildAvgPlayer(p);
  let pageSubtitle = '';
  if(mode === 'average') {
    pageSubtitle = `Gemiddelde over ${reportCount} rapporten`;
  } else if(mode === 'single-report') {
    const teams = selectedReport.wedstrijd
      ? [selectedReport.wedstrijd.thuis, selectedReport.wedstrijd.uit].filter(Boolean).join(' – ')
      : '';
    const dt = selectedReport.datum ? formatDate(selectedReport.datum) : '';
    pageSubtitle = [teams, dt].filter(Boolean).join(' · ') || 'Rapport';
  } else if(reportCount === 1) {
    pageSubtitle = '1 rapport';
  } else {
    pageSubtitle = 'Spelerprofiel';
  }
  const topBtnLabel = (mode === 'average')
    ? `Bekijk alle rapporten (${reportCount})`
    : 'Bekijk volledig rapport';
  const reportsListHtml = reportCount >= 2 ? (() => {
    const rows = allReports.map(r => {
      const teams = r.wedstrijd
        ? [r.wedstrijd.thuis, r.wedstrijd.uit].filter(Boolean).join(' – ')
        : '';
      const dt = r.datum ? formatDate(r.datum) : '—';
      const advLet = gradeForAdvies(r.advies);
      const advLab = adviesLabel(r.advies) || '–';
      const hn = r.huidig_niveau || '–';
      const isActive = (mode === 'single-report' && r.id === selectedReport?.id);
      return `<div class="dtl-report-row${isActive?' active':''}" data-rid="${escapeAttr(r.id)}">
        <div class="dtl-rr-date">${escapeHtml(dt)}</div>
        <div class="dtl-rr-match">${escapeHtml(teams || 'Wedstrijd')}</div>
        <div class="dtl-rr-grade"><span class="grade ${hn==='–'?'D':hn}" style="min-width:28px;text-align:center;">${escapeHtml(hn)}</span></div>
        <div class="dtl-rr-advies"><span class="grade ${advLet}" style="min-width:28px;text-align:center;">${escapeHtml(advLab)}</span></div>
        <div class="dtl-rr-chev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></div>
      </div>`;
    }).join('');
    const switchBack = (mode === 'single-report')
      ? `<button class="btn btn-sm" id="dtl-show-avg" style="margin-bottom:10px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>
          Toon gemiddelde over ${reportCount} rapporten
        </button>` : '';
    return `
      <div class="card compare-card dtl-reports-card" id="dtl-reports-card" style="margin-top:16px;">
        <div class="compare-card-title">
          <span>Alle rapporten (${reportCount})</span>
          <span class="compare-card-sub">Klik op een rapport om dat specifieke rapport te openen</span>
        </div>
        ${switchBack}
        <div class="dtl-reports-list">${rows}</div>
      </div>`;
  })() : '';
  // s35cz: gemiddelde over meerdere rapporten (alleen tonen bij ≥2 in avg-mode)
  const stats = avgPlayerStats(p.id);
  const showAvg = stats && stats.count >= 2 && mode === 'average';
  const avgHtml = showAvg ? (() => {
    const rows = CMP_CRITERIA.map(c => {
      const a = stats.criteria[c.key];
      const letter = a?.letter || '-';
      return `<div class="dtl-avg-cell">
        <div class="dtl-avg-label">${escapeHtml(c.label)}</div>
        <div class="grade ${letter}" style="min-width:32px;text-align:center;">${letter}</div>
        <div class="dtl-avg-sub">${a ? (a.score.toFixed(2) + ' · ' + a.n + ' rapp.') : '—'}</div>
      </div>`;
    }).join('');
    const advLetter = stats.advies ? ('Advies ' + stats.advies.rounded) : '—';
    return `
      <div class="card compare-card" style="margin-top:16px;border-left:4px solid var(--primary-2);">
        <div class="compare-card-title">
          <span>Gemiddelde over ${stats.count} rapporten</span>
          <span class="compare-card-sub">Per criterium gemiddeld (A=4 · D=1) — ${escapeHtml(advLetter)}</span>
        </div>
        <div class="dtl-avg-grid">${rows}</div>
      </div>`;
  })() : '';
  $('#player-view-body').innerHTML = `
    <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <button class="btn btn-sm" id="dtl-back-prev">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>
        ${backLabel}
      </button>
      ${(()=>{
        const inCmp = cmpSelectedIds.includes(p.id);
        const full  = cmpSelectedIds.length >= CMP_MAX;
        if(inCmp) return `<button class="btn btn-sm dtl-cmp-btn dtl-cmp-active" id="dtl-cmp-toggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>In vergelijking</button>`;
        if(full) return '';
        return `<button class="btn btn-sm dtl-cmp-btn" id="dtl-cmp-toggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:3px;"><circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/><path d="M12 8v8"/></svg>+ Vergelijk</button>`;
      })()}
      ${cmpSelectedIds.length >= 2 ? `<button class="btn btn-sm dtl-cmp-goto" id="dtl-cmp-goto">
        Vergelijken (${cmpSelectedIds.length})
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px;"><polyline points="9 18 15 12 9 6"/></svg>
      </button>` : ''}
      <div class="dtl-icon-actions" style="margin-left:auto;display:flex;gap:6px;align-items:center;">
        <button class="btn btn-sm" id="dtl-show-report-top" style="background:var(--primary-2);color:#fff;border-color:var(--primary-2);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          ${escapeHtml(topBtnLabel)}
        </button>
        <button class="btn btn-sm dtl-icon-btn" id="dtl-edit-top" title="Bewerken">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn-sm dtl-icon-btn" id="dtl-pdf-top" title="Download als PDF">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="btn btn-sm dtl-icon-btn" id="dtl-del-top" title="Verwijder rapport" style="color:#ef4444;border-color:#ef4444;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
    <div class="spelersoverzicht-title-row">
      <div class="spelersoverzicht-title">Spelersoverzicht</div>
      <div class="spelersoverzicht-subtitle">${escapeHtml(pageSubtitle)}</div>
      ${mode === 'average' ? `<span class="dtl-avg-pill">Gemiddelde · ${reportCount} rapporten</span>` : ''}
      ${mode === 'single-report' ? `<span class="dtl-avg-pill">Eén rapport</span>` : ''}
    </div>
    <div class="detail-header">
      <div class="detail-avatar">${initials(p.naam)}</div>
      <div style="flex:1;">
        <div class="detail-name">
          ${escapeHtml(p.naam)}
          ${p.leeftijd ? `<span class="dtl-leeftijd-chip">${escapeHtml(p.leeftijd)}</span>` : ''}
        </div>
        <div class="detail-meta">
          ${escapeHtml(meta||'—')}${p.rugnummer?(' · #'+escapeHtml(p.rugnummer)):''}${p.been?(' · '+escapeHtml(p.been)):''}${p.geboorte?(' · '+formatDate(p.geboorte)):''}
        </div>
        ${p.tweebenig ? `<div class="detail-meta" style="margin-top:2px;font-style:italic;">${escapeHtml(p.tweebenig)}</div>` : ''}
        <div class="detail-grade-row">
          <div><span class="grade-label">Huidig</span> <span class="grade ${vp.huidig_niveau||'D'}">${vp.huidig_niveau||'-'}</span></div>
          <div><span class="grade-label">Potentieel</span> <span class="grade outline ${vp.potentieel_niveau||'D'}">${vp.potentieel_niveau||'-'}</span></div>
          <div><span class="grade-label">Advies</span> <span class="grade ${gradeForAdvies(vp.advies)}">${adviesLabel(vp.advies)||'-'}</span></div>
        </div>
      </div>
    </div>

    <div class="dtl-kpi-grid" id="dtl-kpi-grid"></div>

    <div id="dtl-summary-card"></div>

    <div id="dtl-trend-card"></div>

    <div class="card compare-card dtl-sw-card" id="dtl-sw-card">
      <div class="compare-card-title">
        <span>Sterktes &amp; ontwikkelpunten</span>
        <span class="compare-card-sub">Top scores en aandachtspunten op basis van de 7 criteria</span>
      </div>
      <div id="dtl-sw-body"></div>
    </div>

    <div class="card compare-card" style="margin-top:16px;">
      <div class="compare-card-title">
        <span>Totaalindruk</span>
        <span class="compare-card-sub">Huidig &amp; potentieel niveau</span>
      </div>
      <div class="compare-gauges" id="dtl-gauges"></div>
    </div>

    ${avgHtml}

    <div class="compare-twocol" style="margin-top:16px;">
      <div class="card compare-card">
        <div class="compare-card-title">
          <span>Pizza chart — 7 criteria</span>
          <span class="compare-card-sub">Elke punt vertegenwoordigt een score (D → A). Grotere taartpunt = hogere beoordeling.</span>
        </div>
        <div class="dtl-pizza-wrap" id="dtl-pizza"></div>
        <div class="dtl-pizza-legend" id="dtl-pizza-legend"></div>
      </div>
      <div class="card compare-card">
        <div class="compare-card-title">
          <span>Criterium-balken</span>
          <span class="compare-card-sub">Beoordeling per criterium</span>
        </div>
        <div class="compare-bars" id="dtl-bars"></div>
      </div>
    </div>

    ${reportsListHtml}

    <div style="height:16px;"></div>
  `;
  renderDetailKPIs(vp);
  renderDetailSummary(vp);
  renderDetailStrengthsWeaknesses(vp);
  renderDetailGauge(vp);
  renderDetailPizza(vp);
  renderDetailBars(vp);
  renderDetailTrend(p);
  $('#dtl-back-prev').addEventListener('click', () => go(previousViewBeforePlayer || 'database'));
  // Vergelijk-knop: toevoegen/verwijderen
  const _dtlCmpToggle = document.getElementById('dtl-cmp-toggle');
  if(_dtlCmpToggle){
    _dtlCmpToggle.addEventListener('click', () => {
      if(cmpSelectedIds.includes(p.id)){
        cmpSelectedIds = cmpSelectedIds.filter(id => id !== p.id);
        if(typeof toast === 'function') toast(`${p.naam} verwijderd uit vergelijking`);
      } else if(cmpSelectedIds.length < CMP_MAX){
        cmpSelectedIds.push(p.id);
        shUpdateCmpUI();
        const n = cmpSelectedIds.length;
        if(typeof toast === 'function') toast(n >= 2
          ? `${p.naam} toegevoegd — tik "Vergelijken (${n})" om te starten`
          : `${p.naam} toegevoegd — selecteer nog 1 speler om te vergelijken`);
      }
      renderDetailOverview(p); // topbar updaten
    });
  }
  const _dtlCmpGoto = document.getElementById('dtl-cmp-goto');
  if(_dtlCmpGoto) _dtlCmpGoto.addEventListener('click', () => go('compare'));
  /* s35df: knop-gedrag — in avg-modus scroll naar rapportenlijst; anders open volledig rapport voor huidige vp */
  const flashReports = () => {
    const card = document.getElementById('dtl-reports-card');
    if(!card) return;
    card.scrollIntoView({behavior:'smooth', block:'start'});
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
  };
  const handleShowReport = () => {
    if(mode === 'average') flashReports();
    else renderDetailFullReport(vp);
  };
  $('#dtl-show-report').addEventListener('click', handleShowReport);
  const topBtn = document.getElementById('dtl-show-report-top');
  if(topBtn) topBtn.addEventListener('click', handleShowReport);
  const showAvgBtn = document.getElementById('dtl-show-avg');
  if(showAvgBtn) showAvgBtn.addEventListener('click', () => {
    currentReportSelection = null;
    renderDetailOverview(p);
  });
  document.querySelectorAll('#dtl-reports-card .dtl-report-row').forEach(row => {
    row.addEventListener('click', () => {
      const rid = row.getAttribute('data-rid');
      const rep = allReports.find(x => x.id === rid);
      if(!rep) return;
      renderDetailFullReport(buildPlayerFromReport(p, rep));
    });
  });
  // s-icon-btns: nieuwe icon-knoppen bovenaan (vervangt form-actions onderaan)
  const _dtlPdfTop = document.getElementById('dtl-pdf-top');
  if(_dtlPdfTop) _dtlPdfTop.addEventListener('click', () => generatePlayerPDF(vp));
  const _dtlEditTop = document.getElementById('dtl-edit-top');
  if(_dtlEditTop) _dtlEditTop.addEventListener('click', () => { go('report'); loadIntoForm(vp); });
  const _dtlDelTop = document.getElementById('dtl-del-top');
  if(_dtlDelTop) _dtlDelTop.addEventListener('click', async () => {
    const naam = (p.naam || '').trim() || 'onbekende speler';
    if(!confirm('Rapport van ' + naam + ' verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    try { await deletePlayer(p.id); go(previousViewBeforePlayer || 'database'); if(typeof toast==='function') toast('Rapport verwijderd'); }
    catch(err){ if(typeof toast==='function') toast('Verwijderen mislukt', true); }
  });
  $('#dtl-pdf').addEventListener('click', () => generatePlayerPDF(p));
  $('#dtl-edit').addEventListener('click', () => {
    go('report');
    loadIntoForm(p);
  });
  $('#dtl-del').addEventListener('click', async () => {
    // v70h-s27: harde dubbele bevestiging — eerst waarschuwing, dan naam typen.
    const naam = (p.naam || '').trim() || 'onbekende speler';
    const warn = [
      'LET OP — dit verwijdert het rapport van:',
      '',
      `   ${naam}`,
      '',
      'Deze actie kan NIET ongedaan worden gemaakt.',
      'Alle scout-data, beoordelingen en notities zijn permanent verloren.',
      '',
      'Doorgaan?'
    ].join('\n');
    if(!confirm(warn)) return;
    const typed = prompt(`Typ de naam van de speler exact om te bevestigen:\n\n${naam}`);
    if(typed === null) return; // geannuleerd
    if((typed || '').trim().toLowerCase() !== naam.toLowerCase()){
      alert('Naam komt niet overeen. Verwijderen geannuleerd — er is niets gewijzigd.');
      return;
    }
    try {
      await deletePlayer(p.id);
      go(previousViewBeforePlayer || 'database');
      toast('Rapport definitief verwijderd');
    } catch(err){
      console.error('delete failed', err);
      alert('Verwijderen mislukt. Probeer het opnieuw of controleer je internetverbinding.');
    }
  });
  window.scrollTo({top:0});
}

/* ---- KPI tiles (huidig / potentieel / advies / gem.score) ---- */
function renderDetailKPIs(p){
  const wrap = $('#dtl-kpi-grid');
  if(!wrap) return;
  const score = cmpOverallScore(p);
  const scoreGrade = cmpGradeFromNum(score);
  const hn = (p.huidig_niveau || '').toUpperCase();
  const pn = (p.potentieel_niveau || '').toUpperCase();
  const ad = adviesLabel(p.advies) || '-';
  const accentClass = g => ({A:'accent-a',B:'accent-b',C:'accent-c',D:'accent-d'}[g] || 'accent-neutral');
  const hVal = cmpGradeNum(p.huidig_niveau);
  const pVal = cmpGradeNum(p.potentieel_niveau);
  const growth = (hVal && pVal && pVal > hVal) ? `+${pVal - hVal} klasse${pVal-hVal>1?'n':''}` : (hVal && pVal && pVal === hVal ? 'op niveau' : '');
  wrap.innerHTML = `
    <div class="dtl-kpi-tile ${accentClass(hn)} advies-badge-anim" style="animation-delay:.05s">
      <div class="dtl-kpi-label">Huidig niveau</div>
      <div class="dtl-kpi-value">${escapeHtml(hn||'–')}</div>
      <div class="dtl-kpi-sub">${growth ? 'Groei: '+escapeHtml(growth) : 'Nu inzetbaar'}</div>
    </div>
    <div class="dtl-kpi-tile ${accentClass(pn)} advies-badge-anim" style="animation-delay:.12s">
      <div class="dtl-kpi-label">Potentieel</div>
      <div class="dtl-kpi-value">${escapeHtml(pn||'–')}</div>
      <div class="dtl-kpi-sub">Ceiling bij ontwikkeling</div>
    </div>
    <div class="dtl-kpi-tile ${accentClass(gradeForAdvies(p.advies))} advies-badge-anim" style="animation-delay:.19s">
      <div class="dtl-kpi-label">Advies</div>
      <div class="dtl-kpi-value small">${escapeHtml(ad)}</div>
      <div class="dtl-kpi-sub">${p.wapen ? 'Wapen: '+escapeHtml(p.wapen) : 'Scout-conclusie'}</div>
    </div>
    <div class="dtl-kpi-tile ${accentClass(scoreGrade)} advies-badge-anim" style="animation-delay:.26s">
      <div class="dtl-kpi-label">Gem. score</div>
      <div class="dtl-kpi-value">${score ? score.toFixed(2) : '–'}<span style="font-size:14px;font-weight:600;color:var(--text-3);"> / 4</span></div>
      <div class="dtl-kpi-sub">${score ? 'Klasse '+scoreGrade : 'Nog geen beoordelingen'}</div>
    </div>
  `;
}

/* ---- Sterktes & ontwikkelpunten ---- */

/* ---- Scout-samenvatting (wapen + notities + wedstrijd) ---- */
function renderDetailSummary(p){
  const wrap = document.getElementById('dtl-summary-card');
  if(!wrap) return;
  const w = p.wedstrijd || {};
  const hasWapen   = !!p.wapen;
  const hasNotities = !!(p.notities || '').trim();
  const hasWedstrijd = !!(w.thuis || w.uit || w.datum);
  if(!hasWapen && !hasNotities && !hasWedstrijd){ wrap.innerHTML = ''; return; }

  const wedstrijdStr = [
    w.thuis && w.uit ? `${escapeHtml(w.thuis)} vs ${escapeHtml(w.uit)}` : '',
    w.uitslag ? escapeHtml(w.uitslag) : '',
    w.datum   ? formatDate(w.datum)   : ''
  ].filter(Boolean).join(' · ');

  const notitiesStr = (p.notities || '').trim();
  const notitiesPreview = notitiesStr.length > 160
    ? escapeHtml(notitiesStr.slice(0, 160)) + '…'
    : escapeHtml(notitiesStr);

  wrap.innerHTML = `
    <div class="card compare-card dtl-summary-card" style="margin-top:0;margin-bottom:16px;">
      <div class="compare-card-title">
        <span>Scout-samenvatting</span>
        <span class="compare-card-sub">Kernbevindingen op basis van het laatste rapport</span>
      </div>
      <div class="dtl-summary-body">
        ${hasWapen ? `
        <div class="dtl-summary-row dtl-summary-wapen">
          <div class="dtl-summary-icon">⚡</div>
          <div>
            <div class="dtl-summary-label">Persoonlijk wapen</div>
            <div class="dtl-summary-text">${escapeHtml(p.wapen)}</div>
          </div>
        </div>` : ''}
        ${hasWedstrijd ? `
        <div class="dtl-summary-row">
          <div class="dtl-summary-icon">🏟</div>
          <div>
            <div class="dtl-summary-label">Wedstrijd geobserveerd</div>
            <div class="dtl-summary-text">${wedstrijdStr || '—'}</div>
          </div>
        </div>` : ''}
        ${hasNotities ? `
        <div class="dtl-summary-row">
          <div class="dtl-summary-icon">📋</div>
          <div>
            <div class="dtl-summary-label">Scout-notities</div>
            <div class="dtl-summary-text dtl-summary-notes">${notitiesPreview}</div>
          </div>
        </div>` : ''}
      </div>
    </div>`;
}

function renderDetailStrengthsWeaknesses(p){
  const wrap = $('#dtl-sw-body');
  if(!wrap) return;
  const b = p.beoordelingen || {};
  const scored = CMP_CRITERIA.map(c => {
    let g = b[c.key];
    if(!g && c.key === 'grit_huidig') g = b.drit_huidig;
    return { label: c.label, grade: (g||'').toUpperCase(), val: cmpGradeNum(g) };
  }).filter(x => x.val > 0);
  if(!scored.length){
    wrap.innerHTML = `<div class="dtl-sw-empty">Nog geen beoordelingen ingevuld — sterktes en zwaktes verschijnen zodra de criteria zijn ingevuld.</div>`;
    return;
  }
  const sortedHigh = [...scored].sort((a,b) => b.val - a.val);
  const sortedLow  = [...scored].sort((a,b) => a.val - b.val);
  const strengths = sortedHigh.filter(x => x.val >= 3).slice(0, 3);
  const weaknesses = sortedLow.filter(x => x.val <= 2).slice(0, 2);
  const sHtml = strengths.length
    ? strengths.map(s => `<span class="dtl-pill"><span class="pill-grade">${escapeHtml(s.grade)}</span>${escapeHtml(s.label)}</span>`).join('')
    : `<span class="dtl-sw-empty">Geen criteria op A/B niveau (nog).</span>`;
  const wHtml = weaknesses.length
    ? weaknesses.map(w => `<span class="dtl-pill weak"><span class="pill-grade">${escapeHtml(w.grade)}</span>${escapeHtml(w.label)}</span>`).join('')
    : `<span class="dtl-sw-empty">Geen criteria op C/D — sterke basis op alle vlakken.</span>`;
  wrap.innerHTML = `
    <div class="dtl-sw-row">
      <div class="dtl-sw-heading strong">Sterktes</div>
      ${sHtml}
    </div>
    <div class="dtl-sw-row">
      <div class="dtl-sw-heading weak">Ontwikkelpunten</div>
      ${wHtml}
    </div>
  `;
}

/* ---- Pizza chart (segmented radar) ---- */
function renderDetailPizza(p){
  const wrap = $('#dtl-pizza');
  if(!wrap) return;
  const b = p.beoordelingen || {};
  const N = CMP_CRITERIA.length;
  const W = 480, H = 480;
  const cx = W/2, cy = H/2, Rmax = 180;
  const slice = (2 * Math.PI) / N;
  const PALETTE = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899'];
  function arcPath(a0, a1, r){
    const x0 = cx + Math.cos(a0)*r;
    const y0 = cy + Math.sin(a0)*r;
    const x1 = cx + Math.cos(a1)*r;
    const y1 = cy + Math.sin(a1)*r;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  }
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">`;
  for(let lvl=1; lvl<=4; lvl++){
    const r = Rmax * (lvl/4);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,${lvl===4?0.18:0.07})" stroke-width="${lvl===4?1.2:1}"/>`;
  }
  for(let i=0; i<N; i++){
    const a0 = -Math.PI/2 + i*slice + 0.01;
    const a1 = -Math.PI/2 + (i+1)*slice - 0.01;
    let g = b[CMP_CRITERIA[i].key];
    if(!g && CMP_CRITERIA[i].key === 'grit_huidig') g = b.drit_huidig;
    const v = cmpGradeNum(g);
    const r = v ? Rmax * (v/4) : 0;
    const col = PALETTE[i % PALETTE.length];
    if(r > 0){
      svg += `<path d="${arcPath(a0,a1,r)}" fill="${col}" fill-opacity="0.78" stroke="${col}" stroke-width="1.4"/>`;
    } else {
      svg += `<path d="${arcPath(a0,a1,Rmax)}" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
    }
  }
  ['D','C','B','A'].forEach((lbl, i) => {
    const r = Rmax * ((i+1)/4);
    svg += `<text x="${cx+6}" y="${cy - r + 4}" fill="rgba(255,255,255,0.45)" font-size="10" font-family="-apple-system,Segoe UI,sans-serif">${lbl}</text>`;
  });
  for(let i=0; i<N; i++){
    const a = -Math.PI/2 + i*slice + slice/2;
    const lx = cx + Math.cos(a)*(Rmax+26);
    const ly = cy + Math.sin(a)*(Rmax+26);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    const baseline = Math.abs(Math.sin(a)) < 0.2 ? 'middle' : (Math.sin(a) > 0 ? 'hanging' : 'auto');
    svg += `<text x="${lx}" y="${ly}" fill="rgba(232,237,245,0.92)" font-size="12.5" font-weight="600" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="-apple-system,Segoe UI,sans-serif">${escapeHtml(CMP_CRITERIA[i].label)}</text>`;
    let g = b[CMP_CRITERIA[i].key];
    if(!g && CMP_CRITERIA[i].key === 'grit_huidig') g = b.drit_huidig;
    const v = cmpGradeNum(g);
    if(v){
      const r = Rmax * (v/4);
      const gx = cx + Math.cos(a)*(r - 18);
      const gy = cy + Math.sin(a)*(r - 18);
      svg += `<text x="${gx}" y="${gy}" fill="#0b1220" font-size="13" font-weight="800" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system,Segoe UI,sans-serif">${escapeHtml((g||'').toUpperCase())}</text>`;
    }
  }
  svg += `</svg>`;
  wrap.innerHTML = svg;
  const legend = $('#dtl-pizza-legend');
  if(legend){
    legend.innerHTML = CMP_CRITERIA.map((c,i) => {
      let g = b[c.key];
      if(!g && c.key === 'grit_huidig') g = b.drit_huidig;
      const gradeTxt = g ? g.toUpperCase() : '–';
      return `<div class="dtl-pizza-legend-row"><span class="dtl-pizza-legend-dot" style="background:${PALETTE[i%PALETTE.length]}"></span>${escapeHtml(c.label)} · <b style="color:var(--text);">${escapeHtml(gradeTxt)}</b></div>`;
    }).join('');
  }
}

function renderDetailGauge(p){
  const wrap = $('#dtl-gauges');
  if(!wrap) return;
  const col = cmpColorFor(0);
  const score = cmpOverallScore(p);
  const grade = cmpGradeFromNum(score);
  const pct = Math.max(0, Math.min(1, score / 4));
  const R = 46, C = 2 * Math.PI * R;
  const off = C * (1 - pct);
  const potVal = cmpGradeNum(p.potentieel_niveau);
  const potPct = potVal ? potVal/4 : 0;
  const potOff = C * (1 - potPct);
  const meta = [positionLabel(p.positie), p.club].filter(Boolean).join(' · ');
  // D1: start vanuit hidden (stroke-dashoffset = C), animeer naar target
  wrap.innerHTML = `
    <div class="compare-gauge gauge-hidden" style="--player-color:${col.c};--gauge-circumference:${C}">
      <div class="compare-gauge-name">${escapeHtml(p.naam||'?')}</div>
      <div class="compare-gauge-meta">${escapeHtml(meta||'—')}</div>
      <div class="compare-gauge-ring">
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle class="compare-gauge-ring-bg" cx="55" cy="55" r="${R}" fill="none" stroke-width="8"/>
          <circle class="compare-gauge-ring-pot" cx="55" cy="55" r="${R}" fill="none" stroke-width="3"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" stroke-linecap="round"/>
          <circle class="compare-gauge-ring-fg" cx="55" cy="55" r="${R}" fill="none" stroke-width="8"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" stroke-linecap="round"/>
        </svg>
        <div class="compare-gauge-center">
          <div class="compare-gauge-grade">${escapeHtml(grade)}</div>
          <div class="compare-gauge-score">${score ? score.toFixed(2) : '–'} / 4</div>
        </div>
      </div>
      <div class="compare-gauge-dual">
        <div>Huidig<b>${escapeHtml(p.huidig_niveau||'–')}</b></div>
        <div>Potentieel<b>${escapeHtml(p.potentieel_niveau||'–')}</b></div>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    const el = wrap.querySelector('.compare-gauge');
    if(!el) return;
    el.classList.remove('gauge-hidden');
    const fg = el.querySelector('.compare-gauge-ring-fg');
    const pot = el.querySelector('.compare-gauge-ring-pot');
    if(fg)  fg.style.strokeDashoffset  = off;
    if(pot) pot.style.strokeDashoffset = potOff;
  });
}

function renderDetailRadar(p){
  const canvas = $('#dtl-radar');
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = 520, H = 520;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  const cx = W/2, cy = H/2 + 8, R = 180;
  const N = CMP_CRITERIA.length;
  const angle = (i) => -Math.PI/2 + (i * 2*Math.PI / N);
  // Background rings
  for(let lvl=1; lvl<=4; lvl++){
    ctx.beginPath();
    for(let i=0;i<N;i++){
      const a = angle(i);
      const r = R * (lvl/4);
      const x = cx + Math.cos(a)*r;
      const y = cy + Math.sin(a)*r;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath();
    ctx.strokeStyle = lvl===4 ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.08)';
    ctx.lineWidth = lvl===4 ? 1.2 : 1;
    ctx.stroke();
    if(lvl<4){ ctx.fillStyle = 'rgba(255,255,255,.02)'; ctx.fill(); }
  }
  for(let i=0;i<N;i++){
    const a = angle(i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a)*R, cy + Math.sin(a)*R);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = '10px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ['D','C','B','A'].forEach((g, i) => {
    const r = R * ((i+1)/4);
    ctx.fillText(g, cx + 8, cy - r + 3);
  });
  ctx.fillStyle = 'rgba(232,237,245,.9)';
  ctx.font = '600 12.5px -apple-system, Segoe UI, sans-serif';
  for(let i=0;i<N;i++){
    const a = angle(i);
    const lx = cx + Math.cos(a)*(R+24);
    const ly = cy + Math.sin(a)*(R+24);
    ctx.textAlign = Math.abs(Math.cos(a)) < 0.2 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
    ctx.textBaseline = Math.abs(Math.sin(a)) < 0.2 ? 'middle' : (Math.sin(a) > 0 ? 'top' : 'bottom');
    ctx.fillText(CMP_CRITERIA[i].label, lx, ly);
  }
  const col = cmpColorFor(0);
  const b = p.beoordelingen || {};
  const points = CMP_CRITERIA.map((c, i) => {
    let v = cmpGradeNum(b[c.key]);
    if(!v && c.key === 'grit_huidig') v = cmpGradeNum(b.drit_huidig);
    const r = R * (v / 4);
    const a = angle(i);
    return { x: cx + Math.cos(a)*r, y: cy + Math.sin(a)*r, v };
  });
  ctx.beginPath();
  points.forEach((pt, i) => { if(i===0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); });
  ctx.closePath();
  ctx.fillStyle = hexA(col.c, 0.22);
  ctx.fill();
  ctx.strokeStyle = col.c;
  ctx.lineWidth = 2;
  ctx.stroke();
  points.forEach(pt => {
    if(pt.v <= 0) return;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI*2);
    ctx.fillStyle = col.c;
    ctx.fill();
    ctx.strokeStyle = 'rgba(11,15,21,.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.fill();
}

function renderDetailTrend(p){
  const wrap = document.getElementById('dtl-trend-card');
  if(!wrap) return;
  const allReports = reportsForPlayer(p.id || p._id || '');
  if(allReports.length < 2){ wrap.innerHTML = ''; return; }

  // Sort oldest → newest
  const sorted = [...allReports].sort((a,b) => {
    const da = a.datum || a.wedstrijd?.datum || '';
    const db = b.datum || b.wedstrijd?.datum || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const gradeColor = { A:'var(--grade-a)', B:'var(--grade-b)', C:'var(--grade-c)', D:'var(--grade-d)' };
  const gradeScore = { A:4, B:3, C:2, D:1 };

  // Build data points
  const points = sorted.map((r, i) => ({
    i,
    label: r.datum ? formatDate(r.datum).slice(0,7) : `#${i+1}`,
    hn: (r.huidig_niveau||'').toUpperCase(),
    pn: (r.potentieel_niveau||'').toUpperCase(),
    adv: r.advies != null ? Number(r.advies) : null,
    hnVal: gradeScore[(r.huidig_niveau||'').toUpperCase()] || 0,
    pnVal: gradeScore[(r.potentieel_niveau||'').toUpperCase()] || 0,
  }));

  const n = points.length;
  const W = 400, H = 160, pad = { l:36, r:16, t:16, b:32 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const xPos = i => pad.l + (n === 1 ? iW/2 : (i / (n-1)) * iW);
  const yPos = v => pad.t + iH - ((v-1)/3) * iH;

  // SVG grid lines
  let gridLines = '';
  [1,2,3,4].forEach(v => {
    const y = yPos(v);
    const lbl = ['D','C','B','A'][v-1];
    const col = v===4?'rgba(255,255,255,.18)':'rgba(255,255,255,.07)';
    gridLines += `<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="${col}" stroke-width="1"/>`;
    gridLines += `<text x="${pad.l-6}" y="${y+4}" text-anchor="end" font-size="9" fill="rgba(232,237,245,.5)" font-family="inherit">${lbl}</text>`;
  });

  // Build polyline path
  const buildPath = (vals) => vals.map((pt,i) => {
    if(!pt) return null;
    return `${xPos(i).toFixed(1)},${yPos(pt).toFixed(1)}`;
  }).filter(Boolean).join(' ');

  const hnPath  = buildPath(points.map(p => p.hnVal));
  const pnPath  = buildPath(points.map(p => p.pnVal));
  const hnColor = '#60a5fa';
  const pnColor = '#34d399';

  // Dots
  let dots = '';
  points.forEach((pt, i) => {
    const x = xPos(i).toFixed(1);
    if(pt.hnVal){
      const y = yPos(pt.hnVal).toFixed(1);
      dots += `<circle cx="${x}" cy="${y}" r="4.5" fill="${hnColor}" stroke="rgba(11,15,21,.8)" stroke-width="1.5"/>`;
      dots += `<text x="${x}" y="${parseFloat(y)-8}" text-anchor="middle" font-size="9" fill="${hnColor}" font-weight="700" font-family="inherit">${pt.hn}</text>`;
    }
    if(pt.pnVal){
      const y = yPos(pt.pnVal).toFixed(1);
      dots += `<circle cx="${x}" cy="${y}" r="4.5" fill="${pnColor}" stroke="rgba(11,15,21,.8)" stroke-width="1.5"/>`;
      dots += `<text x="${x}" y="${parseFloat(y)+16}" text-anchor="middle" font-size="9" fill="${pnColor}" font-weight="700" font-family="inherit">${pt.pn}</text>`;
    }
  });

  // X-axis labels
  let xLabels = '';
  points.forEach((pt, i) => {
    const x = xPos(i).toFixed(1);
    xLabels += `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="9" fill="rgba(232,237,245,.45)" font-family="inherit">${escapeHtml(pt.label)}</text>`;
  });

  // Trend indicator
  const hnFirst = points[0].hnVal;
  const hnLast  = points[n-1].hnVal;
  const pnFirst = points[0].pnVal;
  const pnLast  = points[n-1].pnVal;
  const delta = (a, b) => a && b ? (b > a ? '↑' : b < a ? '↓' : '→') : '—';
  const deltaCol = (a, b) => a && b ? (b > a ? 'var(--grade-a)' : b < a ? 'var(--grade-d)' : 'var(--text-3)') : 'var(--text-3)';
  const hnDelta = delta(hnFirst, hnLast);
  const pnDelta = delta(pnFirst, pnLast);

  wrap.innerHTML = `
    <div class="card compare-card dtl-trend-card" style="margin-top:16px;">
      <div class="compare-card-title">
        <span>Ontwikkeltrend</span>
        <span class="compare-card-sub">${n} rapporten · huidig- en potentieelniveau over tijd</span>
      </div>
      <div class="dtl-trend-legend">
        <span class="dtl-trend-dot" style="background:${hnColor}"></span><span>Huidig niveau</span>
        <span style="color:${deltaCol(hnFirst,hnLast)};font-weight:700;margin-left:4px;">${hnDelta}</span>
        &nbsp;&nbsp;
        <span class="dtl-trend-dot" style="background:${pnColor}"></span><span>Potentieel</span>
        <span style="color:${deltaCol(pnFirst,pnLast)};font-weight:700;margin-left:4px;">${pnDelta}</span>
      </div>
      <div style="overflow-x:auto;">
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto;">
          ${gridLines}
          <polyline points="${hnPath}" fill="none" stroke="${hnColor}" stroke-width="2" stroke-linejoin="round"/>
          <polyline points="${pnPath}" fill="none" stroke="${pnColor}" stroke-width="2" stroke-linejoin="round" stroke-dasharray="5 3"/>
          ${dots}
          ${xLabels}
        </svg>
      </div>
    </div>`;
}

function renderDetailBars(p){
  const wrap = $('#dtl-bars');
  if(!wrap) return;
  const col = cmpColorFor(0);
  const b = p.beoordelingen || {};
  wrap.innerHTML = CMP_CRITERIA.map(c => {
    let g = b[c.key];
    if(!g && c.key === 'grit_huidig') g = b.drit_huidig;
    const v = cmpGradeNum(g);
    const pct = v ? (v/4)*100 : 0;
    const display = g || '–';
    return `
      <div class="compare-bar-group">
        <div class="compare-bar-group-title">
          <span>${escapeHtml(c.label)}</span>
          <em>${escapeHtml(display)}</em>
        </div>
        <div class="compare-bar-rows">
          <div class="compare-bar-row">
            <div class="compare-bar-name">&nbsp;</div>
            <div class="compare-bar-track">
              <div class="compare-bar-fill bar-init" data-target-w="${pct}" style="width:0;--player-color:${col.c};--player-color-2:${col.c2}"></div>
            </div>
            <div class="compare-bar-grade">${escapeHtml(display)}</div>
          </div>
        </div>
      </div>`;
  }).join('');
  // E2: animate bars
  requestAnimationFrame(() => {
    wrap.querySelectorAll('.compare-bar-fill.bar-init').forEach((el, i) => {
      setTimeout(() => {
        el.classList.remove('bar-init');
        el.style.width = el.dataset.targetW + '%';
      }, i * 50);
    });
  });
}

function renderDetailFullReport(p){
  const b = p.beoordelingen || {};
  const w = p.wedstrijd || {};
  const backBtnHtml = `
    <div style="margin-bottom:14px;">
      <button class="btn btn-sm" id="dtl-back-overview">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><polyline points="15 18 9 12 15 6"/></svg>
        Terug naar overzicht
      </button>
    </div>`;
  // backwards compat: oude records hebben drit_huidig / fysiek_huidig
  const gritVal = b.grit_huidig || b.drit_huidig;
  const fysiekFallback = b.fysiek_huidig;

  const atletischBlock = (b.explosiviteit_huidig || b.sprinten_huidig || b.duelleren_huidig || b.wendbaarheid_huidig)
    ? `
      <div class="detail-criteria">
        <div class="detail-criteria-name">Atletisch — uitgesplitst</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px;">
          <div style="font-size:11px;color:var(--text-2)">Explosiviteit <span class="grade ${b.explosiviteit_huidig||'D'}" style="margin-left:4px">${b.explosiviteit_huidig||'-'}</span></div>
          <div style="font-size:11px;color:var(--text-2)">Sprinten <span class="grade ${b.sprinten_huidig||'D'}" style="margin-left:4px">${b.sprinten_huidig||'-'}</span></div>
          <div style="font-size:11px;color:var(--text-2)">Duelleren <span class="grade ${b.duelleren_huidig||'D'}" style="margin-left:4px">${b.duelleren_huidig||'-'}</span></div>
          <div style="font-size:11px;color:var(--text-2)">Wendbaarheid <span class="grade ${b.wendbaarheid_huidig||'D'}" style="margin-left:4px">${b.wendbaarheid_huidig||'-'}</span></div>
        </div>
      </div>`
    : renderCriteriaCard('Atletisch / Fysiek', fysiekFallback);

  const scoresBlock = '';

  const wedstrijdBlock = (w.datum || w.thuis || w.uit || w.tegenstander || w.opstelling || w.context)
    ? `
      <div class="detail-section">
        <h4>Wedstrijd</h4>
        <div class="detail-criteria-grid">
          ${w.datum ? `<div class="detail-criteria"><div class="detail-criteria-name">Wedstrijddatum</div><div>${formatDate(w.datum)}</div></div>` : ''}
          ${w.thuis ? `<div class="detail-criteria"><div class="detail-criteria-name">Thuisspelende ploeg</div><div>${escapeHtml(w.thuis)}</div></div>` : ''}
          ${w.uit ? `<div class="detail-criteria"><div class="detail-criteria-name">Uitspelende ploeg</div><div>${escapeHtml(w.uit)}</div></div>` : ''}
          ${(!w.thuis && !w.uit && w.tegenstander) ? `<div class="detail-criteria"><div class="detail-criteria-name">Tegenstander</div><div>${escapeHtml(w.tegenstander)}</div></div>` : ''}
          ${w.uitslag ? `<div class="detail-criteria"><div class="detail-criteria-name">Uitslag</div><div>${escapeHtml(w.uitslag)}</div></div>` : ''}
          ${w.opstelling ? `<div class="detail-criteria"><div class="detail-criteria-name">Opstelling</div><div>${escapeHtml(w.opstelling)}</div></div>` : ''}
        </div>
        ${w.context ? `<div class="detail-notes" style="margin-top:10px;">${escapeHtml(w.context)}</div>` : ''}
      </div>`
    : '';

  const fysiekContextBlock = (p.bouw || p.lengte || p.motoriek || p.rijping)
    ? `
      <div class="detail-section">
        <h4>Lichaamsbouw &amp; motoriek</h4>
        <div class="detail-criteria-grid">
          ${p.bouw ? `<div class="detail-criteria"><div class="detail-criteria-name">Lichaamsbouw</div><div>${escapeHtml(p.bouw)}</div></div>` : ''}
          ${p.lengte ? `<div class="detail-criteria"><div class="detail-criteria-name">Lengte</div><div>${escapeHtml(p.lengte)}</div></div>` : ''}
          ${p.motoriek ? `<div class="detail-criteria"><div class="detail-criteria-name">Motoriek</div><div>${escapeHtml(p.motoriek)}</div></div>` : ''}
          ${p.rijping ? `<div class="detail-criteria"><div class="detail-criteria-name">Rijping</div><div>${escapeHtml(p.rijping)}</div></div>` : ''}
        </div>
      </div>`
    : '';

  const toelichtingBlock = (b.techniek_tekst || b.inzicht_tekst || b.grit_tekst || b.explosiviteit_tekst || b.sprinten_tekst || b.duelleren_tekst || b.wendbaarheid_tekst || b.atletisch_tekst)
    ? `
      <div class="detail-section">
        <h4>Toelichtingen per categorie</h4>
        ${b.techniek_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Techniek</div><div class="detail-notes">${escapeHtml(b.techniek_tekst)}</div></div>` : ''}
        ${b.inzicht_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Spelinzicht</div><div class="detail-notes">${escapeHtml(b.inzicht_tekst)}</div></div>` : ''}
        ${b.grit_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">GRIT</div><div class="detail-notes">${escapeHtml(b.grit_tekst)}</div></div>` : ''}
        ${b.explosiviteit_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Explosiviteit</div><div class="detail-notes">${escapeHtml(b.explosiviteit_tekst)}</div></div>` : ''}
        ${b.sprinten_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Sprinten</div><div class="detail-notes">${escapeHtml(b.sprinten_tekst)}</div></div>` : ''}
        ${b.duelleren_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Duelleren</div><div class="detail-notes">${escapeHtml(b.duelleren_tekst)}</div></div>` : ''}
        ${b.wendbaarheid_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Wendbaarheid</div><div class="detail-notes">${escapeHtml(b.wendbaarheid_tekst)}</div></div>` : ''}
        ${b.atletisch_tekst ? `<div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Atletisch (oud)</div><div class="detail-notes">${escapeHtml(b.atletisch_tekst)}</div></div>` : ''}
      </div>`
    : '';

  $('#player-view-body').innerHTML = `
    ${backBtnHtml}
    <div class="detail-header">
      <div class="detail-avatar">${initials(p.naam)}</div>
      <div style="flex:1;">
        <div class="detail-name">${escapeHtml(p.naam)}</div>
        <div class="detail-meta">
          ${escapeHtml(positionLabel(p.positie))}${p.club?(' · '+escapeHtml(p.club)):''}${p.rugnummer?(' · #'+escapeHtml(p.rugnummer)):''}
          ${p.been?(' · '+escapeHtml(p.been)):''}
          ${p.geboorte?(' · '+formatDate(p.geboorte)):''}
        </div>
        ${p.tweebenig ? `<div class="detail-meta" style="margin-top:2px;font-style:italic;">${escapeHtml(p.tweebenig)}</div>` : ''}
        <div class="detail-grade-row">
          <div><span class="grade-label">Huidig</span> <span class="grade ${p.huidig_niveau||'D'}">${p.huidig_niveau||'-'}</span></div>
          <div><span class="grade-label">Potentieel</span> <span class="grade outline ${p.potentieel_niveau||'D'}">${p.potentieel_niveau||'-'}</span></div>
          <div><span class="grade-label">Advies</span> <span class="grade ${gradeForAdvies(p.advies)}">${adviesLabel(p.advies)||'-'}</span></div>
        </div>
      </div>
    </div>

    ${scoresBlock}

    <div class="detail-section">
      <h4>Beoordeling per categorie</h4>
      <div class="detail-criteria-grid">
        ${renderCriteriaCard('Functionele techniek / Spelvaardigheden', b.techniek_huidig)}
        ${renderCriteriaCard('Spelintelligentie / Functioneel tactisch', b.inzicht_huidig)}
        ${renderCriteriaCard('GRIT / Passie & Attitude', gritVal)}
        ${atletischBlock}
      </div>
    </div>

    ${toelichtingBlock}

    ${wedstrijdBlock}

    ${fysiekContextBlock}

    ${p.wapen ? `
    <div class="detail-section">
      <h4>Persoonlijk wapen</h4>
      <div class="detail-notes">${escapeHtml(p.wapen)}</div>
    </div>` : ''}

    ${p.notities ? `
    <div class="detail-section">
      <h4>Notities</h4>
      <div class="detail-notes">${escapeHtml(p.notities)}</div>
    </div>` : ''}

    <div class="detail-section">
      <h4>Context</h4>
      <div class="detail-criteria-grid">
        <div class="detail-criteria"><div class="detail-criteria-name">Beoogde positie</div><div>${escapeHtml(positionLabel(p.beoogd)||'—')}</div></div>
        <div class="detail-criteria"><div class="detail-criteria-name">Leeftijdsgroep</div><div>${escapeHtml(p.leeftijd||'—')}</div></div>
        <div class="detail-criteria"><div class="detail-criteria-name">Scoutingmethode</div><div>${escapeHtml(p.methode||'—')}</div></div>
        <div class="detail-criteria"><div class="detail-criteria-name">Datum</div><div>${formatDate(p.datum)}</div></div>
      </div>
    </div>

    <div class="form-actions" style="margin-top:24px;">
      <button class="btn btn-danger btn-sm" id="del-${p.id}">Verwijder rapport</button>
      <button class="btn btn-sm" id="pdf-${p.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download als PDF
      </button>
      <button class="btn btn-sm" id="edit-${p.id}">Bewerken</button>
    </div>
  `;
  $('#dtl-back-overview').addEventListener('click', ()=> renderDetailOverview(p));
  $(`#del-${p.id}`).addEventListener('click', async ()=>{
    if(confirm('Dit rapport verwijderen?')){
      await deletePlayer(p.id);
      go(previousViewBeforePlayer || 'database');
      toast('Rapport verwijderd');
    }
  });
  $(`#pdf-${p.id}`).addEventListener('click', ()=> generatePlayerPDF(p));
  $(`#edit-${p.id}`).addEventListener('click', ()=>{
    go('report');
    loadIntoForm(p);
  });
  window.scrollTo({top:0});
}
function renderCriteriaCard(name, cur){
  return `
    <div class="detail-criteria">
      <div class="detail-criteria-name">${name}</div>
      <div class="detail-criteria-grades">
        <span class="grade-label">H</span><span class="grade ${cur||'D'}">${cur||'-'}</span>
      </div>
    </div>`;
}
function gradeForAdvies(a){
  const n = parseInt(a,10);
  if(n===4) return 'A'; if(n===3) return 'B'; if(n===2) return 'C';
  return 'D';
}
function adviesLabel(v){
  const map = {'4':'Direct contracteren','3':'Op proef uitnodigen','2':'Periodiek monitoren','1':'Geen vervolgstap'};
  return map[String(v)] || '';
}
function closeDetail(){ $('#modal-backdrop').classList.remove('open'); }

/* =============== REPORT FORM =============== */
function buildGradePickers(){
  $$('.grade-picker').forEach(picker=>{
    const isPot = picker.classList.contains('pot');
    picker.innerHTML = GRADES.map(g=>`
      <button type="button" class="grade-pick ${isPot?'grade-pick-pot':''}" data-grade="${g}">${g}</button>
    `).join('');
    $$('.grade-pick', picker).forEach(b=>{
      b.addEventListener('click', ()=>{
        $$('.grade-pick', picker).forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected');
        picker.dataset.value = b.dataset.grade;
      });
    });
  });
}
// s35an (#7): TERM-MAP synoniemen -> canonisch criterium (matcht grade-picker data-key prefix)
const SHORT_TERM_MAP = {
  'techniek':'techniek','balcontrole':'techniek','passing':'techniek','passen':'techniek',
  'dribbel':'techniek','dribbelen':'techniek','eerste aanname':'techniek','kappen':'techniek','traptechniek':'techniek','afwerken':'techniek',
  'inzicht':'inzicht','positiekeuze':'inzicht','positie':'inzicht','omschakeling':'inzicht',
  'beslissing':'inzicht','spelinzicht':'inzicht','keuze':'inzicht','overzicht':'inzicht','scannen':'inzicht',
  'grit':'grit','mentaliteit':'grit','leiderschap':'grit','doorzettingsvermogen':'grit','focus':'grit','wilskracht':'grit','drive':'grit','felheid':'grit','durf':'grit',
  'explosiviteit':'explosiviteit','explosief':'explosiviteit','start':'explosiviteit','versnelling':'explosiviteit',
  'sprinten':'sprinten','sprint':'sprinten','snelheid':'sprinten','loopvermogen':'sprinten',
  'duelleren':'duelleren','duel':'duelleren','duels':'duelleren','lichaamskracht':'duelleren','tweekamp':'duelleren',
  'wendbaarheid':'wendbaarheid','draaien':'wendbaarheid','balans':'wendbaarheid','wendbaar':'wendbaarheid','coordinatie':'wendbaarheid'
};
const SHORT_CRIT_LABEL = {
  techniek:'Techniek', inzicht:'Inzicht', grit:'Mentaliteit',
  explosiviteit:'Explosiviteit', sprinten:'Sprinten',
  duelleren:'Duelleren', wendbaarheid:'Wendbaarheid'
};
// s35an: parser — leest 'term [a/b/c/d]: tekst' regels uit ruwe notitie.
function parseSnelNotitie(raw){
  const lines = (raw||'').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const crit = {}; const rest = []; let grade = null;
  const gm = (raw||'').match(/(\d{1,2})\s*\/\s*10/);
  if(gm) grade = gm[1];
  lines.forEach(line => {
    if(/^[a-zéëïü\s]+\s*[:,\-\u2014]\s*$/i.test(line)) return; // lege stub
    let m = line.match(/^([a-zéëïü\s]+?)\s+([abcd])\s*[:,\-\u2014]\s*(.+)$/i);
    if(!m){
      const m2 = line.match(/^([abcd])\s+([a-zéëïü\s]+?)\s*[:,\-\u2014]\s*(.+)$/i);
      if(m2) m = [m2[0], m2[2], m2[1], m2[3]];
    }
    if(!m){
      const m3 = line.match(/^([a-zéëïü\s]+?)\s*[:,\-\u2014]\s*(.+)$/i);
      if(m3){
        const term = m3[1].toLowerCase().trim();
        const can = SHORT_TERM_MAP[term];
        if(can){
          if(!crit[can]) crit[can] = {rating:null, tekst:m3[2].trim()};
          else crit[can].tekst += ' \u00b7 '+m3[2].trim();
          return;
        }
      }
      rest.push(line); return;
    }
    const term = m[1].toLowerCase().trim();
    const rating = m[2].toLowerCase();
    const tekst = m[3].trim();
    const can = SHORT_TERM_MAP[term];
    if(!can){ rest.push(line); return; }
    if(!crit[can]){ crit[can] = {rating, tekst}; return; }
    const order = {a:4,b:3,c:2,d:1};
    if(order[rating] > order[crit[can].rating||'d']) crit[can].rating = rating;
    crit[can].tekst += ' \u00b7 '+tekst;
  });
  return {crit, rest, grade};
}
// s35an: vul ratings + toelichtingen + algemene notities op basis van parser-resultaat
function applySnelNotitieToForm(){
  const raw = (document.getElementById('snel-notitie-text')||{}).value || '';
  const status = document.getElementById('snel-notitie-status');
  const {crit, rest, grade} = parseSnelNotitie(raw);
  let nFilled = 0;
  Object.entries(crit).forEach(([can, v]) => {
    const pickerKey = can + '_huidig';
    if(v.rating && typeof setPickerValue === 'function'){
      setPickerValue(pickerKey, v.rating.toUpperCase());
    }
    const ta = document.getElementById('f-tekst-' + can);
    if(ta && v.tekst){
      ta.value = v.tekst;
      ta.style.transition = 'background .35s';
      ta.style.background = 'rgba(74,222,128,0.15)';
      setTimeout(() => { ta.style.background = ''; }, 600);
    }
    nFilled++;
  });
  // niet-herkend + cijfer -> algemene notities (append, niet overschrijven)
  const notitiesEl = document.getElementById('f-notities');
  if(notitiesEl){
    const extra = [];
    if(grade) extra.push('Algemene indruk: '+grade+'/10');
    if(rest.length) extra.push(rest.join(' \u00b7 '));
    if(extra.length){
      const cur = (notitiesEl.value||'').trim();
      const add = extra.join(' \u00b7 ');
      notitiesEl.value = cur ? (cur + '\n' + add) : add;
    }
  }
  if(typeof setDirty === 'function') setDirty(true);
  if(status){
    if(nFilled === 0 && !rest.length && !grade){
      status.textContent = 'Geen herkende regels.';
      status.style.color = '#fbbf24';
    } else {
      const parts = [];
      if(nFilled) parts.push(nFilled+' criterium'+(nFilled===1?'':'a')+' ingevuld');
      if(rest.length || grade) parts.push('rest naar algemene notities');
      status.textContent = '\u2713 '+parts.join(' \u00b7 ');
      status.style.color = '#4ade80';
    }
    setTimeout(() => { status.textContent = '\u00a0'; status.style.color=''; }, 3500);
  }
}
window.applySnelNotitieToForm = applySnelNotitieToForm;
// s35ba: Collapsible form-sections — alles dicht behalve Eindbeoordeling
(function(){
  if(window.__shFsCollapseWired) return;
  window.__shFsCollapseWired = true;
  function applyCollapseDefaults(){
    // s35bi: web (>900px) standaard expanded, app (<900px) standaard collapsed
    const isApp = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
    document.querySelectorAll('.form-section').forEach(sec => {
      if(sec.classList.contains('always-open')) return;
      if(!sec.dataset.shInit){
        sec.dataset.shInit = '1';
        if(isApp) sec.classList.add('collapsed');
      }
    });
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.form-section-title');
    if(!t) return;
    const sec = t.closest('.form-section');
    if(!sec || sec.classList.contains('always-open')) return;
    sec.classList.toggle('collapsed');
  });
  const mo = new MutationObserver(() => applyCollapseDefaults());
  if(document.body) mo.observe(document.body, {childList:true, subtree:true});
  if(document.readyState !== 'loading') applyCollapseDefaults();
  else document.addEventListener('DOMContentLoaded', applyCollapseDefaults);
  window.__shApplyFsCollapse = applyCollapseDefaults;
})();
// s35az: mobile keyboard — focused textarea/input naar centrum scrollen na 300ms
(function(){
  if(window.__shKbdScrollWired) return;
  window.__shKbdScrollWired = true;
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  if(!isMobile) return;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if(!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return;
    // s35ba: snel-notitie textarea NIET scrollen (mobile keyboard dismiss bug)
    if(el.classList && (el.classList.contains('sa-snel-tekst') || el.classList.contains('sa-snel-naam') || el.classList.contains('sa-snel-rug'))) return;
    setTimeout(() => {
      try { el.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_){}
    }, 300);
  });
})();
// s35an: paneel-toggle, stubs, en fill-knop activeren zodra DOM klaar is
function initSnelNotitiePanel(){
  const toggle = document.getElementById('snel-notitie-toggle');
  const body   = document.getElementById('snel-notitie-body');
  const arr    = document.getElementById('snel-notitie-arr');
  const fillBtn= document.getElementById('snel-notitie-fill');
  const stubBtn= document.getElementById('snel-notitie-stubs');
  const ta     = document.getElementById('snel-notitie-text');
  // s35az: auto-save bij elke toetsaanslag (debounced)
  if(ta && !ta.__shAutoSaveWired){
    ta.__shAutoSaveWired = true;
    let __shSnDebounce = null;
    ta.addEventListener('input', () => {
      if(typeof setDirty === 'function') setDirty(true);
      if(__shSnDebounce) clearTimeout(__shSnDebounce);
      __shSnDebounce = setTimeout(() => {
        try {
          const st = document.getElementById('snel-notitie-status');
          if(st){ st.textContent = 'auto-opgeslagen'; st.style.color = '#4ade80'; }
          setTimeout(() => { const s2 = document.getElementById('snel-notitie-status'); if(s2){ s2.textContent = '\u00a0'; s2.style.color = ''; } }, 1500);
        } catch(_){}
      }, 800);
    });
  }
  // s35ao (#7): alleen tonen 30 min vóór tot 1.5 uur ná aftrap van de actieve wedstrijd
  try {
    const panel = document.getElementById('snel-notitie-panel');
    if(panel){
      let inWindow = false;
      try {
        const ctx = window.__shScoutingCtx || null;
        const progId = (ctx && ctx.progId) || (sessionStorage.getItem('progFullCtx') ? JSON.parse(sessionStorage.getItem('progFullCtx')||'{}').progId : null);
        let prog = null;
        if(progId && typeof programmaCache !== 'undefined' && Array.isArray(programmaCache)){
          prog = programmaCache.find(p => p.id === progId);
        }
        if(prog && prog.datum){
          const t = (prog.tijd && /^\d{1,2}:\d{2}$/.test(prog.tijd)) ? prog.tijd : '00:00';
          const ts = new Date(prog.datum + 'T' + t).getTime();
          if(!isNaN(ts)){
            const now = Date.now();
            if(now >= ts - 30*60*1000 && now <= ts + 90*60*1000) inWindow = true;
          }
        }
      } catch(_){}
      panel.style.display = inWindow ? '' : 'none';
    }
  } catch(_){}
  if(!toggle || !body || toggle.dataset.bound) return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    if(arr) arr.textContent = open ? '\u25be' : '\u25b8';
  });
  if(fillBtn) fillBtn.addEventListener('click', applySnelNotitieToForm);
  if(stubBtn) stubBtn.addEventListener('click', () => {
    if(!ta) return;
    ta.value = 'techniek:\ninzicht:\nmentaliteit:\nexplosiviteit:\nsprinten:\nduelleren:\nwendbaarheid:\nalgemeen:';
    ta.focus();
  });
}
window.initSnelNotitiePanel = initSnelNotitiePanel;
document.addEventListener('DOMContentLoaded', initSnelNotitiePanel);
// s35ao (#4): defensieve rebind dashboard match-tile expand
// (production bug: handler werd niet altijd actief; her-bindt elke render veilig)
try {
  document.addEventListener('click', function(e){
    const tile = e.target && e.target.closest && e.target.closest('.today-match-card, .match-tile-dash, [data-match-tile]');
    if(!tile) return;
    if(e.target.closest('button, a, input, .player-row, [data-prevent-expand]')) return;
    const wrap = tile.closest('[data-match-list], #today-matches, .match-list') || tile.parentElement;
    if(wrap){
      const id = tile.dataset.matchId || tile.dataset.id || tile.getAttribute('data-id') || '';
      const cur = wrap.dataset.expandedId || '';
      wrap.dataset.expandedId = (cur === id ? '' : id);
      tile.classList.toggle('expanded', wrap.dataset.expandedId === id);
      tile.classList.toggle('open',     wrap.dataset.expandedId === id);
    } else {
      tile.classList.toggle('expanded');
      tile.classList.toggle('open');
    }
  }, true);
} catch(_){}
// fallback: init na korte tick voor het geval DOMContentLoaded al gevuurd is
setTimeout(initSnelNotitiePanel, 0);

function setPickerValue(key, val){
  const picker = document.querySelector(`.grade-picker[data-key="${key}"]`);
  if(!picker) return;
  picker.dataset.value = val || '';
  $$('.grade-pick', picker).forEach(b=>{
    b.classList.toggle('selected', b.dataset.grade === val);
  });
}
function getPickerValue(key){
  return document.querySelector(`.grade-picker[data-key="${key}"]`)?.dataset.value || '';
}
function refreshPositionDropdowns(){
  const linie = $('#f-linie').value;
  const positionsForLine = POSITIONS_BY_LINE[linie] || ALL_POSITIONS;
  const posSel = $('#f-positie');
  const beoogdSel = $('#f-beoogd');
  const currentPos = posSel.value;
  const currentBeoogd = beoogdSel.value;

  posSel.innerHTML = '<option value="">Kies...</option>' +
    positionsForLine.map(p=>`<option value="${p.code}">${p.label}</option>`).join('');
  beoogdSel.innerHTML = '<option value="">— Zelfde als positie —</option>' +
    ALL_POSITIONS.map(p=>`<option value="${p.code}">${p.label}</option>`).join('');

  if(positionsForLine.some(p=>p.code===currentPos)) posSel.value = currentPos;
  if(currentBeoogd) beoogdSel.value = currentBeoogd;
}
function resetReportForm(){
  if(typeof __shTrace === 'function') __shTrace('reset-report-form', {
    had_ctx: !!window.__shScoutingCtx,
    had_id: !!($('#f-id') && $('#f-id').value)
  });
  $('#report-title').textContent = 'Nieuw spelersrapport';
  $('#report-form').reset();
  $('#f-id').value = '';
  refreshPositionDropdowns();
  $$('.grade-pick').forEach(b=>b.classList.remove('selected'));
  $$('.grade-picker').forEach(p=>p.dataset.value='');
  // s35x: scouting-context loslaten zodat autosave terugvalt op localStorage
  window.__shScoutingCtx = null;
  setDirty(false);
  // s35ca-3: nieuw rapport is per definitie unlocked
  if(typeof __shSetReportLocked === 'function') __shSetReportLocked(false);
}

// s35ca-3: read-only modus voor ingediende rapporten. Zet alle inputs/
// selects/textareas in #report-form op disabled en toont de lock-banner
// met 'Bewerk toch'-knop. Niveau-pickers krijgen pointer-events:none
// via een CSS class op de form.
function __shSetReportLocked(on){
  const form = document.getElementById('report-form');
  if(!form) return;
  const banner = document.getElementById('report-lock-banner');
  const intro = document.getElementById('report-intro-strip');
  const saveDraftBtn = document.getElementById('report-save-draft-btn');
  const submitBtn = document.getElementById('report-save-btn');
  if(on){
    form.classList.add('sh-form-locked');
    form.querySelectorAll('input, select, textarea, button[type="button"][data-tab], .grade-pick').forEach(el => {
      // hidden #f-id niet disablen — we hebben de waarde nodig
      if(el.id === 'f-id') return;
      // niet de lock-banner knop zelf disabelen
      if(el.id === 'report-unlock-btn') return;
      try { el.setAttribute('data-sh-was-disabled', el.disabled ? '1' : '0'); } catch(_){}
      el.disabled = true;
    });
    if(banner){ banner.style.display = 'flex'; }
    if(intro){ intro.style.display = 'none'; }
    if(saveDraftBtn){ saveDraftBtn.style.display = 'none'; }
    if(submitBtn){ submitBtn.style.display = 'none'; }
  } else {
    form.classList.remove('sh-form-locked');
    form.querySelectorAll('[data-sh-was-disabled]').forEach(el => {
      const wasDisabled = el.getAttribute('data-sh-was-disabled') === '1';
      el.disabled = wasDisabled;
      el.removeAttribute('data-sh-was-disabled');
    });
    if(banner){ banner.style.display = 'none'; }
    if(intro){ intro.style.display = ''; }
    if(saveDraftBtn){ saveDraftBtn.style.display = ''; }
    if(submitBtn){ submitBtn.style.display = ''; }
  }
}
window.__shSetReportLocked = __shSetReportLocked;

// s35ca-3: wire Opslaan-knop + Bewerk-toch knop (one-time)
(function _shWireReportButtonsOnce(){
  if(window.__shReportButtonsWired) return;
  window.__shReportButtonsWired = true;
  document.addEventListener('click', function(e){
    const draftBtn = e.target.closest && e.target.closest('#report-save-draft-btn');
    if(draftBtn){
      e.preventDefault();
      window.__shFormSubmitMode = 'draft';
      const form = document.getElementById('report-form');
      if(form){
        // requestSubmit overslaat de submit-knop validatie maar triggert submit-event
        if(typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
      }
      return;
    }
    const unlockBtn = e.target.closest && e.target.closest('#report-unlock-btn');
    if(unlockBtn){
      e.preventDefault();
      const ok = window.confirm('Dit rapport is al ingediend.\nWeet je zeker dat je het wilt bewerken?');
      if(ok && typeof __shSetReportLocked === 'function') __shSetReportLocked(false);
      return;
    }
  });
})();
// s35q: split volledige naam in voornaam (eerste woord) + achternaam (rest,
// inclusief tussenvoegsels zoals 'van der'). Robust voor lege input.
function splitNaam(naam){
  const v = String(naam||'').trim();
  if(!v) return { voornaam: '', achternaam: '' };
  const parts = v.split(/\s+/);
  if(parts.length === 1) return { voornaam: parts[0], achternaam: '' };
  return { voornaam: parts[0], achternaam: parts.slice(1).join(' ') };
}
window.splitNaam = splitNaam;

// s35q: sync verborgen *-naam input uit zichtbare voornaam + achternaam.
// prefix is 'f' voor spelersrapport, 'pp' voor programma modal.
function syncNaamHidden(prefix){
  const vn = ($('#'+prefix+'-voornaam')?.value || '').trim();
  const an = ($('#'+prefix+'-achternaam')?.value || '').trim();
  const full = [vn, an].filter(Boolean).join(' ');
  const hidden = $('#'+prefix+'-naam');
  if(hidden) hidden.value = full;
}
window.syncNaamHidden = syncNaamHidden;

// s35dh fix: parse snel-notitie tekst-string naar individuele rapport-criterium-velden
function _shParseTekstToForm(tekst){
  if(!tekst) return;
  const TERM_MAP = [
    ['techniek',     'f-tekst-techniek'],
    ['inzicht',      'f-tekst-inzicht'],
    ['mentaliteit',  'f-tekst-grit'],        // mentaliteit ↔ GRIT in rapport
    ['explosiviteit','f-tekst-explosiviteit'],
    ['sprinten',     'f-tekst-sprinten'],
    ['duelleren',    'f-tekst-duelleren'],
    ['wendbaarheid', 'f-tekst-wendbaarheid'],
    ['algemeen',     'f-notities'],
  ];
  const src = String(tekst);
  TERM_MAP.forEach(([term, fieldId]) => {
    const el = document.getElementById(fieldId);
    if(!el) return;
    const re = new RegExp('^\\s*' + term + '\\s*:\\s*(.*)$', 'mi');
    const m = src.match(re);
    const val = (m && m[1]) ? m[1].trim() : '';
    if(val) el.value = val; // overschrijft: live-notitie heeft prioriteit boven lege velden
  });
}
function loadIntoForm(p){
  $('#report-title').textContent = 'Rapport bewerken — ' + (p.naam || [p.voornaam, p.achternaam].filter(Boolean).join(' '));
  $('#f-id').value = p.id;
  // s35q: prefer expliciete voornaam/achternaam, fallback op splitNaam(p.naam)
  let voornaam = p.voornaam || '';
  let achternaam = p.achternaam || '';
  if(!voornaam && !achternaam && p.naam){
    const s = splitNaam(p.naam);
    voornaam = s.voornaam; achternaam = s.achternaam;
  }
  if($('#f-voornaam')) $('#f-voornaam').value = voornaam;
  if($('#f-achternaam')) $('#f-achternaam').value = achternaam;
  $('#f-naam').value = p.naam || [voornaam, achternaam].filter(Boolean).join(' ');
  $('#f-geboorte').value = p.geboorte || '';
  $('#f-club').value = p.club || '';
  $('#f-plaats').value = p.plaats || '';
  if($('#f-adres')) $('#f-adres').value = p.adres || '';
  $('#f-rugnummer').value = p.rugnummer || '';
  $('#f-elftal').value = p.elftal || ''; try{document.getElementById('f-elftal')._syncAC && document.getElementById('f-elftal')._syncAC();}catch(_){}
  $('#f-been').value = p.been || '';
  $('#f-tweebenig').value = p.tweebenig || '';
  $('#f-linie').value = p.linie || '';
  refreshPositionDropdowns();
  $('#f-positie').value = p.positie || '';
  $('#f-beoogd').value = p.beoogd || '';
  $('#f-leeftijd').value = p.leeftijd || '';
  if($('#f-leeftijd-opm')) $('#f-leeftijd-opm').value = p.leeftijd_opmerking || '';
  $('#f-methode').value = p.methode || 'Live';
  $('#f-advies').value = p.advies || '';
  $('#f-wapen').value = p.wapen || '';
  $('#f-notities').value = p.notities || p.opmerkingen || ''; // s35dh fix: concept-spelers gebruiken opmerkingen
  if($('#f-niet-gerapporteerd')) $('#f-niet-gerapporteerd').checked = !!p.niet_gerapporteerd;
  if($('#f-niet-gerapporteerd-reden')) $('#f-niet-gerapporteerd-reden').value = p.niet_gerapporteerd_reden || '';
  if(typeof shSyncNietGerapporteerdUI === 'function'){ try{ shSyncNietGerapporteerdUI(); }catch(_){} }

  // s35dh fix: concept-spelers slaan wedstrijddata op in rapport.wedstrijd
  const w = p.wedstrijd || (p.rapport && p.rapport.wedstrijd) || {};
  $('#f-w-datum').value = w.datum || '';
  $('#f-w-thuis').value = w.thuis || w.tegenstander || '';
  $('#f-w-uit').value = w.uit || '';
  $('#f-w-uitslag').value = w.uitslag || '';
  $('#f-w-opstelling').value = w.opstelling || '';
  $('#f-w-context').value = w.context || '';
  /* s35dg Fase H: locatie-velden bij reload van concept */
  if($('#f-w-plaats')) $('#f-w-plaats').value = w.plaats || '';
  if($('#f-w-sportpark')) $('#f-w-sportpark').value = w.sportpark || '';
  if($('#f-w-veld')) $('#f-w-veld').value = w.veld || '';

  $('#f-bouw').value = p.bouw || '';
  $('#f-lengte').value = p.lengte || '';
  $('#f-motoriek').value = p.motoriek || '';
  $('#f-rijping').value = p.rijping || '';

  const b = p.beoordelingen || {};
  setPickerValue('techniek_huidig', b.techniek_huidig);
  setPickerValue('inzicht_huidig', b.inzicht_huidig);
  // backwards compat: oude records hebben drit_huidig
  setPickerValue('grit_huidig', b.grit_huidig || b.drit_huidig);
  setPickerValue('explosiviteit_huidig', b.explosiviteit_huidig);
  setPickerValue('sprinten_huidig', b.sprinten_huidig);
  setPickerValue('duelleren_huidig', b.duelleren_huidig);
  setPickerValue('wendbaarheid_huidig', b.wendbaarheid_huidig);

  $('#f-tekst-techniek').value = b.techniek_tekst || '';
  $('#f-tekst-inzicht').value = b.inzicht_tekst || '';
  $('#f-tekst-grit').value = b.grit_tekst || '';
  $('#f-tekst-explosiviteit').value = b.explosiviteit_tekst || '';
  $('#f-tekst-sprinten').value = b.sprinten_tekst || '';
  $('#f-tekst-duelleren').value = b.duelleren_tekst || '';
  $('#f-tekst-wendbaarheid').value = b.wendbaarheid_tekst || '';

  // s35dh fix: concept-speler met snel-notitie → parse tekst naar criterium-velden
  // alleen als de beoordelingen-teksten nog leeg zijn (wil bestaande rapporten niet overschrijven)
  if(p.opmerkingen && !p.notities){
    const _bEmpty = !b.techniek_tekst && !b.inzicht_tekst && !b.grit_tekst &&
                    !b.explosiviteit_tekst && !b.sprinten_tekst && !b.duelleren_tekst && !b.wendbaarheid_tekst;
    if(_bEmpty) try { _shParseTekstToForm(p.opmerkingen); } catch(_){}
  }

  setPickerValue('huidig_niveau', p.huidig_niveau);
  setPickerValue('potentieel_niveau', p.potentieel_niveau);
  // s35ca-3: rapporten met concept===false zijn ingediend → read-only
  if(typeof __shSetReportLocked === 'function'){
    __shSetReportLocked(p && p.concept === false);
  }
}
function updateSliderDisplay(inputId, valId, val){
  const el = document.getElementById(valId);
  if(!el) return;
  if(val == null || val === '' || val === 0){
    el.textContent = '—';
    el.classList.add('empty');
  } else {
    el.textContent = Number(val).toFixed(1).replace(/\.0$/, '');
    el.classList.remove('empty');
  }
}
async function submitReport(e){
  e.preventDefault();
  // s35ca-3: mode-flag bepaalt of dit een 'submit' (concept:false) of
  // 'draft' (concept:true) opslag is. Default 'submit' voor de Indienen-knop.
  const __mode = (window.__shFormSubmitMode === 'draft') ? 'draft' : 'submit';
  window.__shFormSubmitMode = null;
  const id = $('#f-id').value || uid();
  // s35q: lees voornaam + achternaam, val terug op f-naam voor edge cases
  const voornaam = ($('#f-voornaam')?.value || '').trim();
  const achternaam = ($('#f-achternaam')?.value || '').trim();
  syncNaamHidden('f');
  const naam = $('#f-naam').value.trim();
  if(!voornaam){ toast('Vul een voornaam in', true); return; }
  if(!achternaam){ toast('Vul een achternaam in', true); return; }
  if(!naam){ toast('Vul een naam in', true); return; }
  const huidig = getPickerValue('huidig_niveau');
  const pot = getPickerValue('potentieel_niveau');
  if(__mode === 'submit' && (!huidig || !pot)){
    toast('Geef huidig én potentieel niveau op', true);
    return;
  }
  const isEdit = !!$('#f-id').value;
  const player = {
    id,
    naam,
    voornaam,
    achternaam,
    geboorte: $('#f-geboorte').value,
    club: $('#f-club').value.trim(),
    plaats: $('#f-plaats').value.trim(),
    adres: ($('#f-adres') ? $('#f-adres').value.trim() : ''),
    rugnummer: $('#f-rugnummer').value.trim(),
    elftal: $('#f-elftal').value.trim() || deriveElftalFromReport({
      club: $('#f-club').value.trim(),
      wedstrijd: {
        thuis: $('#f-w-thuis').value.trim(),
        uit: $('#f-w-uit').value.trim()
      }
    }),
    been: $('#f-been').value,
    tweebenig: $('#f-tweebenig').value.trim(),
    linie: $('#f-linie').value,
    positie: $('#f-positie').value,
    beoogd: $('#f-beoogd').value,
    leeftijd: $('#f-leeftijd').value,
    leeftijd_opmerking: $('#f-leeftijd-opm') ? $('#f-leeftijd-opm').value.trim() : '',
    methode: $('#f-methode').value,
    advies: $('#f-advies').value,
    wapen: $('#f-wapen').value.trim(),
    notities: $('#f-notities').value.trim(),
    wedstrijd: {
      datum: $('#f-w-datum').value,
      thuis: $('#f-w-thuis').value.trim(),
      uit: $('#f-w-uit').value.trim(),
      uitslag: $('#f-w-uitslag').value.trim(),
      opstelling: $('#f-w-opstelling').value,
      context: $('#f-w-context').value.trim(),
      /* s35dg Fase H */
      plaats: $('#f-w-plaats') ? $('#f-w-plaats').value.trim() : '',
      sportpark: $('#f-w-sportpark') ? $('#f-w-sportpark').value.trim() : '',
      veld: $('#f-w-veld') ? $('#f-w-veld').value.trim() : ''
    },
    bouw: $('#f-bouw').value,
    lengte: $('#f-lengte').value,
    motoriek: $('#f-motoriek').value,
    rijping: $('#f-rijping').value,
    beoordelingen: {
      techniek_huidig: getPickerValue('techniek_huidig'),
      techniek_tekst: $('#f-tekst-techniek').value.trim(),
      inzicht_huidig: getPickerValue('inzicht_huidig'),
      inzicht_tekst: $('#f-tekst-inzicht').value.trim(),
      grit_huidig: getPickerValue('grit_huidig'),
      grit_tekst: $('#f-tekst-grit').value.trim(),
      explosiviteit_huidig: getPickerValue('explosiviteit_huidig'),
      explosiviteit_tekst: $('#f-tekst-explosiviteit').value.trim(),
      sprinten_huidig: getPickerValue('sprinten_huidig'),
      sprinten_tekst: $('#f-tekst-sprinten').value.trim(),
      duelleren_huidig: getPickerValue('duelleren_huidig'),
      duelleren_tekst: $('#f-tekst-duelleren').value.trim(),
      wendbaarheid_huidig: getPickerValue('wendbaarheid_huidig'),
      wendbaarheid_tekst: $('#f-tekst-wendbaarheid').value.trim()
    },
    huidig_niveau: huidig,
    potentieel_niveau: pot,
    datum: $('#f-w-datum').value || todayISO(),
    concept: (__mode === 'draft')
  };
  try {
    await savePlayer(player);
    // s35ca-3: toast tekst hangt af van mode
    if(__mode === 'draft'){
      toast(isEdit ? 'Concept bijgewerkt' : 'Concept opgeslagen');
    } else {
      toast(isEdit ? 'Rapport bijgewerkt' : 'Rapport ingediend');
    }
    setDirty(false);
    resetReportForm();
    go('database');
  } catch(e){ /* error already toasted */ }
}

/* =============== PITCH / ANALYSES =============== */
function slotMeta(slot){
  return SLOT_META[slot.src] || {label:slot.src.toUpperCase(), short:slot.src.toUpperCase(), matches:[]};
}
function slotsForFormation(f){ return FORMATIONS[f] || FORMATIONS[DEFAULT_FORMATION]; }
function playersMatchingSlot(slot){
  const matches = slotMeta(slot).matches || [];
  return loadPlayers().filter(p => matches.includes(p.positie) || matches.includes(p.beoogd));
}
function emptyChipBg(){ return 'rgba(255,255,255,.08)'; }

/* =============== WEDSTRIJDEN =============== */
function extractAge(teamName){
  if(!teamName) return '';
  const m = String(teamName).match(/\bO\s?\.?\s?(\d{1,2})\b/i);
  return m ? ('O' + m[1]) : '';
}
function stripAgeFromTeam(teamName){
  if(!teamName) return '';
  return String(teamName)
    .replace(/\s*\bO\s?\.?\s?\d{1,2}(?:[-\s]?\d+)?\b/ig, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function aggregateMatches(players){
  const map = new Map();
  players.forEach(p => {
    const w = p.wedstrijd || {};
    const datum = w.datum || p.datum;
    const thuis = (w.thuis || '').trim();
    const uit = (w.uit || '').trim();
    if(!datum || (!thuis && !uit)) return;
    const ageHome = extractAge(thuis);
    const ageAway = extractAge(uit);
    const age = ageHome || ageAway || '';
    const key = [datum, thuis.toLowerCase(), uit.toLowerCase()].join('|');
    if(!map.has(key)){
      map.set(key, {
        datum, thuis, uit, age,
        uitslag: (w.uitslag || '').trim(),
        opstelling: (w.opstelling || ''),
        players: []
      });
    }
    const entry = map.get(key);
    if(!entry.uitslag && (w.uitslag||'').trim()) entry.uitslag = w.uitslag.trim();
    if(!entry.age && age) entry.age = age;
    entry.players.push({
      id: p.id,
      naam: p.naam || '—',
      club: p.club || '',
      positie: p.positie || '',
      huidig_niveau: p.huidig_niveau || '',
      potentieel_niveau: p.potentieel_niveau || ''
    });
  });
  return Array.from(map.values());
}
function formatDayMonth(iso){
  const d = new Date(iso);
  if(isNaN(d)) return { day: '?', month: '', year: '' };
  const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  return { day: String(d.getDate()), month: months[d.getMonth()], year: String(d.getFullYear()) };
}
function groupKeyMonth(iso){
  const d = new Date(iso);
  if(isNaN(d)) return 'Onbekende datum';
  const months = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  return months[d.getMonth()] + ' ' + d.getFullYear();
}
/* ===== s35bo: Typed-confirm delete modal ===== */
function showTypedDeleteConfirm(opts){
  return new Promise((resolve) => {
    const needle = String(opts.confirmWord || '').trim();
    const title  = opts.title || 'Wedstrijdrapport verwijderen?';
    const body   = opts.body  || '';
    const label  = opts.label || 'Type de clubnaam om te bevestigen';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .15s ease;';
    wrap.innerHTML = `
      <div style="background:#11141c;border:1px solid #3a1f1f;border-radius:14px;max-width:480px;width:100%;box-shadow:0 8px 40px rgba(227,6,19,.18);font:14px/1.55 system-ui,sans-serif;color:#e5e9f5">
        <div style="padding:14px 18px;border-bottom:1px solid #3a1f1f;display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(227,6,19,.18);color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:18px">⚠</div>
          <div style="font-size:14.5px;font-weight:700;color:#ef4444">${title.replace(/</g,'&lt;')}</div>
        </div>
        <div style="padding:14px 18px;font-size:12.8px;line-height:1.65;color:#d8dceb">
          ${body}
          <label style="display:block;margin-top:10px;font-size:11.5px;color:#9aa3b7">${label.replace(/</g,'&lt;')} <b style="color:#f5c842">${needle.replace(/</g,'&lt;')}</b></label>
          <input id="__td_input" type="text" autocomplete="off" spellcheck="false" style="margin-top:6px;width:100%;background:#0a0c12;border:1px solid #3a1f1f;color:#e5e9f5;padding:8px 10px;border-radius:6px;font-size:13px;font-family:inherit;outline:none">
        </div>
        <div style="padding:12px 18px;display:flex;gap:8px;border-top:1px solid #3a1f1f;background:rgba(0,0,0,.18)">
          <button id="__td_cancel" type="button" style="background:transparent;border:1px solid #262b39;color:#9aa3b7;padding:7px 14px;border-radius:6px;font-size:12.5px;cursor:pointer">Annuleren</button>
          <button id="__td_ok" type="button" disabled style="background:#e30613;color:#fff;border:0;padding:7px 18px;border-radius:6px;font-size:12.5px;font-weight:700;cursor:not-allowed;margin-left:auto;opacity:.4">Verwijderen</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const inp = wrap.querySelector('#__td_input');
    const okB = wrap.querySelector('#__td_ok');
    const cnB = wrap.querySelector('#__td_cancel');
    const cleanup = (val) => { wrap.remove(); resolve(val); };

    const norm = s => String(s||'').trim().toLowerCase();
    inp.addEventListener('input', () => {
      const m = norm(inp.value) === norm(needle);
      okB.disabled = !m;
      okB.style.cursor   = m ? 'pointer' : 'not-allowed';
      okB.style.opacity  = m ? '1' : '.4';
      inp.style.borderColor = m ? '#7fd99e' : '#3a1f1f';
    });
    okB.addEventListener('click', () => { if(!okB.disabled) cleanup(true); });
    cnB.addEventListener('click', () => cleanup(false));
    wrap.addEventListener('click', (e) => { if(e.target === wrap) cleanup(false); });
    document.addEventListener('keydown', function onEsc(ev){
      if(ev.key === 'Escape'){ document.removeEventListener('keydown', onEsc); cleanup(false); }
    });
    setTimeout(() => inp.focus(), 50);
  });
}

// s36a: leeftijd normaliseren — "O18"/"O.18"/"o 15" -> "O.18" (één consistente groep)
function normAge(s){
  if(!s) return '';
  s = String(s).trim();
  const m = s.match(/^O\.?\s*(\d{1,2})$/i);
  return m ? ('O.' + m[1]) : s;
}

function renderMatches(){
  const players = loadPlayers();
  let matches = aggregateMatches(players).map(m => ({...m, kind: 'aggregated'}));

  // s18b: Voorstel B — standalone match-reports (kind:'report') niet meer in wedstrijden-overzicht

  // s35dh: merge past programma-items die nog niet als aggregated/report voorkomen
  try {
    const _dNow = new Date(); _dNow.setHours(23,59,59,999);
    const _dCut = new Date(_dNow); _dCut.setDate(_dCut.getDate() - 60);
    if(typeof programmaCache !== 'undefined' && Array.isArray(programmaCache)){
      const _existK = new Set(matches.map(m => _shMatchKey(m)));
      programmaCache.forEach(p => {
        if(!p || !p.datum || !p.thuis || !p.uit) return;
        const _d = (typeof parseAnyDate === 'function') ? parseAnyDate(p.datum) : new Date(p.datum);
        if(!_d || isNaN(_d.getTime())) return;
        if(_d > _dNow || _d < _dCut) return;
        // s35dj: programma-item pas zichtbaar in Wedstrijden nadat wedstrijd op slot is
        if(typeof _shIsMatchLocked === 'function' && !_shIsMatchLocked(p)) return;
        const _pm = { datum: p.datum, thuis: p.thuis, uit: p.uit, age: p.leeftijd||'', kind:'programma', progId:p.id, id:p.id, players:[] };
        const _k = _shMatchKey(_pm);
        if(!_existK.has(_k)){ matches.push(_pm); _existK.add(_k); }
      });
    }
  } catch(_){}

  // s18b: stats vóór filtering (totalen op volledige set — geen 'report' meer)
  const _statTotal = matches.length;
  const _statVerwerkt = matches.filter(m => m.kind === 'aggregated').length;
  const _statNogVerwerken = matches.filter(m => (m.kind === 'aggregated' || m.kind === 'programma') && !shIsWedstrijdVerwerkt(_shMatchKey(m))).length;
  const _setText = (id, n) => { const el = document.getElementById(id); if(el) el.textContent = n; };
  _setText('m-stat-total', _statTotal);
  _setText('m-stat-verwerkt', _statVerwerkt);

  // Filters
  const search = ($('#match-search').value || '').toLowerCase().trim();
  const ageFilter = $('#match-age').value || '';
  const sortMode = $('#match-sort').value || 'newest';

  // Populate age filter (unique ages present) + chip-row
  const ages = Array.from(new Set(matches.map(m => normAge(m.age)).filter(Boolean))).sort((a,b)=>{
    return (parseInt(String(a).replace(/\D/g,''))||0) - (parseInt(String(b).replace(/\D/g,''))||0);
  });
  const ageSel = $('#match-age');
  const currentAge = ageSel ? (ageSel.value || ageFilter) : ageFilter;
  if(ageSel){
    ageSel.innerHTML = '<option value="">Alle leeftijden</option>' +
      ages.map(a => `<option value="${a}"${a===currentAge?' selected':''}>${a}</option>`).join('');
  }
  // s35bq: render age-chips
  const ageChipsHost = document.getElementById('match-age-chips');
  if(ageChipsHost){
    const ageCounts = {};
    matches.forEach(m => { const a = normAge(m.age); if(a) ageCounts[a] = (ageCounts[a]||0)+1; });
    const totalAge = matches.length;
    const ageHtml = [`<button type="button" class="m-chip${ageFilter===''?' active':''}" data-age-chip="">Alle <span class="m-chip-count">${totalAge}</span></button>`]
      .concat(ages.map(a => `<button type="button" class="m-chip${ageFilter===a?' active':''}" data-age-chip="${escapeHtml(a)}">${escapeHtml(a)} <span class="m-chip-count">${ageCounts[a]||0}</span></button>`))
      .join('');
    ageChipsHost.innerHTML = ageHtml;
  }
  // s35bq: render status-chips
  const statusChipsHost = document.getElementById('match-status-chips');
  if(statusChipsHost){
    const statuses = [
      { id: '',              label: 'Alle status',     count: _statTotal },
      { id: 'nog-verwerken', label: 'Nog te verwerken',count: _statNogVerwerken },
      { id: 'verwerkt',      label: 'Verwerkt',        count: _statVerwerkt }
    ];
    statusChipsHost.innerHTML = statuses.map(s =>
      `<button type="button" class="m-chip${matchStatusFilter===s.id?' active':''}" data-status-chip="${s.id}">${escapeHtml(s.label)} <span class="m-chip-count">${s.count}</span></button>`
    ).join('');
  }

  // Apply filters
  if(search){
    matches = matches.filter(m =>
      m.thuis.toLowerCase().includes(search) ||
      m.uit.toLowerCase().includes(search) ||
      (m.age || '').toLowerCase().includes(search) ||
      (m.opmerking || '').toLowerCase().includes(search)
    );
  }
  if(ageFilter){
    matches = matches.filter(m => normAge(m.age) === normAge(ageFilter));
  }
  // s35bq + s35bt: status-filter
  if(matchStatusFilter === 'verwerkt'){
    matches = matches.filter(m => m.kind === 'aggregated');
  } else if(matchStatusFilter === 'nog-verwerken'){
    matches = matches.filter(m => (m.kind === 'aggregated' || m.kind === 'programma') && !shIsWedstrijdVerwerkt(_shMatchKey(m)));
  }

  // Sort
  matches.sort((a,b)=>{
    const da = new Date(a.datum).getTime() || 0;
    const db = new Date(b.datum).getTime() || 0;
    return sortMode === 'oldest' ? da - db : db - da;
  });

  $('#matches-count').textContent =
    matches.length + ' wedstrijd' + (matches.length === 1 ? '' : 'en');

  const empty = $('#matches-empty');
  const list = $('#matches-list');
  if(matches.length === 0){
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Group by month
  let lastGroup = null;
  let html = '';
  matches.forEach(m => {
    const group = groupKeyMonth(m.datum);
    if(group !== lastGroup){
      html += `<div class="match-group-header">${escapeHtml(group)}</div>`;
      lastGroup = group;
    }
    const d = formatDayMonth(m.datum);
    const thuisClean = escapeHtml(stripAgeFromTeam(m.thuis) || m.thuis || '—');
    const uitClean = escapeHtml(stripAgeFromTeam(m.uit) || m.uit || '—');

    // s18b: kind === 'report' niet meer getoond in wedstrijden-overzicht

    // s93: programma-item — clean post-match kaart (punten 7-17)
    if(m.kind === 'programma'){
      const _shKeyP = _shMatchKey(m);
      const _progP = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === m.progId) : null;
      const _spelers = _progP ? (_progP.spelers || []) : [];
      const _sns = _progP ? (_progP.snelnotities || []) : [];
      const _wstr = _progP ? _progP.wedstrijdrapport : null;
      // s93: trigger auto-conversie notities → concept-spelersrapporten (punt 7)
      try { if(typeof _shConvertNotesToDrafts === 'function' && _progP) _shConvertNotesToDrafts(_progP); } catch(_){}
      // s93: elftal in naam (punt 13)
      const _thuisF = _progP && _progP.thuis_elftal ? `${_progP.thuis||m.thuis} ${_progP.thuis_elftal}` : (m.thuis||'?');
      const _uitF   = _progP && _progP.uit_elftal   ? `${_progP.uit||m.uit} ${_progP.uit_elftal}`     : (m.uit||'?');
      // s93: per-speler verwerkt check (punt 15)
      const _linkedKeys = new Set(_spelers.map(sp => sp && sp.id).filter(Boolean));
      const _unlinkedSns = _sns.filter(sn => sn && sn.naam && !_linkedKeys.has(sn.spelerKey));
      const _allSpVerwerkt = _spelers.length === 0 ? true : _spelers.every(sp => {
        const concept = (typeof findSlotConcept === 'function') ? findSlotConcept(m.progId, sp.id) : null;
        return concept && !_shPlayerIsConcept(concept);
      });
      const _wstrVerwerkt = _wstr && (_wstr.status === 'ingediend' || _wstr.status === 'verwerkt');
      // s93: groen vinkje alleen als: items aanwezig + alles verwerkt (punt 14)
      const _hasItems = _spelers.length > 0 || !!_wstr;
      const _allVerwerkt = _hasItems && _allSpVerwerkt && _wstrVerwerkt && _unlinkedSns.length === 0;
      // s93: dropdown rows
      let _dropRows = '';
      // Spelersrapporten
      if(_spelers.length > 0 || _unlinkedSns.length > 0){
        _dropRows += `<div class="pm-section-hdr">Spelersrapporten</div>`;
        _dropRows += _spelers.map(sp => {
          const concept = (typeof findSlotConcept === 'function') ? findSlotConcept(m.progId, sp.id) : null;
          const isVerwerkt = concept && !_shPlayerIsConcept(concept);
          const naam = sp.naam||[sp.voornaam,sp.achternaam].filter(Boolean).join(' ')||'?';
          const sn = _sns.find(s => s && s.spelerKey === sp.id);
          const prev = sn && sn.tekst ? escapeHtml(sn.tekst.replace(/^[a-z]+:\s*/gmi,'').replace(/\n+/g,' \u00b7 ').trim().slice(0,60)) : '';
          return `<div class="pm-item-row">
            <div class="pm-item-info">
              <span class="pm-item-name">${escapeHtml(naam)}${sn&&sn.is_opvallend?' \u2b50':''}</span>
              ${sp.positie ? `<span class="pm-item-pos">${escapeHtml(sp.positie)}</span>` : ''}
              ${prev && !isVerwerkt ? `<div class="pm-item-preview">${prev}</div>` : ''}
            </div>
            <div class="pm-item-acts">
              ${isVerwerkt
                ? `<span class="pm-item-done">\u2713</span><button type="button" class="pm-item-link" data-player-id="${escapeHtml(concept.id)}" title="Naar profiel">Profiel</button>`
                : `<button type="button" class="pm-item-btn${concept?' ':' new'}" data-pm-rapport="${escapeHtml(m.progId)}" data-pm-sp-id="${escapeHtml(sp.id)}">${concept ? '\u2192 Open' : '\u2192 Rapport'}</button>`
              }
            </div>
          </div>`;
        }).join('');
        if(_unlinkedSns.length > 0){
          _dropRows += `<div class="pm-section-hdr pm-section-sub">Opgevallen spelers (${_unlinkedSns.length})</div>`;
          _dropRows += _unlinkedSns.map(sn => {
            const prev = sn.tekst ? escapeHtml(sn.tekst.replace(/^[a-z]+:\s*/gmi,'').replace(/\n+/g,' \u00b7 ').trim().slice(0,60)) : '';
            return `<div class="pm-item-row">
              <div class="pm-item-info">
                <span class="pm-item-name">${escapeHtml(sn.naam||'?')}${sn.is_opvallend?' \u2b50':''}</span>
                ${prev ? `<div class="pm-item-preview">${prev}</div>` : ''}
              </div>
              <div class="pm-item-acts">
                <button type="button" class="pm-item-btn new" data-pm-sn-obs="${escapeHtml(m.progId)}" data-pm-sn-id="${escapeHtml(sn.id||'')}">\u2192 Observatie</button>
              </div>
            </div>`;
          }).join('');
        }
      }
      // Wedstrijdnotitie — inline bewerkbaar
      const _wstrInitTekst = (_wstr && _wstr.tekst) ? _wstr.tekst : (_progP && _progP.notities ? _progP.notities : '');
      _dropRows += `<div class="pm-section-hdr">Wedstrijdnotitie</div>
      <div class="pm-wstr-inline">
        <textarea class="pm-wstr-ta" data-pm-wstr-prog="${escapeHtml(m.progId)}" rows="3"
          placeholder="Tactiek, score, sfeer, bijzonderheden...">${escapeHtml(_wstrInitTekst)}</textarea>
        <div class="pm-wstr-actions">
          ${_wstrVerwerkt ? `<span class="pm-item-done">✓ Ingediend</span>` : ''}
        </div>
      </div>`;
      const _chevP = `<span class="match-chevron pm-chev"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>`;
      html += `
        <div class="match-card pm-card" data-prog-match-id="${escapeHtml(m.progId)}" data-match-key="${escapeHtml(_shKeyP)}">
          <div class="match-date pm-toggle">
            <div class="match-date-day">${d.day}</div>
            <div class="match-date-month">${d.month}</div>
            <div class="match-date-year">${d.year}</div>
          </div>
          <div class="match-teams pm-toggle">
            <div class="match-teams-row">
              <span class="match-team-home">${escapeHtml(_thuisF)}</span>
              <span class="match-vs">\u2014</span>
              <span class="match-team-away">${escapeHtml(_uitF)}</span>
              ${_allVerwerkt ? '<span class="pm-done-badge">\u2713</span>' : _chevP}
            </div>
            ${_progP && (_progP.tijd || _progP.leeftijd) ? `<div class="match-meta"><span class="match-players-count">${[_progP.tijd, _progP.leeftijd].filter(Boolean).map(escapeHtml).join(' \u00b7 ')}</span></div>` : ''}
          </div>
          <div class="match-dropdown pm-dropdown" style="display:none">${_dropRows}</div>
        </div>
      `;
      return;
    }

    const scoreHtml = m.uitslag
      ? `<span class="match-score">${escapeHtml(m.uitslag)}</span>`
      : `<span class="match-vs">vs</span>`;
    const playersChips = m.players.map(pl => {
      const isConcept = _shPlayerIsConcept(pl);
      return `<span class="match-player-chip${isConcept?' is-concept':''}" data-player-id="${escapeHtml(pl.id)}" title="${escapeHtml((pl.club || '') + (isConcept?' (concept)':''))}">${escapeHtml(pl.naam)}${isConcept?' 📝':''}</span>`;
    }).join('');
    const ageBadge = m.age
      ? `<span class="match-age-badge">${escapeHtml(m.age)}</span>`
      : '';
    const opstellingMeta = m.opstelling ? `<span class="match-players-count">${escapeHtml(m.opstelling)}</span>` : '';
    const countMeta = `<span class="match-players-count">${m.players.length} rapport${m.players.length===1?'':'en'}</span>`;
    const chevron = `<span class="match-chevron"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>`;
    const dropdownRows = m.players.map(pl => {
      const initials = (pl.naam || '?').split(/\s+/).map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
      const posLabel = (typeof positionLabel === 'function' ? (positionLabel(pl.positie) || pl.positie || '') : (pl.positie || ''));
      const sub = [posLabel, pl.club].filter(Boolean).join(' • ');
      const hg = pl.huidig_niveau || 'D';
      const pg = pl.potentieel_niveau || 'D';
      const isConcept = _shPlayerIsConcept(pl);
      const conceptBadge = isConcept ? `<span class="mdr-concept-badge">Concept</span>` : '';
      const submitBtn = isConcept ? `<button type="button" class="mdr-submit" data-mdr-submit="${escapeHtml(pl.id)}" title="Direct indienen">→ Indienen</button>` : '';
      return `
        <button type="button" class="match-dropdown-row" data-player-id="${escapeHtml(pl.id)}">
          <span class="match-dropdown-avatar">${escapeHtml(initials || '?')}</span>
          <span class="match-dropdown-info">
            <span class="match-dropdown-name">${escapeHtml(pl.naam || '—')}${conceptBadge}</span>
            ${sub ? `<span class="match-dropdown-pos">${escapeHtml(sub)}</span>` : ''}
          </span>
          <span class="match-dropdown-grades" aria-label="Huidig en potentieel niveau">
            <span class="grade ${hg}" title="Huidig niveau">${escapeHtml(pl.huidig_niveau || '-')}</span>
            <span class="grade outline ${pg}" title="Potentieel niveau">${escapeHtml(pl.potentieel_niveau || '-')}</span>
          </span>
          ${submitBtn}
          <svg class="match-dropdown-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      `;
    }).join('');
    {
      const _shKeyA = _shMatchKey(m);
      const _shIsVerwerktA = shIsWedstrijdVerwerkt(_shKeyA);
      const _shBan = _shBannerHTML(m);
      html += `
        <div class="match-card expandable${_shIsVerwerktA?' locked':''}" data-match-id="${escapeHtml(m.id || (m.datum+'|'+m.thuis+'|'+m.uit))}" data-match-key="${escapeHtml(_shKeyA)}">
          <div class="match-date match-toggle">
            <div class="match-date-day">${d.day}</div>
            <div class="match-date-month">${d.month}</div>
            <div class="match-date-year">${d.year}</div>
          </div>
          <div class="match-teams match-toggle">
            <div class="match-teams-row">
              <span class="match-team-home">${thuisClean}</span>
              ${scoreHtml}
              <span class="match-team-away">${uitClean}</span>
              ${chevron}
            </div>
            <div class="match-meta">
              ${_shIsVerwerktA ? '<span class="match-status-pill verwerkt">✓ Verwerkt</span>' : ''}
              ${ageBadge}
              ${opstellingMeta}
              ${countMeta}
            </div>
            ${_shBan}
          </div>
          <div class="match-players">${playersChips}</div>
          <div class="match-dropdown">
            <div class="match-dropdown-title">Rapporten — klik op een speler om te openen</div>
            <div class="match-dropdown-list">${dropdownRows}</div>
          </div>
        </div>
      `;
    }
  });
  list.innerHTML = html;
  setTimeout(() => shStagger(list, '.match-card, .match-report-card, .match-group-header'), 0);

  // s34: concept-card click → open programma-item in edit-modal
  list.querySelectorAll('.concept-card').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.conceptProgId;
      if(!pid || typeof programmaCache === 'undefined') return;
      const prog = programmaCache.find(p => p && p.id === pid);
      if(prog) _shOpenEditModal({...prog, kind:'programma', progId:prog.id});
    });
  });
  // s34: concept-badge pill in match cards → scroll to concept section
  list.querySelectorAll('.m-concept-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrId = pill.dataset.wrOpen;
      if(!wrId) return;
      // Try to open the wedstrijdrapport directly
      const progEl = document.getElementById('matches-concepts-section');
      if(progEl){
        progEl.scrollIntoView({behavior:'smooth', block:'start'});
        // highlight the matching concept card
        const target = document.getElementById('cc-' + CSS.escape(wrId));
        if(target){ target.classList.add('cc-highlight'); setTimeout(()=>target.classList.remove('cc-highlight'),1600); }
      }
      // Also open the rapport form
      if(typeof openProgrammaWedstrijdrapport === 'function'){
        openProgrammaWedstrijdrapport(wrId);
      } else {
        // fallback: open programma-item
        if(typeof programmaCache !== 'undefined'){
          const prog = programmaCache.find(p => p && p.id === wrId);
          if(prog) _shOpenEditModal({...prog, kind:'programma', progId:prog.id});
        }
      }
    });
  });

  list.querySelectorAll('.match-player-chip').forEach(chip => {
    chip.addEventListener('click', (e)=>{
      e.stopPropagation();
      openDetail(chip.dataset.playerId);
    });
  });
  // s35bt: aggregated niet-toernooi cards openen nu de Wedstrijd-bewerken modal
  //        (gelijk aan report-cards). Toernooi-cards blijven inline uitklappen.
  list.querySelectorAll('.match-card.expandable').forEach(card => {
    if(false){
      // Originele expand-inline gedrag voor toernooi clusters
      card.querySelectorAll('.match-toggle').forEach(el => {
        el.addEventListener('click', (e)=>{
          const wasOpen = card.classList.contains('open');
          list.querySelectorAll('.match-card.open').forEach(c => { if(c !== card) c.classList.remove('open'); });
          card.classList.toggle('open', !wasOpen);
        });
      });
    } else {
      // Aggregated wedstrijd -> opent Wedstrijd-bewerken modal
      card.addEventListener('click', (e) => {
        // Negeer kliks die uit interactieve children komen (chips, knoppen, dropdown-rijen)
        const t = e.target;
        if(t && t.closest && (
            t.closest('.match-player-chip') ||
            t.closest('.match-dropdown-row') ||
            t.closest('.match-verwerk-toggle') ||
            t.closest('[data-match-verwerk]') ||
            t.closest('.mdr-submit') ||
            t.closest('.m-snel-chip') ||
            t.closest('button') ||
            t.closest('a')
        )) return;
        const key = card.dataset.matchKey;
        if(!key) return;
        const m = _shFindMatchByKey(key);
        if(!m){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
        m.kind = 'aggregated';
        _shOpenEditModal(m);
      });
    }
  });
  list.querySelectorAll('.match-dropdown-row').forEach(row => {
    row.addEventListener('click', (e)=>{
      e.stopPropagation();
      openDetail(row.dataset.playerId);
    });
  });

  list.querySelectorAll('.match-report-edit').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      openMatchReportModal(btn.dataset.reportId);
    });
  });
  list.querySelectorAll('.match-report-add-player').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const r = matchReportsCache.find(x => x.id === btn.dataset.reportId);
      if(!r) return;
      go('report');
      setTimeout(()=>{
        try {
          $('#f-w-datum').value = r.datum || '';
          $('#f-w-thuis').value = r.thuis || '';
          $('#f-w-uit').value = r.uit || '';
          $('#f-w-context').value = r.opmerking || '';
          if(r.leeftijd) $('#f-leeftijd').value = r.leeftijd;
        } catch(_){}
      }, 80);
    });
  });
  list.querySelectorAll('.match-report-delete').forEach(btn => {
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      // s35bo: typed-confirm met thuis-club als bevestigings-woord
      const rid = btn.dataset.reportId;
      const r = matchReportsCache.find(x => x.id === rid);
      const thuis = (r && r.thuis) ? String(r.thuis).trim() : '';
      let okGo = false;
      if(thuis){
        okGo = await showTypedDeleteConfirm({
          title: 'Wedstrijdrapport verwijderen?',
          body: `Dit rapport van <b>${thuis.replace(/</g,'&lt;')}</b> wordt verwijderd. Spelersrapporten blijven bewaard.`,
          label: 'Type de thuisclub om te bevestigen:',
          confirmWord: thuis
        });
      } else {
        okGo = confirm('Wedstrijdrapport verwijderen?');
      }
      if(!okGo) return;
      try { await deleteMatchReport(rid); toast('Verwijderd'); } catch(_){}
    });
  });

  // s35bs: snel-notitie chip → open spelersrapport-modal met prefill
  list.querySelectorAll('.m-snel-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const progId = btn.dataset.snelProg;
      const snIdx = parseInt(btn.dataset.snelIdx, 10);
      _shConvertSnelToRapport(progId, snIdx);
    });
  });

  // s35dg Fase E: "Open wedstrijdrapport"-knop op concept-banner → open wedstrijd-edit modal
  list.querySelectorAll('[data-wr-open]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const progId = btn.dataset.wrOpen;
      if(!progId) return;
      const prog = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
      if(!prog){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
      _shOpenEditModal({ kind: 'prog', id: prog.id, datum: prog.datum, thuis: prog.thuis, uit: prog.uit });
    });
  });

  // s35br: "Indienen"-mini-knop op concept-dropdown-row
  list.querySelectorAll('.mdr-submit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pid = btn.dataset.mdrSubmit;
      _shSubmitConceptPlayer(pid);
    });
  });

  // s35br: Wedstrijd-verwerken toggle (aggregated cards)
  list.querySelectorAll('[data-match-verwerk]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.matchVerwerk;
      const card = btn.closest('.match-card');
      const m = _shFindMatchByKey(key);
      if(m) _shOpenVerwerkModal(m);
    });
  });

  // s35br: Verwerken-knop in report-card edit-actions
  list.querySelectorAll('.match-verwerk-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reportId = btn.dataset.reportId;
      const r = matchReportsCache.find(x => x.id === reportId);
      if(!r) return;
      const pseudoMatch = { kind: 'report', id: r.id, datum: r.datum, thuis: r.thuis, uit: r.uit, opmerking: r.opmerking };
      _shOpenVerwerkModal(pseudoMatch);
    });
  });

  // s35bs: hele report-card klikbaar -> open Wedstrijd-bewerken modal
  list.querySelectorAll('.match-card.match-report-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Inner interactieve elementen hebben hun eigen stopPropagation
      const rid = card.dataset.reportId;
      if(!rid) return;
      const r = (typeof matchReportsCache !== 'undefined') ? matchReportsCache.find(x => x.id === rid) : null;
      if(!r){ if(typeof toast === "function") toast("Rapport niet gevonden", true); return; }
      _shOpenEditModal({
        kind: 'report',
        id: r.id,
        datum: r.datum,
        thuis: r.thuis,
        uit: r.uit,
        uitslag: r.uitslag,
        age: r.age,
        opmerking: r.opmerking,
        players: []
      });
    });
  });

  // s84: pm-card expand/collapse + → Rapport knop
  list.querySelectorAll('.pm-card').forEach(card => {
    // Expand/collapse via toggle-zone
    card.addEventListener('click', (e) => {
      // s93: spelersrapport knop
      const btnRapport = e.target.closest('[data-pm-rapport]');
      if(btnRapport){
        e.stopPropagation();
        const progId = btnRapport.dataset.pmRapport;
        const spId   = btnRapport.dataset.pmSpId;
        const prog   = (typeof programmaCache !== 'undefined') ? programmaCache.find(x => x && x.id === progId) : null;
        if(!prog){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
        const sp = (prog.spelers||[]).find(s => s && s.id === spId);
        if(!sp){ if(typeof toast === 'function') toast('Speler niet gevonden', true); return; }
        const { player } = (typeof findPlayerMatch === 'function') ? findPlayerMatch(sp) : { player: null };
        const concept = (typeof findSlotConcept === 'function') ? findSlotConcept(prog.id, sp.id) : null;
        if(typeof openScoutingPlayerForm === 'function') openScoutingPlayerForm(prog, sp, player, concept);
        return;
      }
      // s93: losse notitie → observatie knop
      const btnSnObs = e.target.closest('[data-pm-sn-obs]');
      if(btnSnObs){
        e.stopPropagation();
        const progId2 = btnSnObs.dataset.pmSnObs;
        const snId    = btnSnObs.dataset.pmSnId;
        const prog2   = (typeof programmaCache !== 'undefined') ? programmaCache.find(x => x && x.id === progId2) : null;
        if(!prog2){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
        const sn2     = (prog2.snelnotities||[]).find(s => s && (s.id === snId || (s.id == null && snId === '')));
        if(typeof openObservatieForm === 'function') openObservatieForm(prog2, sn2 || {});
        return;
      }
      // s93: wedstrijdrapport knop
      const btnWstr = e.target.closest('[data-pm-wstr]');
      if(btnWstr){
        e.stopPropagation();
        const progId3 = btnWstr.dataset.pmWstr;
        const prog3   = (typeof programmaCache !== 'undefined') ? programmaCache.find(x => x && x.id === progId3) : null;
        if(!prog3){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
        if(typeof _shOpenEditModal === 'function') _shOpenEditModal({ kind:'programma', id:progId3, progId:progId3, datum:prog3.datum, thuis:prog3.thuis, uit:prog3.uit, age:prog3.leeftijd||'', players:[], _focusWstr: true });
        return;
      }
      // s93: profiel-knop (verwerkte spelers)
      const btnLink = e.target.closest('.pm-item-link[data-player-id]');
      if(btnLink){
        e.stopPropagation();
        const pid = btnLink.dataset.playerId;
        if(pid && typeof openDetail === 'function') openDetail(pid);
        return;
      }
      // Edit-modal op klik op datum/teams (niet op knop/link)
      if(e.target.closest('button, a, .pm-dropdown')) return;
      // Toggle dropdown
      const drop = card.querySelector('.pm-dropdown');
      if(drop){
        const isOpen = card.classList.contains('pm-open');
        card.classList.toggle('pm-open', !isOpen);
        drop.style.display = isOpen ? 'none' : 'block';
        const chev = card.querySelector('.pm-chev');
        if(chev) chev.style.transform = isOpen ? '' : 'rotate(180deg)';
        return;
      }
      // Geen dropdown → open edit modal
      const progId = card.dataset.progMatchId;
      if(!progId) return;
      const p = (typeof programmaCache !== 'undefined') ? programmaCache.find(x => x && x.id === progId) : null;
      if(!p){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
      _shOpenEditModal({ kind:'programma', id:progId, progId, datum:p.datum, thuis:p.thuis, uit:p.uit, age:p.leeftijd||'', players:[] });
    });
  });
  // Wire inline wedstrijdnotitie textareas (auto-save on blur)
  list.querySelectorAll('.pm-wstr-ta').forEach(ta => {
    ta.addEventListener('click', e => e.stopPropagation());
    ta.addEventListener('keydown', e => e.stopPropagation());
    ta.addEventListener('focus', e => e.stopPropagation());
    ta.addEventListener('blur', async () => {
      const progId = ta.dataset.pmWstrProg;
      const prog = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
      if(!prog) return;
      const tekst = ta.value.trim();
      // Save to prog.notities (simple scalar) and update concept if exists
      if(prog.notities === tekst) return; // no change
      prog.notities = tekst;
      prog.modified = Date.now();
      if(prog.wedstrijdrapport){
        prog.wedstrijdrapport.tekst = tekst;
        prog.wedstrijdrapport.status = 'concept';
      }
      try {
        if(typeof saveProgrammaItem === 'function') await saveProgrammaItem(prog);
      } catch(_){}
    });
  });

  // s35dh: kaarten zonder .pm-card (oude match-report-card) → edit modal
  list.querySelectorAll('[data-prog-match-id]:not(.pm-card)').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target && e.target.closest && (e.target.closest('button') || e.target.closest('a'))) return;
      const progId = card.dataset.progMatchId;
      if(!progId) return;
      const p = (typeof programmaCache !== 'undefined') ? programmaCache.find(x => x && x.id === progId) : null;
      if(!p){ if(typeof toast === 'function') toast('Wedstrijd niet gevonden', true); return; }
      _shOpenEditModal({ kind:'programma', id:progId, progId, datum:p.datum, thuis:p.thuis, uit:p.uit, age:p.leeftijd||'', players:[] });
    });
  });

  // s35bq: chip-filters
  const ageHost = document.getElementById('match-age-chips');
  if(ageHost && !ageHost.dataset.wired){
    ageHost.dataset.wired = '1';
    ageHost.addEventListener('click', (e) => {
      const b = e.target.closest('[data-age-chip]');
      if(!b) return;
      const v = b.dataset.ageChip || '';
      const sel = document.getElementById('match-age');
      if(sel) sel.value = v;
      renderMatches();
    });
  }
  const statusHost = document.getElementById('match-status-chips');
  if(statusHost && !statusHost.dataset.wired){
    statusHost.dataset.wired = '1';
    statusHost.addEventListener('click', (e) => {
      const b = e.target.closest('[data-status-chip]');
      if(!b) return;
      matchStatusFilter = b.dataset.statusChip || '';
      renderMatches();
    });
  }

  // s35bq: empty-state CTA
  const emptyCta = document.getElementById('m-empty-cta');
  if(emptyCta && !emptyCta.dataset.wired){
    emptyCta.dataset.wired = '1';
    emptyCta.addEventListener('click', () => {
      const btn = document.getElementById('match-report-new-btn');
      if(btn) btn.click();
    });
  }

}

function renderPitch(){
  if(currentAnalysisId && getAnalysis(currentAnalysisId)){
    renderAnalysisDetail();
  } else {
    currentAnalysisId = null;
    renderAnalysesList();
  }
}

function renderAnalysesList(){
  $('#analyses-list-view').style.display = 'block';
  $('#analysis-detail-view').style.display = 'none';
  const wrap = $('#analyses-list-content');
  const analyses = [...loadAnalyses()].sort((a,b)=>{
    const da = a.datum || a.createdAt || '';
    const db = b.datum || b.createdAt || '';
    return db.localeCompare(da);
  });
  if(!analyses.length){
    wrap.innerHTML = `
      <div class="analysis-empty">
        <div class="icon">○</div>
        <h3>Nog geen analyses</h3>
        <p>Maak een elftal analyse aan voor een specifiek team. Per analyse vul je club, leeftijdscategorie, seizoen en opstelling in. Daarna markeer je per positie of er een open positie is en koppel je spelersrapporten.</p>
        <button class="btn btn-primary" id="empty-new-analysis">+ Eerste analyse maken</button>
      </div>`;
    $('#empty-new-analysis').addEventListener('click', createNewAnalysis);
    return;
  }
  $('#analyses-sub').textContent = `${analyses.length} analyse${analyses.length===1?'':'s'}`;
  wrap.innerHTML = `
    <div class="analyses-grid">
      ${analyses.map(a=>{
        const slots = a.slots || {};
        const gapCount = Object.values(slots).filter(s => s && s.gap).length;
        const linkedCount = Object.values(slots).reduce((n,s)=>{
          if(!s) return n;
          const lh = (s.linked_huidig || []).length;
          const lk = (s.linked_kandidaat || []).length;
          const lold = (Array.isArray(s.linked) && !s.linked_huidig) ? s.linked.length : 0;
          return n + lh + lk + lold;
        }, 0);
        const title = [a.club, a.leeftijd].filter(Boolean).join(' · ') || 'Nieuwe analyse';
        return `
          <div class="analysis-card" data-id="${a.id}">
            <div class="analysis-card-title">${escapeHtml(title)}</div>
            <div class="analysis-card-sub">${a.seizoen?escapeHtml(a.seizoen):'—'}</div>
            <div class="analysis-card-meta">
              <span class="analysis-meta-pill">${escapeHtml(a.formation || DEFAULT_FORMATION)}</span>
              <span class="analysis-meta-pill">${formatDate(a.datum)}</span>
              ${linkedCount? `<span class="analysis-meta-pill">${linkedCount} rapport${linkedCount===1?'':'en'}</span>`:''}
            </div>
            <div class="analysis-card-footer">
              <div style="color:var(--text-3);">Open posities</div>
              <div class="analysis-gap-count ${gapCount?'':'zero'}">${gapCount}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  $$('.analysis-card', wrap).forEach(card=>{
    card.addEventListener('click', ()=>{
      currentAnalysisId = card.dataset.id;
      selectedPitchPos = null;
      renderAnalysisDetail();
    });
  });
}

async function createNewAnalysis(){
  const a = blankAnalysis();
  await saveAnalysis(a);
  currentAnalysisId = a.id;
  selectedPitchPos = null;
  renderAnalysisDetail();
  toast('Nieuwe analyse aangemaakt');
}

function renderAnalysisDetail(){
  const a = currentAnalysis();
  if(!a){ renderAnalysesList(); return; }
  $('#analyses-list-view').style.display = 'none';
  $('#analysis-detail-view').style.display = 'block';

  const title = [a.club, a.leeftijd].filter(Boolean).join(' · ') || 'Nieuwe analyse';
  $('#analysis-detail-title').textContent = title;
  $('#analysis-detail-sub').textContent =
    [a.seizoen, a.formation].filter(Boolean).join(' · ') || '—';

  // Populate leeftijd dropdown
  const leeftijdSel = $('#a-leeftijd');
  leeftijdSel.innerHTML = '<option value="">— Kies leeftijdscategorie —</option>' +
    LEEFTIJD_OPTIONS.map(o => `<option value="${o}">${o}</option>`).join('');

  // Header fields
  $('#a-club').value = a.club || '';
  $('#a-leeftijd').value = a.leeftijd || '';
  $('#a-seizoen').value = a.seizoen || '';
  $('#a-datum').value = a.datum || '';
  $('#a-formation').value = FORMATIONS[a.formation] ? a.formation : DEFAULT_FORMATION;

  renderPitchPositions();
  renderPitchInfo();
}

function renderPitchPositions(){
  const a = currentAnalysis();
  if(!a) return;
  const formation = FORMATIONS[a.formation] ? a.formation : DEFAULT_FORMATION;
  const slots = slotsForFormation(formation);
  const state = a.slots || {};
  const container = $('#pitch-positions');

  container.innerHTML = slots.map(slot=>{
    const meta = slotMeta(slot);
    const s = state[slot.key] || {huidig:'', gewenst:'', gap:false};
    const cur = s.huidig;
    const want = s.gewenst;
    const curChip = cur
      ? `<span class="pos-grade" style="background:var(--grade-${cur.toLowerCase()});color:#0a0a0a;">${cur}</span>`
      : `<span class="pos-grade" style="background:${emptyChipBg()};color:var(--text-3);">·</span>`;
    const wantChip = want
      ? `<span class="pos-grade" style="background:transparent;border:1px solid var(--grade-${want.toLowerCase()});color:var(--grade-${want.toLowerCase()});">${want}</span>`
      : `<span class="pos-grade" style="background:transparent;border:1px solid var(--border-2);color:var(--text-3);">·</span>`;
    return `
      <button class="pos-btn ${s.gap?'gap':''} ${selectedPitchPos===slot.key?'selected':''}"
              data-key="${slot.key}"
              style="left:${slot.x}%; top:${slot.y}%;"
              title="${meta.label}">
        <div class="pos-code">${meta.short}</div>
        <div class="pos-grades">${curChip}${wantChip}</div>
      </button>
    `;
  }).join('');

  $$('.pos-btn', container).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selectedPitchPos = btn.dataset.key;
      renderPitchPositions();
      renderPitchInfo();
    });
  });

  const gaps = slots.filter(slot => state[slot.key]?.gap);
  $('#pitch-gap-list').innerHTML = gaps.length
    ? gaps.map(slot=>`<span class="gap-tag">${slotMeta(slot).label}</span>`).join('')
    : '<span style="color:var(--text-3); font-size:12px;">Geen actieve open posities.</span>';

  // G3: heatmap overlay — gekleurde gloeiplekken per positie op basis van huidig niveau
  const overlay = $('#pitch-heatmap-overlay');
  if(overlay){
    const _HM = { A:'#c9a227', B:'#60a5fa', C:'#fbbf24', D:'#e30613' };
    overlay.innerHTML = slots.map(slot => {
      const s = state[slot.key] || {};
      const grade = s.huidig;
      if(!grade || !_HM[grade]) return '';
      return `<div class="heatmap-zone" style="left:${slot.x}%;top:${slot.y}%;width:22%;height:16%;transform:translate(-50%,-60%);background:${_HM[grade]};"></div>`;
    }).join('');
    // fade-in via requestAnimationFrame (CSS transition: opacity .4s)
    $$('.heatmap-zone', overlay).forEach(z => { z.style.opacity = '0'; });
    requestAnimationFrame(() => {
      $$('.heatmap-zone', overlay).forEach((z, i) => {
        setTimeout(() => { z.style.opacity = ''; }, i * 40);
      });
    });
  }
}

function renderPitchInfo(){
  const panel = $('#pitch-info');
  const a = currentAnalysis();
  if(!a || !selectedPitchPos){
    panel.innerHTML = `
      <div class="pitch-info-empty">
        <div style="font-size:32px; opacity:.3; margin-bottom:8px;">⚽</div>
        <div>Klik op een positie in het veld om criteria in te vullen en spelers te koppelen.</div>
      </div>`;
    return;
  }
  const formation = FORMATIONS[a.formation] ? a.formation : DEFAULT_FORMATION;
  const slot = slotsForFormation(formation).find(s=>s.key===selectedPitchPos);
  if(!slot){
    selectedPitchPos = null;
    renderPitchInfo();
    return;
  }
  const meta = slotMeta(slot);
  const s = normalizeSlot((a.slots || {})[selectedPitchPos]);
  const linkedHuidigPlayers = (s.linked_huidig || []).map(id => loadPlayers().find(p=>p.id===id)).filter(Boolean);
  const linkedKandidaatPlayers = (s.linked_kandidaat || []).map(id => loadPlayers().find(p=>p.id===id)).filter(Boolean);

  const renderLinkedItem = (p, category) => `
    <div class="linked-report-item">
      <div class="linked-report-info" data-id="${p.id}">
        <div class="linked-report-name">${escapeHtml(p.naam)}</div>
        <div class="linked-report-meta">${escapeHtml(positionLabel(p.positie))}${p.club?(' · '+escapeHtml(p.club)):''} · ${formatDate(p.datum)}</div>
      </div>
      <div class="linked-report-grades">
        <span class="grade ${p.huidig_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.huidig_niveau||'-'}</span>
        <span class="grade outline ${p.potentieel_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.potentieel_niveau||'-'}</span>
      </div>
      <button class="linked-report-unlink" data-unlink="${p.id}" data-cat="${category}" title="Ontkoppelen">×</button>
    </div>
  `;

  panel.innerHTML = `
    <div class="position-detail-title">${meta.label}</div>
    <div class="position-detail-sub">${meta.short}</div>

    <div class="gap-toggle">
      <input type="checkbox" id="pitch-gap" ${s.gap?'checked':''} />
      <label for="pitch-gap">Markeer als <strong style="color:var(--secondary)">open positie</strong></label>
    </div>

    <div class="position-grade-block">
      <label><span class="dual-label-pill pill-current">Huidig kwaliteitsniveau</span></label>
      <div class="grade-picker" id="pitch-cur"></div>
    </div>
    <div class="position-grade-block">
      <label><span class="dual-label-pill pill-potential">Gewenst niveau</span></label>
      <div class="grade-picker pot" id="pitch-want"></div>
    </div>

    <div class="criteria-fields">
      <div class="criteria-field">
        <label>Profiel huidige speler(s)</label>
        <textarea id="slot-huidige-1" placeholder="Wie speelt er nu op deze positie? Beschrijf type, kwaliteiten, beperkingen...">${escapeHtml(s.huidige_speler_1||'')}</textarea>
      </div>
      <div class="criteria-field">
        <label>Profiel gewenste speler</label>
        <textarea id="slot-gezocht" placeholder="Wat voor speler zoeken we? Type, kwaliteiten, leeftijd, voorkeursbeen...">${escapeHtml(s.gezochte_speler||'')}</textarea>
      </div>
      <div class="criteria-field">
        <label>Wat missen we?</label>
        <textarea id="slot-missende" placeholder="Wat ontbreekt er concreet — kwaliteit, diepte, specifiek profiel?">${escapeHtml(s.missende||'')}</textarea>
      </div>
    </div>

    <div class="linked-reports">
      <div class="linked-reports-header">
        <div class="linked-reports-title">Huidige spelers (${linkedHuidigPlayers.length})</div>
        <button class="btn btn-sm" data-add-linked="huidig">+ Koppel rapport huidige speler</button>
      </div>
      ${linkedHuidigPlayers.length
        ? linkedHuidigPlayers.map(p => renderLinkedItem(p, 'huidig')).join('')
        : '<div class="linked-reports-empty">Nog geen huidige spelers gekoppeld. Koppel rapporten van spelers die nu op deze positie spelen.</div>'}
    </div>

    <div class="linked-reports" style="margin-top:10px;">
      <div class="linked-reports-header">
        <div class="linked-reports-title">Potentiële kandidaten (${linkedKandidaatPlayers.length})</div>
        <button class="btn btn-sm" data-add-linked="kandidaat">+ Koppel rapport potentiële kandidaat</button>
      </div>
      ${linkedKandidaatPlayers.length
        ? linkedKandidaatPlayers.map(p => renderLinkedItem(p, 'kandidaat')).join('')
        : '<div class="linked-reports-empty">Nog geen kandidaten gekoppeld. Koppel rapporten van spelers die deze open positie zouden kunnen invullen.</div>'}
    </div>
  `;

  // Grade pickers
  ['pitch-cur','pitch-want'].forEach((id,i)=>{
    const isPot = i===1;
    const el = $('#'+id);
    el.innerHTML = GRADES.map(g=>`<button type="button" class="grade-pick ${isPot?'grade-pick-pot':''}" data-grade="${g}">${g}</button>`).join('');
    const cur = i===0 ? s.huidig : s.gewenst;
    $$('.grade-pick', el).forEach(b=>{
      if(b.dataset.grade === cur) b.classList.add('selected');
      b.addEventListener('click', async ()=>{
        $$('.grade-pick', el).forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected');
        const patch = i===0 ? {huidig:b.dataset.grade} : {gewenst:b.dataset.grade};
        await patchSlot(selectedPitchPos, patch);
        renderPitchPositions();
      });
    });
  });

  // Gap toggle
  $('#pitch-gap').addEventListener('change', async e=>{
    await patchSlot(selectedPitchPos, {gap: e.target.checked});
    renderPitchPositions();
  });

  // Criteria textareas — save on blur (avoids flooding writes on every keystroke)
  [
    ['slot-huidige-1','huidige_speler_1'],
    ['slot-gezocht','gezochte_speler'],
    ['slot-missende','missende']
  ].forEach(([id,key])=>{
    const el = $('#'+id);
    if(!el) return;
    el.addEventListener('blur', async ()=>{
      const newVal = el.value.trim();
      const cur = currentAnalysis();
      const oldVal = (cur && cur.slots && cur.slots[selectedPitchPos] && cur.slots[selectedPitchPos][key]) || '';
      if(newVal !== oldVal){
        await patchSlot(selectedPitchPos, {[key]: newVal});
      }
    });
  });

  // Add linked buttons (huidig + kandidaat)
  $$('[data-add-linked]', panel).forEach(btn=>{
    btn.addEventListener('click', ()=> openPlayerPicker(btn.dataset.addLinked));
  });

  // Unlink + open detail
  $$('.linked-report-unlink', panel).forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.unlink;
      const cat = btn.dataset.cat;
      const cur = currentAnalysis();
      const slot = normalizeSlot(cur.slots[selectedPitchPos]);
      const key = cat === 'kandidaat' ? 'linked_kandidaat' : 'linked_huidig';
      const filtered = (slot[key] || []).filter(x=>x!==id);
      await patchSlot(selectedPitchPos, {[key]: filtered});
      renderPitchInfo();
      renderPitchPositions();
    });
  });
  $$('.linked-report-info', panel).forEach(el=>{
    el.addEventListener('click', ()=> openDetail(el.dataset.id));
  });
}

/* =============== PLAYER PICKER MODAL =============== */
let pickerCategory = 'huidig'; // 'huidig' or 'kandidaat'
function openPlayerPicker(category){
  pickerCategory = category === 'kandidaat' ? 'kandidaat' : 'huidig';
  const titleEl = $('#picker-modal .modal-title');
  if(titleEl){
    titleEl.textContent = pickerCategory === 'kandidaat'
      ? 'Koppel rapport — Potentiële kandidaat'
      : 'Koppel rapport — Huidige speler';
  }
  $('#picker-backdrop').classList.add('open');
  $('#picker-search').value = '';
  renderPickerList('');
  setTimeout(()=> $('#picker-search').focus(), 50);
}
function closePlayerPicker(){
  $('#picker-backdrop').classList.remove('open');
}
function renderPickerList(query){
  const a = currentAnalysis();
  if(!a || !selectedPitchPos) return;
  const slot = normalizeSlot(a.slots[selectedPitchPos]);
  const targetKey = pickerCategory === 'kandidaat' ? 'linked_kandidaat' : 'linked_huidig';
  const linkedIds = new Set(slot[targetKey] || []);
  const q = (query||'').trim().toLowerCase();

  let players = [...loadPlayers()];
  if(q){
    players = players.filter(p => {
      const hay = `${p.naam||''} ${p.club||''} ${positionLabel(p.positie)} ${p.beoogd||''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  players.sort((a,b)=>{
    const aLinked = linkedIds.has(a.id) ? 1 : 0;
    const bLinked = linkedIds.has(b.id) ? 1 : 0;
    if(aLinked !== bLinked) return aLinked - bLinked;
    return new Date(b.datum||0) - new Date(a.datum||0);
  });

  const wrap = $('#picker-list');
  if(!players.length){
    wrap.innerHTML = '<div class="linked-reports-empty">Geen spelers gevonden.</div>';
    return;
  }
  wrap.innerHTML = players.map(p=>{
    const linked = linkedIds.has(p.id);
    return `
      <div class="player-picker-item ${linked?'linked':''}" data-id="${p.id}">
        <div class="recent-avatar" style="width:32px;height:32px;font-size:12px;">${initials(p.naam)}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600;font-size:13px;">${escapeHtml(p.naam)} ${linked?'<span class="player-picker-badge">Gekoppeld</span>':''}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">${escapeHtml(positionLabel(p.positie))}${p.club?(' · '+escapeHtml(p.club)):''} · ${formatDate(p.datum)}</div>
        </div>
        <div style="display:flex;gap:4px;">
          <span class="grade ${p.huidig_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.huidig_niveau||'-'}</span>
          <span class="grade outline ${p.potentieel_niveau||'D'}" style="padding:0 6px;height:18px;font-size:10px;">${p.potentieel_niveau||'-'}</span>
        </div>
      </div>
    `;
  }).join('');

  $$('.player-picker-item', wrap).forEach(el=>{
    if(el.classList.contains('linked')) return;
    el.addEventListener('click', async ()=>{
      const id = el.dataset.id;
      const cur = currentAnalysis();
      const slot = normalizeSlot(cur.slots[selectedPitchPos]);
      const targetKey = pickerCategory === 'kandidaat' ? 'linked_kandidaat' : 'linked_huidig';
      const linked = [...(slot[targetKey] || []), id];
      await patchSlot(selectedPitchPos, {[targetKey]: linked});
      closePlayerPicker();
      renderPitchInfo();
      renderPitchPositions();
      toast(pickerCategory === 'kandidaat' ? 'Kandidaat gekoppeld' : 'Huidige speler gekoppeld');
    });
  });
}

async function changeFormation(newFormation){
  if(!FORMATIONS[newFormation]) return;
  const a = currentAnalysis();
  if(!a) return;
  const fresh = blankAnalysisSlots(newFormation);
  // Migrate matching slot keys
  for(const key of Object.keys(fresh)){
    if(a.slots && a.slots[key]) fresh[key] = a.slots[key];
  }
  selectedPitchPos = null;
  await patchAnalysis({formation: newFormation, slots: fresh});
  renderAnalysisDetail();
}

/* =============== HELPERS =============== */
/* s35cz: gemiddelde-berekening per speler over meerdere rapporten.
   Schaal A=4..D=1; gemiddelde terug naar letter via 3.5/2.5/1.5 thresholds. */
function reportsForPlayer(playerId){
  if(!playerId) return [];
  try {
    return (loadMatchReports() || [])
      .filter(r => r && r.player_id === playerId && !r.concept)
      .sort((a,b) => String(b.datum||'').localeCompare(String(a.datum||'')));
  } catch(_){ return []; }
}
function _avgScoreToLetter(avg){
  if(avg == null || isNaN(avg)) return null;
  if(avg >= 3.5) return 'A';
  if(avg >= 2.5) return 'B';
  if(avg >= 1.5) return 'C';
  return 'D';
}
function avgLetterForCriterium(reports, key){
  if(!Array.isArray(reports) || reports.length === 0) return null;
  const vals = [];
  for(const r of reports){
    const v = r?.beoordelingen?.[key];
    if(v && CMP_GRADE_VAL[v] != null) vals.push(CMP_GRADE_VAL[v]);
  }
  if(vals.length === 0) return null;
  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
  return { letter: _avgScoreToLetter(avg), score: avg, n: vals.length };
}
function avgAdvies(reports){
  if(!Array.isArray(reports) || reports.length === 0) return null;
  const vals = [];
  for(const r of reports){
    const v = parseInt(r?.advies, 10);
    if(!isNaN(v) && v>=1 && v<=4) vals.push(v);
  }
  if(vals.length === 0) return null;
  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
  return { score: avg, rounded: Math.round(avg), n: vals.length };
}
function avgPlayerStats(playerId){
  const reports = reportsForPlayer(playerId);
  if(reports.length === 0) return null;
  const out = { count: reports.length, criteria: {}, advies: avgAdvies(reports) };
  for(const c of CMP_CRITERIA){
    out.criteria[c.key] = avgLetterForCriterium(reports, c.key);
  }
  return out;
}

/* s35df: gemiddelde letter voor een top-level rapportveld (huidig_niveau, potentieel_niveau) */
function avgLetterField(reports, fieldName){
  if(!Array.isArray(reports) || reports.length === 0) return null;
  const vals = [];
  for(const r of reports){
    const v = r?.[fieldName];
    if(v && CMP_GRADE_VAL[v] != null) vals.push(CMP_GRADE_VAL[v]);
  }
  if(vals.length === 0) return null;
  const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
  return { letter: _avgScoreToLetter(avg), score: avg, n: vals.length };
}

/* s35df: bouw een synthetische "gemiddelde speler" voor de Spelersoverzicht-weergave
   wanneer er ≥2 rapporten zijn. Alle bestaande sub-renders gebruiken deze record. */
function buildAvgPlayer(p){
  if(!p) return p;
  const reports = reportsForPlayer(p.id);
  if(reports.length < 2) return p;
  const stats = avgPlayerStats(p.id);
  const hAvg = avgLetterField(reports, 'huidig_niveau');
  const pAvg = avgLetterField(reports, 'potentieel_niveau');
  const beoordelingen = {};
  for(const c of CMP_CRITERIA){
    const a = stats?.criteria?.[c.key];
    if(a?.letter && a.letter !== '-') beoordelingen[c.key] = a.letter;
  }
  return {
    ...p,
    beoordelingen,
    huidig_niveau:     hAvg?.letter || p.huidig_niveau,
    potentieel_niveau: pAvg?.letter || p.potentieel_niveau,
    advies: stats?.advies?.rounded ? String(stats.advies.rounded) : p.advies,
    _isAverage: true,
    _reportCount: reports.length
  };
}

/* s35df: overlay een specifiek rapport op de spelerrecord — voor 'open dit rapport' flow */
function buildPlayerFromReport(p, report){
  if(!p || !report) return p;
  return {
    ...p,
    beoordelingen:     report.beoordelingen     || p.beoordelingen || {},
    huidig_niveau:     report.huidig_niveau     || p.huidig_niveau,
    potentieel_niveau: report.potentieel_niveau || p.potentieel_niveau,
    advies:            (report.advies != null && report.advies !== '') ? report.advies : p.advies,
    wedstrijd:         report.wedstrijd         || p.wedstrijd,
    datum:             report.datum             || p.datum,
    /* s35dg Fase H: prefill wedstrijd-locatie velden */
    plaats:            report.plaats            || p.plaats,
    sportpark:         report.sportpark         || p.sportpark,
    veld:              report.veld              || p.veld,
    opmerkingen:       report.opmerkingen       || p.opmerkingen,
    sterke_punten:     report.sterke_punten     || p.sterke_punten,
    ontwikkelpunten:   report.ontwikkelpunten   || p.ontwikkelpunten,
    _fromReportId: report.id,
    _isAverage: false
  };
}

function positionLabel(code){
  if(!code) return '';
  const p = ALL_POSITIONS.find(x=>x.code.toUpperCase()===String(code).toUpperCase());
  return p ? p.label : code;
}
function escapeHtml(s){
  if(s==null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escapeAttr(s){
  if(s==null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
/* Afleiden van elftal (bv. "O.15-1") uit wedstrijdgegevens.
   Zoekt naar O.X-Y patroon in thuis of uit; geeft voorkeur aan de teamnaam
   waarvan de clubnaam overeenkomt met p.club. */
function deriveElftalFromReport(p){
  if(!p) return '';
  const re = /O\.?\s*(\d{1,2})\s*-\s*(\d+)/i;
  const teams = [
    p.wedstrijd?.thuis || '',
    p.wedstrijd?.uit || ''
  ].filter(Boolean);
  const club = (p.club || '').toLowerCase().trim();
  // Voorkeur: team waar clubnaam in voorkomt
  if(club){
    for(const t of teams){
      if(t.toLowerCase().includes(club)){
        const m = t.match(re);
        if(m) return `O.${m[1]}-${m[2]}`;
      }
    }
  }
  // Fallback: eerste team met O.X-Y
  for(const t of teams){
    const m = t.match(re);
    if(m) return `O.${m[1]}-${m[2]}`;
  }
  return '';
}
function exportJSON(){
  const data = {
    exported: new Date().toISOString(),
    scout: currentUser?.email || 'Marcel Steeman',
    players: loadPlayers(),
    analyses: loadAnalyses()
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scouting_export_${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export gedownload');
}

/* =============== PDF EXPORT (per speler) =============== */
function slugify(s){
  return (s||'rapport').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'rapport';
}

const BRAND_SHIELD_SVG = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pdfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff2a3a"/>
      <stop offset="100%" stop-color="#8a0410"/>
    </linearGradient>
  </defs>
  <path d="M40 4 L70 14 L70 44 Q70 64 40 76 Q10 64 10 44 L10 14 Z"
        fill="url(#pdfGrad)" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
  <text x="40" y="51" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="26" font-weight="900" fill="white" letter-spacing="-1.5">SH</text>
  <circle cx="40" cy="13" r="2.8" fill="#f5c518"/>
</svg>`;

const WATERMARK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>
  <path d='M40 4 L70 14 L70 44 Q70 64 40 76 Q10 64 10 44 L10 14 Z'
        fill='none' stroke='%23999999' stroke-width='1.2' stroke-linejoin='round'/>
  <text x='40' y='50' text-anchor='middle' font-family='Arial,sans-serif'
        font-size='22' font-weight='900' fill='%23999999' letter-spacing='-1'>SH</text>
  <circle cx='40' cy='13' r='2' fill='%23999999'/>
</svg>`;

function pdfCriteriaCard(name, val){
  const v = val || '—';
  const color = val ? `#${({A:'22c55e',B:'84cc16',C:'f59e0b',D:'ef4444'})[val]||'888'}` : '#3a4660';
  return `
    <div style="background:#1a2332;border:1px solid #232d40;border-left:3px solid ${color};border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;color:#e8edf5;margin-bottom:6px;font-weight:600;">${name}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:9px;color:#9aa8bd;text-transform:uppercase;letter-spacing:1px;">Huidig</span>
        <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;padding:0 7px;border-radius:4px;background:${color};color:#fff;font-weight:800;font-size:12px;">${v}</span>
      </div>
    </div>`;
}

function pdfGradeChip(val, outline){
  if(!val) return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#1d2533;color:#6b7689;font-weight:700;font-size:12px;border:1px solid #2f3b52;">—</span>`;
  const hex = ({A:'#22c55e',B:'#84cc16',C:'#f59e0b',D:'#ef4444'})[val] || '#888';
  if(outline){
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:transparent;border:2px solid ${hex};color:${hex};font-weight:800;font-size:12px;">${val}</span>`;
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${hex};color:#fff;font-weight:800;font-size:12px;">${val}</span>`;
}

function pdfGradeChipLg(val, outline){
  if(!val) return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:32px;padding:0 10px;border-radius:6px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-weight:800;font-size:18px;">—</span>`;
  const hex = ({A:'#22c55e',B:'#84cc16',C:'#f59e0b',D:'#ef4444'})[val] || '#888';
  if(outline){
    return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:32px;padding:0 10px;border-radius:6px;background:transparent;border:2px solid ${hex};color:${hex};font-weight:800;font-size:18px;">${val}</span>`;
  }
  return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:32px;padding:0 10px;border-radius:6px;background:${hex};color:#fff;font-weight:800;font-size:18px;">${val}</span>`;
}

async function generatePlayerPDF(p){
  // === ScoutingHub PDF v3 — dark website-stijl + pizza/donut/bars canvas ===
  const jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
  if(!jsPDFCtor){
    toast('PDF-bibliotheek niet geladen — vernieuw de pagina', true);
    return;
  }
  toast('PDF wordt gemaakt...');

  // ---------- OSM map snapshot ----------
  async function buildMapDataURL(lat, lon, zoom){
    return new Promise((resolve) => {
      try {
        const z = zoom || 14;
        const n = Math.pow(2, z);
        const xT = ((lon + 180) / 360) * n;
        const latRad = lat * Math.PI / 180;
        const yT = (1 - Math.log(Math.tan(latRad) + 1/Math.cos(latRad)) / Math.PI) / 2 * n;
        const COLS = 3, ROWS = 2;
        const TILE = 256;
        const baseX = Math.floor(xT) - 1;
        const baseY = Math.floor(yT);
        const pxX = (xT - baseX) * TILE;
        const pxY = (yT - baseY) * TILE;
        const W = COLS * TILE, H = ROWS * TILE;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0d1422'; ctx.fillRect(0, 0, W, H);
        const tiles = [];
        for(let r = 0; r < ROWS; r++){
          for(let c = 0; c < COLS; c++){
            tiles.push({ r, c, x: baseX + c, y: baseY + r });
          }
        }
        let loaded = 0, errored = 0;
        const tryFinish = () => {
          if(loaded + errored < tiles.length) return;
          const TARGET_W = 760, TARGET_H = 360;
          const sx = Math.max(0, Math.min(W - TARGET_W, pxX - TARGET_W/2));
          const sy = Math.max(0, Math.min(H - TARGET_H, pxY - TARGET_H/2));
          const out = document.createElement('canvas');
          out.width = TARGET_W; out.height = TARGET_H;
          const octx = out.getContext('2d');
          octx.drawImage(canvas, sx, sy, TARGET_W, TARGET_H, 0, 0, TARGET_W, TARGET_H);
          // Donker vignette zodat het in dark theme past
          const grad = octx.createRadialGradient(TARGET_W/2, TARGET_H/2, TARGET_H*0.25, TARGET_W/2, TARGET_H/2, TARGET_W*0.75);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(8,12,22,0.55)');
          octx.fillStyle = grad; octx.fillRect(0, 0, TARGET_W, TARGET_H);
          // Pin
          const pinX = pxX - sx, pinY = pxY - sy;
          const glow = octx.createRadialGradient(pinX, pinY-20, 0, pinX, pinY-20, 44);
          glow.addColorStop(0, 'rgba(227,6,19,0.65)');
          glow.addColorStop(1, 'rgba(227,6,19,0)');
          octx.fillStyle = glow;
          octx.beginPath(); octx.arc(pinX, pinY-20, 44, 0, Math.PI*2); octx.fill();
          octx.save();
          octx.translate(pinX, pinY);
          octx.shadowColor = 'rgba(0,0,0,0.55)';
          octx.shadowBlur = 10; octx.shadowOffsetY = 4;
          octx.fillStyle = '#e30613';
          octx.beginPath();
          octx.moveTo(0, 0);
          octx.bezierCurveTo(-24, -20, -24, -56, 0, -56);
          octx.bezierCurveTo(24, -56, 24, -20, 0, 0);
          octx.closePath(); octx.fill();
          octx.shadowColor = 'transparent';
          octx.fillStyle = 'rgba(255,255,255,0.22)';
          octx.beginPath(); octx.ellipse(-6, -42, 8, 12, 0, 0, Math.PI*2); octx.fill();
          octx.fillStyle = '#f5c518';
          octx.beginPath(); octx.arc(0, -37, 9, 0, Math.PI*2); octx.fill();
          octx.fillStyle = '#fff';
          octx.font = 'bold 11px Inter, Arial, sans-serif';
          octx.textAlign = 'center'; octx.textBaseline = 'middle';
          octx.fillText('SH', 0, -37);
          octx.restore();
          try { resolve(out.toDataURL('image/jpeg', 0.85)); }
          catch(e){ resolve(null); }
        };
        const TIMEOUT_MS = 6000;
        const timer = setTimeout(()=>{ errored = tiles.length - loaded; tryFinish(); }, TIMEOUT_MS);
        tiles.forEach(t => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, t.c * TILE, t.r * TILE, TILE, TILE);
            loaded++;
            if(loaded + errored === tiles.length){ clearTimeout(timer); tryFinish(); }
          };
          img.onerror = () => {
            errored++;
            if(loaded + errored === tiles.length){ clearTimeout(timer); tryFinish(); }
          };
          img.src = `https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`;
        });
      } catch(err){ resolve(null); }
    });
  }

  // ---------- Pizza chart (segmented radar) ----------
  function buildPizzaDataURL(p){
    const W = 720, H = 720;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d111c'; ctx.fillRect(0, 0, W, H);
    const cx = W/2, cy = H/2 - 8, Rmax = 260;
    const b = p.beoordelingen || {};
    const PALETTE = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899'];
    const CRIT = [
      ['Techniek','techniek_huidig'],
      ['Inzicht','inzicht_huidig'],
      ['GRIT','grit_huidig'],
      ['Explosief','explosiviteit_huidig'],
      ['Sprinten','sprinten_huidig'],
      ['Duelleren','duelleren_huidig'],
      ['Wendbaarh.','wendbaarheid_huidig'],
    ];
    const N = CRIT.length;
    const slice = (2*Math.PI) / N;
    const gv = (g) => ({A:4,B:3,C:2,D:1}[(g||'').toUpperCase()] || 0);
    // Background rings
    for(let lvl = 1; lvl <= 4; lvl++){
      const r = Rmax * (lvl / 4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.strokeStyle = lvl === 4 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
      ctx.lineWidth = lvl === 4 ? 1.6 : 1;
      ctx.stroke();
    }
    // Slices
    for(let i = 0; i < N; i++){
      const a0 = -Math.PI/2 + i*slice + 0.015;
      const a1 = -Math.PI/2 + (i+1)*slice - 0.015;
      let g = b[CRIT[i][1]];
      if(!g && CRIT[i][1] === 'grit_huidig') g = b.drit_huidig;
      const v = gv(g);
      const r = v ? Rmax * (v/4) : 0;
      const col = PALETTE[i % PALETTE.length];
      if(r > 0){
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a1);
        ctx.closePath();
        ctx.fillStyle = col + 'cc'; // ~80% opacity
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, Rmax, a0, a1);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      }
    }
    // Grade-letter inside each slice
    for(let i = 0; i < N; i++){
      const a = -Math.PI/2 + i*slice + slice/2;
      let g = b[CRIT[i][1]];
      if(!g && CRIT[i][1] === 'grit_huidig') g = b.drit_huidig;
      const v = gv(g);
      if(v){
        const r = Rmax * (v/4);
        const gx = cx + Math.cos(a)*(r - 24);
        const gy = cy + Math.sin(a)*(r - 24);
        ctx.fillStyle = '#0b1220';
        ctx.font = 'bold 18px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((g||'').toUpperCase(), gx, gy);
      }
    }
    // Ring labels D/C/B/A
    ['D','C','B','A'].forEach((lbl, i) => {
      const r = Rmax * ((i+1)/4);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '12px Inter, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, cx + 6, cy - r);
    });
    // Outer labels
    for(let i = 0; i < N; i++){
      const a = -Math.PI/2 + i*slice + slice/2;
      const lx = cx + Math.cos(a)*(Rmax + 38);
      const ly = cy + Math.sin(a)*(Rmax + 38);
      ctx.fillStyle = 'rgba(232,237,245,0.95)';
      ctx.font = '600 16px Inter, Arial, sans-serif';
      ctx.textAlign = Math.abs(Math.cos(a)) < 0.2 ? 'center' : (Math.cos(a) > 0 ? 'left' : 'right');
      ctx.textBaseline = Math.abs(Math.sin(a)) < 0.2 ? 'middle' : (Math.sin(a) > 0 ? 'top' : 'bottom');
      ctx.fillText(CRIT[i][0], lx, ly);
    }
    try { return cv.toDataURL('image/png'); } catch(e){ return null; }
  }

  // ---------- Donut gauge (huidig + potentieel) ----------
  function buildGaugeDataURL(p){
    const W = 560, H = 560;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d111c'; ctx.fillRect(0, 0, W, H);
    const gv = (g) => ({A:4,B:3,C:2,D:1}[(g||'').toUpperCase()] || 0);
    const b = p.beoordelingen || {};
    const KEYS = ['techniek_huidig','inzicht_huidig','grit_huidig','explosiviteit_huidig','sprinten_huidig','duelleren_huidig','wendbaarheid_huidig'];
    let vals = KEYS.map(k => {
      let g = b[k]; if(!g && k === 'grit_huidig') g = b.drit_huidig;
      return gv(g);
    }).filter(v => v > 0);
    const hn = gv(p.huidig_niveau);
    if(hn){ vals.push(hn, hn); }
    const score = vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length) : 0;
    const grade = score >= 3.5 ? 'A' : score >= 2.5 ? 'B' : score >= 1.5 ? 'C' : score >= 0.5 ? 'D' : '-';
    const pct = Math.max(0, Math.min(1, score / 4));
    const potVal = gv(p.potentieel_niveau);
    const potPct = potVal ? potVal / 4 : 0;
    const cx = W/2, cy = H/2;
    const Rmain = 200;
    // BG ring
    ctx.beginPath();
    ctx.arc(cx, cy, Rmain, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 32;
    ctx.stroke();
    // Potentieel thin ring (offset slightly inward)
    if(potPct > 0){
      ctx.beginPath();
      ctx.arc(cx, cy, Rmain - 28, -Math.PI/2, -Math.PI/2 + Math.PI*2 * potPct);
      ctx.strokeStyle = 'rgba(245,197,24,0.85)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // Huidig (main red)
    if(pct > 0){
      ctx.beginPath();
      ctx.arc(cx, cy, Rmain, -Math.PI/2, -Math.PI/2 + Math.PI*2 * pct);
      ctx.strokeStyle = '#e30613';
      ctx.lineWidth = 32;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // Center grade
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 150px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(grade, cx, cy - 8);
    ctx.fillStyle = 'rgba(232,237,245,0.65)';
    ctx.font = '500 28px Inter, Arial, sans-serif';
    ctx.fillText(`${score ? score.toFixed(2) : '–'} / 4`, cx, cy + 92);
    try { return cv.toDataURL('image/png'); } catch(e){ return null; }
  }

  // ---------- Criterium-bars (horizontal) ----------
  function buildBarsDataURL(p){
    const W = 760, H = 480;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d111c'; ctx.fillRect(0, 0, W, H);
    const b = p.beoordelingen || {};
    const gv = (g) => ({A:4,B:3,C:2,D:1}[(g||'').toUpperCase()] || 0);
    const ROWS = [
      ['Techniek','techniek_huidig'],
      ['Inzicht','inzicht_huidig'],
      ['GRIT','grit_huidig'],
      ['Explosief','explosiviteit_huidig'],
      ['Sprinten','sprinten_huidig'],
      ['Duelleren','duelleren_huidig'],
      ['Wendbaarh.','wendbaarheid_huidig'],
    ];
    const PAD_L = 130, PAD_R = 80, PAD_T = 32, PAD_B = 24;
    const trackW = W - PAD_L - PAD_R;
    const rowGap = (H - PAD_T - PAD_B) / ROWS.length;
    ROWS.forEach(([lbl, key], i) => {
      let g = b[key]; if(!g && key === 'grit_huidig') g = b.drit_huidig;
      const v = gv(g);
      const cy = PAD_T + i*rowGap + rowGap/2;
      // Label
      ctx.fillStyle = 'rgba(232,237,245,0.85)';
      ctx.font = '600 18px Inter, Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(lbl, 16, cy);
      // Track
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      const trackY = cy - 8, trackH = 16;
      const radius = 8;
      ctx.moveTo(PAD_L + radius, trackY);
      ctx.lineTo(PAD_L + trackW - radius, trackY);
      ctx.quadraticCurveTo(PAD_L + trackW, trackY, PAD_L + trackW, trackY + radius);
      ctx.lineTo(PAD_L + trackW, trackY + trackH - radius);
      ctx.quadraticCurveTo(PAD_L + trackW, trackY + trackH, PAD_L + trackW - radius, trackY + trackH);
      ctx.lineTo(PAD_L + radius, trackY + trackH);
      ctx.quadraticCurveTo(PAD_L, trackY + trackH, PAD_L, trackY + trackH - radius);
      ctx.lineTo(PAD_L, trackY + radius);
      ctx.quadraticCurveTo(PAD_L, trackY, PAD_L + radius, trackY);
      ctx.closePath();
      ctx.fill();
      // Fill
      if(v > 0){
        const fillW = Math.max(20, trackW * (v/4));
        const grad = ctx.createLinearGradient(PAD_L, 0, PAD_L + fillW, 0);
        grad.addColorStop(0, '#ff4757');
        grad.addColorStop(1, '#e30613');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(PAD_L + radius, trackY);
        ctx.lineTo(PAD_L + fillW - radius, trackY);
        ctx.quadraticCurveTo(PAD_L + fillW, trackY, PAD_L + fillW, trackY + radius);
        ctx.lineTo(PAD_L + fillW, trackY + trackH - radius);
        ctx.quadraticCurveTo(PAD_L + fillW, trackY + trackH, PAD_L + fillW - radius, trackY + trackH);
        ctx.lineTo(PAD_L + radius, trackY + trackH);
        ctx.quadraticCurveTo(PAD_L, trackY + trackH, PAD_L, trackY + trackH - radius);
        ctx.lineTo(PAD_L, trackY + radius);
        ctx.quadraticCurveTo(PAD_L, trackY, PAD_L + radius, trackY);
        ctx.closePath();
        ctx.fill();
      }
      // Grade letter right
      ctx.fillStyle = v ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.font = 'bold 22px Inter, Arial, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v ? (g||'').toUpperCase() : '–', W - 24, cy);
    });
    try { return cv.toDataURL('image/png'); } catch(e){ return null; }
  }

  // ---------- Heater shield (matches login SVG exactly) ----------
  function buildShieldDataURL(size, watermark){
    const S = size;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');
    // Path: M80 8 L142 30 L142 78 C142 116 116 144 80 154 C44 144 18 116 18 78 L18 30 Z (in 160 viewBox)
    const k = S / 160;
    const shieldPath = () => {
      ctx.beginPath();
      ctx.moveTo(80*k, 8*k);
      ctx.lineTo(142*k, 30*k);
      ctx.lineTo(142*k, 78*k);
      ctx.bezierCurveTo(142*k, 116*k, 116*k, 144*k, 80*k, 154*k);
      ctx.bezierCurveTo(44*k, 144*k, 18*k, 116*k, 18*k, 78*k);
      ctx.lineTo(18*k, 30*k);
      ctx.closePath();
    };
    if(watermark){
      // Very subtle white outline on dark background — geen bruinige stempel meer
      shieldPath();
      ctx.fillStyle = 'rgba(255,255,255,0.020)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      try { return cv.toDataURL('image/png'); } catch(e){ return null; }
    }
    // Gradient body (matches SVG linearGradient #introShield)
    const grad = ctx.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#e30613');
    grad.addColorStop(0.55, '#ff5d6a');
    grad.addColorStop(1, '#f5c518');
    shieldPath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.4 * k;
    ctx.stroke();
    // Shine overlay (top half) — matches second path in SVG
    ctx.save();
    shieldPath();
    ctx.clip();
    const shine = ctx.createLinearGradient(0, 0, 0, S);
    shine.addColorStop(0, 'rgba(255,255,255,0.55)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.moveTo(80*k, 8*k);
    ctx.lineTo(142*k, 30*k);
    ctx.lineTo(142*k, 60*k);
    ctx.bezierCurveTo(120*k, 64*k, 100*k, 60*k, 80*k, 56*k);
    ctx.bezierCurveTo(60*k, 60*k, 40*k, 64*k, 18*k, 60*k);
    ctx.lineTo(18*k, 30*k);
    ctx.closePath();
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.restore();
    // Gold dot
    ctx.beginPath();
    ctx.arc(80*k, 22*k, 3.5*k, 0, Math.PI*2);
    ctx.fillStyle = '#f5c518';
    ctx.fill();
    // SH text
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${58*k}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SH', 80*k, 100*k);
    try { return cv.toDataURL('image/png'); } catch(e){ return null; }
  }

  // Pre-generate all images
  const shieldImg     = buildShieldDataURL(360, false);
  const shieldFooter  = buildShieldDataURL(120, false);
  const shieldWatermk = buildShieldDataURL(420, true);
  const pizzaImg      = buildPizzaDataURL(p);
  const gaugeImg      = buildGaugeDataURL(p);
  const barsImg       = buildBarsDataURL(p);

  const clubKey = (p.club || '').trim().toLowerCase();
  const clubInfo = (typeof CLUB_ADRESSEN !== 'undefined' && CLUB_ADRESSEN[clubKey]) ? CLUB_ADRESSEN[clubKey] : null;
  let mapData = null;
  if(clubInfo && clubInfo.lat && clubInfo.lon){
    mapData = await buildMapDataURL(clubInfo.lat, clubInfo.lon, 14);
  }

  const doc = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });

  // ====== Dark website-stijl palet ======
  const COL = {
    paper:    [11, 16, 28],     // dark navy bg
    paperAlt: [16, 22, 36],
    cardBg:   [22, 28, 44],
    cardBg2:  [28, 34, 52],
    deep:     [8, 12, 22],
    ink:      [240, 244, 250],  // wit-ish
    sub:      [180, 188, 202],
    muted:    [130, 138, 152],
    line:     [38, 46, 64],
    red:      [227, 6, 19],
    redSoft:  [255, 71, 87],
    redDeep:  [138, 4, 16],
    gold:     [245, 197, 24],
    goldDeep: [184, 134, 11],
    A: [34, 197, 94],
    B: [59, 130, 246],
    C: [245, 158, 11],
    D: [239, 68, 68]
  };
  const PAGE_W = 210, PAGE_H = 297;
  const MARGIN_L = 14, MARGIN_R = 14, MARGIN_T = 18, MARGIN_B = 20;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  let y = MARGIN_T;

  const setFill = (c) => doc.setFillColor(c[0], c[1], c[2]);
  const setStroke = (c) => doc.setDrawColor(c[0], c[1], c[2]);
  const setText = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const gradeColor = (g) => COL[g] || COL.muted;

  function newPageIfNeeded(needed){
    if(y + needed > PAGE_H - MARGIN_B){
      doc.addPage();
      drawPageBg();
      y = MARGIN_T;
    }
  }

  function drawPageBg(){
    setFill(COL.paper);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    // Subtiele warmere hoek rechtsboven (zoals website ambient)
    setFill([18, 22, 38]);
    doc.triangle(PAGE_W, 0, PAGE_W, 80, PAGE_W - 110, 0, 'F');
    setFill([22, 26, 44]);
    doc.triangle(PAGE_W, 0, PAGE_W, 36, PAGE_W - 58, 0, 'F');
    // Rode lijn links
    setFill(COL.red);
    doc.rect(0, 0, 3.4, PAGE_H, 'F');
    setFill(COL.gold);
    doc.rect(3.4, 0, 0.8, PAGE_H, 'F');
    // Watermerk shield (heel subtiel)
    if(shieldWatermk){
      try { doc.addImage(shieldWatermk, 'PNG', PAGE_W - 95, PAGE_H - 130, 80, 80, undefined, 'FAST'); } catch(e){}
    }
  }

  function sectionHeading(label){
    newPageIfNeeded(13);
    setFill(COL.red);
    doc.rect(MARGIN_L, y + 1, 2.4, 4.5, 'F');
    setFill(COL.gold);
    doc.rect(MARGIN_L + 2.4, y + 1, 0.8, 4.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(COL.red);
    doc.text(label.toUpperCase(), MARGIN_L + 6.5, y + 4.8);
    setStroke(COL.line); doc.setLineWidth(0.3);
    doc.line(MARGIN_L, y + 7.5, PAGE_W - MARGIN_R, y + 7.5);
    y += 11.5;
  }

  function gradePill(g, x, cy, w, h){
    if(!g){
      setFill([42, 50, 70]);
      doc.roundedRect(x, cy, w, h, 1.4, 1.4, 'F');
      setText(COL.muted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(h * 1.4);
      doc.text('-', x + w/2, cy + h*0.72, { align: 'center' });
      return;
    }
    setFill(gradeColor(g));
    doc.roundedRect(x, cy, w, h, 1.4, 1.4, 'F');
    setText([255,255,255]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(h * 1.7);
    doc.text(g, x + w/2, cy + h*0.72, { align: 'center' });
  }

  function wrapText(text, maxW, size, font){
    doc.setFont('helvetica', font || 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(text || '', maxW);
  }

  drawPageBg();

  // ===== HEADER =====
  const LOGO_MM = 18;
  if(shieldImg){
    try { doc.addImage(shieldImg, 'PNG', MARGIN_L, y, LOGO_MM, LOGO_MM, undefined, 'FAST'); } catch(e){}
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  setText(COL.ink);
  doc.text('ScoutingHub', MARGIN_L + 23, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  setText(COL.gold);
  doc.text('PROFESSIONAL YOUTH FOOTBALL SCOUTING', MARGIN_L + 23, y + 11.4);
  doc.setFontSize(7);
  setText(COL.muted);
  doc.text('Scouting & talentbeoordeling - vertrouwelijk rapport', MARGIN_L + 23, y + 14.8);

  const w = p.wedstrijd || {};
  const reportDate = w.datum || p.datum || todayISO();
  const badgeW = 50, badgeX = PAGE_W - MARGIN_R - badgeW;
  setFill(COL.cardBg);
  doc.roundedRect(badgeX, y, badgeW, 16, 2, 2, 'F');
  setFill(COL.gold);
  doc.rect(badgeX, y, badgeW, 1.2, 'F');
  setText(COL.gold);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.text('RAPPORTDATUM', badgeX + badgeW/2, y + 5.5, { align: 'center' });
  setText(COL.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(formatDate(reportDate), badgeX + badgeW/2, y + 11.8, { align: 'center' });

  y += 22;
  setFill(COL.red);
  doc.rect(MARGIN_L, y, CONTENT_W * 0.45, 1.3, 'F');
  setFill(COL.gold);
  doc.rect(MARGIN_L + CONTENT_W * 0.45, y, CONTENT_W * 0.22, 1.3, 'F');
  setFill([240, 200, 80]);
  doc.rect(MARGIN_L + CONTENT_W * 0.67, y, CONTENT_W * 0.10, 1.3, 'F');
  y += 8;

  // ===== NAAM + META =====
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  setText(COL.ink);
  doc.text(p.naam || '-', MARGIN_L, y + 7);
  y += 11;

  const metaParts = [
    positionLabel(p.positie),
    p.club || null,
    p.rugnummer ? `#${p.rugnummer}` : null,
    p.been || null,
    p.geboorte ? `geb. ${formatDate(p.geboorte)}` : null
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  setText(COL.sub);
  doc.text(metaParts.join('  -  '), MARGIN_L, y);
  y += 4;
  if(p.tweebenig){
    const tw = wrapText(p.tweebenig, CONTENT_W, 8.5, 'italic');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    setText(COL.muted);
    doc.text(tw, MARGIN_L, y + 3);
    y += tw.length * 3.6;
  }
  y += 6;

  // ===== OVERVIEW: gauge + KPI tiles (3-col layout zoals website) =====
  const ovH = 56;
  newPageIfNeeded(ovH + 4);
  // Linker tile: donut gauge
  const gaugeW = CONTENT_W * 0.38;
  setFill(COL.cardBg);
  doc.roundedRect(MARGIN_L, y, gaugeW, ovH, 2.4, 2.4, 'F');
  setFill(COL.red); doc.rect(MARGIN_L, y, gaugeW, 1.5, 'F');
  setText(COL.gold); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
  doc.text('OVERALL SCORE', MARGIN_L + 4, y + 6.5);
  if(gaugeImg){
    const gSz = Math.min(gaugeW - 8, ovH - 10);
    try { doc.addImage(gaugeImg, 'PNG', MARGIN_L + (gaugeW - gSz)/2, y + 8, gSz, gSz, undefined, 'FAST'); } catch(e){}
  }

  // Rechter kolom: huidig / potentieel / advies stacked
  const rightX = MARGIN_L + gaugeW + 4;
  const rightW = CONTENT_W - gaugeW - 4;
  const tileH = (ovH - 8) / 3;

  // Huidig
  setFill(COL.cardBg);
  doc.roundedRect(rightX, y, rightW, tileH, 2, 2, 'F');
  setFill(COL.red); doc.rect(rightX, y, 2, tileH, 'F');
  setText(COL.muted); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
  doc.text('HUIDIG NIVEAU', rightX + 6, y + 5.2);
  gradePill(p.huidig_niveau, rightX + rightW - 18, y + 3.5, 12, tileH - 7);
  setText(COL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(p.huidig_niveau ? gradeLabel(p.huidig_niveau) : 'Niet beoordeeld', rightX + 6, y + tileH - 4);

  // Potentieel
  const py2 = y + tileH + 4;
  setFill(COL.cardBg);
  doc.roundedRect(rightX, py2, rightW, tileH, 2, 2, 'F');
  setFill(COL.gold); doc.rect(rightX, py2, 2, tileH, 'F');
  setText(COL.muted); doc.setFontSize(6.8); doc.setFont('helvetica', 'normal');
  doc.text('POTENTIEEL', rightX + 6, py2 + 5.2);
  if(p.potentieel_niveau){
    const pc = gradeColor(p.potentieel_niveau);
    setStroke(pc); setFill(COL.cardBg);
    doc.setLineWidth(0.9);
    doc.roundedRect(rightX + rightW - 18, py2 + 3.5, 12, tileH - 7, 1.4, 1.4, 'FD');
    setText(pc); doc.setFont('helvetica', 'bold'); doc.setFontSize((tileH - 7)*1.7);
    doc.text(p.potentieel_niveau, rightX + rightW - 12, py2 + tileH - 6, { align: 'center' });
  } else {
    gradePill(null, rightX + rightW - 18, py2 + 3.5, 12, tileH - 7);
  }
  setText(COL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(p.potentieel_niveau ? gradeLabel(p.potentieel_niveau) : 'Niet beoordeeld', rightX + 6, py2 + tileH - 4);

  // Advies
  const py3 = py2 + tileH + 4;
  setFill(COL.deep);
  doc.roundedRect(rightX, py3, rightW, tileH, 2, 2, 'F');
  setFill(COL.gold); doc.rect(rightX, py3, rightW, 1.2, 'F');
  setText(COL.gold); doc.setFontSize(6.8); doc.setFont('helvetica', 'normal');
  doc.text('ADVIES', rightX + 6, py3 + 5.2);
  setText(COL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(adviesLabel(p.advies) || '-', rightX + 6, py3 + tileH - 4);

  y += ovH + 8;

  // ===== PIZZA CHART + BARS naast elkaar (zoals website) =====
  if(pizzaImg || barsImg){
    sectionHeading('Beoordeling per criterium');
    const chartH = 78;
    newPageIfNeeded(chartH + 4);
    const colW = (CONTENT_W - 4) / 2;
    // Pizza card
    setFill(COL.cardBg);
    doc.roundedRect(MARGIN_L, y, colW, chartH, 2.2, 2.2, 'F');
    setStroke(COL.line); doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN_L, y, colW, chartH, 2.2, 2.2, 'S');
    setText(COL.gold); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.text('PIZZA CHART - 7 CRITERIA', MARGIN_L + 4, y + 5.5);
    if(pizzaImg){
      const sz = Math.min(colW - 4, chartH - 9);
      try { doc.addImage(pizzaImg, 'PNG', MARGIN_L + (colW - sz)/2, y + 7, sz, sz, undefined, 'FAST'); } catch(e){}
    }
    // Bars card
    const bx = MARGIN_L + colW + 4;
    setFill(COL.cardBg);
    doc.roundedRect(bx, y, colW, chartH, 2.2, 2.2, 'F');
    setStroke(COL.line); doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, colW, chartH, 2.2, 2.2, 'S');
    setText(COL.gold); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.text('CRITERIUM-BALKEN', bx + 4, y + 5.5);
    if(barsImg){
      const barH = chartH - 10;
      try { doc.addImage(barsImg, 'PNG', bx + 2, y + 7, colW - 4, barH, undefined, 'FAST'); } catch(e){}
    }
    y += chartH + 6;
  }

  // ===== SUBSCORES ATLETISCH =====
  const b = p.beoordelingen || {};
  const atletischSubs = [
    ['Explosief', b.explosiviteit_huidig],
    ['Sprinten', b.sprinten_huidig],
    ['Duelleren', b.duelleren_huidig],
    ['Wendbaarheid', b.wendbaarheid_huidig]
  ].filter(([,v]) => v);
  if(atletischSubs.length){
    newPageIfNeeded(15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(COL.muted);
    doc.text('SUBSCORES ATLETISCH VERMOGEN', MARGIN_L, y + 3);
    y += 6;
    const subW = (CONTENT_W - 9) / 4;
    atletischSubs.forEach(([n, v], i) => {
      const sx = MARGIN_L + i * (subW + 3);
      setFill(COL.cardBg);
      doc.roundedRect(sx, y, subW, 10, 1.5, 1.5, 'F');
      setStroke(COL.line); doc.setLineWidth(0.25);
      doc.roundedRect(sx, y, subW, 10, 1.5, 1.5, 'S');
      setText(COL.sub); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      doc.text(n, sx + 3, y + 6);
      setFill(gradeColor(v));
      doc.roundedRect(sx + subW - 9, y + 2.5, 6, 5, 0.8, 0.8, 'F');
      setText([255,255,255]); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text(v, sx + subW - 6, y + 6, { align: 'center' });
    });
    y += 14;
  }

  // ===== TOELICHTINGEN =====
  const toelichtingen = [
    ['Techniek', b.techniek_tekst],
    ['Spelinzicht', b.inzicht_tekst],
    ['GRIT / Attitude', b.grit_tekst],
    ['Explosiviteit', b.explosiviteit_tekst],
    ['Sprinten', b.sprinten_tekst],
    ['Duelleren', b.duelleren_tekst],
    ['Wendbaarheid', b.wendbaarheid_tekst]
  ].filter(([,v]) => v && v.trim());

  if(toelichtingen.length){
    sectionHeading('Toelichtingen per categorie');
    toelichtingen.forEach(([n, t]) => {
      const lines = wrapText(t, CONTENT_W - 10, 9, 'normal');
      const blockH = 6 + lines.length * 4 + 4;
      newPageIfNeeded(blockH + 2);
      setFill(COL.cardBg);
      doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 1.6, 1.6, 'F');
      setFill(COL.red);
      doc.rect(MARGIN_L, y, 1.8, blockH, 'F');
      setStroke(COL.line); doc.setLineWidth(0.25);
      doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 1.6, 1.6, 'S');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(COL.red);
      doc.text(n.toUpperCase(), MARGIN_L + 5, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setText(COL.ink);
      doc.text(lines, MARGIN_L + 5, y + 9.5);
      y += blockH + 3;
    });
    y += 2;
  }

  function infoGrid(items){
    const colW = (CONTENT_W - 4) / 2;
    const rowH = 11;
    for(let i = 0; i < items.length; i++){
      const col = i % 2, row = Math.floor(i / 2);
      if(col === 0) newPageIfNeeded(rowH + 2);
      const cx = MARGIN_L + col * (colW + 4);
      const cy = y + row * (rowH + 2);
      const [n, v] = items[i];
      setFill(COL.cardBg);
      doc.roundedRect(cx, cy, colW, rowH, 1.4, 1.4, 'F');
      setStroke(COL.line); doc.setLineWidth(0.25);
      doc.roundedRect(cx, cy, colW, rowH, 1.4, 1.4, 'S');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setText(COL.muted);
      doc.text(n.toUpperCase(), cx + 3, cy + 3.8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); setText(COL.ink);
      const vLines = wrapText(v, colW - 6, 9.5, 'bold');
      doc.text(vLines[0] || '', cx + 3, cy + 8.5);
    }
    y += Math.ceil(items.length / 2) * (rowH + 2) + 2;
  }

  // ===== WEDSTRIJD =====
  const wedstrijdInfo = [
    w.datum ? ['Wedstrijddatum', formatDate(w.datum)] : null,
    w.thuis ? ['Thuis', w.thuis] : null,
    w.uit ? ['Uit', w.uit] : null,
    w.uitslag ? ['Uitslag', w.uitslag] : null,
    w.opstelling ? ['Opstelling', w.opstelling] : null
  ].filter(Boolean);

  if(wedstrijdInfo.length || w.context){
    sectionHeading('Wedstrijd');
    if(wedstrijdInfo.length) infoGrid(wedstrijdInfo);
    if(w.context){
      const lines = wrapText(w.context, CONTENT_W - 10, 9, 'normal');
      const blockH = 6 + lines.length * 4 + 4;
      newPageIfNeeded(blockH + 2);
      setFill([28, 28, 32]);
      doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 1.6, 1.6, 'F');
      setFill(COL.gold);
      doc.rect(MARGIN_L, y, 2, blockH, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setText(COL.gold);
      doc.text('CONTEXT', MARGIN_L + 6, y + 4.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setText(COL.ink);
      doc.text(lines, MARGIN_L + 6, y + 9.5);
      y += blockH + 4;
    }
  }

  // ===== FYSIEK =====
  const fysiekInfo = [
    p.bouw ? ['Lichaamsbouw', p.bouw] : null,
    p.lengte ? ['Lengte', p.lengte] : null,
    p.motoriek ? ['Motoriek', p.motoriek] : null,
    p.rijping ? ['Rijping', p.rijping] : null
  ].filter(Boolean);

  if(fysiekInfo.length){
    sectionHeading('Lichaamsbouw & motoriek');
    infoGrid(fysiekInfo);
  }

  // ===== WAPEN =====
  if(p.wapen){
    sectionHeading('Persoonlijk wapen');
    const lines = wrapText(p.wapen, CONTENT_W - 10, 10, 'normal');
    const blockH = 4 + lines.length * 4.4 + 4;
    newPageIfNeeded(blockH + 2);
    setFill([30, 30, 26]);
    doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 2, 2, 'F');
    setFill(COL.gold);
    doc.rect(MARGIN_L, y, 2.5, blockH, 'F');
    setStroke([60, 50, 16]); doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 2, 2, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); setText(COL.ink);
    doc.text(lines, MARGIN_L + 6, y + 7);
    y += blockH + 4;
  }

  // ===== NOTITIES =====
  if(p.notities){
    sectionHeading('Notities');
    const lines = wrapText(p.notities, CONTENT_W - 8, 9.5, 'normal');
    const blockH = 4 + lines.length * 4.2 + 4;
    newPageIfNeeded(blockH + 2);
    setFill(COL.cardBg);
    doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 1.6, 1.6, 'F');
    setStroke(COL.line); doc.setLineWidth(0.25);
    doc.roundedRect(MARGIN_L, y, CONTENT_W, blockH, 1.6, 1.6, 'S');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); setText(COL.ink);
    doc.text(lines, MARGIN_L + 5, y + 7);
    y += blockH + 4;
  }

  // ===== LOCATIE & SPORTPARK =====
  if(clubInfo){
    const mapBlockH = (mapData ? 100 : 18) + 30;
    newPageIfNeeded(mapBlockH);
    sectionHeading('Locatie & sportpark');

    if(mapData){
      const mapW = CONTENT_W;
      const mapH = mapW * (360 / 760);
      setFill(COL.cardBg);
      doc.roundedRect(MARGIN_L, y, mapW, mapH, 2, 2, 'F');
      setStroke(COL.line); doc.setLineWidth(0.35);
      doc.roundedRect(MARGIN_L, y, mapW, mapH, 2, 2, 'S');
      try {
        doc.addImage(mapData, 'JPEG', MARGIN_L + 0.6, y + 0.6, mapW - 1.2, mapH - 1.2, undefined, 'FAST');
      } catch(e){
        setText(COL.muted); doc.setFontSize(9);
        doc.text('(kaart kon niet geladen worden)', MARGIN_L + mapW/2, y + mapH/2, { align: 'center' });
      }
      setFill([15, 20, 32]);
      doc.roundedRect(MARGIN_L + mapW - 46, y + mapH - 5.8, 44, 4.4, 0.8, 0.8, 'F');
      setText(COL.muted); doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
      doc.text('(c) OpenStreetMap contributors', MARGIN_L + mapW - 3, y + mapH - 2.6, { align: 'right' });
      y += mapH + 4;
    } else {
      setFill(COL.cardBg);
      doc.roundedRect(MARGIN_L, y, CONTENT_W, 14, 1.6, 1.6, 'F');
      setFill(COL.gold); doc.rect(MARGIN_L, y, 2, 14, 'F');
      setText(COL.muted); doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
      doc.text('Kaartweergave niet beschikbaar (kaarttegels konden niet geladen worden).', MARGIN_L + 6, y + 9);
      y += 16;
    }

    const infoH = 26;
    newPageIfNeeded(infoH + 2);
    setFill(COL.deep);
    doc.roundedRect(MARGIN_L, y, CONTENT_W, infoH, 2, 2, 'F');
    setFill(COL.gold);
    doc.rect(MARGIN_L, y, CONTENT_W, 1.4, 'F');
    setText(COL.gold); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.text('SPORTPARK', MARGIN_L + 5, y + 6.5);
    setText(COL.ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(clubInfo.sportpark || clubInfo.naam || (p.club || '-'), MARGIN_L + 5, y + 12);
    setText(COL.sub); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(clubInfo.adres || '', MARGIN_L + 5, y + 18);
    if(clubInfo.naam && clubInfo.naam.toLowerCase() !== (p.club || '').toLowerCase()){
      doc.setFontSize(7.5); setText(COL.muted);
      doc.text(`Club: ${clubInfo.naam}`, MARGIN_L + 5, y + 23);
    }
    setText(COL.gold); doc.setFontSize(6.5);
    doc.text(`${clubInfo.lat.toFixed(4)} N  -  ${clubInfo.lon.toFixed(4)} E`, PAGE_W - MARGIN_R - 5, y + 23, { align: 'right' });
    y += infoH + 6;
  }

  // ===== CONTEXT =====
  sectionHeading('Context');
  infoGrid([
    ['Beoogde positie', positionLabel(p.beoogd) || '-'],
    ['Leeftijdsgroep', p.leeftijd || '-'],
    ['Scoutingmethode', p.methode || '-'],
    ['Rapportdatum', formatDate(p.datum) || '-']
  ]);

  // ===== FOOTER op elke pagina =====
  const totalPages = doc.internal.getNumberOfPages();
  for(let i = 1; i <= totalPages; i++){
    doc.setPage(i);
    setStroke(COL.line); doc.setLineWidth(0.3);
    doc.line(MARGIN_L, PAGE_H - 14, PAGE_W - MARGIN_R, PAGE_H - 14);
    if(shieldFooter){
      try { doc.addImage(shieldFooter, 'PNG', MARGIN_L, PAGE_H - 12, 9, 9, undefined, 'FAST'); } catch(e){}
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(COL.ink);
    doc.text('ScoutingHub', MARGIN_L + 12, PAGE_H - 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setText(COL.muted);
    doc.text('Opgesteld door Marcel Steeman', MARGIN_L + 12, PAGE_H - 4.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setText(COL.muted);
    doc.text(`${i} / ${totalPages}`, PAGE_W - MARGIN_R, PAGE_H - 6, { align: 'right' });
    doc.setFontSize(6.5);
    doc.text(`Gegenereerd ${formatDate(todayISO())}`, PAGE_W - MARGIN_R, PAGE_H - 2.5, { align: 'right' });
  }

  const filename = `rapport-${slugify(p.naam)}-${reportDate}.pdf`;
  try {
    doc.save(filename);
    toast('PDF gedownload');
  } catch(err){
    console.error('PDF error:', err);
    toast('PDF maken mislukt', true);
  }
}

function gradeLabel(g){
  return ({A:'A — uitstekend',B:'B — bovengemiddeld',C:'C — gemiddeld',D:'D — onder gemiddeld'})[(g||'').toUpperCase()] || '';
}


/* =============== PROGRAMMA — WEEK PLANNER =============== */
let progWeekOffset = 0; // 0 = huidige week
let progExpandedId = null; // welk programma-item is uitgeklapt
let ppFullDraft = null; // tijdens spelermodaal: concept volledig rapport

function genId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}
function pad2(n){ return String(n).padStart(2,'0'); }
function isoDateStr(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function parseIsoDate(s){ if(!s) return null; const [y,m,d]=s.split('-').map(Number); return new Date(y, m-1, d); }
/* s35bk-3: tolerant date parser — accepts ISO-string, Date, Firebase Timestamp, or millis */
function parseAnyDate(v){
  if(!v) return null;
  if(v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if(typeof v === 'number'){ const d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  if(typeof v === 'object'){
    if(typeof v.toDate === 'function'){ try { const d = v.toDate(); return isNaN(d.getTime()) ? null : d; } catch(_){ return null; } }
    if(typeof v.seconds === 'number'){ const d = new Date(v.seconds*1000); return isNaN(d.getTime()) ? null : d; }
  }
  if(typeof v === 'string'){
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
    const d = new Date(v); return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function datumToIsoStr(v){
  const d = parseAnyDate(v);
  if(!d) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

/* ISO 8601 week: maandag = dag 1 */
function getISOWeek(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return [d.getUTCFullYear(), week];
}
function getMondayOfWeek(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7; // zo=0 → 7
  if(day !== 1) d.setDate(d.getDate() - (day - 1));
  return d;
}
function shiftWeek(monday, weeks){
  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  d.setDate(d.getDate() + weeks*7);
  return d;
}
function getCurrentDisplayMonday(){
  return shiftWeek(getMondayOfWeek(new Date()), progWeekOffset);
}
function weekKey(jaar, weeknr){ return `${jaar}-W${pad2(weeknr)}`; }

const DAY_NAMES_NL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
const MONTH_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
function formatNlDate(d){ return `${d.getDate()} ${MONTH_NL[d.getMonth()]}`; }
function formatNlDateFull(d){ return `${d.getDate()} ${MONTH_NL[d.getMonth()]} ${d.getFullYear()}`; }

// s35bk-2: Agenda-view state + render
let agendaSpan = 1;      // 1 / 3 / 7 dagen
let agendaDayOffset = 0; // 0 = vandaag
function agendaLeeftijdClass(l){
  if(!l) return '';
  const m = String(l).match(/O\.?(\d+)/i);
  if(!m) return '';
  return 'O' + m[1];
}
function renderAgenda(){
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(start.getDate() + agendaDayOffset);
  const days = [];
  for(let i=0; i<agendaSpan; i++){
    const d = new Date(start); d.setDate(d.getDate()+i);
    days.push(d);
  }
  // s35cq: last-day-grens naar 23:59:59 zodat Firebase Timestamps met tijdcomponent
  //        op de laatste dag niet onder tafel vallen.
  const last = new Date(days[days.length-1]);
  const lastInclusive = new Date(last); lastInclusive.setHours(23,59,59,999);

  // Label
  const fmt = d => `${DAY_NAMES_NL[(d.getDay()+6)%7].slice(0,3)} ${d.getDate()} ${MONTH_NL[d.getMonth()].slice(0,3)}`;
  const lbl = agendaSpan === 1
    ? `${DAY_NAMES_NL[(start.getDay()+6)%7]} ${start.getDate()} ${MONTH_NL[start.getMonth()]} ${start.getFullYear()}`
    : `${fmt(start)} — ${fmt(last)} ${last.getFullYear()}`;
  const lblEl = $('#agenda-range-label'); if(lblEl) lblEl.textContent = lbl;

  // Items per dag — incl. toernooien
  const rangeItems = programmaCache.filter(p => {
    if(!p.datum) return false;
    const d = parseAnyDate(p.datum);
    if(!d) return false;
    return d >= start && d <= lastInclusive;
  });

  const grid = $('#agenda-grid');
  if(!grid) return;

  if(rangeItems.length === 0){
    grid.innerHTML = `<div class="agenda-empty">Geen wedstrijden in deze periode.<br><span style="font-size:11.5px;opacity:.7">Voeg toe via Programma.</span></div>`;
    return;
  }

  grid.innerHTML = days.map(d => {
    const dStr = isoDateStr(d);
    const isToday = d.getTime() === today.getTime();
    const dayItems = rangeItems
      .filter(p => datumToIsoStr(p.datum) === dStr)
      .sort((a,b) => (a.tijd||'99:99').localeCompare(b.tijd||'99:99'));

    // Heeft de dag events na 17:00? -> avond auto-uitklappen
    const hasEvening = dayItems.some(it => {
      const t = String(it.tijd||''); const h = parseInt(t.split(':')[0], 10);
      return !isNaN(h) && h >= 17;
    });

    // s35cq: uur-rijen 06-24, avond ingeklapt tenzij hasEvening
    const morningEnd = 17;
    const eveningStart = 17;
    const morningRows = [];
    for(let h=6; h<morningEnd; h++){
      const hourItems = dayItems.filter(it => parseInt((it.tijd||'').split(':')[0],10) === h);
      morningRows.push(renderAgendaHourRow(h, hourItems));
    }
    const eveningRows = [];
    for(let h=eveningStart; h<24; h++){
      const hourItems = dayItems.filter(it => parseInt((it.tijd||'').split(':')[0],10) === h);
      eveningRows.push(renderAgendaHourRow(h, hourItems));
    }
    const eveningId = `agenda-evening-${dStr}`;
    const eveningHtml = hasEvening
      ? eveningRows.join('')
      : `<button class="agenda-evening-toggle" data-agenda-evening="${eveningId}"><span><strong>Avond 17:00 — 24:00</strong> &middot; geen wedstrijden</span><span>uitklappen ▾</span></button><div id="${eveningId}" style="display:none">${eveningRows.join('')}</div>`;

    // s35cq: App-blokken — vroege ochtend 06-09 + avond t/m 24 erbij
    const blockDefs = [
      {label:'Vroege ochtend', range:'06-09', from:6,  to:9},
      {label:'Ochtend',        range:'09-11', from:9,  to:11},
      {label:'Middag',         range:'11-14', from:11, to:14},
      {label:'Vroeg-mid',      range:'14-17', from:14, to:17},
      {label:'Eind-mid',       range:'17-20', from:17, to:20},
      {label:'Avond',          range:'20-24', from:20, to:24}
    ];
    // s35cq: catch-all voor items zonder geldige tijd (NaN of buiten 06-23)
    const orphanItems = dayItems.filter(it => {
      const h = parseInt((it.tijd||'').split(':')[0], 10);
      return isNaN(h) || h < 6 || h >= 24;
    });
    const orphanHtml = orphanItems.length ? `
      <div class="agenda-mobile-block gap-block">
        <div class="agenda-mobile-block-time">⏱ Tijd nog onbekend</div>
        ${orphanItems.map(it => {
          const title = `${(it.thuis||'?')} — ${(it.uit||'?')}${it.leeftijd? ' ('+it.leeftijd+')':''}`;
          const progAttr = it.id ? ` data-agenda-progid="${it.id}"` : '';
          return `<div class="agenda-mobile-evt flagged"${progAttr}><span class="t notijd">—:—</span><span class="lbl">${escapeHtml(title)} <em style="color:var(--text-3);font-size:11px;">(tijd toevoegen)</em></span></div>`;
        }).join('')}
      </div>` : '';
    const mobileBlocks = blockDefs.map(b => {
      const items = dayItems.filter(it => {
        const h = parseInt((it.tijd||'').split(':')[0], 10);
        return !isNaN(h) && h >= b.from && h < b.to;
      });
      if(items.length === 0) return '';
      return `
        <div class="agenda-mobile-block">
          <div class="agenda-mobile-block-time">${b.label} &middot; ${b.range}</div>
          ${items.map(it => {
            const cls = agendaLeeftijdClass(it.leeftijd);
            const dur = getMatchDurationMin(it.leeftijd);
            const title = `${(it.thuis||'?')} — ${(it.uit||'?')}${it.leeftijd? ' ('+it.leeftijd+')':''}`;
            const progAttr = it.id ? ` data-agenda-progid="${it.id}"` : '';
            return `<div class="agenda-mobile-evt"${progAttr}><span class="t">${escapeHtml(it.tijd||'')}</span><span class="lbl">${escapeHtml(title)}</span></div>`;
          }).join('')}
        </div>`;
    }).join('');
    const mobileHtml = (orphanHtml + mobileBlocks) || `<div class="agenda-empty" style="padding:14px">Geen wedstrijden.</div>`;

    const trnBanners = '';

    return `
      <div class="agenda-day-col">
        <div class="agenda-day-head">
          <div class="agenda-day-name${isToday?' today':''}">${DAY_NAMES_NL[(d.getDay()+6)%7]} ${d.getDate()} ${MONTH_NL[d.getMonth()].slice(0,3)}${isToday?' &middot; vandaag':''}</div>
          <div class="agenda-day-count">${dayItems.length} wedstrijd${dayItems.length===1?'':'en'}</div>
        </div>
        ${morningRows.join('')}
        ${eveningHtml}
        ${mobileHtml}
      </div>`;
  }).join('');

  // Avond uitklap-handlers
  grid.querySelectorAll('[data-agenda-evening]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tgt = document.getElementById(btn.dataset.agendaEvening);
      if(tgt){ tgt.style.display = (tgt.style.display === 'none' ? '' : 'none'); btn.style.display='none'; }
    });
  });
  // Match-klik -> detail-modal (zelfde als programma)
  grid.querySelectorAll('[data-agenda-progid]').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.agendaProgid;
      if(pid && typeof openProgMatchDetailModal === 'function') openProgMatchDetailModal(pid);
    });
  });
}
// s35bu: returnt CSS-class voor match-status (komend / bezig / afgelopen)
function _shMatchStatusClass(prog){
  try {
    if(typeof getMatchWindow !== 'function') return '';
    const w = getMatchWindow(prog);
    if(!w) return '';
    const now = new Date();
    if(now > w.end)        return 'prog-status-afgelopen';
    if(now >= w.start)     return 'prog-status-bezig';
    return 'prog-status-komend';
  } catch(_){ return ''; }
}

function renderAgendaHourRow(hour, items){
  const hh = String(hour).padStart(2,'0') + ':00';
  if(items.length === 0){
    return `<div class="agenda-hour-row empty"><div class="agenda-hour-label">${hh}</div><div class="agenda-hour-cell"></div></div>`;
  }
  const evts = items.map(it => {
    const cls = agendaLeeftijdClass(it.leeftijd);
    const dur = getMatchDurationMin(it.leeftijd);
    const stCls = _shMatchStatusClass(it); // s35bu
    const title = `${(it.thuis||'?')} — ${(it.uit||'?')}${it.leeftijd? ' ('+it.leeftijd+')':''}`;
    const loc = it.locatie || it.adres || '';
    const meta = [loc].filter(Boolean).join(' &middot; ');
    return `<div class="agenda-evt ${cls} ${stCls}" data-agenda-progid="${it.id||''}">
      <div class="agenda-evt-title">${escapeHtml(it.tijd||'')} &middot; ${escapeHtml(title)}</div>
      ${meta? `<div class="agenda-evt-meta">${escapeHtml(meta)}</div>`:''}
    </div>`;
  }).join('');
  return `<div class="agenda-hour-row"><div class="agenda-hour-label">${hh}</div><div class="agenda-hour-cell">${evts}</div></div>`;
}

/* s35bk-3: span-toggle state for Programma (1/3/7 days) — s35bo: default 1-dag agenda */
let progSpan = 1;
let progDayOffset = 0; // 0 = today (used when progSpan !== 7)
/* s35cw: actieve dag in Week-view op mobile (0=Ma … 6=Zo). Default = vandaag als
   die in de zichtbare week valt, anders maandag (0). Wordt gezet bij render.   */
let progWeekActiveDay = 0;
/* s35db: actieve dag in 3-dagen view op mobile (0,1,2). Default 0 = eerste dag,
   maar als vandaag in window valt wordt die voorgeselecteerd in render.        */
let progUurActiveDay = 0;

function renderProgrammaUur(){
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(start.getDate() + progDayOffset);
  const days = [];
  for(let i=0; i<progSpan; i++){
    const d = new Date(start); d.setDate(d.getDate()+i);
    days.push(d);
  }
  const last = days[days.length-1];
  // s35cq: last-day-grens naar 23:59:59 zodat Firebase Timestamps met tijdcomponent
  //        op de laatste dag niet onder tafel vallen.
  const lastInclusive = new Date(last); lastInclusive.setHours(23,59,59,999);

  // Label in #prog-weeklabel
  const fmt = d => `${DAY_NAMES_NL[(d.getDay()+6)%7].slice(0,3)} ${d.getDate()} ${MONTH_NL[d.getMonth()].slice(0,3)}`;
  const lbl = progSpan === 1
    ? `${DAY_NAMES_NL[(start.getDay()+6)%7]} ${start.getDate()} ${MONTH_NL[start.getMonth()]} ${start.getFullYear()}`
    : `${fmt(start)} — ${fmt(last)} ${last.getFullYear()}`;
  const lblEl = $('#prog-weeklabel'); if(lblEl) lblEl.textContent = lbl;
  const subEl = $('#programma-sub');
  if(subEl) subEl.textContent = progSpan === 1 ? 'Eén dag — sideline overzicht' : 'Drie dagen — sideline overzicht';

  const rangeItems = programmaCache.filter(p => {
    if(!p.datum) return false;
    const d = parseAnyDate(p.datum);
    if(!d) return false;
    return d >= start && d <= lastInclusive;
  });

  const grid = $('#programma-grid');
  if(!grid) return;
  grid.classList.add('prog-grid-uur');
  // s35db: marker voor multi-day mode (3 dagen) zodat CSS niet-actieve dagen kan verbergen
  if(progSpan > 1){
    grid.classList.add('prog-uur-multi');
  } else {
    grid.classList.remove('prog-uur-multi');
  }

  $('#programma-empty').style.display = rangeItems.length === 0 ? 'block' : 'none';

  // s35db: bepaal actieve dag-index voor mobile pills in 3-dagen mode.
  //        Vandaag heeft prioriteit als die in window valt, anders behoud keuze.
  let activeUurIdx = (typeof progUurActiveDay === 'number') ? progUurActiveDay : 0;
  const todayIdxInRange = days.findIndex(d => d.getTime() === today.getTime());
  if(progDayOffset === 0 && todayIdxInRange >= 0){
    activeUurIdx = todayIdxInRange;
  }
  if(activeUurIdx < 0 || activeUurIdx >= days.length) activeUurIdx = 0;
  progUurActiveDay = activeUurIdx;

  // s35db: pills voor 3-dagen mode — zelfde markup-pattern als week-daytabs,
  //        zodat de bestaande CSS-styling (.prog-week-daytab) wordt hergebruikt.
  const uurTabsHtml = progSpan > 1
    ? `<div class="prog-week-daytabs prog-uur-daytabs">${days.map((d,i) => {
        const cnt = rangeItems.filter(p => datumToIsoStr(p.datum) === isoDateStr(d)).length;
        const isTd = d.getTime() === today.getTime();
        const isAct = i === activeUurIdx;
        const cls = ['prog-week-daytab', isTd?'today':'', isAct?'active':''].filter(Boolean).join(' ');
        return `<div class="${cls}" data-pu-tab="${i}"><span class="num">${d.getDate()}</span>${DAY_NAMES_NL[(d.getDay()+6)%7].slice(0,2)}${cnt>0?'<br><span class="dot"></span>':''}</div>`;
      }).join('')}</div>`
    : '';

  const dayColsHtml = days.map((d, idx) => {
    const dStr = isoDateStr(d);
    const isToday = d.getTime() === today.getTime();
    const isActive = idx === activeUurIdx;
    const dayItems = rangeItems
      .filter(p => datumToIsoStr(p.datum) === dStr)
      .sort((a,b) => (a.tijd||'99:99').localeCompare(b.tijd||'99:99'));

    const hasEvening = dayItems.some(it => {
      const t = String(it.tijd||''); const h = parseInt(t.split(':')[0], 10);
      return !isNaN(h) && h >= 17;
    });

    // s35cq: uur-rijen 06-24
    const morningRows = [];
    for(let h=6; h<17; h++){
      const hourItems = dayItems.filter(it => parseInt((it.tijd||'').split(':')[0],10) === h);
      morningRows.push(renderAgendaHourRow(h, hourItems));
    }
    const eveningRows = [];
    for(let h=17; h<24; h++){
      const hourItems = dayItems.filter(it => parseInt((it.tijd||'').split(':')[0],10) === h);
      eveningRows.push(renderAgendaHourRow(h, hourItems));
    }
    const eveningId = `prog-evening-${dStr}`;
    const eveningHtml = hasEvening
      ? eveningRows.join('')
      : `<button class="agenda-evening-toggle" data-agenda-evening="${eveningId}"><span><strong>Avond 17:00 — 24:00</strong> &middot; geen wedstrijden</span><span>uitklappen ▾</span></button><div id="${eveningId}" style="display:none">${eveningRows.join('')}</div>`;

    // s35cq: App-blokken — vroege ochtend 06-09 + avond t/m 24
    const blockDefs = [
      {label:'Vroege ochtend', range:'06-09', from:6,  to:9},
      {label:'Ochtend',        range:'09-11', from:9,  to:11},
      {label:'Middag',         range:'11-14', from:11, to:14},
      {label:'Vroeg-mid',      range:'14-17', from:14, to:17},
      {label:'Eind-mid',       range:'17-20', from:17, to:20},
      {label:'Avond',          range:'20-24', from:20, to:24}
    ];
    // s35cq: catch-all voor items zonder geldige tijd
    const orphanItems = dayItems.filter(it => {
      const h = parseInt((it.tijd||'').split(':')[0], 10);
      return isNaN(h) || h < 6 || h >= 24;
    });
    const orphanHtml = orphanItems.length ? `
      <div class="agenda-mobile-block gap-block">
        <div class="agenda-mobile-block-time">⏱ Tijd nog onbekend</div>
        ${orphanItems.map(it => {
          const stCls = _shMatchStatusClass(it);
          const title = `${(it.thuis||'?')} — ${(it.uit||'?')}${it.leeftijd? ' ('+it.leeftijd+')':''}`;
          const progAttr = it.id ? ` data-agenda-progid="${it.id}"` : '';
          return `<div class="agenda-mobile-evt flagged ${stCls}"${progAttr}><span class="t notijd">—:—</span><span class="lbl">${escapeHtml(title)} <em style="color:var(--text-3);font-size:11px;">(tijd toevoegen)</em></span></div>`;
        }).join('')}
      </div>` : '';
    const mobileBlocks = blockDefs.map(b => {
      const items = dayItems.filter(it => {
        const h = parseInt((it.tijd||'').split(':')[0], 10);
        return !isNaN(h) && h >= b.from && h < b.to;
      });
      if(items.length === 0) return '';
      return `
        <div class="agenda-mobile-block">
          <div class="agenda-mobile-block-time">${b.label} &middot; ${b.range}</div>
          ${items.map(it => {
            const dur = getMatchDurationMin(it.leeftijd);
            const stCls = _shMatchStatusClass(it); // s35bu
            const title = `${(it.thuis||'?')} — ${(it.uit||'?')}${it.leeftijd? ' ('+it.leeftijd+')':''}`;
            const progAttr = it.id ? ` data-agenda-progid="${it.id}"` : '';
            return `<div class="agenda-mobile-evt ${stCls}"${progAttr}><span class="t">${escapeHtml(it.tijd||'')}</span><span class="lbl">${escapeHtml(title)}</span></div>`;
          }).join('')}
        </div>`;
    }).join('');
    const mobileHtml = (orphanHtml + mobileBlocks) || `<div class="agenda-empty" style="padding:14px">Geen wedstrijden.</div>`;

    return `
      <div class="agenda-day-col${isActive?' active':''}" data-pu-day-idx="${idx}">
        <div class="agenda-day-head">
          <div class="agenda-day-name${isToday?' today':''}">${DAY_NAMES_NL[(d.getDay()+6)%7]} ${d.getDate()} ${MONTH_NL[d.getMonth()].slice(0,3)}${isToday?' &middot; vandaag':''}</div>
          <div class="agenda-day-count">${dayItems.length} wedstrijd${dayItems.length===1?'':'en'}</div>
        </div>
        ${morningRows.join('')}
        ${eveningHtml}
        ${mobileHtml}
        <button class="prog-add-btn" data-prog-add-day="${dStr}" style="margin-top:10px">+ Wedstrijd</button>
      </div>`;
  }).join('');

  // s35db: combineer pills (alleen in 3-dagen mode) + day-cols
  grid.innerHTML = uurTabsHtml + dayColsHtml;

  // s35db: pill-click → wissel actieve dag in 3-dagen mode
  grid.querySelectorAll('[data-pu-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = parseInt(tab.dataset.puTab, 10);
      if(isNaN(idx)) return;
      progUurActiveDay = idx;
      renderProgramma();
    });
  });

  grid.querySelectorAll('[data-agenda-evening]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tgt = document.getElementById(btn.dataset.agendaEvening);
      if(tgt){ tgt.style.display = (tgt.style.display === 'none' ? '' : 'none'); btn.style.display='none'; }
    });
  });
  grid.querySelectorAll('[data-agenda-progid]').forEach(el => {
    el.addEventListener('click', () => {
      const pid = el.dataset.agendaProgid;
      if(pid && typeof openProgMatchDetailModal === 'function') openProgMatchDetailModal(pid);
    });
  });
  grid.querySelectorAll('[data-prog-add-day]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openProgMatchModal(null, btn.dataset.progAddDay);
    });
  });
}

function renderProgramma(){
  const monday  = getCurrentDisplayMonday();
  const sunday  = new Date(monday); sunday.setDate(sunday.getDate()+6);
  const [jaar, weeknr] = getISOWeek(monday);
  const today   = new Date(); today.setHours(0,0,0,0);

  // Nav label
  const fromStr = `${monday.getDate()} ${MONTH_NL[monday.getMonth()].slice(0,3)}`;
  const toStr   = `${sunday.getDate()} ${MONTH_NL[sunday.getMonth()].slice(0,3)}`;
  const navLabel = $('#prog-nav-label');
  if(navLabel) navLabel.innerHTML =
    `<span class="pnl-wk">Wk ${weeknr}</span><span class="pnl-range">${fromStr}–${toStr}</span>`;
  const subEl = $('#programma-sub');
  if(subEl) subEl.textContent =
    progWeekOffset === 0 ? 'Huidige week'
    : progWeekOffset < 0 ? `${Math.abs(progWeekOffset)} week${Math.abs(progWeekOffset)===1?'':'en'} terug`
    : `${progWeekOffset} week${progWeekOffset===1?'':'en'} vooruit`;

  // Verberg de oude week-strip — niet meer nodig in agenda-view
  const strip = $('#prog-week-strip');
  if(strip) strip.style.display = 'none';

  const days = [];
  for(let i=0;i<7;i++){ const d=new Date(monday); d.setDate(d.getDate()+i); days.push(d); }

  const weekItems = programmaCache.filter(p => {
    if(!p.datum) return false;
    const d = parseAnyDate(p.datum);
    return d && d >= monday && d <= sunday;
  });

  const TYPE_ICON  = { wedstrijd:'⚽', training:'🏃', vergadering:'💬' };

  // ── Event card builder ──
  const evCardHTML = (it, dStr) => {
    const type   = it.type || 'wedstrijd';
    const icon   = TYPE_ICON[type] || '📅';
    const stCls  = _shMatchStatusClass(it);
    const thuisLbl = [it.thuis, it.thuis_elftal].filter(Boolean).join(' ');
    const uitLbl   = [it.uit,   it.uit_elftal  ].filter(Boolean).join(' ');
    const titleLine = type==='wedstrijd'
      ? `${escapeHtml(thuisLbl||'?')} – ${escapeHtml(uitLbl||'?')}`
      : escapeHtml(it.naam||(type.charAt(0).toUpperCase()+type.slice(1)));
    const spelersN = (it.spelers||[]).length;
    const clubInfo = (typeof CLUB_ADRESSEN!=='undefined'&&it.thuis) ? CLUB_ADRESSEN[(it.thuis||'').toLowerCase().trim()] : null;
    let mapsUrl='';
    if(clubInfo&&clubInfo.lat&&clubInfo.lon) mapsUrl=`https://www.google.com/maps/dir/?api=1&destination=${clubInfo.lat},${clubInfo.lon}`;
    else if(it.locatie) mapsUrl=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.locatie)}`;
    const locLabel = it.locatie||(clubInfo&&clubInfo.sportpark)||'';
    const isPast  = it.datum && it.datum < new Date().toISOString().slice(0,10);
    const canVerw = isPast && it.status!=='verwerkt' && spelersN>0;
    const canLive = type==='wedstrijd' && spelersN>0 &&
      (typeof isMatchInWindow === 'function'
        ? isMatchInWindow(it, new Date())
        : it.datum === new Date().toISOString().slice(0,10));
    return `<div class="pag-card ${stCls}" data-prog-id="${escapeHtml(it.id)}">
      <div class="pag-card-top">
        <span class="pag-icon">${icon}</span>
        ${it.tijd?`<span class="pag-time">${escapeHtml(it.tijd)}</span>`:''}
        <span class="pag-title">${titleLine}</span>
        <button class="pag-edit" data-pec-edit="${escapeHtml(it.id)}" aria-label="Bewerken">✏</button>
      </div>
      <div class="pag-chips">
        ${it.leeftijd?`<span class="pag-chip age">${escapeHtml(it.leeftijd)}</span>`:''}
        ${spelersN?`<span class="pag-chip">${spelersN}sp</span>`:''}
        ${locLabel?`<span class="pag-chip loc">${mapsUrl?`<a class="pag-loc-link" href="${mapsUrl}" target="_blank" rel="noopener">📍${escapeHtml(locLabel)}</a>`:`📍${escapeHtml(locLabel)}`}</span>`:''}
        ${it.status==='verwerkt'?`<span class="pag-chip ok">✓</span>`:''}
      </div>
      ${canLive||canVerw?`<div class="pag-actions">
        ${canLive?`<button class="pec-live-btn" data-pec-live="${it.id}">● Live</button>`:''}
        ${canVerw?`<button class="pec-verwerk-btn" data-pec-verwerk="${it.id}">✓ Verwerk</button>`:''}
      </div>`:''}
    </div>`;
  };


  // ── Bouw alle dagkolommen ──
  const grid = $('#programma-grid');
  if(!grid) return;

  const hasAnything = weekItems.length>0;
  grid.innerHTML = days.map((d,i) => {
    const dStr     = isoDateStr(d);
    const isToday  = d.getTime()===today.getTime();
    const dayItems = weekItems
      .filter(p => datumToIsoStr(p.datum)===dStr)
      .sort((a,b) => (a.tijd||'99:99').localeCompare(b.tijd||'99:99'));
    const hasItems = dayItems.length>0;
    const abbr     = DAY_NAMES_NL[(d.getDay()+6)%7].slice(0,2).toUpperCase();
    const cardsHtml = dayItems.map(it=>evCardHTML(it,dStr)).join('');
    return `<div class="pag-day${isToday?' is-today':''}${!hasItems?' is-empty':''}" data-pag-day="${i}">
      <div class="pag-day-head">
        <span class="pag-abbr">${abbr}</span>
        <span class="pag-date-num${isToday?' today':''}">${d.getDate()}</span>
        <span class="pag-month">${MONTH_NL[d.getMonth()].slice(0,3)}</span>
        ${hasItems?`<span class="pag-day-cnt">${dayItems.length}</span>`:''}
      </div>
      <div class="pag-day-body">
        ${cardsHtml||'<div class="pag-vrij">—</div>'}
      </div>
      <button class="pag-add-day-btn" data-add-day="${dStr}" title="Toevoegen op ${abbr} ${d.getDate()}">+</button>
    </div>`;
  }).join('');

  // ── Event delegation — één keer, nooit dubbel ──
  const newGrid = grid.cloneNode(false);
  newGrid.innerHTML = grid.innerHTML;
  grid.parentNode.replaceChild(newGrid, grid);

  newGrid.addEventListener('click', e => {
    const card = e.target.closest('[data-prog-id]');
    const edit = e.target.closest('[data-pec-edit]');
    const live = e.target.closest('[data-pec-live]');
    const verw = e.target.closest('[data-pec-verwerk]');
    const add  = e.target.closest('[data-add-day]');
    const link = e.target.closest('.pag-loc-link');
    if(link) return; // laat link gewoon volgen
    if(add)  { e.stopPropagation(); openProgMatchModal(null, add.dataset.addDay); return; }
    if(edit) { e.stopPropagation(); openProgMatchModal(edit.dataset.pecEdit, null); return; }
    if(verw) { e.stopPropagation(); if(typeof verwerkProgrammaItem==='function') verwerkProgrammaItem(verw.dataset.pecVerwerk); return; }
    if(live) { e.stopPropagation(); if(typeof openLiveScoutModal==='function') openLiveScoutModal(live.dataset.pecLive); return; }
    if(card&&typeof openProgMatchDetailModal==='function') openProgMatchDetailModal(card.dataset.progId);
  });

  const emptyEl = $('#programma-empty');
  if(emptyEl) emptyEl.style.display = hasAnything ? 'none' : 'block';
  setTimeout(() => shStagger(newGrid, '.pag-card'), 0);
}

/* s21: Live scouten modal */
function openLiveScoutModal(progId){
  const it = (typeof programmaCache !== 'undefined') ? programmaCache.find(p => p && p.id === progId) : null;
  if(!it) return;
  const backdrop = document.getElementById('live-scout-backdrop');
  const body     = document.getElementById('live-scout-body');
  const sub      = document.getElementById('live-scout-sub');
  if(!backdrop || !body) return;

  // Header info
  const teams = it.thuis && it.uit
    ? `${it.thuis}${it.thuis_elftal?' '+it.thuis_elftal:''} — ${it.uit}${it.uit_elftal?' '+it.uit_elftal:''}`
    : (it.naam || 'Wedstrijd');
  if(sub) sub.textContent = [it.tijd, teams].filter(Boolean).join('  ·  ');

  // Load existing live notes from localStorage
  const _lsKey = `sh_live_scout_${progId}`;
  let savedNotes = {};
  try { savedNotes = JSON.parse(localStorage.getItem(_lsKey)||'{}'); } catch(_){}

  const spelers = it.spelers || [];
  if(spelers.length === 0){
    body.innerHTML = '<div class="lsm-empty">Geen spelers op dit programma-item.</div>';
  } else {
    body.innerHTML = spelers.map((sp, i) => {
      const pid  = sp.spelerId || sp.id || `sp_${i}`;
      const naam = sp.naam || '?';
      const note = savedNotes[pid] || '';
      return `
        <div class="lsm-player-row" data-lsm-pid="${escapeAttr(pid)}">
          <div class="lsm-player-name">
            ${sp.rugnummer ? `<span class="lsm-nr">#${escapeHtml(String(sp.rugnummer))}</span>` : ''}
            ${escapeHtml(naam)}
            ${sp.positie ? `<span class="lsm-pos">${escapeHtml(sp.positie)}</span>` : ''}
          </div>
          <textarea class="lsm-note" data-lsm-pid="${escapeAttr(pid)}" rows="2"
            placeholder="Snelle observatie...">${escapeHtml(note)}</textarea>
        </div>`;
    }).join('');
  }

  // Wedstrijdnotitie sectie
  const _lsWstrKey = `sh_live_wstr_${progId}`;
  let _savedWstr = '';
  try { _savedWstr = localStorage.getItem(_lsWstrKey) || it.notities || ''; } catch(_){}
  const _wstrDiv = document.createElement('div');
  _wstrDiv.className = 'lsm-wstr-section';
  _wstrDiv.innerHTML = `
    <div class="lsm-wstr-label">Wedstrijdnotitie</div>
    <textarea class="lsm-wstr-ta" rows="3" placeholder="Tactiek, score, sfeer, bijzonderheden...">${escapeHtml(_savedWstr)}</textarea>
  `;
  body.appendChild(_wstrDiv);
  const _wstrTA = _wstrDiv.querySelector('textarea');
  if(_wstrTA){
    _wstrTA.addEventListener('input', () => {
      try { localStorage.setItem(_lsWstrKey, _wstrTA.value); } catch(_){}
    });
  }

  backdrop.style.display = 'flex';
  // Focus eerste textarea
  setTimeout(() => { const f = body.querySelector('textarea'); if(f) f.focus(); }, 80);

  // Auto-save bij typen
  body.querySelectorAll('textarea[data-lsm-pid]').forEach(ta => {
    ta.addEventListener('input', () => {
      try {
        let cur = {}; try { cur = JSON.parse(localStorage.getItem(_lsKey)||'{}'); } catch(_){}
        cur[ta.dataset.lsmPid] = ta.value;
        localStorage.setItem(_lsKey, JSON.stringify(cur));
      } catch(_){}
    });
  });

  // Sluit
  const _close = () => { backdrop.style.display = 'none'; };
  document.getElementById('live-scout-close').onclick  = _close;
  document.getElementById('live-scout-close2').onclick = _close;
  backdrop.addEventListener('click', e => { if(e.target === backdrop) _close(); }, { once: true });

  // Opslaan → persist notes terug naar programmaCache + save
  document.getElementById('live-scout-save').onclick = async () => {
    const notes = {};
    body.querySelectorAll('textarea[data-lsm-pid]').forEach(ta => { notes[ta.dataset.lsmPid] = ta.value.trim(); });
    // Sla op als snelnotities op het programma-item
    const existing = Array.isArray(it.snelnotities) ? [...it.snelnotities] : [];
    const stamp = new Date().toLocaleTimeString('nl-NL', {hour:'2-digit',minute:'2-digit'});
    Object.entries(notes).forEach(([pid, note]) => {
      if(!note) return;
      const sp = spelers.find(s => (s.spelerId||s.id) === pid);
      const label = sp ? sp.naam : pid;
      existing.push({ tekst: `[${stamp}] ${label}: ${note}`, aangemaakt: Date.now(), spelerId: pid });
    });
    const _wstrTekstSave = _wstrTA ? _wstrTA.value.trim() : '';
    const updated = { ...it, snelnotities: existing, notities: _wstrTekstSave || it.notities || '', modified: Date.now() };
    if(typeof saveProgrammaItem === 'function'){
      try { await saveProgrammaItem(updated); toast('Notities opgeslagen'); } catch(e){ toast('Opslaan mislukt', true); }
    }
    _close();
  };
}
window.openLiveScoutModal = openLiveScoutModal;

function progMatchCardHTML(it){
  const isV = it.status === 'verwerkt';
  const teams = `${it.thuis||'?'} — ${it.uit||'?'}`;
  const spelersN = (it.spelers||[]).length;
  return `
    <div class="prog-match-card${isV?' verwerkt':''}" data-prog-id="${it.id}">
      <div class="prog-match-time">${it.tijd || '—'}</div>
      <div class="prog-match-teams">${escapeHtml(teams)}</div>
      <div class="prog-match-meta">
        ${it.leeftijd ? `<span class="pill">${escapeHtml(it.leeftijd)}</span>` : ''}
        ${spelersN ? `<span class="pill">${spelersN} speler${spelersN===1?'':'s'}</span>` : ''}
      </div>
    </div>
  `;
}

function progDetailHTML(it){
  const isV = it.status === 'verwerkt';
  const spelers = it.spelers || [];
  const datum = it.datum ? formatNlDateFull(parseIsoDate(it.datum)) : '';
  // Route via Google Maps — kies beste destination
  const club = (typeof CLUB_ADRESSEN !== 'undefined' && it.thuis)
    ? CLUB_ADRESSEN[it.thuis.toLowerCase().trim()] : null;
  let mapsUrl = '';
  if(club && club.lat && club.lon){
    mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${club.lat},${club.lon}`;
  } else if(club && club.adres){
    mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(club.adres)}`;
  } else if(it.locatie){
    mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.locatie)}`;
  }
  const routeBtnHTML = mapsUrl
    ? `<a class="btn btn-route-prog" href="${mapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🗺️ Route</a>`
    : '';
  return `
    <div class="prog-detail-card${isV?' verwerkt':''}" data-prog-detail-id="${it.id}">
      <div class="prog-detail-head">
        <div>
          <div class="prog-detail-title">${escapeHtml(it.thuis||'?')}${it.thuis_elftal?' '+escapeHtml(it.thuis_elftal):''} — ${escapeHtml(it.uit||'?')}${it.uit_elftal?' '+escapeHtml(it.uit_elftal):''}</div>
          <div class="prog-detail-meta">
            ${datum ? `<span>${datum}</span>` : ''}
            ${it.tijd ? `<span>${it.tijd}</span>` : ''}
            ${it.leeftijd ? `<span>${escapeHtml(it.leeftijd)}</span>` : ''}
            ${it.methode ? `<span>${escapeHtml(it.methode)}</span>` : ''}
            ${it.locatie ? `<span>${escapeHtml(it.locatie)}${it.veld ? ' &middot; Veld '+escapeHtml(it.veld) : ''}</span>` : ''}
            ${isV ? `<span style="color:#22c55e; font-weight:700;">✓ Verwerkt</span>` : ''}
          </div>
        </div>
        <div class="prog-detail-actions">
          ${/* s35bj: Route + Verwerken weg uit programma-uitklap; Bewerken blijft */''}
          ${isV ? '' : `<button class="btn btn-secondary" data-prog-edit>Bewerken</button>`}
          <button class="btn" data-prog-collapse>Sluiten</button>
        </div>
      </div>
      ${it.notities ? `<div style="font-size:12.5px; color:var(--text-2); margin:6px 0 10px; padding:8px 10px; background:var(--bg-3); border-radius:8px;">${escapeHtml(it.notities)}</div>` : ''}
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
        <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-3);">Spelers om te bekijken</div>
        ${isV ? '' : `<button class="btn btn-secondary" data-prog-add-speler><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Speler</button>`}
      </div>
      <div class="prog-spelers">
        ${spelers.length === 0 ? `<div style="font-size:12px; color:var(--text-3); padding:14px; text-align:center; border:1px dashed var(--border); border-radius:10px;">Nog geen spelers gepland — klik op + Speler.</div>` : spelers.map(s => progSpelerRowHTML(s)).join('')}
      </div>
    </div>
  `;
}

function progSpelerRowHTML(s){
  const hasFull = !!s.volledig;
  // Zoek de bekende speler op voor rapport-teller
  let nRapporten = 0, isKnown = false;
  try {
    const vn = s.voornaam || (s.naam||'').split(' ')[0] || '';
    const an = s.achternaam || (s.naam||'').split(' ').slice(1).join(' ') || '';
    const match = (vn && an) ? findExistingPlayer(vn, an, s.geboorte||'') : null;
    if(match && match.player){
      nRapporten = (reportsForPlayer(match.player.id) || []).length;
      isKnown = true;
    }
  } catch(_){}
  const next = nRapporten + 1;
  const nth = next === 1 ? '1e' : next === 2 ? '2e' : next === 3 ? '3e' : `${next}e`;
  const koppelBadge = `<span class="prog-speler-koppel" title="${isKnown ? nRapporten+' eerdere rapporten' : 'Nieuw in het systeem'}">
    <span class="prog-koppel-dot"></span>${nth} rapport
  </span>`;
  return `
    <div class="prog-speler-row" data-prog-speler-id="${s.id}">
      <div class="prog-speler-main">
        <div class="prog-speler-naam">${escapeHtml(s.naam || '(onbenoemd)')}${s.rugnummer ? ` <span style="color:var(--text-3); font-weight:500;">#${escapeHtml(s.rugnummer)}</span>` : ''}
          ${koppelBadge}
        </div>
        <div class="prog-speler-sub">
          ${[s.club, s.positie].filter(Boolean).map(escapeHtml).join(' · ') || 'geen extra info'}
          ${s.voor_notities ? ` · <em style="color:var(--text-2);">${escapeHtml(s.voor_notities.slice(0,60))}${s.voor_notities.length>60?'…':''}</em>` : ''}
        </div>
      </div>
      <div class="prog-speler-actions">
        <span class="prog-speler-badge${hasFull?' full':''}">${hasFull ? 'voorrapport' : 'kort'}</span>
      </div>
    </div>
  `;
}

function wireProgDetail(card, it){
  card.querySelector('[data-prog-collapse]')?.addEventListener('click', () => {
    progExpandedId = null; renderProgramma();
  });
  card.querySelector('[data-prog-edit]')?.addEventListener('click', () => openProgMatchModal(it.id, null));
  card.querySelector('[data-prog-verwerk]')?.addEventListener('click', () => verwerkProgrammaItem(it.id));
  card.querySelector('[data-prog-add-speler]')?.addEventListener('click', () => openProgPlayerModal(it.id, null));
  card.querySelectorAll('[data-prog-speler-id]').forEach(row => {
    row.addEventListener('click', () => openProgPlayerModal(it.id, row.dataset.progSpelerId));
  });
}

function openProgDetail(id){
  progExpandedId = (progExpandedId === id ? null : id);
  renderProgramma();
  if(progExpandedId){
    setTimeout(() => {
      const el = document.querySelector('.prog-detail-card[data-prog-detail-id]');
      if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
    }, 80);
  }
}

/* ------------- s35r: read-only wedstrijd-detail modal ------------- */
function openProgMatchDetailModal(progId){
  const it = programmaCache.find(p => p.id === progId);
  if(!it){ toast('Wedstrijd niet gevonden', true); return; }

  function setVal(elId, val, fallback){
    const el = $('#'+elId);
    if(!el) return;
    const v = (val || '').toString().trim();
    if(v){ el.textContent = v; el.classList.remove('empty'); }
    else { el.textContent = fallback || '—'; el.classList.add('empty'); }
  }
  // Datum -> NL formaat (DD-MM-YYYY) als datum gevuld is
  let datumNL = '';
  if(it.datum){
    const parts = String(it.datum).split('-');
    if(parts.length === 3) datumNL = `${parts[2]}-${parts[1]}-${parts[0]}`;
    else datumNL = it.datum;
  }
  setVal('pmd-datum', datumNL);
  setVal('pmd-tijd', it.tijd);
  $('#pmd-teams').textContent = `${it.thuis || '?'} — ${it.uit || '?'}`;
  $('#pmd-teams').classList.remove('empty');
  setVal('pmd-leeftijd', it.leeftijd);
  setVal('pmd-info', it.info);
  setVal('pmd-methode', it.methode);
  setVal('pmd-plaats', it.plaats);
  setVal('pmd-locatie', it.locatie);
  const notWrap = $('#pmd-notities-wrap');
  if(it.notities && String(it.notities).trim()){
    notWrap.style.display = '';
    $('#pmd-notities').textContent = it.notities;
  } else {
    notWrap.style.display = 'none';
  }

  // Spelers-lijst
  const spelers = Array.isArray(it.spelers) ? it.spelers : [];
  $('#pmd-spelers-title').textContent = `Spelers (${spelers.length})`;
  const listEl = $('#pmd-spelers');
  if(spelers.length === 0){
    listEl.innerHTML = '<div class="pmd-empty">Nog geen spelers toegevoegd. Klik op "+ Speler toevoegen" om te beginnen.</div>';
  } else {
    listEl.innerHTML = spelers.map(sp => {
      const naam = sp.naam || [sp.voornaam, sp.achternaam].filter(Boolean).join(' ') || '(geen naam)';
      const metaParts = [];
      if(sp.rugnummer) metaParts.push('#' + sp.rugnummer);
      if(sp.positie) metaParts.push(sp.positie);
      if(sp.club) metaParts.push(sp.club);
      const meta = metaParts.join(' · ');
      return `<div class="pmd-player-row" data-spid="${escapeHtml(sp.id||'')}">
        <span class="pmd-player-name">${escapeHtml(naam)}</span>
        ${meta ? `<span class="pmd-player-meta">${escapeHtml(meta)}</span>` : ''}
      </div>`;
    }).join('');
  }

  // Route-knop alleen tonen als we maps-url kunnen bouwen
  const routeBtn = $('#pmd-route');
  let mapsUrl = '';
  if(typeof window.findClubInfo === 'function' && it.thuis){
    const ci = window.findClubInfo(it.thuis);
    if(ci && ci.lat && ci.lon) mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${ci.lat},${ci.lon}`;
    else if(ci && (ci.adres || ci.adresFull)) mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ci.adresFull || ci.adres)}`;
  }
  if(!mapsUrl && it.locatie) mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.locatie)}`;
  if(mapsUrl){
    routeBtn.style.display = '';
    routeBtn.dataset.url = mapsUrl;
  } else {
    routeBtn.style.display = 'none';
    routeBtn.dataset.url = '';
  }

  // Bewaar huidige id voor knop-handlers
  $('#prog-match-detail-modal').dataset.progId = progId;
  // s35bu: als wedstrijd afgelopen is -> bewerken via Programma blokkeren,
  //        CTA naar Wedstrijden-tab (zelfde regel als dashboard).
  try {
    const _w = (typeof getMatchWindow === 'function') ? getMatchWindow(it) : null;
    const _isAfgelopen = !!(_w && new Date() > _w.end);
    const _addBtn  = document.getElementById('pmd-add-player');
    const _editBtn = document.getElementById('pmd-edit');
    const _actions = document.querySelector('#prog-match-detail-modal .pmd-actions');
    // verwijder oude CTA als die nog stond
    const _oldCta = document.getElementById('pmd-goto-wedstrijden');
    if(_oldCta) _oldCta.remove();
    if(_isAfgelopen){
      if(_addBtn)  _addBtn.style.display  = 'none';
      if(_editBtn) _editBtn.style.display = 'none';
      if(_actions){
        const cta = document.createElement('button');
        cta.type = 'button';
        cta.id = 'pmd-goto-wedstrijden';
        cta.className = 'btn btn-primary';
        cta.innerHTML = '✓ Afgelopen — bewerken via Wedstrijden';
        cta.addEventListener('click', () => {
          try { closeProgMatchDetailModal(); } catch(_){}
          try {
            if(typeof currentTab !== 'undefined') currentTab = 'wedstrijden';
            if(typeof renderApp === 'function') renderApp();
            setTimeout(() => {
              try {
                const m = {
                  kind: 'aggregated',
                  datum: it.datum, thuis: it.thuis, uit: it.uit,
                  uitslag: it.uitslag || '', age: it.leeftijd || '',
                  opmerking: it.notities || '',
                  players: []
                };
                if(typeof _shOpenEditModal === 'function') _shOpenEditModal(m);
              } catch(_){}
            }, 220);
          } catch(_){}
        });
        _actions.appendChild(cta);
      }
    } else {
      if(_addBtn)  _addBtn.style.display  = '';
      if(_editBtn) _editBtn.style.display = '';
    }
  } catch(_){}
  showModal('prog-match-detail-backdrop');

  // Speler-rij klik -> open bestaande speler in prog-player-modal
  listEl.querySelectorAll('.pmd-player-row').forEach(row => {
    row.addEventListener('click', () => {
      const spid = row.dataset.spid;
      if(typeof openProgPlayerModal === 'function') openProgPlayerModal(progId, spid || null);
    });
  });
}
function closeProgMatchDetailModal(){ hideModal('prog-match-detail-backdrop'); }
window.openProgMatchDetailModal = openProgMatchDetailModal;

/* ------------- Plan match modal ------------- */
function _pmUpdateTypeUI(type){
  // s35dj: toon/verberg velden op basis van type
  const isW = !type || type === 'wedstrijd';
  const naamRow = $('#pm-naam-row');
  const wFields = $('#pm-wedstrijd-fields');
  if(naamRow) naamRow.style.display = isW ? 'none' : '';
  if(wFields) wFields.style.display = isW ? '' : 'none';
  document.querySelectorAll('.pm-type-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.pmType === (type||'wedstrijd'));
  });
  if($('#pm-type')) $('#pm-type').value = type || 'wedstrijd';
  // required-attrib op thuis/uit aanpassen
  const thuisEl = $('#pm-thuis'); const uitEl = $('#pm-uit');
  if(thuisEl) thuisEl.required = isW;
  if(uitEl)   uitEl.required   = isW;
}

function openProgMatchModal(progId, defaultDate){
  _shResetDirty('progMatch'); // s91: reset dirty-flag bij elke open
  const it = progId ? programmaCache.find(p => p.id === progId) : null;
  const type = it ? (it.type || 'wedstrijd') : 'wedstrijd';
  $('#prog-match-title').textContent = it ? 'Afspraak bewerken' : 'Afspraak inplannen';
  $('#pm-id').value = it ? it.id : '';
  $('#pm-datum').value = it ? (it.datum||'') : (defaultDate || isoDateStr(new Date()));
  $('#pm-tijd').value = it ? (it.tijd||'') : '';
  if($('#pm-naam')) $('#pm-naam').value = it ? (it.naam||'') : '';
  _pmUpdateTypeUI(type);
  // s35be: pm-leeftijd field weg — niet meer laden
  $('#pm-methode').value = it ? (it.methode || 'Live') : 'Live';
  // pm-info is nu een <select> — voeg legacy-waarden alsnog toe.
  (function(){
    const sel = $('#pm-info');
    const v = it ? (it.info||'') : '';
    if(v && !Array.from(sel.options).some(o => o.value === v)){
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      sel.appendChild(opt);
    }
    sel.value = v;
  })();
  $('#pm-thuis').value = it ? (it.thuis||'') : '';
  $('#pm-uit').value = it ? (it.uit||'') : '';
  // s35bd: elftal-per-club velden
  if($('#pm-thuis-elftal')) $('#pm-thuis-elftal').value = it ? (it.thuis_elftal||'') : '';
  if($('#pm-uit-elftal'))   $('#pm-uit-elftal').value   = it ? (it.uit_elftal||'')   : '';
  $('#pm-locatie').value = it ? (it.locatie||'') : '';
  if($('#pm-veld')) $('#pm-veld').value = it ? (it.veld||'') : '';
  $('#pm-notities').value = it ? (it.notities||'') : '';
  $('#pm-delete').style.display = it ? '' : 'none';
  /* s35cg: vul scout-dropdown als je coordinator/admin bent */
  try {
    if(typeof populateScoutDropdown === 'function'){
      populateScoutDropdown(it && it._targetScoutUid ? it._targetScoutUid : '');
    }
  } catch(_){}
  // s35dg Fase A: reset speler-koppel buffer + UI bij elke open
  try { if(typeof pmppResetUI === 'function') pmppResetUI(); } catch(_){}
  showModal('prog-match-backdrop');
  // Wire club/elftal AC bij elke open (dynamische modal)
  try {
    ['pm-thuis','pm-uit','f-club','f-w-thuis','f-w-uit','mr-thuis','mr-uit'].forEach(id => {
      const el = document.getElementById(id);
      if(el && !el._shClubACWired && typeof shWireClubAC === 'function'){
        shWireClubAC(el); el._shClubACWired = true;
      }
    });
    ['pm-thuis-elftal','pm-uit-elftal','f-elftal','mr-elftal'].forEach(id => {
      const el = document.getElementById(id);
      if(el && !el._shElftalACWired && typeof shWireLeeftijdAC === 'function'){
        shWireLeeftijdAC(el); el._shElftalACWired = true;
      }
    });
  } catch(_){}
  // v70h-s35a: auto-fill sportpark + plaats uit CLUB_ADRESSEN zodra thuisclub gekozen wordt.
  (function(){
    const thuis = $('#pm-thuis');
    const loc = $('#pm-locatie');
    const plaats = $('#pm-plaats');
    if(!thuis || !loc) return;
    function tryFill(){
      if(typeof window.findClubInfo !== 'function') return;
      const ci = window.findClubInfo(thuis.value);
      if(!ci) return;
      const sp = ci.sportpark || '';
      const pl = ci.plaats || '';
      if(sp){
        const cur = loc.value.trim();
        if(!cur || loc.dataset.autofill === '1'){
          loc.value = sp;
          loc.dataset.autofill = '1';
        }
      }
      if(plaats && pl){
        const curP = plaats.value.trim();
        if(!curP || plaats.dataset.autofill === '1'){
          plaats.value = pl;
          plaats.dataset.autofill = '1';
        }
      }
    }
    loc.addEventListener('input', () => { loc.dataset.autofill = '0'; });
    if(plaats) plaats.addEventListener('input', () => { plaats.dataset.autofill = '0'; });
    thuis.addEventListener('change', tryFill);
    thuis.addEventListener('blur', tryFill);
    thuis.addEventListener('input', tryFill);
    tryFill();
  })();
  setTimeout(()=> $('#pm-datum').focus(), 80);
}
function closeProgMatchModal(){ _shResetDirty('progMatch'); hideModal('prog-match-backdrop'); }

let __savingProgMatch = false;
async function saveProgMatchFromForm(e){
  e.preventDefault();
  // s35ah: dubbele-klik-guard -> 1x klikken = 1 wedstrijd.
  if(__savingProgMatch) return;
  __savingProgMatch = true;
  const _submitBtn = e.target && e.target.querySelector ? e.target.querySelector('button[type="submit"]') : null;
  if(_submitBtn){ _submitBtn.disabled = true; _submitBtn.dataset._origText = _submitBtn.textContent; _submitBtn.textContent = 'Opslaan...'; }
  // ID nu definitief vaststellen + meteen in #pm-id zetten zodat opnieuw
  // klikken bestaande record bewerkt i.p.v. nieuwe te maken.
  let _id = $('#pm-id').value;
  if(!_id){
    _id = genId('prog');
    $('#pm-id').value = _id;
  }
  const id = _id;
  const existing = programmaCache.find(p => p.id === id);
  const thuis = $('#pm-thuis').value.trim();
  const uit = $('#pm-uit').value.trim();
  const datum = $('#pm-datum').value;
  let locatie = $('#pm-locatie').value.trim();

  // v70h: Auto-vul locatie via robuuste findClubInfo (slug + naam + fuzzy)
  if(!locatie && thuis && typeof window.findClubInfo === 'function'){
    const ci = window.findClubInfo(thuis);
    if(ci) locatie = ci.sportpark || ci.naam || '';
  }

  // s35bd: elftal-per-club
  const thuis_elftal = ($('#pm-thuis-elftal')?.value || '').trim();
  const uit_elftal   = ($('#pm-uit-elftal')?.value   || '').trim();

  /* s35cg: scout-dropdown uitlezen (lege string = mijzelf) */
  const _scoutSel = $('#pm-scout');
  const _targetScoutUid = (_scoutSel && _scoutSel.value) ? _scoutSel.value : '';
  // s35dg Fase A: merge pending koppelingen uit het aanmaak-formulier.
  const existingSpelers = existing ? (existing.spelers || []) : [];
  const pendingSpelers = Array.isArray(__pmPendingPlayers) ? __pmPendingPlayers.slice() : [];
  // Filter dubbele namen (zelfde voornaam+achternaam+geboorte) tov bestaande lijst
  const seen = new Set(existingSpelers.map(s =>
    ((s.voornaam||'')+'|'+(s.achternaam||'')+'|'+(s.geboorte||'')).toLowerCase()
  ));
  const mergedPending = pendingSpelers.filter(s => {
    const k = ((s.voornaam||'')+'|'+(s.achternaam||'')+'|'+(s.geboorte||'')).toLowerCase();
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const _pmType = ($('#pm-type')?.value || 'wedstrijd');
  const _pmNaam = ($('#pm-naam')?.value || '').trim();
  const item = {
    id,
    datum,
    type: _pmType,
    naam: _pmNaam,
    tijd: $('#pm-tijd').value,
    // s35be: leeftijd-veld weg (elftal nu per-club)
    methode: $('#pm-methode').value,
    info: $('#pm-info').value.trim(),
    thuis, uit, locatie,
    thuis_elftal, uit_elftal,
    veld: ($('#pm-veld')?.value || '').trim(),
    notities: $('#pm-notities').value.trim(),
    spelers: existingSpelers.concat(mergedPending),
    status: existing ? (existing.status || 'gepland') : 'gepland',
    verwerkt_op: existing ? (existing.verwerkt_op || null) : null,
    verwerkt_player_ids: existing ? (existing.verwerkt_player_ids || []) : [],
    created: existing ? existing.created : Date.now(),
    modified: Date.now(),
    /* s35cg: doorgegeven aan saveProgrammaItem voor cross-scout write */
    _targetScoutUid
  };
  try {
    await saveProgrammaItem(item);
    // s35dg Fase A: buffer leeg na succesvolle save
    __pmPendingPlayers = [];
    closeProgMatchModal();
    progExpandedId = id;
    const nAdded = mergedPending.length;
    toast(nAdded ? `Afspraak ingepland + ${nAdded} speler${nAdded===1?'':'s'} gekoppeld` : 'Afspraak ingepland');
  } catch(e){ /* toast in saveProgrammaItem */ }
  finally {
    __savingProgMatch = false;
    if(_submitBtn){
      _submitBtn.disabled = false;
      if(_submitBtn.dataset._origText) _submitBtn.textContent = _submitBtn.dataset._origText;
      delete _submitBtn.dataset._origText;
    }
  }
}

async function deleteProgMatchFromForm(){
  const id = $('#pm-id').value;
  if(!id) return;
  if(!confirm('Geplande wedstrijd verwijderen? Eventuele spelers in dit plan gaan ook weg.')) return;
  try {
    await deleteProgrammaItem(id);
    closeProgMatchModal();
    if(progExpandedId === id) progExpandedId = null;
    toast('Verwijderd');
  } catch(e){}
}

/* ------------- Plan player modal ------------- */
/* ----- s35t: speler-autocomplete in programma-modal ----- */
let __ppSugTimer = null;
function schedulePpSuggestionRefresh(){
  if(__ppSugTimer) clearTimeout(__ppSugTimer);
  __ppSugTimer = setTimeout(() => {
    try { renderPpSuggestions(); } catch(_){}
    try { renderKnownPlayerBanner(); } catch(_){}
  }, 180);
}
// Zoek matchende spelers in playersCache met scoring.
// Retourneer top 5 (score >= 3).
function getPpSuggestions(){
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  if(!players.length) return [];
  const norm = s => String(s||'').trim().toLowerCase();
  const vn = norm($('#pp-voornaam')?.value);
  const an = norm($('#pp-achternaam')?.value);
  const gb = norm($('#pp-geboorte')?.value);
  const cl = norm($('#pp-club')?.value);
  // Minimaal 2 chars in voornaam OF achternaam, anders geen suggesties
  if((vn.length < 2) && (an.length < 2)) return [];
  function namen(p){
    let pvn = norm(p.voornaam), pan = norm(p.achternaam);
    if((!pvn || !pan) && p.naam && typeof splitNaam === 'function'){
      const s = splitNaam(p.naam);
      if(!pvn) pvn = norm(s.voornaam);
      if(!pan) pan = norm(s.achternaam);
    }
    return { pvn, pan };
  }
  const scored = [];
  for(const p of players){
    const { pvn, pan } = namen(p);
    let score = 0;
    if(vn){
      if(pvn === vn) score += 3;
      else if(pvn.startsWith(vn)) score += 2;
      else continue; // voornaam moet matchen als ingevuld
    }
    if(an){
      if(pan === an) score += 3;
      else if(pan.startsWith(an)) score += 2;
      else continue; // achternaam moet matchen als ingevuld
    }
    if(gb && norm(p.geboorte) === gb) score += 3;
    const pcl = norm(p.club);
    if(cl){
      if(pcl === cl) score += 2;
      else if(pcl && pcl.includes(cl)) score += 1;
    }
    if(score >= 2) scored.push({ player: p, score }); // s35u: prefix-match op enkel voornaam ook tonen
  }
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, 5).map(x => x.player);
}

function renderPpSuggestions(){
  const wrap = document.getElementById('pp-suggestion-wrap');
  if(!wrap) return;
  // Niet tonen bij bewerken van bestaande speler
  const editing = !!($('#pp-spelerid')?.value);
  if(editing){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const suggestions = getPpSuggestions();
  if(!suggestions.length){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const rows = suggestions.map(p => {
    const naam = p.naam || [p.voornaam, p.achternaam].filter(Boolean).join(' ') || '(geen naam)';
    const metaParts = [];
    if(p.club) metaParts.push(p.club);
    if(p.geboorte){
      const parts = String(p.geboorte).split('-');
      metaParts.push(parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : p.geboorte);
    }
    if(p.positie) metaParts.push(p.positie);
    return `<div class="pp-sug-row" data-player-id="${escapeHtml(p.id)}">
      <div style="min-width:0; flex:1; display:flex; flex-direction:column; gap:2px;">
        <div class="pp-sug-name">${escapeHtml(naam)}</div>
        ${metaParts.length ? `<div class="pp-sug-meta">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
      </div>
      <span class="pp-sug-apply">VUL IN</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="pp-sug-title">Uit spelersdatabase (${suggestions.length})</div>${rows}`;
  wrap.style.display = '';
  wrap.querySelectorAll('.pp-sug-row').forEach(row => {
    row.addEventListener('click', () => applyPpSuggestion(row.dataset.playerId));
  });
}

function applyPpSuggestion(playerId){
  if(!playerId) return;
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const p = players.find(x => x.id === playerId);
  if(!p){ toast('Speler niet gevonden in database', true); return; }
  // Splits naam indien voornaam/achternaam ontbreken
  let vn = p.voornaam || '', an = p.achternaam || '';
  if((!vn || !an) && p.naam && typeof splitNaam === 'function'){
    const s = splitNaam(p.naam);
    if(!vn) vn = s.voornaam;
    if(!an) an = s.achternaam;
  }
  $('#pp-voornaam').value = vn;
  $('#pp-achternaam').value = an;
  if(p.geboorte) $('#pp-geboorte').value = p.geboorte;
  if(p.club) $('#pp-club').value = p.club;
  if(p.rugnummer !== undefined && p.rugnummer !== null) $('#pp-rugnummer').value = String(p.rugnummer);
  if(p.positie) $('#pp-positie').value = p.positie;
  if(typeof syncNaamHidden === 'function') syncNaamHidden('pp');
  // Verberg suggestie-strip na keuze
  const wrap = document.getElementById('pp-suggestion-wrap');
  if(wrap){ wrap.style.display = 'none'; wrap.innerHTML = ''; }
  // s35dg Fase B: refresh bekende-speler banner (toont nu zeker een match)
  try { renderKnownPlayerBanner(); } catch(_){}
  // s35v: laat zien wat er allemaal ingevuld is (incl. hidden fields)
  const naam = [vn, an].filter(Boolean).join(' ');
  const bits = [];
  if(p.geboorte){
    const parts = String(p.geboorte).split('-');
    bits.push('geb. ' + (parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : p.geboorte));
  }
  if(p.club) bits.push(p.club);
  if(p.rugnummer !== undefined && p.rugnummer !== null && String(p.rugnummer).trim() !== '') bits.push('#' + p.rugnummer);
  if(p.positie) bits.push(p.positie);
  const msg = 'Ingevuld: ' + naam + (bits.length ? ' · ' + bits.join(' · ') : '');
  if(typeof toast === 'function') toast(msg);
}
window.getPpSuggestions = getPpSuggestions;
window.renderPpSuggestions = renderPpSuggestions;
window.applyPpSuggestion = applyPpSuggestion;

/* s35dg Fase B: toon banner als de naam matcht met een bestaande speler in de database.
   Telt rapporten via reportsForPlayer() en toont "Dit wordt het Ne spelersrapport van [Naam]."
*/
function renderKnownPlayerBanner(){
  const el = document.getElementById('pp-known-banner');
  if(!el) return;
  // Niet tonen bij bewerken van bestaande speler-koppeling
  const editing = !!($('#pp-spelerid')?.value);
  if(editing){ el.style.display = 'none'; el.innerHTML = ''; return; }
  const vn = ($('#pp-voornaam')?.value || '').trim();
  const an = ($('#pp-achternaam')?.value || '').trim();
  const gb = ($('#pp-geboorte')?.value || '').trim();
  if(!vn || !an){ el.style.display = 'none'; el.innerHTML = ''; return; }
  let match = null;
  try { match = findExistingPlayer(vn, an, gb); } catch(_){}
  if(!match || !match.player){
    // Nieuwe speler: toon "1e rapport" zodra naam volledig is
    if(vn && an){
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px; line-height:1; flex-shrink:0;">🟢</span>
          <div>
            <div style="font-weight:700; color:#4ade80; font-size:13px;">Gekoppeld — 1e rapport</div>
            <div style="margin-top:2px; color:#bbf7d0;">${escapeHtml(vn)} ${escapeHtml(an)} · nieuw in het systeem</div>
          </div>
        </div>`;
      el.style.display = '';
    } else {
      el.style.display = 'none'; el.innerHTML = '';
    }
    return;
  }
  const p = match.player;
  let n = 0;
  try { n = (reportsForPlayer(p.id) || []).length; } catch(_){}
  const next = n + 1;
  const nth = next === 1 ? '1e' : next === 2 ? '2e' : next === 3 ? '3e' : `${next}e`;
  const naam = p.naam || [p.voornaam, p.achternaam].filter(Boolean).join(' ');
  el.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:18px; line-height:1; flex-shrink:0;">🟢</span>
      <div>
        <div style="font-weight:700; color:#4ade80; font-size:13px;">Gekoppeld — ${nth} rapport</div>
        <div style="margin-top:2px; color:#bbf7d0;">${escapeHtml(naam)}${n > 0 ? ` · ${n} eerdere rapport${n===1?'':'en'}` : ' · nieuw in het systeem'}</div>
      </div>
    </div>`;
  el.style.display = '';
}
window.renderKnownPlayerBanner = renderKnownPlayerBanner;

/* ============================================================
   s35dg Fase A — Spelers direct koppelen bij wedstrijd-aanmaak.
   Buffer-based: speler-records leven in __pmPendingPlayers tot
   het plan wordt opgeslagen; bij save worden ze in item.spelers
   gemerged. Hergebruikt de pp-* autocomplete-scoring.
   ============================================================ */
let __pmPendingPlayers = [];
let __pmppSugTimer = null;

function pmppResetPending(){ __pmPendingPlayers = []; }

function pmppGetSuggestions(){
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  if(!players.length) return [];
  const norm = s => String(s||'').trim().toLowerCase();
  const vn = norm($('#pmpp-voornaam')?.value);
  const an = norm($('#pmpp-achternaam')?.value);
  const gb = norm($('#pmpp-geboorte')?.value);
  const cl = norm($('#pmpp-club')?.value);
  if((vn.length < 2) && (an.length < 2)) return [];
  function namen(p){
    let pvn = norm(p.voornaam), pan = norm(p.achternaam);
    if((!pvn || !pan) && p.naam && typeof splitNaam === 'function'){
      const s = splitNaam(p.naam);
      if(!pvn) pvn = norm(s.voornaam);
      if(!pan) pan = norm(s.achternaam);
    }
    return { pvn, pan };
  }
  const scored = [];
  for(const p of players){
    if(p.concept) continue; // concepten niet voorstellen als bestaande speler
    const { pvn, pan } = namen(p);
    let score = 0;
    if(vn){
      if(pvn === vn) score += 3;
      else if(pvn.startsWith(vn)) score += 2;
      else continue;
    }
    if(an){
      if(pan === an) score += 3;
      else if(pan.startsWith(an)) score += 2;
      else continue;
    }
    if(gb && norm(p.geboorte) === gb) score += 3;
    const pcl = norm(p.club);
    if(cl){
      if(pcl === cl) score += 2;
      else if(pcl && pcl.includes(cl)) score += 1;
    }
    if(score >= 2) scored.push({ player: p, score });
  }
  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, 5).map(x => x.player);
}

function pmppRenderSuggestions(){
  const wrap = document.getElementById('pmpp-suggestion-wrap');
  if(!wrap) return;
  const suggestions = pmppGetSuggestions();
  if(!suggestions.length){ wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const rows = suggestions.map(p => {
    const naam = p.naam || [p.voornaam, p.achternaam].filter(Boolean).join(' ') || '(geen naam)';
    const metaParts = [];
    if(p.club) metaParts.push(p.club);
    if(p.geboorte){
      const parts = String(p.geboorte).split('-');
      metaParts.push(parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : p.geboorte);
    }
    if(p.positie) metaParts.push(p.positie);
    return `<div class="pp-sug-row" data-player-id="${escapeHtml(p.id)}">
      <div style="min-width:0; flex:1; display:flex; flex-direction:column; gap:2px;">
        <div class="pp-sug-name">${escapeHtml(naam)}</div>
        ${metaParts.length ? `<div class="pp-sug-meta">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
      </div>
      <span class="pp-sug-apply">VUL IN</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="pp-sug-title">Uit spelersdatabase (${suggestions.length})</div>${rows}`;
  wrap.style.display = '';
  wrap.querySelectorAll('.pp-sug-row').forEach(row => {
    row.addEventListener('click', () => pmppApplySuggestion(row.dataset.playerId));
  });
}

function pmppApplySuggestion(playerId){
  if(!playerId) return;
  const players = (typeof loadPlayers === 'function') ? loadPlayers() : [];
  const p = players.find(x => x.id === playerId);
  if(!p){ toast('Speler niet gevonden in database', true); return; }
  let vn = p.voornaam || '', an = p.achternaam || '';
  if((!vn || !an) && p.naam && typeof splitNaam === 'function'){
    const s = splitNaam(p.naam);
    if(!vn) vn = s.voornaam;
    if(!an) an = s.achternaam;
  }
  if($('#pmpp-voornaam')) $('#pmpp-voornaam').value = vn;
  if($('#pmpp-achternaam')) $('#pmpp-achternaam').value = an;
  if(p.geboorte && $('#pmpp-geboorte')) $('#pmpp-geboorte').value = p.geboorte;
  if(p.club && $('#pmpp-club')) $('#pmpp-club').value = p.club;
  const wrap = document.getElementById('pmpp-suggestion-wrap');
  if(wrap){ wrap.style.display = 'none'; wrap.innerHTML = ''; }
  try { pmppRenderKnownBanner(); } catch(_){}
}

function pmppRenderKnownBanner(){
  const el = document.getElementById('pmpp-known-banner');
  if(!el) return;
  const vn = ($('#pmpp-voornaam')?.value || '').trim();
  const an = ($('#pmpp-achternaam')?.value || '').trim();
  const gb = ($('#pmpp-geboorte')?.value || '').trim();
  if(!vn || !an){ el.style.display = 'none'; el.innerHTML = ''; return; }
  let match = null;
  try { match = findExistingPlayer(vn, an, gb); } catch(_){}
  if(!match || !match.player){
    // Nieuwe speler: toon "1e rapport" zodra naam volledig is
    if(vn && an){
      el.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px; line-height:1; flex-shrink:0;">🟢</span>
          <div>
            <div style="font-weight:700; color:#4ade80; font-size:13px;">Gekoppeld — 1e rapport</div>
            <div style="margin-top:2px; color:#bbf7d0;">${escapeHtml(vn)} ${escapeHtml(an)} · nieuw in het systeem</div>
          </div>
        </div>`;
      el.style.display = '';
    } else {
      el.style.display = 'none'; el.innerHTML = '';
    }
    return;
  }
  const p = match.player;
  let n = 0;
  try { n = (reportsForPlayer(p.id) || []).length; } catch(_){}
  const next = n + 1;
  const nth = (next === 1) ? '1e' : (next === 2) ? '2e' : (next === 3) ? '3e' : (next + 'e');
  const naam = p.naam || [p.voornaam, p.achternaam].filter(Boolean).join(' ');
  el.innerHTML = `<div style="display:flex; align-items:flex-start; gap:8px;">
    <span style="font-size:14px; line-height:1;">ℹ️</span>
    <div>
      <div style="font-weight:600; color:#bbf7d0;">Deze speler is al bekend</div>
      <div style="margin-top:2px;">Dit wordt het <strong>${nth} spelersrapport</strong> van ${escapeHtml(naam)}${n>0 ? ` (${n} eerder)` : ''}.</div>
    </div>
  </div>`;
  el.style.display = '';
}

function pmppSchedule(){
  if(__pmppSugTimer) clearTimeout(__pmppSugTimer);
  __pmppSugTimer = setTimeout(() => {
    try { pmppRenderSuggestions(); } catch(_){}
    try { pmppRenderKnownBanner(); } catch(_){}
  }, 180);
}

function pmppRenderList(){
  const list = document.getElementById('pmpp-list');
  if(!list) return;
  if(!__pmPendingPlayers.length){ list.innerHTML = ''; return; }
  const rows = __pmPendingPlayers.map(s => {
    const naam = s.naam || [s.voornaam, s.achternaam].filter(Boolean).join(' ') || '(geen naam)';
    const meta = [];
    if(s.club) meta.push(s.club);
    if(s.geboorte){
      const parts = String(s.geboorte).split('-');
      meta.push(parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : s.geboorte);
    }
    return `<div style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-1); margin-top:6px;">
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px;">${escapeHtml(naam)}</div>
        ${meta.length ? `<div style="font-size:11.5px; color:var(--text-3); margin-top:1px;">${escapeHtml(meta.join(' · '))}</div>` : ''}
      </div>
      <button type="button" class="btn" data-pmpp-remove="${escapeHtml(s.id)}" style="font-size:11.5px; padding:4px 8px; color:#ef4444;">Verwijderen</button>
    </div>`;
  }).join('');
  list.innerHTML = `<div style="font-size:11.5px; color:var(--text-3); margin-top:8px;">Toegevoegd aan plan (${__pmPendingPlayers.length}):</div>${rows}`;
  list.querySelectorAll('[data-pmpp-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pmpp-remove');
      __pmPendingPlayers = __pmPendingPlayers.filter(x => x.id !== id);
      pmppRenderList();
    });
  });
}

function pmppAdd(){
  const vn = ($('#pmpp-voornaam')?.value || '').trim();
  const an = ($('#pmpp-achternaam')?.value || '').trim();
  if(!vn || !an){ toast('Vul voornaam en achternaam in', true); return; }
  const gb = ($('#pmpp-geboorte')?.value || '').trim();
  const cl = ($('#pmpp-club')?.value || '').trim();
  // Voorkom dubbel-toevoegen (zelfde naam + geboorte) in dezelfde sessie
  const dup = __pmPendingPlayers.find(s =>
    (s.voornaam||'').toLowerCase() === vn.toLowerCase() &&
    (s.achternaam||'').toLowerCase() === an.toLowerCase() &&
    (s.geboorte||'') === gb
  );
  if(dup){ toast('Deze speler staat al in het plan', true); return; }
  const naam = [vn, an].filter(Boolean).join(' ');
  __pmPendingPlayers.push({
    id: genId('progsp'),
    naam, voornaam: vn, achternaam: an,
    geboorte: gb, club: cl,
    rugnummer: '', positie: '',
    voor_notities: '',
    volledig: null,
    modified: Date.now()
  });
  // Velden leegmaken voor volgende speler
  if($('#pmpp-voornaam')) $('#pmpp-voornaam').value = '';
  if($('#pmpp-achternaam')) $('#pmpp-achternaam').value = '';
  if($('#pmpp-geboorte')) $('#pmpp-geboorte').value = '';
  if($('#pmpp-club')) $('#pmpp-club').value = '';
  const wrap = document.getElementById('pmpp-suggestion-wrap');
  if(wrap){ wrap.style.display = 'none'; wrap.innerHTML = ''; }
  const banner = document.getElementById('pmpp-known-banner');
  if(banner){ banner.style.display = 'none'; banner.innerHTML = ''; }
  pmppRenderList();
  if($('#pmpp-voornaam')) $('#pmpp-voornaam').focus();
}

function pmppResetUI(){
  __pmPendingPlayers = [];
  ['#pmpp-voornaam','#pmpp-achternaam','#pmpp-geboorte','#pmpp-club'].forEach(sel => {
    const el = document.querySelector(sel);
    if(el) el.value = '';
  });
  const wrap = document.getElementById('pmpp-suggestion-wrap');
  if(wrap){ wrap.style.display = 'none'; wrap.innerHTML = ''; }
  const banner = document.getElementById('pmpp-known-banner');
  if(banner){ banner.style.display = 'none'; banner.innerHTML = ''; }
  const list = document.getElementById('pmpp-list');
  if(list) list.innerHTML = '';
  const det = document.getElementById('pm-pp-details');
  if(det) det.open = false;
}

// Wire-up: handlers + buttons (één keer, na DOM-load)
(function wirePmppHandlers(){
  function bind(){
    ['pmpp-voornaam','pmpp-achternaam','pmpp-geboorte','pmpp-club'].forEach(id => {
      const el = document.getElementById(id);
      if(el && !el.dataset._pmppBound){
        el.dataset._pmppBound = '1';
        el.addEventListener('input', pmppSchedule);
        el.addEventListener('change', pmppSchedule);
      }
    });
    const addBtn = document.getElementById('pmpp-add');
    if(addBtn && !addBtn.dataset._pmppBound){
      addBtn.dataset._pmppBound = '1';
      addBtn.addEventListener('click', pmppAdd);
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();

window.pmppAdd = pmppAdd;
window.pmppRenderList = pmppRenderList;
window.pmppResetUI = pmppResetUI;
window.__pmPendingPlayers = __pmPendingPlayers;

function openProgPlayerModal(progId, spelerId){
  const it = programmaCache.find(p => p.id === progId);
  if(!it) return;
  const sp = spelerId ? (it.spelers||[]).find(s => s.id === spelerId) : null;
  $('#prog-player-title').textContent = sp ? 'Speler bewerken' : 'Speler toevoegen';
  $('#pp-progid').value = progId;
  $('#pp-spelerid').value = sp ? sp.id : '';
  // s35q: voornaam/achternaam — fallback op splitNaam(sp.naam) voor oude records
  let _vn = '', _an = '';
  if(sp){
    _vn = sp.voornaam || '';
    _an = sp.achternaam || '';
    if(!_vn && !_an && sp.naam){
      const s = splitNaam(sp.naam);
      _vn = s.voornaam; _an = s.achternaam;
    }
  }
  $('#pp-voornaam').value = _vn;
  $('#pp-achternaam').value = _an;
  $('#pp-naam').value = sp ? (sp.naam || [_vn, _an].filter(Boolean).join(' ')) : '';
  $('#pp-geboorte').value = sp ? (sp.geboorte||'') : '';
  $('#pp-club').value = sp ? (sp.club || '') : (it.thuis || '');
  $('#pp-notities').value = sp ? (sp.voor_notities||'') : '';
  // s35p: hidden inputs — bewaar bestaande rugnummer/positie van een eerdere edit
  $('#pp-rugnummer').value = sp ? (sp.rugnummer||'') : '';
  $('#pp-positie').value = sp ? (sp.positie||'') : '';

  ppFullDraft = sp && sp.volledig ? {...sp.volledig} : null;
  refreshPpFullStatus();
  $('#pp-delete').style.display = sp ? '' : 'none';
  showModal('prog-player-backdrop');
  // s35t: reset suggestie-strip en check direct (bij sp leeg toont 'ie niets totdat user typt)
  const sugWrap = document.getElementById('pp-suggestion-wrap');
  if(sugWrap){ sugWrap.style.display = 'none'; sugWrap.innerHTML = ''; }
  // s35dg Fase B: reset bekende-speler banner
  const knownBanner = document.getElementById('pp-known-banner');
  if(knownBanner){ knownBanner.style.display = 'none'; knownBanner.innerHTML = ''; }
  if(typeof renderPpSuggestions === 'function') setTimeout(renderPpSuggestions, 50);
  if(typeof renderKnownPlayerBanner === 'function') setTimeout(renderKnownPlayerBanner, 60);
  setTimeout(()=> $('#pp-voornaam').focus(), 80); // s35q: voornaam is nu eerste veld
}
function closeProgPlayerModal(){ hideModal('prog-player-backdrop'); ppFullDraft = null; }

function refreshPpFullStatus(){
  const has = !!ppFullDraft;
  // s35ap (#3): groene "Concept-rapport ingevuld"-banner verbergen
  //            (de knop-tekst zelf zegt al dat er een concept is)
  const statusEl = $('#pp-full-status');
  if(statusEl) statusEl.style.display = 'none';
  const txtEl = $('#pp-full-status-text');
  if(txtEl) txtEl.textContent = has
    ? `Concept-rapport ingevuld (${Object.keys(ppFullDraft).length} velden).`
    : '';
  // s35ap (#4): knop-label wisselen "Volledig invullen" <-> "Concept verder invullen"
  try {
    const btn = document.getElementById('pp-open-full');
    if(btn){
      const labelNode = Array.from(btn.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
      const newLabel = has ? 'Concept verder invullen' : 'Volledig invullen';
      if(labelNode) labelNode.textContent = ' ' + newLabel;
      else btn.appendChild(document.createTextNode(' ' + newLabel));
    }
  } catch(_){}
}

async function saveProgPlayerFromForm(e, opts){
  if(e && typeof e.preventDefault === 'function') e.preventDefault();
  const silent = !!(opts && opts.silent);
  const progId = $('#pp-progid').value;
  const it = programmaCache.find(p => p.id === progId);
  if(!it){ if(!silent) toast('Geplande wedstrijd niet gevonden', true); return false; }

  const spelerId = $('#pp-spelerid').value || genId('progsp');
  // s35q: voornaam + achternaam zijn de zichtbare velden; naam wordt afgeleid
  const voornaam = ($('#pp-voornaam')?.value || '').trim();
  const achternaam = ($('#pp-achternaam')?.value || '').trim();
  syncNaamHidden('pp');
  const naam = ($('#pp-naam').value||'').trim();
  if(!naam){
    // s35p/s35q: zonder naam (i.e. voornaam+achternaam beide leeg) niet opslaan
    return false;
  }
  const speler = {
    id: spelerId,
    naam,
    voornaam,
    achternaam,
    geboorte: ($('#pp-geboorte')?.value||''),
    rugnummer: ($('#pp-rugnummer').value||'').trim(),
    club: $('#pp-club').value.trim(),
    positie: ($('#pp-positie').value||''),
    voor_notities: $('#pp-notities').value.trim(),
    volledig: ppFullDraft ? {...ppFullDraft} : null,
    modified: Date.now()
  };
  const spelers = [...(it.spelers||[])];
  const idx = spelers.findIndex(s => s.id === spelerId);
  if(idx >= 0) spelers[idx] = speler; else spelers.push(speler);

  const updated = {...it, spelers, modified: Date.now()};
  try {
    await saveProgrammaItem(updated);
    // s35bu: consume markers van _shConvertSnelToRapport -> splice source snel-notitie
    try {
      const _snId = window.__shConvertingFromSnId;
      const _snProgId = window.__shConvertingFromProgId;
      if(_snId && _snProgId && _snProgId === progId){
        const arr = Array.isArray(updated.snelnotities) ? updated.snelnotities.slice() : [];
        const filtered = arr.filter(s => s && s.id !== _snId);
        if(filtered.length !== arr.length){
          const after = {...updated, snelnotities: filtered, modified: Date.now()};
          await saveProgrammaItem(after);
        }
      }
    } catch(_){}
    finally {
      window.__shConvertingFromSnId = null;
      window.__shConvertingFromProgId = null;
    }
    closeProgPlayerModal();
    if(!silent) toast('Speler opgeslagen');
    // s35r: als detail-modal open is, ververs de spelerslijst
    const detailBd = document.getElementById('prog-match-detail-backdrop');
    if(detailBd && detailBd.classList.contains('active')){
      const detailId = document.getElementById('prog-match-detail-modal')?.dataset.progId;
      if(detailId === progId && typeof openProgMatchDetailModal === 'function'){
        openProgMatchDetailModal(progId);
      }
    }
    return true;
  } catch(e){ return false; }
}

// s35p: auto-save bij sluiten modal (X, klik buiten, Annuleren).
// - Bestaande speler: altijd opslaan (zelfs als naam leeg is gemaakt? Nee: behoud
//   minimaal naam; als alles leeg is bij edit, dan negeren we de sluiting).
// - Nieuwe speler: alleen opslaan als naam ingevuld is.
async function autoSaveProgPlayerOnClose(){
  const isEditing = !!$('#pp-spelerid').value;
  // s35q: sync hidden naam vóór check, zodat naam de echte combinatie is
  syncNaamHidden('pp');
  const naam = ($('#pp-naam').value||'').trim();
  const club = ($('#pp-club').value||'').trim();
  const geboorte = ($('#pp-geboorte')?.value||'').trim();
  const notities = ($('#pp-notities').value||'').trim();
  const hasContent = naam || club || geboorte || notities || ppFullDraft;
  if(!hasContent && !isEditing){ closeProgPlayerModal(); return; }
  if(!naam){ closeProgPlayerModal(); return; }
  const ok = await saveProgPlayerFromForm({preventDefault:()=>{}}, {silent:true});
  if(!ok) closeProgPlayerModal();
}
window.autoSaveProgPlayerOnClose = autoSaveProgPlayerOnClose;

async function deleteProgPlayerFromForm(){
  const progId = $('#pp-progid').value;
  const spelerId = $('#pp-spelerid').value;
  if(!progId || !spelerId) return;
  if(!confirm('Speler uit dit plan verwijderen?')) return;
  const it = programmaCache.find(p => p.id === progId);
  if(!it) return;
  const updated = {...it, spelers: (it.spelers||[]).filter(s => s.id !== spelerId), modified: Date.now()};
  try {
    await saveProgrammaItem(updated);
    closeProgPlayerModal();
    toast('Verwijderd');
  } catch(e){}
}

/* ------------- Voorrapport uitklap: opent rapportformulier in concept-mode ------------- */
let ppOpenedForFull = false; // flag zodat we weten dat we terug moeten
function openPpFullForm(){
  // Sla compact-state op via sessionStorage zodat we terug kunnen
  // s35q: sync hidden naam en passeer voornaam/achternaam/geboorte mee
  syncNaamHidden('pp');
  const ctx = {
    progId: $('#pp-progid').value,
    spelerId: $('#pp-spelerid').value || genId('progsp'),
    naam: $('#pp-naam').value,
    voornaam: ($('#pp-voornaam')?.value || ''),
    achternaam: ($('#pp-achternaam')?.value || ''),
    geboorte: ($('#pp-geboorte')?.value || ''),
    rugnummer: $('#pp-rugnummer').value,
    club: $('#pp-club').value,
    positie: $('#pp-positie').value,
    voor_notities: $('#pp-notities').value,
    volledig: ppFullDraft
  };
  sessionStorage.setItem('progFullCtx', JSON.stringify(ctx));
  closeProgPlayerModal();

  // Wissel naar rapportformulier
  go('report');
  resetReportForm();
  // Vooraf vullen met basis + bestaand concept
  const p = ctx.volledig || {};
  // s35q: prefill voornaam/achternaam in full form; sync hidden naam
  if(ctx.voornaam && $('#f-voornaam')) $('#f-voornaam').value = ctx.voornaam;
  if(ctx.achternaam && $('#f-achternaam')) $('#f-achternaam').value = ctx.achternaam;
  if(ctx.naam) $('#f-naam').value = ctx.naam;
  syncNaamHidden('f');
  if(ctx.geboorte) $('#f-geboorte').value = ctx.geboorte;
  if(ctx.club) $('#f-club').value = ctx.club;
  if(ctx.rugnummer) $('#f-rugnummer').value = ctx.rugnummer;
  if(ctx.positie) $('#f-positie').value = ctx.positie;
  // s37: wedstrijddata + leeftijdscategorie vullen vanuit snelnotitie-context
  try {
    const _wCtx = window.__shSnelProgContext || null;
    if(_wCtx){
      if(_wCtx.datum && $('#f-w-datum') && !$('#f-w-datum').value) $('#f-w-datum').value = _wCtx.datum;
      if(_wCtx.thuis && $('#f-w-thuis') && !$('#f-w-thuis').value) $('#f-w-thuis').value = _wCtx.thuis;
      if(_wCtx.uit   && $('#f-w-uit')   && !$('#f-w-uit').value)   $('#f-w-uit').value   = _wCtx.uit;
      if(_wCtx.leeftijd && $('#f-leeftijd') && !$('#f-leeftijd').value) $('#f-leeftijd').value = _wCtx.leeftijd;
      window.__shSnelProgContext = null; // eenmalig verbruiken
    } else {
      // Fallback: zoek prog via progId in cache
      const _pid = ctx.progId;
      if(_pid && typeof programmaCache !== 'undefined'){
        const _pr = programmaCache.find(p => p && p.id === _pid);
        if(_pr){
          if(_pr.datum && $('#f-w-datum') && !$('#f-w-datum').value) $('#f-w-datum').value = _pr.datum;
          if(_pr.thuis && $('#f-w-thuis') && !$('#f-w-thuis').value) $('#f-w-thuis').value = _pr.thuis;
          if(_pr.uit   && $('#f-w-uit')   && !$('#f-w-uit').value)   $('#f-w-uit').value   = _pr.uit;
          if(_pr.leeftijd && $('#f-leeftijd') && !$('#f-leeftijd').value) $('#f-leeftijd').value = _pr.leeftijd;
        }
      }
    }
  } catch(_){}

  if(p && Object.keys(p).length){
    loadIntoForm({...p, id: ''}); // zonder id zodat het concept blijft
    $('#f-id').value = ''; // nooit overschrijven bestaande speler
  }

  $('#report-title').textContent = `Voorrapport — ${ctx.naam || 'speler'}`;
  // Banner met "terug naar plan" + "save als concept" actie
  injectProgFullBanner(ctx);
}

function injectProgFullBanner(ctx){
  let banner = document.getElementById('prog-full-banner');
  if(banner) banner.remove();
  banner = document.createElement('div');
  banner.id = 'prog-full-banner';
  banner.style.cssText = 'background:rgba(245,197,24,0.12); border:1px solid rgba(245,197,24,0.4); border-radius:10px; padding:12px 14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;';
  banner.innerHTML = `
    <div style="font-size:13px; line-height:1.4;">
      <strong style="color:#f5c518;">Voorrapport-modus</strong> — wijzigingen worden als concept bij je geplande speler opgeslagen, niet in de spelers-database.
    </div>
    <!-- s35ao: knoppen verwijderd (autosave doet werk vanzelf) -->
  `;
  const form = document.getElementById('view-report');
  form.insertBefore(banner, form.firstChild.nextSibling);

  document.getElementById('prog-full-back').addEventListener('click', () => {
    setDirty(false);
    sessionStorage.removeItem('progFullCtx');
    banner.remove();
    backToProgrammaFromFull(ctx.progId);
  });
  document.getElementById('prog-full-save').addEventListener('click', async () => {
    const draft = collectReportFormData();
    delete draft.id;
    const it = programmaCache.find(p => p.id === ctx.progId);
    if(!it){ toast('Wedstrijd niet meer gevonden', true); return; }
    const spelers = [...(it.spelers || [])];
    const idx = spelers.findIndex(s => s.id === ctx.spelerId);
    const updatedSp = {
      id: ctx.spelerId,
      naam: draft.naam || ctx.naam,
      voornaam: draft.voornaam || ctx.voornaam || '',
      achternaam: draft.achternaam || ctx.achternaam || '',
      geboorte: draft.geboorte || ctx.geboorte || '',
      rugnummer: draft.rugnummer || ctx.rugnummer,
      club: draft.club || ctx.club,
      positie: draft.positie || ctx.positie,
      voor_notities: ctx.voor_notities,
      volledig: draft,
      modified: Date.now()
    };
    if(idx >= 0) spelers[idx] = updatedSp; else spelers.push(updatedSp);
    try {
      await saveProgrammaItem({...it, spelers, modified: Date.now()});
      setDirty(false);
      sessionStorage.removeItem('progFullCtx');
      banner.remove();
      toast('Opgeslagen');
      backToProgrammaFromFull(ctx.progId);
    } catch(e){}
  });
}

function backToProgrammaFromFull(progId){
  progExpandedId = progId || null;
  go('programma');
}

/* s36d: 'Niet gerapporteerd'-optie — alleen tonen bij een gekoppelde speler
   (speler die in een programma-wedstrijd aan prog.spelers hangt). */
function shIsCoupledPlayerInReportForm(){
  const norm = s => String(s||'').trim().toLowerCase();
  const vn = norm($('#f-voornaam') && $('#f-voornaam').value);
  const an = norm($('#f-achternaam') && $('#f-achternaam').value);
  if(!vn || !an) return false;
  if(typeof programmaCache === 'undefined' || !Array.isArray(programmaCache)) return false;
  for(const prog of programmaCache){
    const sps = Array.isArray(prog && prog.spelers) ? prog.spelers : [];
    for(const sp of sps){
      let svn = norm(sp.voornaam), san = norm(sp.achternaam);
      if((!svn || !san) && sp.naam && typeof splitNaam === 'function'){
        const s = splitNaam(sp.naam);
        if(!svn) svn = norm(s.voornaam);
        if(!san) san = norm(s.achternaam);
      }
      if(svn === vn && san === an) return true;
    }
  }
  return false;
}
function shSyncNietGerapporteerdUI(){
  const sec = document.getElementById('niet-gerapporteerd-section');
  if(sec) sec.style.display = shIsCoupledPlayerInReportForm() ? '' : 'none';
  const cb = document.getElementById('f-niet-gerapporteerd');
  const wrap = document.getElementById('niet-gerapporteerd-reden-wrap');
  if(cb && wrap) wrap.style.display = cb.checked ? '' : 'none';
}
window.shSyncNietGerapporteerdUI = shSyncNietGerapporteerdUI;
/* s36f: zichtbaarheid betrouwbaar bijwerken zolang het rapport-formulier
   open staat — dekt alle paden waarlangs een rapport geopend wordt. */
try {
  setInterval(function(){
    var rv = document.getElementById('view-report');
    if(rv && rv.offsetParent !== null){
      try { shSyncNietGerapporteerdUI(); } catch(_){}
    }
  }, 600);
} catch(_){}

function collectReportFormData(){
  // Verzamelt alle velden zoals saveReport doet, zonder daadwerkelijk op te slaan
  // s35q: zorg dat hidden naam in sync is voordat we 'm lezen
  if(typeof syncNaamHidden === 'function') syncNaamHidden('f');
  const data = {
    naam: $('#f-naam').value.trim(),
    voornaam: ($('#f-voornaam')?.value || '').trim(),
    achternaam: ($('#f-achternaam')?.value || '').trim(),
    geboorte: $('#f-geboorte').value,
    club: $('#f-club').value.trim(),
    plaats: ($('#f-plaats') ? $('#f-plaats').value.trim() : ''),
    adres: ($('#f-adres') ? $('#f-adres').value.trim() : ''),
    rugnummer: $('#f-rugnummer').value.trim(),
    elftal: $('#f-elftal').value.trim(),
    been: $('#f-been').value,
    tweebenig: $('#f-tweebenig').value.trim(),
    linie: $('#f-linie').value,
    positie: $('#f-positie').value,
    beoogd: $('#f-beoogd').value,
    leeftijd: $('#f-leeftijd').value,
    leeftijd_opmerking: $('#f-leeftijd-opm') ? $('#f-leeftijd-opm').value.trim() : '',
    methode: $('#f-methode').value,
    advies: $('#f-advies').value,
    wapen: $('#f-wapen').value.trim(),
    notities: $('#f-notities').value.trim(),
    niet_gerapporteerd: !!($('#f-niet-gerapporteerd') && $('#f-niet-gerapporteerd').checked),
    niet_gerapporteerd_reden: ($('#f-niet-gerapporteerd-reden') ? $('#f-niet-gerapporteerd-reden').value : ''),
    huidig_niveau: getPickerValue('huidig_niveau'),
    potentieel_niveau: getPickerValue('potentieel_niveau'),
    wedstrijd: {
      datum: $('#f-w-datum').value,
      thuis: $('#f-w-thuis').value.trim(),
      uit: $('#f-w-uit').value.trim(),
      uitslag: $('#f-w-uitslag').value.trim(),
      opstelling: $('#f-w-opstelling').value.trim(),
      context: $('#f-w-context').value.trim(),
      /* s35dg Fase H */
      plaats: $('#f-w-plaats') ? $('#f-w-plaats').value.trim() : '',
      sportpark: $('#f-w-sportpark') ? $('#f-w-sportpark').value.trim() : '',
      veld: $('#f-w-veld') ? $('#f-w-veld').value.trim() : ''
    },
    bouw: $('#f-bouw').value.trim(),
    lengte: $('#f-lengte').value.trim(),
    motoriek: $('#f-motoriek').value,
    rijping: $('#f-rijping').value,
    beoordelingen: {
      techniek_huidig: getPickerValue('techniek_huidig'),
      inzicht_huidig: getPickerValue('inzicht_huidig'),
      grit_huidig: getPickerValue('grit_huidig'),
      explosiviteit_huidig: getPickerValue('explosiviteit_huidig'),
      sprinten_huidig: getPickerValue('sprinten_huidig'),
      duelleren_huidig: getPickerValue('duelleren_huidig'),
      wendbaarheid_huidig: getPickerValue('wendbaarheid_huidig'),
      techniek_tekst: $('#f-tekst-techniek').value.trim(),
      inzicht_tekst: $('#f-tekst-inzicht').value.trim(),
      grit_tekst: $('#f-tekst-grit').value.trim(),
      explosiviteit_tekst: $('#f-tekst-explosiviteit').value.trim(),
      sprinten_tekst: $('#f-tekst-sprinten').value.trim(),
      duelleren_tekst: $('#f-tekst-duelleren').value.trim(),
      wendbaarheid_tekst: $('#f-tekst-wendbaarheid').value.trim()
    }
  };
  return data;
}

/* ------------- Verwerken: promote naar spelers + match_reports ------------- */
async function verwerkProgrammaItem(id){
  const it = programmaCache.find(p => p.id === id);
  if(!it){ toast('Niet gevonden', true); return; }
  const spelers = (it.spelers || []).filter(s => s.volledig); // alleen spelers met concept
  if(spelers.length === 0 && !it.thuis && !it.uit){
    toast('Niets te verwerken — vul minstens één voorrapport in', true);
    return;
  }
  const msg = spelers.length
    ? `Verwerken naar database?\n\n→ ${spelers.length} spelerrapport${spelers.length===1?'':'en'} worden aangemaakt\n→ Wedstrijd wordt gemarkeerd als verwerkt`
    : 'Verwerken? Er zijn geen volledig ingevulde voorrapporten — alleen de wedstrijd wordt vastgelegd.';
  if(!confirm(msg)) return;

  setSync('syncing');
  const createdPlayerIds = [];
  try {
    for(const sp of spelers){
      const playerId = genId('player');
      const playerData = {
        ...(sp.volledig || {}),
        id: playerId,
        naam: sp.volledig?.naam || sp.naam,
        club: sp.volledig?.club || sp.club,
        rugnummer: sp.volledig?.rugnummer || sp.rugnummer,
        positie: sp.volledig?.positie || sp.positie,
        methode: sp.volledig?.methode || it.methode || 'Live',
        datum: it.datum,
        created: Date.now(),
        modified: Date.now()
      };
      // wedstrijd context vullen vanuit programma als die leeg is
      if(!playerData.wedstrijd) playerData.wedstrijd = {};
      if(!playerData.wedstrijd.datum) playerData.wedstrijd.datum = it.datum;
      if(!playerData.wedstrijd.thuis) playerData.wedstrijd.thuis = it.thuis;
      if(!playerData.wedstrijd.uit) playerData.wedstrijd.uit = it.uit;
      await savePlayer(playerData);
      createdPlayerIds.push(playerId);
    }
    const updated = {
      ...it,
      status: 'verwerkt',
      verwerkt_op: Date.now(),
      verwerkt_player_ids: createdPlayerIds,
      modified: Date.now()
    };
    await saveProgrammaItem(updated);
    toast(`Verwerkt — ${createdPlayerIds.length} speler${createdPlayerIds.length===1?'':'s'} toegevoegd`);
  } catch(e){
    console.error('Verwerken mislukt:', e);
    toast('Verwerken mislukt — controleer verbinding', true);
  }
}

/* ------------- Maandag-reminder bij login ------------- */
/* s36e: irritante 'onverwerkte planning'-popup vervangen door een subtiele
   telbadge achter 'Wedstrijden' in de navigatie (desktop + mobiel). */
function shUpdateMatchesNavBadge(){
  let n = 0;
  try {
    if(typeof programmaCache !== 'undefined' && programmaCache && programmaCache.length
       && typeof getISOWeek === 'function' && typeof weekKey === 'function' && typeof parseIsoDate === 'function'){
      const cur = getISOWeek(new Date());
      const curKey = weekKey(cur[0], cur[1]);
      const today = new Date(); today.setHours(0,0,0,0);
      n = programmaCache.filter(it => {
        if(!it || it.status === 'verwerkt' || !it.datum) return false;
        // s100: ook localStorage-verwerkt meenemen
        const _itKey = [it.datum, (it.thuis||'').toLowerCase(), (it.uit||'').toLowerCase()].join('|');
        if(typeof shIsWedstrijdVerwerkt === 'function' && shIsWedstrijdVerwerkt(_itKey)) return false;
        const d = parseIsoDate(it.datum);
        if(!d) return false;
        return d < today;
      }).length;
    }
  } catch(_){}
  document.querySelectorAll('[data-view="matches"]').forEach(nav => {
    let badge = nav.querySelector('.nav-overdue-badge');
    if(n > 0){
      const isBottom = nav.classList.contains('bn-item');
      if(!badge){
        badge = document.createElement('span');
        badge.className = 'nav-overdue-badge';
        if(isBottom) nav.style.position = 'relative';
        badge.style.cssText = isBottom
          ? 'position:absolute; top:5px; right:14px; background:#e30613; color:#fff; font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:8px; padding:0 3px; display:inline-flex; align-items:center; justify-content:center; line-height:1; box-sizing:border-box; z-index:2;'
          : 'background:#e30613; color:#fff; font-size:10px; font-weight:700; min-width:17px; height:17px; border-radius:9px; padding:0 5px; display:inline-flex; align-items:center; justify-content:center; line-height:1; margin-left:7px; vertical-align:middle; box-sizing:border-box;';
        nav.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.style.display = 'inline-flex';
      nav.setAttribute('title', n + ' onverwerkte wedstrijd' + (n === 1 ? '' : 'en') + ' uit voorgaande weken');
    } else if(badge){
      badge.style.display = 'none';
    }
  });
}
window.shUpdateMatchesNavBadge = shUpdateMatchesNavBadge;

/* ---- Follow-up nav-badge op Spelersbase ---- */
function shUpdateDatabaseNavBadge(){
  try {
    // s-badge-off: op verzoek uitgeschakeld
    const n = 0;
    document.querySelectorAll('[data-view="database"]').forEach(nav => {
      let badge = nav.querySelector('.nav-followup-badge');
      if(n > 0){
        const isBottom = nav.classList.contains('bn-item');
        if(!badge){
          badge = document.createElement('span');
          badge.className = 'nav-followup-badge';
          if(isBottom) nav.style.position = 'relative';
          badge.style.cssText = isBottom
            ? 'position:absolute; top:5px; right:14px; background:var(--grade-c); color:#1a0c00; font-size:9px; font-weight:700; min-width:15px; height:15px; border-radius:8px; padding:0 3px; display:inline-flex; align-items:center; justify-content:center; line-height:1; box-sizing:border-box; z-index:2;'
            : 'background:var(--grade-c); color:#1a0c00; font-size:10px; font-weight:700; min-width:17px; height:17px; border-radius:9px; padding:0 5px; display:inline-flex; align-items:center; justify-content:center; line-height:1; margin-left:7px; vertical-align:middle; box-sizing:border-box;';
          nav.appendChild(badge);
        }
        badge.textContent = n > 99 ? '99+' : String(n);
        badge.style.display = 'inline-flex';
        nav.setAttribute('title', n + ' speler' + (n===1?'':'s') + ' zonder recent bezoek (60+ dagen)');
      } else if(badge){
        badge.style.display = 'none';
      }
    });
  } catch(_){}
}
window.shUpdateDatabaseNavBadge = shUpdateDatabaseNavBadge;

/* ---- Vergelijken nav-badge + floating bar ---- */
function shUpdateCmpUI(){
  try {
    const n = (typeof cmpSelectedIds !== 'undefined') ? cmpSelectedIds.length : 0;
    // Sidebar badge
    document.querySelectorAll('[data-view="compare"]').forEach(nav => {
      let badge = nav.querySelector('.nav-cmp-badge');
      if(n > 0){
        if(!badge){
          badge = document.createElement('span');
          badge.className = 'nav-cmp-badge';
          nav.appendChild(badge);
        }
        badge.textContent = String(n);
        badge.style.display = 'inline-flex';
      } else if(badge){
        badge.style.display = 'none';
      }
    });
    // Floating bar — NIET tonen op de vergelijken-pagina zelf
    const onComparePage = (typeof currentView !== 'undefined' && currentView === 'compare');
    const bar = document.getElementById('cmp-float-bar');
    const countEl = document.getElementById('cmp-float-count');
    if(bar){
      if(countEl) countEl.textContent = String(n);
      bar.style.display = (n > 0 && !onComparePage) ? 'flex' : 'none';
    }
  } catch(_){}
}
window.shUpdateCmpUI = shUpdateCmpUI;


function checkProgrammaReminder(){
  if(!programmaCache || programmaCache.length === 0) return;
  const now = new Date();
  const [curJaar, curWeek] = getISOWeek(now);
  const curKey = weekKey(curJaar, curWeek);

  const lastDismissed = localStorage.getItem('progReminderDismissed');
  if(lastDismissed === curKey) return;

  // Filter onverwerkte items van weken vóór huidige week
  const overdue = programmaCache.filter(it => {
    if(it.status === 'verwerkt') return false;
    if(!it.datum) return false;
    const d = parseIsoDate(it.datum);
    if(!d) return false;
    const [j, w] = getISOWeek(d);
    return weekKey(j, w) < curKey;
  });
  if(overdue.length === 0) return;

  const list = $('#prog-reminder-list');
  list.innerHTML = overdue
    .sort((a,b) => (a.datum||'').localeCompare(b.datum||''))
    .map(it => {
      const datum = it.datum ? formatNlDateFull(parseIsoDate(it.datum)) : '?';
      const spN = (it.spelers||[]).length;
      return `<div style="padding:10px 12px; border-bottom:1px solid var(--border); cursor:pointer;" data-rem-id="${it.id}">
        <div style="font-weight:600; font-size:13px;">${escapeHtml(it.thuis||'?')}${it.thuis_elftal?' '+escapeHtml(it.thuis_elftal):''} — ${escapeHtml(it.uit||'?')}${it.uit_elftal?' '+escapeHtml(it.uit_elftal):''}</div>
        <div style="font-size:11.5px; color:var(--text-3); margin-top:2px;">${datum}${it.leeftijd?' · '+escapeHtml(it.leeftijd):''}${spN?' · '+spN+' speler'+(spN===1?'':'s'):''}</div>
      </div>`;
    }).join('');

  $('#prog-reminder-text').textContent =
    `Er staan nog ${overdue.length} ingeplande wedstrijd${overdue.length===1?'':'en'} uit voorgaande weken die niet zijn verwerkt. Wil je deze nog bewerken of verwerken?`;

  list.querySelectorAll('[data-rem-id]').forEach(row => {
    row.addEventListener('click', () => {
      progExpandedId = row.dataset.remId;
      // Stel offset zo in dat we de juiste week tonen
      const it = programmaCache.find(p => p.id === row.dataset.remId);
      if(it && it.datum){
        const thisMonday = getMondayOfWeek(new Date());
        const itMonday = getMondayOfWeek(parseIsoDate(it.datum));
        progWeekOffset = Math.round((itMonday - thisMonday) / (7*24*3600*1000));
      }
      hideModal('prog-reminder-backdrop');
      go('programma');
    });
  });

  showModal('prog-reminder-backdrop');
}

/* ------------- Wire up programma events (once) ------------- */
function wireProgrammaUI(){
  // s35dj: één keer binden — guard tegen dubbele listeners (PWA bfcache/pageshow)
  if(window.__progUIInited) return;
  window.__progUIInited = true;
  $('#programma-new-btn')?.addEventListener('click', () => openProgMatchModal(null, isoDateStr(new Date())));
  $('#programma-today-btn')?.addEventListener('click', () => { progWeekOffset = 0; renderProgramma(); });
  $('#prog-prev-week')?.addEventListener('click', () => { progWeekOffset--; renderProgramma(); });
  $('#prog-next-week')?.addEventListener('click', () => { progWeekOffset++; renderProgramma(); });

  // s-week-picker: klik op week-label → verborgen date-input opent, sprong naar willekeurige week
  (function _wireWeekPicker(){
    const label = $('#prog-nav-label');
    if(!label || label.dataset.wpWired) return;
    label.dataset.wpWired = '1';
    label.style.cursor = 'pointer';
    label.title = 'Klik om naar een specifieke week te gaan';
    // maak verborgen date-input
    const inp = document.createElement('input');
    inp.type = 'date';
    inp.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;';
    label.appendChild(inp);
    label.addEventListener('click', (e) => {
      // Stel input in op maandag van huidige displayweek
      const mon = getCurrentDisplayMonday();
      inp.value = isoDateStr(mon);
      inp.showPicker ? inp.showPicker() : inp.click();
    });
    inp.addEventListener('change', () => {
      if(!inp.value) return;
      const chosen = new Date(inp.value + 'T00:00:00');
      const thisMonday = getMondayOfWeek(new Date());
      const chosenMonday = getMondayOfWeek(chosen);
      progWeekOffset = Math.round((chosenMonday - thisMonday) / (7*24*3600*1000));
      // Zet actieve dag op de gekozen datum als die in de week valt
      const dayOfWeek = (chosen.getDay() + 6) % 7; // 0=ma
      progWeekActiveDay = dayOfWeek;
      renderProgramma();
    });
  })();

  // s35dj: type-pill klikken in modal
  document.addEventListener('click', e => {
    const pill = e.target.closest('[data-pm-type]');
    if(!pill) return;
    _pmUpdateTypeUI(pill.dataset.pmType);
  });

  // s35bk-2: Agenda-view bindings
  $('#agenda-today-btn')?.addEventListener('click', () => { agendaDayOffset = 0; renderAgenda(); });
  $('#agenda-prev')?.addEventListener('click', () => { agendaDayOffset -= agendaSpan; renderAgenda(); });
  $('#agenda-next')?.addEventListener('click', () => { agendaDayOffset += agendaSpan; renderAgenda(); });
  document.querySelectorAll('[data-agenda-span]').forEach(btn => {
    btn.addEventListener('click', () => {
      agendaSpan = parseInt(btn.dataset.agendaSpan, 10) || 1;
      document.querySelectorAll('[data-agenda-span]').forEach(b => b.classList.toggle('active', b === btn));
      renderAgenda();
    });
  });

  // s35r: read-only wedstrijd-detail modal
  $('#prog-match-detail-close')?.addEventListener('click', closeProgMatchDetailModal);
  $('#prog-match-detail-backdrop')?.addEventListener('click', e => {
    if(e.target.id === 'prog-match-detail-backdrop') closeProgMatchDetailModal();
  });
  $('#pmd-edit')?.addEventListener('click', () => {
    const progId = $('#prog-match-detail-modal').dataset.progId;
    if(!progId) return;
    closeProgMatchDetailModal();
    setTimeout(() => openProgMatchModal(progId), 60);
  });
  $('#pmd-add-player')?.addEventListener('click', () => {
    const progId = $('#prog-match-detail-modal').dataset.progId;
    if(!progId) return;
    // Detail-modal niet sluiten — speler-modal komt erbovenop. Bij opslaan/sluiten
    // van speler-modal blijft detail-modal zichtbaar met geüpdatete spelerslijst.
    openProgPlayerModal(progId, null);
  });
  $('#pmd-route')?.addEventListener('click', () => {
    const url = $('#pmd-route').dataset.url;
    if(url) window.open(url, '_blank', 'noopener');
  });

  // Plan match modal
  $('#prog-match-close')?.addEventListener('click', () => _shGuardClose('progMatch', closeProgMatchModal));
  $('#pm-cancel')?.addEventListener('click', () => _shGuardClose('progMatch', closeProgMatchModal));
  $('#prog-match-form')?.addEventListener('submit', saveProgMatchFromForm);
  $('#pm-delete')?.addEventListener('click', deleteProgMatchFromForm);
  $('#prog-match-backdrop')?.addEventListener('click', e => { if(e.target.id === 'prog-match-backdrop') _shGuardClose('progMatch', closeProgMatchModal); });
  // s91: markeer dirty bij elke input/change in het formulier
  $('#prog-match-form')?.addEventListener('input', () => _shMarkDirty('progMatch'));
  $('#prog-match-form')?.addEventListener('change', () => _shMarkDirty('progMatch'));

  // Plan player modal — s35p: alle sluit-acties triggeren auto-save
  $('#prog-player-close')?.addEventListener('click', autoSaveProgPlayerOnClose);
  $('#pp-cancel')?.addEventListener('click', autoSaveProgPlayerOnClose);
  $('#prog-player-form')?.addEventListener('submit', saveProgPlayerFromForm);
  $('#pp-delete')?.addEventListener('click', deleteProgPlayerFromForm);
  $('#pp-open-full')?.addEventListener('click', openPpFullForm);
  $('#pp-full-clear')?.addEventListener('click', () => { ppFullDraft = null; refreshPpFullStatus(); });
  $('#prog-player-backdrop')?.addEventListener('click', e => { if(e.target.id === 'prog-player-backdrop') autoSaveProgPlayerOnClose(); });
  // s35q: live sync van verborgen pp-naam + f-naam uit voornaam/achternaam
  // s35t: + suggestion refresh op alle pp-velden
  $('#pp-voornaam')?.addEventListener('input', () => { syncNaamHidden('pp'); schedulePpSuggestionRefresh(); });
  $('#pp-achternaam')?.addEventListener('input', () => { syncNaamHidden('pp'); schedulePpSuggestionRefresh(); });
  $('#pp-geboorte')?.addEventListener('input', () => schedulePpSuggestionRefresh());
  $('#pp-club')?.addEventListener('input', () => schedulePpSuggestionRefresh());
  $('#f-voornaam')?.addEventListener('input', () => syncNaamHidden('f'));
  $('#f-achternaam')?.addEventListener('input', () => syncNaamHidden('f'));

  // Reminder modal
  $('#prog-reminder-close')?.addEventListener('click', () => hideModal('prog-reminder-backdrop'));
  $('#prog-reminder-skip')?.addEventListener('click', () => {
    const [j, w] = getISOWeek(new Date());
    localStorage.setItem('progReminderDismissed', weekKey(j, w));
    hideModal('prog-reminder-backdrop');
  });
  $('#prog-reminder-goto')?.addEventListener('click', () => {
    hideModal('prog-reminder-backdrop');
    go('programma');
  });
}

// Modal show/hide helpers (bestaande conventie: .modal-backdrop.open { display:flex })
function showModal(id){ const el = document.getElementById(id); if(el) el.classList.add('open'); }
function hideModal(id){ const el = document.getElementById(id); if(el) el.classList.remove('open'); }

// Init wire-up zodra DOM klaar is
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', wireProgrammaUI);
} else {
  wireProgrammaUI();
}

/* =============== IMPORT =============== */
function openImportModal(){
  $('#import-text').value = '';
  $('#import-status').textContent = '';
  $('#import-status').style.color = '';
  const fileEl = $('#import-file');
  if(fileEl) fileEl.value = '';
  const nameEl = $('#import-file-name');
  if(nameEl) nameEl.textContent = '';
  $('#import-backdrop').classList.add('open');
  setTimeout(()=> $('#import-text').focus(), 50);
}
function closeImportModal(){
  $('#import-backdrop').classList.remove('open');
}
async function runImport(){
  const status = $('#import-status');
  const raw = $('#import-text').value.trim();
  if(!raw){
    status.style.color = 'var(--red)';
    status.textContent = 'Plak eerst een rapport-blokje in het veld.';
    return;
  }
  const list = _parseImportListRaw(raw);
  if(!list){
    status.style.color = 'var(--red)';
    status.textContent = 'Het geplakte tekstblok kan niet gelezen worden. Controleer of je het hele blokje hebt gekopieerd.';
    return;
  }
  if(!list.length){
    status.style.color = 'var(--red)';
    status.textContent = 'Geen rapporten gevonden in het blokje.';
    return;
  }
  if(!currentUser){
    status.style.color = 'var(--red)';
    status.textContent = 'Niet ingelogd. Log opnieuw in en probeer het nogmaals.';
    return;
  }
  const existingIds = new Set(loadPlayers().map(p => p.id));
  let ok = 0, fail = 0, missingNaam = 0, firstErr = '';
  status.style.color = 'var(--text-2)';
  status.textContent = `Bezig met importeren van ${list.length} rapport${list.length===1?'':'en'}...`;
  for(const entry of list){
    if(!entry || typeof entry !== 'object'){ fail++; continue; }
    if(!entry.naam){ missingNaam++; fail++; continue; }
    const player = {...entry};
    if(!player.id || existingIds.has(player.id)) player.id = uid();
    existingIds.add(player.id);
    if(!player.datum) player.datum = (player.wedstrijd && player.wedstrijd.datum) || todayISO();
    try {
      await savePlayer(player);
      ok++;
    } catch(e){
      fail++;
      if(!firstErr) firstErr = (e && (e.message || e.code)) || 'onbekende fout';
    }
  }
  if(ok > 0){
    status.style.color = 'var(--green)';
    status.textContent = `${ok} rapport${ok===1?'':'en'} geïmporteerd${fail?` · ${fail} mislukt`:''}.`;
    toast(`${ok} rapport${ok===1?'':'en'} toegevoegd`);
    setTimeout(()=>{
      closeImportModal();
      applyFilters();
    }, 900);
  } else {
    status.style.color = 'var(--red)';
    if(missingNaam === list.length){
      status.textContent = `Dit lijkt geen spelers-bestand. Geen "naam"-veld gevonden — gebruik het knopje "Wedstrijden importeren" op de Wedstrijden-pagina.`;
    } else if(firstErr){
      status.textContent = `Importeren mislukt — ${firstErr}`;
    } else {
      status.textContent = `Importeren mislukt. Controleer het blokje.`;
    }
  }
}

/* =============== MATCH-REPORT IMPORT =============== */
function openMatchReportImportModal(){
  $('#mreport-import-text').value = '';
  $('#mreport-import-status').textContent = '';
  $('#mreport-import-status').style.color = '';
  const fileEl = $('#mreport-import-file');
  if(fileEl) fileEl.value = '';
  const nameEl = $('#mreport-import-file-name');
  if(nameEl) nameEl.textContent = '';
  $('#mreport-import-backdrop').classList.add('open');
  setTimeout(()=> $('#mreport-import-text').focus(), 50);
}
function closeMatchReportImportModal(){
  $('#mreport-import-backdrop').classList.remove('open');
}
async function runMatchReportImport(){
  const status = $('#mreport-import-status');
  const raw = $('#mreport-import-text').value.trim();
  if(!raw){
    status.style.color = 'var(--red)';
    status.textContent = 'Plak eerst een wedstrijd-blokje in het veld.';
    return;
  }
  const list = _parseImportListRaw(raw);
  if(!list){
    status.style.color = 'var(--red)';
    status.textContent = 'Het geplakte tekstblok kan niet gelezen worden. Controleer of je het hele blokje hebt gekopieerd.';
    return;
  }
  if(!list.length){
    status.style.color = 'var(--red)';
    status.textContent = 'Geen wedstrijden gevonden in het blokje.';
    return;
  }
  if(!currentUser){
    status.style.color = 'var(--red)';
    status.textContent = 'Niet ingelogd. Log opnieuw in en probeer het nogmaals.';
    return;
  }
  const existingIds = new Set(loadMatchReports().map(r => r.id));
  let ok = 0, fail = 0, firstErr = '';
  status.style.color = 'var(--text-2)';
  status.textContent = `Bezig met importeren van ${list.length} wedstrijd${list.length===1?'':'en'}...`;
  for(const entry of list){
    if(!entry || typeof entry !== 'object'){ fail++; continue; }
    if(!entry.thuis && !entry.uit && !entry.opmerking){ fail++; continue; }
    const report = {
      id: entry.id || uid(),
      datum: entry.datum || todayISO(),
      leeftijd: entry.leeftijd || '',
      thuis: entry.thuis || '',
      uit: entry.uit || '',
      opmerking: entry.opmerking || ''
    };
    if(existingIds.has(report.id)) report.id = uid();
    existingIds.add(report.id);
    try {
      await saveMatchReport(report);
      ok++;
    } catch(e){
      fail++;
      if(!firstErr) firstErr = (e && (e.message || e.code)) || 'onbekende fout';
    }
  }
  if(ok > 0){
    status.style.color = 'var(--green)';
    status.textContent = `${ok} wedstrijd${ok===1?'':'en'} geïmporteerd${fail?` · ${fail} mislukt`:''}.`;
    toast(`${ok} wedstrijd${ok===1?'':'en'} toegevoegd`);
    setTimeout(()=>{
      closeMatchReportImportModal();
      if(typeof renderMatches === 'function') renderMatches();
    }, 900);
  } else {
    status.style.color = 'var(--red)';
    if(firstErr){
      status.textContent = `Importeren mislukt — ${firstErr}`;
    } else {
      status.textContent = `Importeren mislukt. Controleer het blokje.`;
    }
  }
}

/* =============== MATCH-REPORT BULK DELETE (via import-bestand) =============== */
function openMatchReportBulkDeleteModal(){
  $('#mreport-bulkdel-text').value = '';
  $('#mreport-bulkdel-status').textContent = '';
  $('#mreport-bulkdel-status').style.color = '';
  const fileEl = $('#mreport-bulkdel-file');
  if(fileEl) fileEl.value = '';
  const nameEl = $('#mreport-bulkdel-file-name');
  if(nameEl) nameEl.textContent = '';
  $('#mreport-bulkdel-backdrop').classList.add('open');
  setTimeout(()=> $('#mreport-bulkdel-text').focus(), 50);
}
function closeMatchReportBulkDeleteModal(){
  $('#mreport-bulkdel-backdrop').classList.remove('open');
}
/* Maak rauwe import-tekst leesbaar voor JSON.parse */
function _sanitizeImportRaw(raw){
  if(!raw) return '';
  let s = String(raw);
  s = s.replace(/^﻿/, '');                            // BOM
  s = s.replace(/ /g, ' ').replace(/[​-‍﻿]/g, '');  // non-breaking + zero-width
  s = s.replace(/```(?:json)?\s*/gi, '').replace(/```/g, ''); // code fences
  s = s.replace(/,\s*(\}|\])/g, '$1');                 // trailing commas
  return s.trim();
}
/* Probeer een tweede sanitatie waarbij smart-quotes worden vervangen — alleen
   gebruiken als directe parse faalt, want valid JSON kan deze chars in strings hebben */
function _sanitizeQuotesAggressive(s){
  return s
    .replace(/[“”„‟″‶]/g, '"')
    .replace(/[‘’‚‛′‵]/g, "'");
}
/* Pak het eerste complete JSON-fragment uit een tekst (object of array) */
function _extractJsonFragment(s){
  if(!s) return null;
  const fA = s.indexOf('['), fO = s.indexOf('{');
  let start = -1, openCh = '', closeCh = '';
  if(fA === -1 && fO === -1) return null;
  if(fA === -1)            { start = fO; openCh = '{'; closeCh = '}'; }
  else if(fO === -1)       { start = fA; openCh = '['; closeCh = ']'; }
  else if(fA < fO)         { start = fA; openCh = '['; closeCh = ']'; }
  else                     { start = fO; openCh = '{'; closeCh = '}'; }
  let depth = 0, inStr = false, esc = false;
  for(let i = start; i < s.length; i++){
    const c = s[i];
    if(inStr){
      if(esc) esc = false;
      else if(c === '\\') esc = true;
      else if(c === '"') inStr = false;
      continue;
    }
    if(c === '"'){ inStr = true; continue; }
    if(c === openCh) depth++;
    else if(c === closeCh){
      depth--;
      if(depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
function _parseImportListRaw(raw){
  const cleaned = _sanitizeImportRaw(raw);
  if(!cleaned) return null;
  const attempts = [cleaned, _sanitizeQuotesAggressive(cleaned)];
  for(const src of attempts){
    // 1) directe parse
    try {
      const data = JSON.parse(src);
      return Array.isArray(data) ? data : [data];
    } catch(_) {}
    // 2) JSONL
    const lines = src.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if(lines.length > 1){
      const parsed = [];
      let allOk = true;
      for(const line of lines){
        try { parsed.push(JSON.parse(line)); } catch(__) { allOk = false; break; }
      }
      if(allOk && parsed.length) return parsed;
    }
    // 3) komma-loze objecten op losse regels
    try {
      const wrapped = JSON.parse('[' + src.replace(/}\s*[\r\n]+\s*{/g, '},{') + ']');
      if(Array.isArray(wrapped) && wrapped.length) return wrapped;
    } catch(__) {}
    // 4) eerste compleet JSON-fragment uit prose
    const frag = _extractJsonFragment(src);
    if(frag){
      try {
        const data = JSON.parse(frag);
        return Array.isArray(data) ? data : [data];
      } catch(__) {}
    }
    // 5) meerdere losse fragmenten in de tekst
    const objs = [];
    let rest = src, guard = 0;
    while(rest && guard++ < 500){
      const f = _extractJsonFragment(rest);
      if(!f) break;
      try {
        const data = JSON.parse(f);
        if(Array.isArray(data)) objs.push(...data); else objs.push(data);
      } catch(__) { break; }
      const idx = rest.indexOf(f);
      rest = rest.slice(idx + f.length);
    }
    if(objs.length) return objs;
  }
  return null;
}
async function runMatchReportBulkDelete(){
  const status = $('#mreport-bulkdel-status');
  const raw = $('#mreport-bulkdel-text').value.trim();
  if(!raw){
    status.style.color = 'var(--red)';
    status.textContent = 'Plak eerst het JSON-blok dat je wilt verwijderen.';
    return;
  }
  const list = _parseImportListRaw(raw);
  if(!list || !list.length){
    status.style.color = 'var(--red)';
    status.textContent = 'Het geplakte tekstblok kan niet gelezen worden.';
    return;
  }
  const existing = loadMatchReports();
  const norm = (s) => (s||'').toString().trim().toLowerCase();
  const wanted = list.map(e => ({
    datum: norm(e.datum),
    thuis: norm(e.thuis),
    uit: norm(e.uit)
  }));
  const toDelete = existing.filter(r =>
    wanted.some(w =>
      w.datum === norm(r.datum) &&
      w.thuis === norm(r.thuis) &&
      w.uit === norm(r.uit)
    )
  );
  if(!toDelete.length){
    status.style.color = 'var(--text-2)';
    status.textContent = `Geen overeenkomende rapporten gevonden (${list.length} in blokje).`;
    return;
  }
  if(!confirm(`${toDelete.length} wedstrijdrapport${toDelete.length===1?'':'en'} verwijderen?\n\nDit kan niet ongedaan worden gemaakt.`)){
    return;
  }
  status.style.color = 'var(--text-2)';
  status.textContent = `Bezig met verwijderen van ${toDelete.length} rapport${toDelete.length===1?'':'en'}...`;
  let ok = 0, fail = 0;
  for(const r of toDelete){
    try { await deleteMatchReport(r.id); ok++; }
    catch(e){ fail++; }
  }
  if(ok > 0){
    status.style.color = 'var(--green)';
    status.textContent = `${ok} rapport${ok===1?'':'en'} verwijderd${fail?` · ${fail} mislukt`:''}.`;
    toast(`${ok} rapport${ok===1?'':'en'} verwijderd`);
    setTimeout(()=>{
      closeMatchReportBulkDeleteModal();
      if(typeof renderMatches === 'function') renderMatches();
    }, 900);
  } else {
    status.style.color = 'var(--red)';
    status.textContent = `Verwijderen mislukt.`;
  }
}

/* =============== PLAYER BULK DELETE (via import-bestand) =============== */
function openPlayerBulkDeleteModal(){
  $('#player-bulkdel-text').value = '';
  $('#player-bulkdel-status').textContent = '';
  $('#player-bulkdel-status').style.color = '';
  const fileEl = $('#player-bulkdel-file');
  if(fileEl) fileEl.value = '';
  const nameEl = $('#player-bulkdel-file-name');
  if(nameEl) nameEl.textContent = '';
  $('#player-bulkdel-backdrop').classList.add('open');
  setTimeout(()=> $('#player-bulkdel-text').focus(), 50);
}
function closePlayerBulkDeleteModal(){
  $('#player-bulkdel-backdrop').classList.remove('open');
}
async function runPlayerBulkDelete(){
  const status = $('#player-bulkdel-status');
  const raw = $('#player-bulkdel-text').value.trim();
  if(!raw){
    status.style.color = 'var(--red)';
    status.textContent = 'Plak eerst het JSON-blok dat je wilt verwijderen.';
    return;
  }
  const list = _parseImportListRaw(raw);
  if(!list || !list.length){
    status.style.color = 'var(--red)';
    status.textContent = 'Het geplakte tekstblok kan niet gelezen worden.';
    return;
  }
  const existing = loadPlayers();
  const norm = (s) => (s||'').toString().trim().toLowerCase();
  const wanted = list.map(e => ({
    naam: norm(e.naam || ((e.voornaam||'') + ' ' + (e.achternaam||'')).trim()),
    club: norm(e.club),
    team: norm(e.team)
  })).filter(w => w.naam);
  const toDelete = existing.filter(p =>
    wanted.some(w =>
      w.naam === norm(p.naam) &&
      (!w.club || w.club === norm(p.club)) &&
      (!w.team || w.team === norm(p.team))
    )
  );
  if(!toDelete.length){
    status.style.color = 'var(--text-2)';
    status.textContent = `Geen overeenkomende spelers gevonden (${wanted.length} in blokje).`;
    return;
  }
  if(!confirm(`${toDelete.length} speler${toDelete.length===1?'':'s'} verwijderen?\n\nDit kan niet ongedaan worden gemaakt.`)){
    return;
  }
  status.style.color = 'var(--text-2)';
  status.textContent = `Bezig met verwijderen van ${toDelete.length} speler${toDelete.length===1?'':'s'}...`;
  let ok = 0, fail = 0;
  for(const p of toDelete){
    try { await deletePlayer(p.id); ok++; }
    catch(e){ fail++; }
  }
  if(ok > 0){
    status.style.color = 'var(--green)';
    status.textContent = `${ok} speler${ok===1?'':'s'} verwijderd${fail?` · ${fail} mislukt`:''}.`;
    toast(`${ok} speler${ok===1?'':'s'} verwijderd`);
    setTimeout(()=>{
      closePlayerBulkDeleteModal();
      if(typeof renderDB === 'function') renderDB();
    }, 900);
  } else {
    status.style.color = 'var(--red)';
    status.textContent = `Verwijderen mislukt.`;
  }
}

/* =============== INIT =============== */
function initApp(){
  if (window.location.hostname.includes('cloudworkstations.dev')) {
        window.go && window.go('dashboard');
    }

  if(appInitialized) return;
  if (window.location.hostname.includes('cloudworkstations.dev')) {
        setTimeout(() => { if (typeof go === 'function') go('dashboard'); }, 200);
    }

  appInitialized = true;

  // Mobile drawer toggle
  const sidebarEl = $('#sidebar');
  const backdropEl = $('#sidebar-backdrop');
  const burgerEl = $('#burger-btn');
  function openDrawer(){
    if(!sidebarEl) return;
    sidebarEl.classList.add('open');
    if(backdropEl) backdropEl.classList.add('show');
    if(burgerEl) burgerEl.setAttribute('aria-expanded','true');
  }
  function closeDrawer(){
    if(!sidebarEl) return;
    sidebarEl.classList.remove('open');
    if(backdropEl) backdropEl.classList.remove('show');
    if(burgerEl) burgerEl.setAttribute('aria-expanded','false');
  }
  if(burgerEl){
    burgerEl.addEventListener('click', ()=>{
      if(sidebarEl && sidebarEl.classList.contains('open')) closeDrawer();
      else openDrawer();
    });
  }
  if(backdropEl) backdropEl.addEventListener('click', closeDrawer);

  $$('.nav-item').forEach(b=>{
    b.addEventListener('click', ()=> go(b.dataset.view));
    b.addEventListener('click', ()=>{ if(window.innerWidth <= 900) closeDrawer(); });
  });
  // Bottom tab nav (mobile) — view-knoppen + 'Meer' opent drawer
  $$('#bottom-nav .bn-item').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.action === 'menu'){
        if(typeof openDrawer === 'function') openDrawer();
        else if(burgerEl) burgerEl.click();
        return;
      }
      if(b.dataset.view) go(b.dataset.view);
    });
  });
  // Tap logo/title to go home
  const mtHome = $('#mt-home');
  if(mtHome) mtHome.addEventListener('click', ()=> go('dashboard'));
  $$('[data-go]').forEach(b=>{
    b.addEventListener('click', ()=> go(b.dataset.go));
  });
  $('#logout-btn').addEventListener('click', ()=> doLogout(false));

  /* Settings modal — open/sluit via event delegation (timing-proof) */
  /* (handlers staan onderaan via document.addEventListener) */

  buildGradePickers();
  shUpdateCmpUI();
  refreshPositionDropdowns();
  $('#f-linie').addEventListener('change', refreshPositionDropdowns);
  $('#f-club').addEventListener('blur', async ()=>{
    const plaatsEl = $('#f-plaats');
    const adresEl  = $('#f-adres');
    const raw = ($('#f-club').value || '').trim();
    if(!raw) return;
    // s35e: normaliseer Club zelf naar canonieke adresboek-naam, en spiegel met die naam
    try {
      const ciPre = (typeof window.findClubInfo === 'function') ? window.findClubInfo(raw) : null;
      if(ciPre && ciPre.naam && $('#f-club').value !== ciPre.naam){
        $('#f-club').value = ciPre.naam;
      }
      // s35ao (#3 decoupling): club->thuis mirror uitgezet
      if(false){
        const thuisEl = $('#f-w-thuis');
        if(thuisEl){
          const mirrorVal = (ciPre && ciPre.naam) ? ciPre.naam : raw;
          const cur = (thuisEl.value || '').trim();
          let safeToOverwrite = !cur;
          if(!safeToOverwrite){
            try {
              const curInfo = (typeof window.findClubInfo === 'function') ? window.findClubInfo(cur) : null;
              if(curInfo) safeToOverwrite = true;
            } catch(_){}
          }
          if(safeToOverwrite && cur !== mirrorVal){
            thuisEl.value = mirrorVal;
            thuisEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    } catch(_){}
    const raw2 = ($('#f-club').value || '').trim();
    const key = raw2.toLowerCase();
    // v70h-s35a: directe lookup via findClubInfo (CLUB_ADRESSEN + HV_CLUBS) heeft voorrang
    if(typeof window.findClubInfo === 'function'){
      const ci = window.findClubInfo(raw2);
      if(ci){
        if(plaatsEl && !plaatsEl.value.trim() && ci.plaats) plaatsEl.value = ci.plaats;
        if(adresEl && !adresEl.value.trim()){
          const parts = [ci.sportpark, ci.adres, ci.postcode].filter(Boolean);
          if(parts.length) adresEl.value = parts.join(' \u00b7 ');
        }
      }
    }
    const plaatsFilled = plaatsEl.value.trim();
    const adresFilled  = adresEl && adresEl.value.trim();
    // 1. Snelle hardcoded match (alleen plaats)
    if(!plaatsFilled && CLUB_CITY[key]) plaatsEl.value = CLUB_CITY[key];
    // 2. Local cache
    if(!plaatsEl.value.trim() && _clubCache && _clubCache[key]) plaatsEl.value = _clubCache[key];
    if(adresEl && !adresFilled && _clubAddrCache && _clubAddrCache[key]) adresEl.value = _clubAddrCache[key];
    // Als beide al gevuld zijn: niets meer doen
    if(plaatsEl.value.trim() && adresEl && adresEl.value.trim()) return;
    // 3. Live Nominatim lookup (auto-geocode, gratis, geen API key)
    try {
      if(!plaatsEl.value.trim()) plaatsEl.setAttribute('placeholder', 'Plaats wordt opgezocht…');
      if(adresEl && !adresEl.value.trim()) adresEl.setAttribute('placeholder', 'Adres wordt opgezocht…');
      const city = await lookupClubCity(raw);
      if(city && !plaatsEl.value.trim()){
        plaatsEl.value = city;
        scheduleGeoRerender();
      }
      if(adresEl && !adresEl.value.trim() && _clubAddrCache[key]){
        adresEl.value = _clubAddrCache[key];
      }
      if(city || (adresEl && adresEl.value.trim())){
        const msg = adresEl && adresEl.value.trim() ? `Adres gevonden: ${adresEl.value}` : `Plaats gevonden: ${city}`;
        toast(msg);
      } else {
        toast('Geen adres gevonden — handmatig invullen graag.');
      }
    } catch(_){} finally {
      plaatsEl.setAttribute('placeholder', 'Automatisch ingevuld vanuit club');
      if(adresEl) adresEl.setAttribute('placeholder', 'Bijv. Sportlaan 12, 1234 AB Amsterdam');
    }
  });
  $('#report-form').addEventListener('submit', submitReport);
  $('#report-form').addEventListener('input', ()=> { setDirty(true); try{ shSyncNietGerapporteerdUI(); }catch(_){} });
  $('#f-niet-gerapporteerd')?.addEventListener('change', ()=> { try{ shSyncNietGerapporteerdUI(); }catch(_){} });
  // s35ao (#3 decoupling): thuis->club mirror uitgezet
  if(false) try {
    const thuisInp = $('#f-w-thuis');
    if(thuisInp){
      thuisInp.addEventListener('blur', ()=>{
        const raw = (thuisInp.value || '').trim();
        if(!raw) return;
        const clubEl   = $('#f-club');
        const plaatsEl = $('#f-plaats');
        const adresEl  = $('#f-adres');
        let info = null;
        try { if(typeof window.findClubInfo === 'function') info = window.findClubInfo(raw); } catch(_){}
        // s35e: normaliseer Thuisspelende ploeg zelf naar canonieke naam
        if(info && info.naam && thuisInp.value !== info.naam){
          thuisInp.value = info.naam;
        }
        // s35e: Club spiegelt mee — overschrijf óók als oude waarde een bekende club was
        if(clubEl){
          const canonical = (info && info.naam) ? info.naam : raw;
          const cur = (clubEl.value || '').trim();
          let safeToOverwrite = !cur;
          if(!safeToOverwrite){
            try {
              const curInfo = (typeof window.findClubInfo === 'function') ? window.findClubInfo(cur) : null;
              if(curInfo) safeToOverwrite = true;
            } catch(_){}
          }
          if(safeToOverwrite && cur !== canonical){
            clubEl.value = canonical;
            clubEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        if(info){
          if(plaatsEl && !plaatsEl.value.trim() && info.plaats){
            plaatsEl.value = info.plaats;
            plaatsEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if(adresEl && !adresEl.value.trim()){
            const parts = [info.sportpark, info.adres, info.postcode].filter(Boolean);
            if(parts.length){
              adresEl.value = parts.join(' \u00b7 ');
              adresEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }
      });
    }
  } catch(_){}
  $('#report-form').addEventListener('change', ()=> setDirty(true));
  $('#report-form').addEventListener('click', (e)=>{
    if(e.target.classList && e.target.classList.contains('grade-pick')) setDirty(true);
  });
  // s35as hotfix: #report-clear is in #227 verwijderd — null-check toegevoegd
  const _clearBtn = $('#report-clear');
  if(_clearBtn){
    _clearBtn.addEventListener('click', ()=>{
      if(!confirmDiscard()) return;
      resetReportForm();
    });
  }
  $('#report-cancel').addEventListener('click', ()=>{
    if(!confirmDiscard()) return;
    resetReportForm();
    go('dashboard');
  });

  ['filter-search','filter-position','filter-current','filter-potential','filter-advies','filter-period'].forEach(id=>{
    const handler = () => { _dbPage = 1; applyFilters(); }; // v70h-s25: reset bij filter-change
    $('#'+id).addEventListener('input', handler);
    $('#'+id).addEventListener('change', handler);
  });
  // v70h-s27: linker Vergelijken-knop
  const _cmpFilterBtn = document.getElementById('db-compare-filter-btn');
  if(_cmpFilterBtn){
    _cmpFilterBtn.addEventListener('click', () => {
      if(_cmpFilterBtn.disabled) return;
      const max = (typeof CMP_MAX === 'number') ? CMP_MAX : 6;
      if(dbCheckedIds.length < 2) return;
      cmpSelectedIds = dbCheckedIds.slice(0, max);
      shUpdateCmpUI();
      dbCheckedIds = [];
      go('compare');
    });
  }
  updateDbCompareFilterBtn();

  ['match-search','match-age','match-sort'].forEach(id=>{
    const el = $('#'+id);
    if(el){
      el.addEventListener('input', renderMatches);
      el.addEventListener('change', renderMatches);
    }
  });

  $('#export-btn').addEventListener('click', exportJSON);

  $('#import-btn').addEventListener('click', openImportModal);
  $('#import-close').addEventListener('click', closeImportModal);
  $('#import-cancel').addEventListener('click', closeImportModal);
  $('#import-go').addEventListener('click', runImport);
  $('#import-file-btn').addEventListener('click', ()=> $('#import-file').click());
  $('#import-file').addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    $('#import-file-name').textContent = file.name;
    try {
      const text = await file.text();
      $('#import-text').value = text;
      const status = $('#import-status');
      status.style.color = 'var(--text-2)';
      status.textContent = `Bestand geladen (${file.name}). Klik op Importeren.`;
    } catch(err) {
      const status = $('#import-status');
      status.style.color = '#ef4444';
      status.textContent = 'Bestand kon niet gelezen worden.';
    }
  });
  $('#import-backdrop').addEventListener('click', e=>{
    if(e.target.id === 'import-backdrop') closeImportModal();
  });

  // Match-report import
  $('#match-report-import-btn')?.addEventListener('click', openMatchReportImportModal);
  $('#mreport-import-close')?.addEventListener('click', closeMatchReportImportModal);
  $('#mreport-import-cancel')?.addEventListener('click', closeMatchReportImportModal);
  $('#mreport-import-go')?.addEventListener('click', runMatchReportImport);
  $('#mreport-import-file-btn')?.addEventListener('click', ()=> $('#mreport-import-file').click());
  $('#mreport-import-file')?.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    $('#mreport-import-file-name').textContent = file.name;
    try {
      const text = await file.text();
      $('#mreport-import-text').value = text;
      const status = $('#mreport-import-status');
      status.style.color = 'var(--text-2)';
      status.textContent = `Bestand geladen (${file.name}). Klik op Importeren.`;
    } catch(err) {
      const status = $('#mreport-import-status');
      status.style.color = '#ef4444';
      status.textContent = 'Bestand kon niet gelezen worden.';
    }
  });
  $('#mreport-import-backdrop')?.addEventListener('click', e=>{
    if(e.target.id === 'mreport-import-backdrop') closeMatchReportImportModal();
  });

  // Match-report bulk delete (via import-JSON)
  $('#match-report-bulk-delete-btn')?.addEventListener('click', openMatchReportBulkDeleteModal);
  $('#mreport-bulkdel-close')?.addEventListener('click', closeMatchReportBulkDeleteModal);
  $('#mreport-bulkdel-cancel')?.addEventListener('click', closeMatchReportBulkDeleteModal);
  $('#mreport-bulkdel-go')?.addEventListener('click', runMatchReportBulkDelete);
  $('#mreport-bulkdel-file-btn')?.addEventListener('click', ()=> $('#mreport-bulkdel-file').click());
  $('#mreport-bulkdel-file')?.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    $('#mreport-bulkdel-file-name').textContent = file.name;
    try {
      const text = await file.text();
      $('#mreport-bulkdel-text').value = text;
      const status = $('#mreport-bulkdel-status');
      status.style.color = 'var(--text-2)';
      status.textContent = `Bestand geladen (${file.name}). Klik op Verwijderen.`;
    } catch(err) {
      const status = $('#mreport-bulkdel-status');
      status.style.color = '#ef4444';
      status.textContent = 'Bestand kon niet gelezen worden.';
    }
  });
  $('#mreport-bulkdel-backdrop')?.addEventListener('click', e=>{
    if(e.target.id === 'mreport-bulkdel-backdrop') closeMatchReportBulkDeleteModal();
  });

  // Player bulk delete (via import-JSON)
  $('#player-bulk-delete-btn')?.addEventListener('click', openPlayerBulkDeleteModal);
  $('#player-bulkdel-close')?.addEventListener('click', closePlayerBulkDeleteModal);
  $('#player-bulkdel-cancel')?.addEventListener('click', closePlayerBulkDeleteModal);
  $('#player-bulkdel-go')?.addEventListener('click', runPlayerBulkDelete);
  $('#player-bulkdel-file-btn')?.addEventListener('click', ()=> $('#player-bulkdel-file').click());
  $('#player-bulkdel-file')?.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    $('#player-bulkdel-file-name').textContent = file.name;
    try {
      const text = await file.text();
      $('#player-bulkdel-text').value = text;
      const status = $('#player-bulkdel-status');
      status.style.color = 'var(--text-2)';
      status.textContent = `Bestand geladen (${file.name}). Klik op Verwijderen.`;
    } catch(err) {
      const status = $('#player-bulkdel-status');
      status.style.color = '#ef4444';
      status.textContent = 'Bestand kon niet gelezen worden.';
    }
  });
  $('#player-bulkdel-backdrop')?.addEventListener('click', e=>{
    if(e.target.id === 'player-bulkdel-backdrop') closePlayerBulkDeleteModal();
  });

  $('#modal-close').addEventListener('click', closeDetail);
  $('#modal-backdrop').addEventListener('click', e=>{
    if(e.target.id === 'modal-backdrop') closeDetail();
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
      closeDetail();
      closeImportModal();
      closeMatchReportImportModal();
      closeMatchReportBulkDeleteModal();
      closePlayerBulkDeleteModal();
      closePlayerPicker();
      closeContactModal();
      closeMatchReportModal();
      closeTipModal();
    }
  });

  // Analyses list
  $('#new-analysis-btn').addEventListener('click', createNewAnalysis);

  // Analysis detail navigation
  $('#analysis-back-btn').addEventListener('click', ()=>{
    currentAnalysisId = null;
    selectedPitchPos = null;
    renderAnalysesList();
  });
  $('#analysis-delete-btn').addEventListener('click', async ()=>{
    if(!currentAnalysisId) return;
    if(confirm('Deze analyse verwijderen? Dit kan niet ongedaan gemaakt worden.')){
      const id = currentAnalysisId;
      currentAnalysisId = null;
      selectedPitchPos = null;
      await deleteAnalysis(id);
      renderAnalysesList();
      toast('Analyse verwijderd');
    }
  });

  // Header field inputs — save on change
  ['a-club','a-leeftijd','a-seizoen','a-datum'].forEach(id=>{
    const key = id.slice(2); // strip "a-"
    $('#'+id).addEventListener('change', async e=>{
      const a = currentAnalysis(); if(!a) return;
      await patchAnalysis({[key]: e.target.value});
      // Update title without full re-render to avoid losing focus
      const title = [$('#a-club').value, $('#a-leeftijd').value].filter(Boolean).join(' · ') || 'Nieuwe analyse';
      $('#analysis-detail-title').textContent = title;
      $('#analysis-detail-sub').textContent =
        [$('#a-seizoen').value, $('#a-formation').value].filter(Boolean).join(' · ') || '—';
    });
  });
  $('#a-formation').addEventListener('change', e=> changeFormation(e.target.value));

  // Picker modal
  $('#picker-close').addEventListener('click', closePlayerPicker);
  $('#picker-backdrop').addEventListener('click', e=>{
    if(e.target.id === 'picker-backdrop') closePlayerPicker();
  });
  $('#picker-search').addEventListener('input', e=> renderPickerList(e.target.value));

  // Contacts
  $('#contact-new-btn')?.addEventListener('click', ()=> openContactModal());
  $('#contact-close')?.addEventListener('click', () => _shGuardClose('contact', closeContactModal));
  $('#contact-cancel')?.addEventListener('click', () => _shGuardClose('contact', closeContactModal));
  $('#contact-backdrop')?.addEventListener('click', e=>{
    if(e.target.id === 'contact-backdrop') _shGuardClose('contact', closeContactModal);
  });
  $('#contact-form')?.addEventListener('input', () => _shMarkDirty('contact')); // s91
  $('#contact-form')?.addEventListener('change', () => _shMarkDirty('contact')); // s91
  $('#contact-form')?.addEventListener('submit', submitContactForm);
  // Auto-format NL telefoonnummer: "(+316) XX XX XX XX"
  $('#c-tel')?.addEventListener('input', e => {
    const el = e.target;
    el.value = formatNLPhone(el.value);
    requestAnimationFrame(() => { try { el.setSelectionRange(el.value.length, el.value.length); } catch(_){} });
  });
  $('#c-tel')?.addEventListener('focus', e => {
    if(!e.target.value || e.target.value.replace(/\D/g,'') === '') e.target.value = '(+316) ';
    requestAnimationFrame(() => { try { e.target.setSelectionRange(e.target.value.length, e.target.value.length); } catch(_){} });
  });
  $('#contact-delete')?.addEventListener('click', async ()=>{
    const id = $('#c-id').value;
    if(!id) return;
    const c = contactsCache.find(x => x.id === id);
    const naam = c?.naam || 'dit contact';
    if(!confirm(`Weet je zeker dat je ${naam} wilt verwijderen?`)) return;
    try {
      await deleteContact(id);
      closeContactModal();
      toast('Contact verwijderd');
    } catch(_) {}
  });
  $('#contact-search')?.addEventListener('input', renderContacts);
  $('#contact-sort')?.addEventListener('change', renderContacts);

  // Wire club-AC en elftal-AC op alle velden met data-picker attribuut
  try {
    // Club autocomplete op alle [data-picker="club"] inputs
    document.querySelectorAll('[data-picker="club"]').forEach(el => {
      if(!el._shClubACWired && typeof shWireClubAC === 'function'){
        shWireClubAC(el);
        el._shClubACWired = true;
      }
    });
    // Elftal autocomplete op alle [data-picker="elftal"] inputs
    document.querySelectorAll('[data-picker="elftal"]').forEach(el => {
      if(!el._shElftalACWired && typeof shWireLeeftijdAC === 'function'){
        shWireLeeftijdAC(el);
        el._shElftalACWired = true;
      }
    });
    // Zorg dat datalist element bestaat voor native browser fallback
    if(!document.getElementById('club-suggestions')){
      const dl = document.createElement('datalist');
      dl.id = 'club-suggestions';
      document.body.appendChild(dl);
      if(typeof fillClubDatalist === 'function') fillClubDatalist();
    }
  } catch(_){}
}

// ── shAC — Universele autocomplete engine ────────────────────────────────────
window.shAC = (function(){
  let _inp = null, _items = [], _cb = null, _sel = -1;
  let _box = null;

  function _ensureBox(){
    if(_box && document.body.contains(_box)) return;
    _box = document.createElement('div');
    _box.className = 'sh-ac-box';
    _box.style.cssText = 'position:fixed;z-index:99999;background:var(--bg-card,#1a1e2e);border:1px solid var(--border,#2a2f45);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.45);overflow:hidden;max-height:240px;overflow-y:auto;min-width:200px;';
    document.body.appendChild(_box);
    _box.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-ac-idx]');
      if(li){ e.preventDefault(); _pick(+li.dataset.acIdx); }
    });
  }

  function _pos(){
    if(!_inp || !_box) return;
    const r = _inp.getBoundingClientRect();
    _box.style.left = r.left + 'px';
    _box.style.top  = (r.bottom + 2) + 'px';
    _box.style.width = Math.max(r.width, 220) + 'px';
  }

  function _render(){
    if(!_box) return;
    _box.innerHTML = _items.map((it,i) => {
      const primary = escapeHtml(it.primary || it.label || '');
      const secondary = it.secondary ? `<div style="font-size:11px;color:var(--text-2,#9aa3b7);margin-top:1px;">${escapeHtml(it.secondary)}</div>` : '';
      const bg = i === _sel ? 'background:var(--hover,#1e2236);' : '';
      return `<div data-ac-idx="${i}" style="padding:9px 14px;cursor:pointer;${bg}" onmouseover="this.style.background='var(--hover,#1e2236)'" onmouseout="this.style.background='${i===_sel?'var(--hover,#1e2236)':''}'">
        <div style="font-size:14px;color:var(--text-1,#e2e8f0);font-weight:500;">${primary}</div>${secondary}
      </div>`;
    }).join('');
  }

  function _pick(idx){
    if(idx < 0 || idx >= _items.length) return;
    if(_cb) _cb(_items[idx]);
    _close();
  }

  function _close(){
    _sel = -1;
    _items = [];
    _inp = null;
    _cb = null;
    if(_box){ _box.innerHTML = ''; _box.style.display = 'none'; }
  }

  return {
    show(input, items, cb){
      _ensureBox();
      _inp = input; _items = items; _cb = cb; _sel = -1;
      _box.style.display = 'block';
      _pos();
      _render();
    },
    close: _close,
    onKey(e){
      if(!_items.length) return false;
      if(e.key === 'ArrowDown'){ _sel = Math.min(_sel+1, _items.length-1); _render(); return true; }
      if(e.key === 'ArrowUp'){ _sel = Math.max(_sel-1, -1); _render(); return true; }
      if(e.key === 'Enter' && _sel >= 0){ _pick(_sel); return true; }
      if(e.key === 'Escape'){ _close(); return true; }
      return false;
    }
  };
  window.addEventListener('resize', () => { if(_inp) _close(); }, true);
})();

function shWireClubAC(input){
  if(!input) return;
  input.setAttribute('autocomplete','off');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if(!q){ window.shAC?.close(); return; }
    const clubs = (typeof HV_CLUBS !== 'undefined') ? HV_CLUBS : [];
    const startsWith = [], contains = [];
    for(const c of clubs){
      if(!c.naam) continue;
      const n = c.naam.toLowerCase();
      const keys = c.keys||[];
      if(n.startsWith(q) || keys.some(k => k.startsWith(q))) startsWith.push(c);
      else if(n.includes(q) || keys.some(k => k.includes(q))) contains.push(c);
    }
    const merged = [...startsWith, ...contains].slice(0, 12);
    if(!merged.length){ window.shAC?.close(); return; }
    const items = merged.map(c => ({label: c.naam, primary: c.naam, secondary: [c.plaats, c.sportpark].filter(Boolean).join(' · ')}));
    window.shAC?.show(input, items, item => { input.value = item.label; input.dispatchEvent(new Event('change', {bubbles:true})); });
  });
  input.addEventListener('keydown', e => { if(window.shAC?.onKey(e)) e.preventDefault(); });
  input.addEventListener('blur', () => setTimeout(() => window.shAC?.close(), 150));
}
function shUpgradeSelectToAC(id){ /* no-op */ }
const _SH_ELFTALLEN = (function(){ const out = []; for(let age=8;age<=23;age++){ const max=10; for(let nr=1;nr<=max;nr++) out.push('O.'+age+'-'+nr); } return out; })();
function shWireLeeftijdAC(input){
  if(!input) return;
  input.setAttribute('autocomplete','off');
  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if(!raw){ window.shAC?.close(); return; }
    // Typed a number like "8","10","15" -> exact age match
    const numMatch = raw.match(/^(\d{1,2})(-(\d{1,2}))?$/);
    let matches;
    if(numMatch){
      const age = parseInt(numMatch[1]);
      const teamNr = numMatch[3] ? parseInt(numMatch[3]) : null;
      if(age >= 8 && age <= 23){
        matches = _SH_ELFTALLEN.filter(e => {
          const parts = e.split(/[.\-]/); // ["O","8","1"]
          if(parseInt(parts[1]) !== age) return false;
          if(teamNr !== null) return parseInt(parts[2]) === teamNr;
          return true;
        });
      } else { matches = []; }
    } else {
      // Text like "O.8", "O.8-1", "o8" etc
      const q = raw.toLowerCase().replace(/[\s.]/g, '');
      matches = _SH_ELFTALLEN.filter(e => {
        const n = e.toLowerCase().replace(/[\s.]/g, '');
        return n.startsWith(q);
      });
    }
    matches = matches.slice(0, 12);
    if(!matches.length){ window.shAC?.close(); return; }
    window.shAC?.show(input, matches.map(e=>({label:e,primary:e,secondary:''})), item => {
      input.value = item.label;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    });
  });
  input.addEventListener('keydown', e => { if(window.shAC?.onKey(e)) e.preventDefault(); });
  input.addEventListener('blur', () => setTimeout(() => window.shAC?.close(), 150));
}
function switchMatchesSubview(sub){
  const btn = document.getElementById('msv-'+sub);
  document.querySelectorAll('.msv-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  if(sub === 'wedstrijden' && typeof renderMatchReports === 'function') renderMatchReports();
}
window.switchMatchesSubview = switchMatchesSubview;

// ── Intro overlay dismiss ────────────────────────────────────────────────────
(function setupIntro(){
  var _dismissed = false;
  function dismiss(){
    if(_dismissed) return;
    _dismissed = true;
    var overlay = document.getElementById('intro-overlay');
    if(!overlay) return;
    overlay.classList.add('intro-gone');
  }
  function wire(){
    var overlay = document.getElementById('intro-overlay');
    if(!overlay){ setTimeout(dismiss, 100); return; }
    // Dismiss op elke interactie: click, touch, keydown
    overlay.addEventListener('click', dismiss);
    document.addEventListener('keydown', dismiss, {once: true});
    document.addEventListener('touchstart', dismiss, {once: true, passive: true});
    // Auto-dismiss na 3 seconden
    setTimeout(dismiss, 3000);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

// s35cg: laad gebruikersrol vanuit Firestore (coordinator/admin check)
async function loadUserRole(){
  try {
    if(!currentUser) return;
    const { getFirestore, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const db = getFirestore();
    const snap = await getDoc(doc(db, 'users', currentUser.uid));
    const role = snap.exists() ? (snap.data().role || 'scout') : 'scout';
    window._shUserRole = role;
    // Coordinator-features tonen/verbergen
    document.querySelectorAll('[data-role-min="coordinator"]').forEach(el => {
      el.style.display = (role === 'coordinator' || role === 'admin') ? '' : 'none';
    });
  } catch(_){
    // Geen rol-data beschikbaar — geen probleem, app werkt als standaard scout
    window._shUserRole = 'scout';
  }
}
window.loadUserRole = loadUserRole;

onAuthStateChanged(auth, async (user) => {
  if(user){
    currentUser = user;
    try {
      await initApp();
      subscribeData();
      showApp();
      go('dashboard');
      loadUserRole();
    } catch(err){
      console.error('Bootstrap fout:', err);
      const errEl = document.getElementById('login-error');
      if(errEl) errEl.textContent = 'Laad-fout: ' + (err && err.message ? err.message : String(err));
      showLogin();
    }
  } else {
    currentUser = null;
    showLogin();
  }
});

/* Scouting Platform — Service Worker
   Bump CACHE_VERSION whenever you ship a new index.html so users get the latest. */
const CACHE_VERSION = 'sh-v414-teams-programma-afronden';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-rt`;

const CORE_ASSETS = [
  './',
  './index.html',
  './handleiding.html',
  './privacy.html',
  './voorwaarden.html',
  'screenshot-login.png',
  'screenshot-dashboard.png',
  'screenshot-sidebar.png',
  'screenshot-obs-chips.png',
  'screenshot-vormtrend.png',
  'screenshot-vergelijken.png',
  'screenshot-elftal-analyse.png',
  'screenshot-ritten.png',
  'lp-shot-dashboard.jpg',
  './app.min.js',
  './clubs-data.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => {
        // cache:'reload' omzeilt browser HTTP-cache zodat SW echt verse bytes pakt.
        const reqs = CORE_ASSETS.map((u) => new Request(u, { cache: 'reload' }));
        return Promise.all(reqs.map((r) => fetch(r).then((res) => cache.put(r, res)).catch(()=>{})));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim()).then(() => {
      // Stuur alle open tabs een reload-signaal zodat nieuwe app.js geladen wordt
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    })
  );
});

// Prompt 12 — wedstrijd-schema voor best-effort periodic sync (in runtime-cache).
let _shSchedule = null;
async function _shStoreSchedule(data){
  _shSchedule = data;
  try {
    const c = await caches.open(RUNTIME_CACHE);
    await c.put('sh-schedule.json', new Response(JSON.stringify(data || {}), { headers: { 'Content-Type': 'application/json' } }));
  } catch(_){}
}
async function _shReadSchedule(){
  if (_shSchedule) return _shSchedule;
  try {
    const c = await caches.open(RUNTIME_CACHE);
    const r = await c.match('sh-schedule.json');
    if (r) return await r.json();
  } catch(_){}
  return null;
}

self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (d.type === 'SH_SHOW_NOTIFICATION') {
    event.waitUntil(self.registration.showNotification(d.title || 'ScoutingHub', {
      body: d.body || '', icon: './icon-192.png', badge: './icon-192.png',
      tag: (d.data && d.data.tag) || 'sh-match', data: d.data || {}
    }));
    return;
  }
  if (d.type === 'SH_SET_SCHEDULE') { event.waitUntil(_shStoreSchedule(d)); return; }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.focus(); } catch(_){} try { c.postMessage({ type: 'SH_OPEN_MATCH', data }); } catch(_){} return; }
    }
    if (self.clients.openWindow) {
      const url = './' + (data.tid ? ('#match=' + encodeURIComponent(data.tid) + ':' + encodeURIComponent(data.matchId || '')) : '');
      await self.clients.openWindow(url);
    }
  })());
});

// Best-effort periodic sync. Browsers throttelen dit zwaar (min. ~uren), dus
// GEEN garantie op exact "5 min vooraf". Voor gegarandeerde levering bij
// gesloten app is server-side FCM nodig (zie oplevering).
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'sh-match-reminders') return;
  event.waitUntil((async () => {
    const sched = await _shReadSchedule();
    if (!sched || !sched.enabled || !Array.isArray(sched.matches)) return;
    const now = new Date();
    if (sched.day && sched.day !== now.toISOString().slice(0,10)) return;
    const nowMin = now.getHours()*60 + now.getMinutes();
    const mins = sched.minutes || 5;
    for (const m of sched.matches) {
      const mm = String(m.time||'').match(/^(\d{2}):(\d{2})$/);
      if (!mm) continue;
      const diff = ((+mm[1])*60 + (+mm[2])) - nowMin;
      if (diff >= 0 && diff <= mins) {
        await self.registration.showNotification('⚽ Wedstrijd begint zo!', {
          body: (m.teams || '') + (m.field ? ' op ' + m.field : '') + ' — over ' + diff + ' min',
          icon: './icon-192.png', badge: './icon-192.png', tag: 'sh-match-' + m.id, data: { tid: m.tid, matchId: m.id }
        });
      }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip cross-origin Firebase / Firestore / Google requests — let them hit the network directly.
  if (url.origin !== self.location.origin &&
      /firebaseio|firestore|googleapis|gstatic|google\.com/.test(url.hostname)) {
    return;
  }

  // Network-first for navigations (HTML), so updates roll out quickly.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    event.respondWith(
      fetch(new Request(req, { cache: 'reload' })).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Network-first for JS/CSS so code updates always land immediately.
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(
      fetch(new Request(req, { cache: 'reload' })).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }
});
   

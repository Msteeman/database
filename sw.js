/* Scouting Platform — Service Worker
   Bump CACHE_VERSION whenever you ship a new index.html so users get the latest. */
const CACHE_VERSION = 'sh-v158-login-fix-cmp-functies-fix-debug-fn-dedup-merge-fix-debug-notities-notities-aggregated-notities-dropdown-notities-in-wedstrijden-notities-fix-databalk';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-rt`;

const CORE_ASSETS = [
  './',
  './index.html',
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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
   
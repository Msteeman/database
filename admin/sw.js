/* ScoutingHub Beheer — Service Worker (scope: /admin/)
   Apart van de scout-PWA (../sw.js): eigen cache, eigen scope.
   Bump CACHE_VERSION wanneer er een nieuwe admin/index.html komt. */
const CACHE_VERSION = 'sh-admin-v1';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-rt`;

const CORE_ASSETS = [
  '/admin/',
  '/admin/index.html',
  '/admin/manifest.webmanifest',
  '/admin/icon-192.png',
  '/admin/icon-512.png',
  '/admin/apple-touch-icon.png',
  '/app.js',
  '/style.css',
  '/clubs-data.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => {
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
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin (Firebase/Firestore/Google) altijd rechtstreeks naar netwerk.
  if (url.origin !== self.location.origin &&
      /firebaseio|firestore|googleapis|gstatic|google\.com/.test(url.hostname)) {
    return;
  }

  // Navigaties: network-first, val terug op admin-shell.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(new Request(req, { cache: 'reload' })).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('/admin/index.html')))
    );
    return;
  }

  // JS/CSS: network-first zodat updates direct landen.
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

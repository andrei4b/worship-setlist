/* service-worker.js — offline support (network-first for our own code) */

const CACHE_NAME = 'worship-planner-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/db.js',
  './js/utils.js',
  './js/songs.js',
  './js/setlists.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isSameOrigin = new URL(request.url).origin === self.location.origin;

  // Network-first for navigation and our own app code (js/css/html/manifest),
  // falling back to cache when offline. A stale cache-first strategy here is
  // what caused past fixes to not reach installed devices until the service
  // worker script itself changed — this way, updates land on the very next
  // online visit instead of being stuck behind a version bump.
  if (request.mode === 'navigate' || isSameOrigin) {
    event.respondWith(
      // cache: 'no-store' bypasses the browser's own HTTP cache, not just
      // ours — without it, "network-first" could still serve a stale
      // response the browser cached on a prior visit.
      fetch(request, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return res;
      }).catch(() => caches.match(request).then(r => r || (request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  // Cache-first for cross-origin assets (Google Fonts, etc.) — immutable
  // once fetched, so there's no freshness to chase and caching saves a round trip.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

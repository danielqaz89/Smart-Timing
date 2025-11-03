// Simple offline-first service worker for Smart Stempling
const CACHE_NAME = 'smart-stempling-v1';
const ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Navigation requests: network-first with offline fallback to cached '/'
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put('/', copy).catch(()=>{}));
        return res;
      }).catch(() => caches.match('/') || caches.match('/offline'))
    );
    return;
  }

  if (url.origin === location.origin) {
    // static/assets: stale-while-revalidate
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((networkRes) => {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return networkRes;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

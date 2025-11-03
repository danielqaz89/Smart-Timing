// Offline-first service worker with background sync for Smart Stempling
const CACHE_NAME = 'smart-stempling-v2';
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

  // API requests: network-first, cache API responses
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (req.method === 'GET' && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
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

// Background sync for offline log creation
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-logs') {
    event.waitUntil(syncPendingLogs());
  }
});

async function syncPendingLogs() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const pending = keys.filter(k => k.url.includes('__pending__'));
    
    for (const req of pending) {
      try {
        const res = await cache.match(req);
        const data = await res.json();
        const actualUrl = req.url.replace('__pending__', '');
        
        await fetch(actualUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        await cache.delete(req);
      } catch (e) {
        console.error('Sync failed for', req.url, e);
      }
    }
  } catch (e) {
    console.error('Background sync failed', e);
  }
}

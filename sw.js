
const CACHE_NAME = 'payper-v2';
const STATIC_CACHE = 'payper-static-v2';
const DYNAMIC_CACHE = 'payper-dynamic-v2';

// Static assets to cache immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,600;0,700;1,800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@100..700&display=swap'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - smart caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Supabase API calls - they need fresh data
  if (url.hostname.includes('supabase') || url.pathname.includes('/rest/v1')) {
    return; // Let the app handle API calls with its own offline logic
  }

  // For images - Cache First with network fallback
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Return a placeholder if image fails
          return new Response('', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
        });
      })
    );
    return;
  }

  // For scripts and styles - Stale While Revalidate
  if (event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // For everything else - Network first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.protocol === 'https:') {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('./index.html');
        });
      })
  );
});

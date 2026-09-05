// Kuik POS service worker — keeps the /pos terminal shell available offline.
// App shell + static assets are cached; data goes through the IndexedDB outbox
// (lib/pos/sync.ts), never the SW. Scope is limited to /pos.

const CACHE = 'kuik-pos-v2';
// Everything this worker is allowed to evict. Deleting by "not my current
// cache" would wipe the dashboard worker's cache on every activation — and it
// would return the favour. Two workers share this origin (see sw-app.js).
const OWNED_PREFIX = 'kuik-pos-';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(OWNED_PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase/CDN calls

  // Navigations: network-first (fresh deploys win), fall back to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep only plain 200 pages: replaying a redirected or error response
          // to a navigation is a network error in Chrome (see sw-app.js).
          if (res.ok && res.type === 'basic' && !res.redirected) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => {
          const usable = (r) => r && r.ok && !r.redirected;
          const hit = await caches.match(req);
          if (usable(hit)) return hit;
          const shell = await caches.match('/pos');
          return usable(shell) ? shell : Response.error();
        }),
    );
    return;
  }

  // Build assets: cache-first.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icon')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
  }
});

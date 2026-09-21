// Kuik POS service worker — keeps the /pos terminal shell available offline.
// App shell + static assets are cached; data goes through the IndexedDB outbox
// (lib/pos/sync.ts), never the SW. Scope is limited to /pos.

const CACHE = 'kuik-pos-v2';

// Offline with nothing cached: Kuik's own "Sin conexión" page with a retry,
// not Chrome's "This page couldn't load" (see sw-app.js).
const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kuik</title>
<style>body{margin:0;background:#111114;color:#fff;font:16px system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}main{padding:24px;max-width:360px}h1{font-size:20px;margin:0 0 8px}p{color:#a3a3a3;margin:0 0 20px}button{background:#fff;color:#000;border:0;border-radius:12px;padding:12px 22px;font-weight:600;font-size:15px}</style></head>
<body><main><h1>Sin conexión</h1><p>No se pudo abrir esta pantalla. Revisa el Wi-Fi o los datos y vuelve a intentar.</p><button onclick="location.reload()">Reintentar</button></main></body></html>`;
const offlinePage = () =>
  new Response(OFFLINE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

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
          return usable(shell) ? shell : offlinePage();
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

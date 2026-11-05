// Kuik POS service worker — keeps the /pos terminal available offline: the
// page, its scripts and styles, and every product photo it has shown. Data
// goes through the IndexedDB outbox (lib/pos/sync.ts), never the SW. Scope is
// limited to /pos.

const CACHE = 'kuik-pos-v2';
// Photos live in their own cache: they outlast a shell version, and they are
// the one thing here that needs a size limit.
const IMAGES = 'kuik-pos-img-v1';
// Room for a large menu at a couple of sizes each; the oldest go first.
const IMAGES_MAX = 1500;

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
        keys.filter((k) => k.startsWith(OWNED_PREFIX) && k !== CACHE && k !== IMAGES).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Product photos and category icons come from Supabase's CDN
  // (lib/image-loader.ts): the one cross-origin thing this worker keeps.
  if (url.hostname.endsWith('.supabase.co') && isPublicImage(url.pathname)) {
    event.respondWith(photo(req, url));
    return;
  }
  if (url.origin !== self.location.origin) return; // never touch other Supabase/CDN calls

  // Navigations: network-first (fresh deploys win), fall back to cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Keep only plain 200 pages: replaying a redirected or error response
          // to a navigation is a network error in Chrome (see sw-app.js).
          // The copy is taken NOW: once the response is handed to the browser
          // its body is in use, and a clone made later throws, so nothing
          // was ever stored.
          if (res.ok && res.type === 'basic' && !res.redirected) keep(CACHE, req, res.clone());
          return res;
        })
        .catch(async () => {
          const usable = (r) => r && r.ok && !r.redirected;
          const hit = await caches.match(req);
          if (usable(hit)) return hit;
          // Whichever /pos page is stored: the register is usually opened
          // with its branch in the query (/pos?branch=…).
          const shell = await caches.match('/pos', { ignoreSearch: true });
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
            if (res.ok) keep(CACHE, req, res.clone());
            return res;
          }),
      ),
    );
  }
});

/** Store a copy without holding up the answer; a failed write is not the page's problem. */
function keep(cacheName, req, copy) {
  caches
    .open(cacheName)
    .then((c) => c.put(req, copy))
    .catch(() => {});
}

// The page that registered this worker loaded its scripts and styles before
// the worker existed, so none of them passed through it. It sends their URLs
// (and its own) once the worker is in control, and they are stored here, so
// one visit with a network is enough to open the register without one.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const raw of data.urls.slice(0, 400)) {
        try {
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          const asset = url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icon');
          const page = url.pathname === '/pos' || url.pathname.startsWith('/pos/');
          if (!asset && !page) continue;
          if (await cache.match(url.href)) continue;
          const res = await fetch(url.href, { credentials: 'same-origin' });
          if (res.ok && res.type === 'basic' && !res.redirected) await cache.put(url.href, res);
        } catch {
          // one file that would not store does not stop the rest
        }
      }
    })(),
  );
});

// ── Photos ─────────────────────────────────────────────────────────────────

const OBJECT = '/storage/v1/object/public/';
const RENDER = '/storage/v1/render/image/public/';

function isPublicImage(pathname) {
  return pathname.startsWith(OBJECT) || pathname.startsWith(RENDER);
}

/** The stored object a URL points at, whatever size or route it was asked through. */
function objectKey(pathname) {
  if (pathname.startsWith(RENDER)) return pathname.slice(RENDER.length);
  if (pathname.startsWith(OBJECT)) return pathname.slice(OBJECT.length);
  return null;
}

/**
 * A photo: from the cache when it is there, else from the network and into
 * the cache, else any other size of the same photo.
 *
 * Every photo the register has shown once is kept, not only the ones a
 * precache asked for. A tile's own <img> request is no-cors, and its answer
 * would be opaque: unreadable, uncheckable, and charged to the storage quota
 * at several MB each. So the worker asks for the same URL with CORS instead
 * (the bucket answers `access-control-allow-origin: *`), which gives a
 * response it can verify and store, and hands that to the tile.
 *
 * The last step is what survives a rotated tablet or a resized window: the
 * tile then asks for a width that was never fetched, and without a network
 * the photo at another width is far better than a blank square.
 */
async function photo(req, url) {
  const cache = await caches.open(IMAGES);
  // Any cache: an earlier version of this worker kept photos beside the shell.
  const hit = (await cache.match(req.url, { ignoreVary: true })) || (await caches.match(req.url, { ignoreVary: true }));
  if (hit) return hit;
  try {
    const res = await fetch(req.url, {
      mode: 'cors',
      credentials: 'omit',
      // The same Accept the tile sent, so the CDN picks the same format.
      headers: { accept: req.headers.get('accept') || 'image/*' },
    });
    if (res.ok && res.type === 'cors') {
      // Stored before answering: a photo seen is a photo kept, even if the
      // tab closes right after.
      await cache.put(req.url, res.clone()).catch(() => {});
      trim(cache);
    }
    return res;
  } catch (err) {
    const other = await otherSize(cache, url);
    if (other) return other;
    throw err;
  }
}

/** The same photo at whatever size is cached: the widest, which scales down cleanly. */
async function otherSize(cache, url) {
  const key = objectKey(url.pathname);
  if (!key) return null;
  let best = null;
  let bestWidth = -1;
  for (const k of await cache.keys()) {
    const u = new URL(k.url);
    if (u.hostname !== url.hostname || objectKey(u.pathname) !== key) continue;
    // The untouched original counts as the widest there is.
    const width = u.pathname.startsWith(OBJECT) ? Infinity : Number(u.searchParams.get('width')) || 0;
    if (width > bestWidth) {
      best = k;
      bestWidth = width;
    }
  }
  return best ? cache.match(best, { ignoreVary: true }) : null;
}

let trimming = false;
/** Oldest entries out once the cache passes its limit (keys come in insertion order). */
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - IMAGES_MAX))) await cache.delete(k);
  } catch {
    // a failed trim only means the cache is a little over for now
  } finally {
    trimming = false;
  }
}

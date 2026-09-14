// Kuik dashboard service worker.
//
// Two jobs: keep the shell usable on a flaky venue wifi, and receive push
// notifications so a hostess learns about a booking without staring at a tab.
//
// Scope is the whole origin, because dashboard routes share no common prefix
// (/dashboard, /menu, /reservations…). That is safe alongside sw-pos.js: two
// registrations coexist and the MOST SPECIFIC matching scope controls a client,
// so /pos pages keep their own worker. This file still bails out of /pos
// requests explicitly, to cover the window before that worker activates.

const CACHE = 'kuik-app-v3';
// Only ever evict our own caches — see the matching note in sw-pos.js.
const OWNED_PREFIX = 'kuik-app-';

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

// What a navigation gets when the network is down and nothing is cached. A
// real page with a retry, in Kuik's words — returning Response.error() here
// hands the person Chrome's own "This page couldn't load" screen, which
// inside the phone app reads as the app being broken.
const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>Kuik</title>
<style>body{margin:0;background:#111114;color:#fff;font:16px system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}main{padding:24px;max-width:360px}h1{font-size:20px;margin:0 0 8px}p{color:#a3a3a3;margin:0 0 20px}button{background:#fff;color:#000;border:0;border-radius:12px;padding:12px 22px;font-weight:600;font-size:15px}</style></head>
<body><main><h1>Sin conexión</h1><p>No se pudo abrir esta pantalla. Revisa el Wi-Fi o los datos y vuelve a intentar.</p><button onclick="location.reload()">Reintentar</button></main></body></html>`;
const offlinePage = () =>
  new Response(OFFLINE_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

// In local development the worker exists only so push can be tested; caching
// anything would mean serving stale Turbopack bundles.
const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('fetch', (event) => {
  if (IS_DEV) return;

  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase/CDN calls
  if (url.pathname.startsWith('/pos')) return;     // sw-pos.js owns those
  if (url.pathname.startsWith('/api/')) return;    // never serve stale data

  // Navigations: network-first, so a fresh deploy always wins. Only a plain
  // 200 page is kept: a redirect (a server action switching restaurants, a
  // sign-out) must reach the browser untouched, and replaying a redirected or
  // error response to a navigation is itself a network error in Chrome — the
  // "This page couldn't load" screen.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic' && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const usable = (r) => r && r.ok && !r.redirected;
          const hit = await caches.match(req);
          if (usable(hit)) return hit;
          const shell = await caches.match('/reservations');
          return usable(shell) ? shell : offlinePage();
        }),
    );
    return;
  }

  // Build assets are content-hashed, so cache-first is safe.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
  }
});

// ── Push ────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  // Every push MUST show a notification: `userVisibleOnly` is mandatory, and a
  // silent one costs the origin its push permission.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || 'Kuik';
  const options = {
    body: data.body || '',
    // Same tag = a second update replaces the first rather than stacking.
    tag: data.tag || 'kuik',
    data: { url: data.url || '/reservations', ...(data.data || {}) },
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    // Safari/iOS reports maxActions === 0 and ignores these; Android shows them.
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
    requireInteraction: Boolean(data.requireInteraction),
  };

  // The icon's number: what is still waiting for a person, as counted by
  // the server when it sent the push.
  if (typeof data.badge === 'number' && 'setAppBadge' in self.navigator) {
    const p = data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge();
    if (p && p.catch) p.catch(() => {});
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const { notification, action } = event;
  notification.close();
  const data = notification.data || {};

  event.waitUntil(
    (async () => {
      // A service worker cannot invoke a Next server action — the action id is
      // a build artifact — so quick replies go through a real API route.
      if (action === 'accept' && data.orderId) {
        try {
          await fetch(`/api/orders/${data.orderId}/status`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-kuik-client': 'sw' },
            credentials: 'include',
            body: JSON.stringify({ status: 'preparing' }),
          });
        } catch {
          // Offline: fall through and just open the board.
        }
      }
      if (action && data.reservationId) {
        try {
          await fetch(`/api/reservations/${data.reservationId}/status`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-kuik-client': 'sw' },
            credentials: 'include',
            body: JSON.stringify({ status: action === 'confirm' ? 'confirmed' : 'cancelled' }),
          });
        } catch {
          // Offline: fall through and just open the page.
        }
      }

      const url = data.url || '/reservations';
      const section = data.orderId ? '/orders' : '/reservations';
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = clientList.find((c) => c.url.includes(section));
      if (open) {
        await open.focus();
        open.postMessage(data.orderId ? { type: 'kuik:order-updated', id: data.orderId } : { type: 'kuik:reservation-updated', id: data.reservationId });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Chrome fires this on rotation. Safari does not fire it reliably, which is
  // why the app also re-posts its subscription on every dashboard load.
  event.waitUntil(
    (async () => {
      try {
        const old = event.oldSubscription || (await self.registration.pushManager.getSubscription());
        const key = event.newSubscription
          ? null
          : old && old.options && old.options.applicationServerKey;
        const sub =
          event.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          }));
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-kuik-client': 'sw' },
          credentials: 'include',
          body: JSON.stringify({ subscription: sub, oldEndpoint: old ? old.endpoint : null }),
        });
      } catch {
        // Nothing useful to do here; the next dashboard load re-registers.
      }
    })(),
  );
});

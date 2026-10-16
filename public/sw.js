// Service worker. The server fills in CACHE (changes every deploy) and SHELL (the current
// hashed files), see src/assets.js.
//   /assets/ and /fonts/  cache first: the names contain a hash, so they never go stale.
//   pages                 network first (3 s), then the saved copy: still opens offline.
//   today's data (API)    network first, then the saved copy, so timings show offline.
const CACHE = 'rekha-dev';
const SHELL = ['/manifest.json', '/icon.svg', '/icons/icon-192.png'];
const DATA = /^\/api\/(meta|timings|panchang|calendar|horoscope|i18n\/[a-z]{2})(\?|$)/;
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); });
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
const save = (req, res) => { if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
function networkFirst(req, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const fallback = async () => {
      if (done) return; done = true;
      resolve((await caches.match(req)) || (req.mode === 'navigate' ? (await caches.match('/')) || Response.error() : Response.error()));
    };
    const timer = timeoutMs ? setTimeout(async () => { if (await caches.match(req)) fallback(); }, timeoutMs) : null;
    fetch(req).then((res) => { clearTimeout(timer); save(req, res); if (!done) { done = true; resolve(res); } }).catch(() => { clearTimeout(timer); fallback(); });
  });
}
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname === '/admin') return;
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => save(e.request, r))));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (DATA.test(url.pathname + url.search)) e.respondWith(networkFirst(e.request, 0));
    return; // sign-in, payments and readings always go to the network
  }
  e.respondWith(networkFirst(e.request, e.request.mode === 'navigate' ? 3000 : 0));
});

// Daily timing alerts (see src/push.js): show the notification, open Rekha when tapped.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Rekha', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Rekha', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.location.origin));
    return open ? open.navigate(url).then((c) => (c || open).focus()) : self.clients.openWindow(url);
  }));
});

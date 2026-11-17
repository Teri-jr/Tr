// 大回りジェネレータ: 電波のない区間でも開けるようにする Service Worker
// いつも先にネットへ取りに行き(更新がすぐ反映される)、つながらないときだけ前回の控えを返す。
const CACHE = 'oomawari-v3';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'data.js', 'engine.js', 'kiosk.html']).catch(() => {}))); });
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('oomawari-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (req.method !== 'GET' || (url.origin !== location.origin && !font) || url.pathname.endsWith('changelog.json')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      if (hit) return hit;
      throw err;
    }
  })());
});

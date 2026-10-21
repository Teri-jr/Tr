// 受験勉強 運行表: 通知用の最小 Service Worker
// iOS(ホーム画面に追加したWebアプリ)は registration.showNotification() でしか通知を出せないため、そのために置く。
// オフラインキャッシュはしない(index.html を更新したらすぐ反映されるように)。

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// 通知をタップしたら、開いているアプリを前面に出す(無ければ開く)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./index.html');
  })());
});

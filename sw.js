// StudyLine: 通知用の最小 Service Worker
// iOS(ホーム画面に追加したWebアプリ)は registration.showNotification() でしか通知を出せないため、そのために置く。
// オフラインキャッシュはしない(index.html を更新したらすぐ反映されるように)。

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// 閉じていても通知する(Webプッシュ): 自分の Cloudflare のプログラムから、決まった時刻に届く
// iOS は届いたら必ず通知を出す決まりなので、画面を見ているときも出して、すぐ消す(アプリの中で音と表示が出るため)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const seen = list.some(c => c.visibilityState === 'visible' && c.focused);
    const tag = d.tag || 'ttable-phase';
    await self.registration.showNotification(d.title || 'StudyLine', { body: d.body || '', tag, renotify: !seen, silent: seen, icon: 'icon-192.png', badge: 'icon-192.png' });
    if (seen) {
      await new Promise(r => setTimeout(r, 400));
      for (const n of await self.registration.getNotifications({ tag })) n.close();
    }
  })());
});

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

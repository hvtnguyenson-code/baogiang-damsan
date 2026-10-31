// Service Worker Web Push & Notification Click Handlers
// Authority: ADR-059, P5-056A, P5-020

self.addEventListener('push', (event) => {
  const payload = {
    title: 'Báo giảng Đam San',
    body: 'Bạn có thông báo mới trong ứng dụng.',
    clickUrl: '/thong-bao',
  };

  const options = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: {
      clickUrl: payload.clickUrl || '/thong-bao',
    },
    tag: 'baogiang-notification',
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = '/thong-bao';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetPath);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
    }),
  );
});


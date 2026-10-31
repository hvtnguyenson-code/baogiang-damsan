// Service Worker Web Push & Notification Click Handlers
// Authority: ADR-059, P5-056A, P5-020

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Báo giảng Đam San',
    body: 'Bạn có thông báo mới trong ứng dụng.',
    clickUrl: '/thong-bao',
  };

  if (event.data) {
    try {
      const data = event.data.json();
      if (data && typeof data === 'object') {
        payload = {
          title: data.title || payload.title,
          body: data.body || payload.body,
          clickUrl: data.clickUrl || payload.clickUrl,
        };
      }
    } catch {
      try {
        const text = event.data.text();
        if (text) {
          payload.body = text;
        }
      } catch {
        // Fallback to generic copy
      }
    }
  }

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
  const rawUrl = event.notification.data?.clickUrl || '/thong-bao';
  // Enforce same-origin relative URL only
  const targetPath =
    typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//')
      ? rawUrl
      : '/thong-bao';

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


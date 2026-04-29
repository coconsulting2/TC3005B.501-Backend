/**
 * Service Worker for Web Push Notifications (M3-006).
 * Listens for 'push' events and shows native OS notifications.
 */

/* eslint-disable no-restricted-globals */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "CocoAPI";
  const options = {
    body: data.body || "Tienes una nueva notificación",
    icon: data.icon || "/Logo.svg",
    badge: "/Logo.svg",
    vibrate: [100, 50, 100],
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

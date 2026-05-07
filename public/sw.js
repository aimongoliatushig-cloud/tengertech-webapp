const DEFAULT_URL = "/notifications";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const fallbackPayload = {
    title: "Хот тохижилтын ERP",
    body: "Шинэ мэдэгдэл ирлээ.",
    icon: "/icon.png",
    badge: "/apple-icon.png",
    url: DEFAULT_URL,
    tag: "municipal-notification",
  };

  let payload = fallbackPayload;
  if (event.data) {
    try {
      payload = { ...fallbackPayload, ...event.data.json() };
    } catch {
      payload = { ...fallbackPayload, body: event.data.text() };
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || fallbackPayload.icon,
    badge: payload.badge || fallbackPayload.badge,
    tag: payload.tag || fallbackPayload.tag,
    data: {
      url: payload.url || DEFAULT_URL,
      eventType: payload.eventType || "notification",
      createdAt: Date.now(),
    },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || DEFAULT_URL;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.includes(targetUrl)) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});

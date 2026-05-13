const DEFAULT_URL = "/notifications";
const BADGE_DB_NAME = "municipal-pwa-badge";
const BADGE_STORE_NAME = "badge-state";
const BADGE_COUNT_KEY = "unread-count";

function openBadgeDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in self)) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(BADGE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(BADGE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readBadgeCount() {
  const db = await openBadgeDb();
  if (!db) {
    return 0;
  }

  return new Promise((resolve) => {
    const transaction = db.transaction(BADGE_STORE_NAME, "readonly");
    const request = transaction.objectStore(BADGE_STORE_NAME).get(BADGE_COUNT_KEY);
    request.onsuccess = () => {
      const value = Number(request.result ?? 0);
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    };
    request.onerror = () => resolve(0);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function writeBadgeCount(count) {
  const db = await openBadgeDb();
  if (!db) {
    return;
  }

  await new Promise((resolve) => {
    const transaction = db.transaction(BADGE_STORE_NAME, "readwrite");
    const store = transaction.objectStore(BADGE_STORE_NAME);

    if (count > 0) {
      store.put(count, BADGE_COUNT_KEY);
    } else {
      store.delete(BADGE_COUNT_KEY);
    }

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

async function setAppBadgeSafely(count) {
  try {
    if (count > 0 && navigator && "setAppBadge" in navigator) {
      await navigator.setAppBadge(count);
      return;
    }
  } catch (error) {
    console.warn("[badge] navigator.setAppBadge failed:", error);
  }

  try {
    if (count > 0 && self.registration && "setAppBadge" in self.registration) {
      await self.registration.setAppBadge(count);
    }
  } catch (error) {
    console.warn("[badge] registration.setAppBadge failed:", error);
  }
}

async function clearAppBadgeSafely() {
  try {
    if (navigator && "clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
      return;
    }
  } catch (error) {
    console.warn("[badge] navigator.clearAppBadge failed:", error);
  }

  try {
    if (self.registration && "clearAppBadge" in self.registration) {
      await self.registration.clearAppBadge();
    }
  } catch (error) {
    console.warn("[badge] registration.clearAppBadge failed:", error);
  }
}

async function incrementUnreadBadgeCount() {
  try {
    const nextCount = (await readBadgeCount()) + 1;
    await writeBadgeCount(nextCount);
    await setAppBadgeSafely(nextCount);
  } catch (error) {
    console.warn("[badge] unread count increment failed:", error);
  }
}

async function clearUnreadBadgeCount() {
  try {
    await writeBadgeCount(0);
  } catch (error) {
    console.warn("[badge] unread count clear failed:", error);
  }

  await clearAppBadgeSafely();
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const fallbackPayload = {
    title: "Хот тохижилтын систем",
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

  event.waitUntil(
    Promise.all([
      incrementUnreadBadgeCount(),
      self.registration.showNotification(payload.title, options),
    ]),
  );
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

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_APP_BADGE") {
    return;
  }

  event.waitUntil(clearUnreadBadgeCount());
});

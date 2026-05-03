"use client";

import { useEffect } from "react";

const NOTIFICATION_PERMISSION_SESSION_KEY = "workspace-notification-permission-requested";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function registerPushSubscription(publicKey: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return;
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await fetch("/api/push/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
}

export function NotificationPermissionButton() {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (!window.isSecureContext) {
      console.warn("Notification permission requires HTTPS or localhost.");
      return;
    }

    let cancelled = false;

    async function setupPushNotifications() {
      const publicKeyResponse = await fetch("/api/push/public-key", { cache: "no-store" }).catch(
        () => null,
      );
      if (!publicKeyResponse?.ok) {
        return;
      }

      const publicKeyPayload = (await publicKeyResponse.json().catch(() => null)) as {
        enabled?: boolean;
        publicKey?: string | null;
      } | null;
      if (!publicKeyPayload?.enabled || !publicKeyPayload.publicKey || cancelled) {
        return;
      }

      if (Notification.permission === "denied") {
        return;
      }

      if (Notification.permission === "default") {
        if (window.sessionStorage.getItem(NOTIFICATION_PERMISSION_SESSION_KEY) === "1") {
          return;
        }

        window.sessionStorage.setItem(NOTIFICATION_PERMISSION_SESSION_KEY, "1");
        const permission = await Notification.requestPermission();
        if (permission === "default") {
          window.sessionStorage.removeItem(NOTIFICATION_PERMISSION_SESSION_KEY);
        }
        if (permission !== "granted" || cancelled) {
          return;
        }
      }

      if (Notification.permission === "granted") {
        await registerPushSubscription(publicKeyPayload.publicKey).catch((error) => {
          console.warn("Push subscription failed:", error);
        });
      }
    }

    void setupPushNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

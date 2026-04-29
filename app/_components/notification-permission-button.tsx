"use client";

import { useEffect } from "react";

const NOTIFICATION_PERMISSION_SESSION_KEY = "workspace-notification-permission-requested";

export function NotificationPermissionButton() {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !window.isSecureContext) {
      return;
    }

    if (Notification.permission !== "default") {
      return;
    }

    if (window.sessionStorage.getItem(NOTIFICATION_PERMISSION_SESSION_KEY) === "1") {
      return;
    }

    window.sessionStorage.setItem(NOTIFICATION_PERMISSION_SESSION_KEY, "1");
    void Notification.requestPermission();
  }, []);

  return null;
}

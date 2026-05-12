"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect } from "react";

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (count?: number) => Promise<void>;
};

const CLEAR_BADGE_MESSAGE = { type: "CLEAR_APP_BADGE" };

async function clearNavigatorBadge() {
  const badgeNavigator = navigator as BadgeNavigator;

  if (!badgeNavigator.clearAppBadge) {
    return;
  }

  try {
    await badgeNavigator.clearAppBadge();
  } catch (error) {
    console.warn("[badge] clearAppBadge failed:", error);
  }
}

async function notifyServiceWorkerToClearBadge() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage(CLEAR_BADGE_MESSAGE);
  } catch (error) {
    console.warn("[badge] service worker clear message failed:", error);
  }
}

export function AppBadgeManager() {
  const pathname = usePathname();
  const clearBadge = useCallback(() => {
    void clearNavigatorBadge();
    void notifyServiceWorkerToClearBadge();
  }, []);

  useEffect(() => {
    clearBadge();

    const clearWhenVisible = () => {
      if (document.visibilityState === "visible") {
        clearBadge();
      }
    };

    window.addEventListener("focus", clearBadge);
    window.addEventListener("pageshow", clearBadge);
    document.addEventListener("visibilitychange", clearWhenVisible);

    return () => {
      window.removeEventListener("focus", clearBadge);
      window.removeEventListener("pageshow", clearBadge);
      document.removeEventListener("visibilitychange", clearWhenVisible);
    };
  }, [clearBadge]);

  useEffect(() => {
    if (pathname === "/notifications") {
      clearBadge();
    }
  }, [clearBadge, pathname]);

  return null;
}

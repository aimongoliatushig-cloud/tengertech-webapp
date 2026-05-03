"use client";

import { useCallback, useEffect, useState } from "react";

const LABEL_ENABLE = "\u041c\u044d\u0434\u044d\u0433\u0434\u044d\u043b \u0438\u0434\u044d\u0432\u0445\u0436\u04af\u04af\u043b\u044d\u0445";
const LABEL_ENABLING =
  "\u041c\u044d\u0434\u044d\u0433\u0434\u044d\u043b \u0438\u0434\u044d\u0432\u0445\u0436\u04af\u04af\u043b\u0436 \u0431\u0430\u0439\u043d\u0430...";
const LABEL_TITLE =
  "\u041c\u044d\u0434\u044d\u0433\u0434\u044d\u043b \u0430\u0432\u0430\u0445\u044b\u0433 \u0437\u04e9\u0432\u0448\u04e9\u04e9\u0440\u04e9\u0445 \u04af\u04af?";
const LABEL_SECURE_TITLE =
  "\u041c\u044d\u0434\u044d\u0433\u0434\u044d\u043b\u0434 HTTPS \u0448\u0430\u0430\u0440\u0434\u043b\u0430\u0433\u0430\u0442\u0430\u0439";
const LABEL_BODY =
  "\u0428\u0438\u043d\u044d \u0430\u0436\u0438\u043b, \u0442\u0430\u0439\u043b\u0430\u043d, \u0445\u0443\u0433\u0430\u0446\u0430\u0430\u043d\u044b \u0430\u043d\u0445\u0430\u0430\u0440\u0443\u0443\u043b\u0433\u044b\u0433 \u044d\u043d\u044d \u0442\u04e9\u0445\u04e9\u04e9\u0440\u04e9\u043c\u0436 \u0434\u044d\u044d\u0440 \u0430\u0432\u043d\u0430.";
const LABEL_DISABLED =
  "Push \u0442\u04af\u043b\u0445\u04af\u04af\u0440 \u0430\u0447\u0430\u0430\u043b\u0430\u0433\u0434\u0430\u0430\u0433\u04af\u0439. Dev server-\u044d\u044d \u0434\u0430\u0445\u0438\u043d \u0430\u0441\u0430\u0430\u0433\u0430\u0430\u0434 \u0434\u0430\u0445\u0438\u043d \u043e\u0440\u043e\u043b\u0434\u043e\u043e\u0440\u043e\u0439.";
const LABEL_INSECURE =
  "\u041e\u0434\u043e\u043e\u0433\u0438\u0439\u043d \u0445\u0430\u044f\u0433 HTTP \u0442\u0443\u043b browser \u043c\u044d\u0434\u044d\u0433\u0434\u043b\u0438\u0439\u043d \u0437\u04e9\u0432\u0448\u04e9\u04e9\u0440\u04e9\u043b \u0430\u0441\u0443\u0443\u0445\u0433\u04af\u0439. HTTPS \u0434\u043e\u043c\u044d\u0439\u043d\u044d\u044d\u0440 \u043d\u044d\u044d\u0445\u044d\u0434 \u0438\u0434\u044d\u0432\u0445\u0436\u04af\u04af\u043b\u044d\u0445 \u0431\u043e\u043b\u043e\u043c\u0436\u0442\u043e\u0439.";
const LABEL_OPEN_SECURE =
  "HTTPS \u0445\u0430\u044f\u0433\u0430\u0430\u0440 \u043d\u044d\u044d\u0445";
const LABEL_SECURE_REQUIRED =
  "HTTPS \u0442\u043e\u0445\u0438\u0440\u0433\u043e\u043e \u0448\u0430\u0430\u0440\u0434\u043b\u0430\u0433\u0430\u0442\u0430\u0439";

type PushStatus =
  | "checking"
  | "unsupported"
  | "insecure"
  | "disabled"
  | "ready"
  | "granted"
  | "denied"
  | "error";

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
    throw new Error("Push notification is not supported in this browser.");
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

  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  if (!response.ok) {
    throw new Error("Push subscription could not be saved.");
  }
}

async function loadPublicKey() {
  const response = await fetch("/api/push/public-key", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as {
    enabled?: boolean;
    publicKey?: string | null;
  } | null;

  return payload?.enabled ? (payload.publicKey ?? null) : null;
}

function getConfiguredSecureUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const baseUrl = new URL(candidate as string);
      if (baseUrl.protocol !== "https:") {
        continue;
      }

      return new URL(`${window.location.pathname}${window.location.search}`, baseUrl).toString();
    } catch {
      // Ignore malformed public URLs and continue with the next configured value.
    }
  }

  return null;
}

export function NotificationPermissionButton() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);

  const requestAndSubscribe = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }

    if (!window.isSecureContext) {
      setSecureUrl(getConfiguredSecureUrl());
      setStatus("insecure");
      return;
    }

    setBusy(true);
    try {
      const resolvedKey = publicKey ?? (await loadPublicKey());
      setPublicKey(resolvedKey);

      if (!resolvedKey) {
        setStatus("disabled");
        return;
      }

      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;

      if (permission === "default") {
        setStatus("ready");
        return;
      }

      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      await registerPushSubscription(resolvedKey);
      setStatus("granted");
    } catch (error) {
      console.warn("Push subscription failed:", error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }

    if (!window.isSecureContext) {
      console.warn("Notification permission requires HTTPS or localhost.");
      setSecureUrl(getConfiguredSecureUrl());
      setStatus("insecure");
      return;
    }

    let cancelled = false;

    async function setupPushNotifications() {
      const resolvedKey = await loadPublicKey().catch(() => null);
      if (cancelled) {
        return;
      }
      setPublicKey(resolvedKey);

      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }

      if (Notification.permission === "default") {
        setStatus(resolvedKey ? "ready" : "disabled");
        return;
      }

      if (Notification.permission === "granted" && resolvedKey) {
        await registerPushSubscription(resolvedKey).catch((error) => {
          console.warn("Push subscription failed:", error);
          setStatus("error");
        });
        if (!cancelled) {
          setStatus("granted");
        }
        return;
      }

      setStatus(resolvedKey ? "ready" : "disabled");
    }

    void setupPushNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking" || status === "unsupported" || status === "granted" || status === "denied") {
    return null;
  }

  const bodyText =
    status === "insecure" ? LABEL_INSECURE : status === "disabled" ? LABEL_DISABLED : LABEL_BODY;
  const titleText = status === "insecure" ? LABEL_SECURE_TITLE : LABEL_TITLE;
  const buttonText =
    status === "insecure" ? (secureUrl ? LABEL_OPEN_SECURE : LABEL_SECURE_REQUIRED) : busy ? LABEL_ENABLING : LABEL_ENABLE;
  const buttonDisabled = busy || (status === "insecure" && !secureUrl);
  const buttonStyle = {
    display: "block",
    width: "100%",
    marginTop: 12,
    border: 0,
    borderRadius: 999,
    background: status === "insecure" && !secureUrl ? "#9CA3AF" : "#2E7D32",
    color: "#fff",
    cursor: buttonDisabled ? "not-allowed" : "pointer",
    fontSize: 14,
    fontWeight: 700,
    padding: "12px 16px",
    textAlign: "center" as const,
    textDecoration: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 1000,
        width: "min(360px, calc(100vw - 32px))",
        border: "1px solid rgba(46, 125, 50, 0.22)",
        borderRadius: 18,
        background: "#fff",
        boxShadow: "0 14px 32px rgba(20, 83, 45, 0.22)",
        color: "#122018",
        padding: 16,
      }}
    >
      <strong style={{ display: "block", fontSize: 15, marginBottom: 6 }}>
        {titleText}
      </strong>
      <span style={{ display: "block", color: "#526157", fontSize: 13, lineHeight: 1.45 }}>
        {bodyText}
      </span>
      {status === "insecure" && secureUrl ? (
        <a href={secureUrl} style={buttonStyle}>
          {buttonText}
        </a>
      ) : null}
      {status === "insecure" && !secureUrl ? (
        <button type="button" disabled style={buttonStyle}>
          {buttonText}
        </button>
      ) : null}
      {status !== "insecure" ? (
      <button
        type="button"
        onClick={() => void requestAndSubscribe()}
        disabled={buttonDisabled}
        style={buttonStyle}
      >
        {buttonText}
      </button>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

const LABEL_ENABLE = "Мэдэгдэл идэвхжүүлэх";
const LABEL_ENABLING = "Мэдэгдэл идэвхжүүлж байна...";
const LABEL_TITLE = "Мэдэгдэл авахыг зөвшөөрөх үү?";
const LABEL_SECURE_TITLE = "Мэдэгдэлд HTTPS шаардлагатай";
const LABEL_BODY =
  "Шинэ ажил, тайлан, хугацааны анхааруулгыг энэ төхөөрөмж дээр авна.";
const LABEL_CONFIG_MISSING =
  "Мэдэгдлийн түлхүүр ачаалагдаагүй байна. Серверийн мэдэгдлийн тохиргоог шалгана уу.";
const LABEL_CONFIG_SESSION =
  "Мэдэгдлийн тохиргоо ачаалахад алдаа гарлаа. Нэвтрэлт болон серверийн тохиргоог шалгана уу.";
const LABEL_DENIED =
  "Browser дээр мэдэгдэл хориглогдсон байна. Сайтын тохиргооноос зөвшөөрнө үү.";
const LABEL_PROMPT_HELP =
  "Browser зөвшөөрлийн цонх харуулсангүй. Хаягийн мөрний зүүн талын сайтын тохиргооноос Notifications зөвшөөрнө үү.";
const LABEL_ERROR =
  "Мэдэгдэл идэвхжүүлэх үед алдаа гарлаа. Дахин оролдоно уу.";
const LABEL_INSECURE =
  "Одоогийн хаяг HTTP тул browser мэдэгдлийн зөвшөөрөл асуухгүй. HTTPS домэйнээр нээхэд идэвхжүүлэх боломжтой.";
const LABEL_OPEN_SECURE = "HTTPS хаягаар нээх";
const LABEL_SECURE_REQUIRED = "HTTPS тохиргоо шаардлагатай";
const LABEL_RETRY = "Дахин оролдох";

const STEP_TIMEOUT_MS = 8000;
const PERMISSION_TIMEOUT_MS = 12000;

type PushStatus =
  | "checking"
  | "unsupported"
  | "insecure"
  | "config-missing"
  | "config-error"
  | "ready"
  | "granted"
  | "denied"
  | "prompt-help"
  | "error";

type PublicKeyFailureReason = "missing" | "session" | "error";

type PublicKeyResult =
  | { ok: true; publicKey: string }
  | { ok: false; reason: PublicKeyFailureReason };

function logPushStep(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.info(`[push] ${message}`, details);
    return;
  }
  console.info(`[push] ${message}`);
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = STEP_TIMEOUT_MS) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

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

async function loadPublicKey(): Promise<PublicKeyResult> {
  try {
    const response = await withTimeout(
      fetch("/api/push/public-key", { cache: "no-store" }),
      "public key request",
    );
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      return { ok: false, reason: "session" };
    }

    const payload = (await response.json().catch(() => null)) as {
      enabled?: boolean;
      publicKey?: string | null;
    } | null;

    if (!response.ok) {
      return { ok: false, reason: "error" };
    }

    if (!payload?.enabled || !payload.publicKey) {
      return { ok: false, reason: "missing" };
    }

    return { ok: true, publicKey: payload.publicKey };
  } catch (error) {
    console.warn("[push] public key request failed:", error);
    return { ok: false, reason: "error" };
  }
}

async function resolveNotificationPermission() {
  logPushStep("current permission before click", {
    permission: Notification.permission,
  });

  if (Notification.permission !== "default") {
    logPushStep("permission result", { permission: Notification.permission });
    return Notification.permission;
  }

  const permission = await withTimeout(
    Notification.requestPermission(),
    "notification permission request",
    PERMISSION_TIMEOUT_MS,
  ).catch(() => "default" as NotificationPermission);
  logPushStep("permission result", { permission });
  return permission;
}

async function registerPushSubscription(publicKey: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notification is not supported in this browser.");
  }

  logPushStep("public key present", { present: Boolean(publicKey) });
  const registration = await withTimeout(
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }),
    "service worker registration",
  );
  logPushStep("service worker registered", { scope: registration.scope });

  const existingSubscription = await withTimeout(
    registration.pushManager.getSubscription(),
    "existing subscription lookup",
  );
  logPushStep("existing subscription lookup", {
    found: Boolean(existingSubscription),
  });

  const subscription =
    existingSubscription ??
    (await withTimeout(
      registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }),
      "push subscription",
    ));
  logPushStep(existingSubscription ? "existing subscription reused" : "new subscription created");

  const response = await withTimeout(
    fetch("/api/push/subscription", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    }),
    "subscription save",
  );
  logPushStep("subscription save response", { status: response.status });

  if (!response.ok) {
    throw new Error("Push subscription could not be saved.");
  }
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

  const setPublicKeyFailure = useCallback((reason: PublicKeyFailureReason) => {
    setPublicKey(null);
    setStatus(reason === "missing" ? "config-missing" : "config-error");
  }, []);

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
      const permission = await resolveNotificationPermission();

      if (permission === "default") {
        setStatus("prompt-help");
        return;
      }

      if (permission === "denied") {
        setStatus("denied");
        return;
      }

      let resolvedPublicKey = publicKey;
      if (!resolvedPublicKey) {
        const publicKeyResult = await loadPublicKey();
        if (!publicKeyResult.ok) {
          setPublicKeyFailure(publicKeyResult.reason);
          return;
        }
        resolvedPublicKey = publicKeyResult.publicKey;
        setPublicKey(publicKeyResult.publicKey);
      }

      await registerPushSubscription(resolvedPublicKey);
      setStatus("granted");
    } catch (error) {
      console.warn("[push] subscription failed:", error);
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }, [publicKey, setPublicKeyFailure]);

  useEffect(() => {
    let cancelled = false;

    async function setupPushNotifications() {
      await Promise.resolve();

      if (typeof window === "undefined" || !("Notification" in window)) {
        if (!cancelled) {
          setStatus("unsupported");
        }
        return;
      }

      if (!window.isSecureContext) {
        console.warn("[push] Notification permission requires HTTPS or localhost.");
        if (!cancelled) {
          setSecureUrl(getConfiguredSecureUrl());
          setStatus("insecure");
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) {
          setStatus("denied");
        }
        return;
      }

      const publicKeyResult = await loadPublicKey();
      if (cancelled) {
        return;
      }

      if (!publicKeyResult.ok) {
        setPublicKeyFailure(publicKeyResult.reason);
        return;
      }

      setPublicKey(publicKeyResult.publicKey);

      if (Notification.permission === "granted") {
        await registerPushSubscription(publicKeyResult.publicKey).catch((error) => {
          console.warn("[push] subscription failed:", error);
          if (!cancelled) {
            setStatus("error");
          }
        });
        if (!cancelled) {
          setStatus("granted");
        }
        return;
      }

      setStatus("ready");
    }

    void setupPushNotifications();

    return () => {
      cancelled = true;
    };
  }, [setPublicKeyFailure]);

  if (status === "checking" || status === "unsupported" || status === "granted") {
    return null;
  }

  const titleText =
    status === "insecure"
      ? LABEL_SECURE_TITLE
      : status === "ready"
        ? LABEL_TITLE
        : "Мэдэгдэл идэвхжээгүй";
  const bodyText =
    status === "insecure"
      ? LABEL_INSECURE
      : status === "config-missing"
        ? LABEL_CONFIG_MISSING
        : status === "config-error"
          ? LABEL_CONFIG_SESSION
          : status === "denied"
            ? LABEL_DENIED
            : status === "prompt-help"
              ? LABEL_PROMPT_HELP
              : status === "error"
                ? LABEL_ERROR
                : LABEL_BODY;
  const buttonText =
    status === "insecure"
      ? secureUrl
        ? LABEL_OPEN_SECURE
        : LABEL_SECURE_REQUIRED
      : busy
        ? LABEL_ENABLING
        : status === "ready"
          ? LABEL_ENABLE
          : LABEL_RETRY;
  const showRetryButton = status === "prompt-help" || status === "error";
  const showActionButton = status === "ready" || status === "insecure" || showRetryButton;
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
      {showActionButton && status === "insecure" && secureUrl ? (
        <a href={secureUrl} style={buttonStyle}>
          {buttonText}
        </a>
      ) : null}
      {showActionButton && status === "insecure" && !secureUrl ? (
        <button type="button" disabled style={buttonStyle}>
          {buttonText}
        </button>
      ) : null}
      {showActionButton && status !== "insecure" ? (
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

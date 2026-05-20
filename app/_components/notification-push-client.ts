"use client";

export type NotificationPermissionStatus =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export type NotificationConnectionStatus =
  | "not_started"
  | "registering_service_worker"
  | "subscribing_push"
  | "saving_to_server"
  | "connected"
  | "failed";

export type BackendSubscriptionStatus = {
  saved: boolean;
  active?: boolean;
  id?: number | null;
  lastSuccessfulConnection?: string | null;
  lastErrorMessage?: string | null;
};

export type NotificationDiagnostics = {
  notificationSupport: boolean;
  serviceWorkerSupport: boolean;
  pushManagerSupport: boolean;
  secureContext: boolean;
  privateModePossible: boolean;
  permissionStatus: NotificationPermissionStatus;
  connectionStatus: NotificationConnectionStatus;
  serviceWorkerRegistered: boolean;
  pushSubscriptionCreated: boolean;
  backendSubscriptionSaved: boolean;
  lastSuccessfulConnection: string | null;
  lastErrorMessage: string | null;
  publicKeyAvailable: boolean;
  serviceWorkerScope: string | null;
  browser: string;
  platform: string;
  endpoint: string | null;
};

export type ConnectNotificationOptions = {
  forceReconnect?: boolean;
  userId?: number | null;
  onStatusChange?: (status: NotificationConnectionStatus) => void;
};

const STEP_TIMEOUT_MS = 12_000;
const PERMISSION_TIMEOUT_MS = 20_000;
const LAST_SUCCESS_KEY = "municipal.notifications.lastSuccessAt";
const LAST_ERROR_KEY = "municipal.notifications.lastError";

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function logNotificationStep(message: string, details?: Record<string, unknown>) {
  if (!isDevelopment()) {
    return;
  }

  if (details) {
    console.info(`[notifications] ${message}`, details);
    return;
  }

  console.info(`[notifications] ${message}`);
}

function storeLastError(message: string) {
  try {
    window.localStorage.setItem(LAST_ERROR_KEY, message);
  } catch {
    // Local storage can be unavailable in private modes.
  }
}

function storeLastSuccess(value = new Date().toISOString()) {
  try {
    window.localStorage.setItem(LAST_SUCCESS_KEY, value);
    window.localStorage.removeItem(LAST_ERROR_KEY);
  } catch {
    // Local storage can be unavailable in private modes.
  }
}

function readLocalState() {
  if (typeof window === "undefined") {
    return { lastSuccessfulConnection: null, lastErrorMessage: null };
  }

  try {
    return {
      lastSuccessfulConnection: window.localStorage.getItem(LAST_SUCCESS_KEY),
      lastErrorMessage: window.localStorage.getItem(LAST_ERROR_KEY),
    };
  } catch {
    return { lastSuccessfulConnection: null, lastErrorMessage: null };
  }
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

function getPermissionStatus(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function getNotificationStatusMessage(diagnostics: Pick<
  NotificationDiagnostics,
  | "notificationSupport"
  | "serviceWorkerSupport"
  | "pushManagerSupport"
  | "secureContext"
  | "privateModePossible"
  | "permissionStatus"
  | "connectionStatus"
  | "backendSubscriptionSaved"
>) {
  if (!diagnostics.notificationSupport || !diagnostics.serviceWorkerSupport || !diagnostics.pushManagerSupport) {
    return "Browser мэдэгдэл дэмжихгүй байна";
  }

  if (!diagnostics.secureContext) {
    return "HTTPS холболт шаардлагатай";
  }

  if (diagnostics.permissionStatus === "denied") {
    return "Мэдэгдэл browser дээр хаагдсан байна";
  }

  if (diagnostics.privateModePossible) {
    return "Private/Incognito горим дээр мэдэгдэл ажиллахгүй байж болно";
  }

  if (diagnostics.connectionStatus === "connected" && diagnostics.backendSubscriptionSaved) {
    return "Мэдэгдэл идэвхтэй";
  }

  if (diagnostics.permissionStatus === "granted" && !diagnostics.backendSubscriptionSaved) {
    return "Мэдэгдэл browser дээр зөвшөөрөгдсөн боловч төхөөрөмж серверт бүртгэгдээгүй байна. Холболт сэргээнэ үү.";
  }

  if (diagnostics.connectionStatus === "failed") {
    return "Сервертэй холбогдож чадсангүй";
  }

  return "Мэдэгдлийн холболт сэргээх шаардлагатай";
}

export function getBrowserName(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (/Edg\//.test(userAgent)) {
    return "Microsoft Edge";
  }
  if (/Chrome\//.test(userAgent) && !/Chromium\//.test(userAgent)) {
    return "Chrome";
  }
  if (/Firefox\//.test(userAgent)) {
    return "Firefox";
  }
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) {
    return "Safari";
  }
  return "Browser";
}

async function detectPrivateModePossible() {
  if (typeof window === "undefined") {
    return false;
  }

  let storageLooksLimited = false;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && estimate.quota < 120_000_000) {
      storageLooksLimited = true;
    }
  } catch {
    storageLooksLimited = true;
  }

  let indexedDbBlocked = false;
  try {
    await new Promise<void>((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }

      const request = indexedDB.open("__municipal_notification_private_probe__", 1);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB failed"));
      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase("__municipal_notification_private_probe__");
        resolve();
      };
    });
  } catch {
    indexedDbBlocked = true;
  }

  return storageLooksLimited || indexedDbBlocked;
}

async function loadPublicKey() {
  const response = await withTimeout(
    fetch("/api/push/public-key", { cache: "no-store" }),
    "public key request",
  );
  const payload = (await response.json().catch(() => null)) as {
    enabled?: boolean;
    publicKey?: string | null;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Мэдэгдлийн public key авахад алдаа гарлаа.");
  }

  if (!payload?.enabled || !payload.publicKey) {
    throw new Error("VAPID public key тохируулагдаагүй байна.");
  }

  return payload.publicKey;
}

async function checkBackendSubscription(endpoint: string): Promise<BackendSubscriptionStatus> {
  const response = await withTimeout(
    fetch(`/api/notifications/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
      cache: "no-store",
    }),
    "backend subscription status",
  );
  const payload = (await response.json().catch(() => null)) as BackendSubscriptionStatus & {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Сервер дээрх төхөөрөмжийн бүртгэл шалгахад алдаа гарлаа.");
  }

  return {
    saved: Boolean(payload?.saved),
    active: Boolean(payload?.active),
    id: payload?.id ?? null,
    lastSuccessfulConnection: payload?.lastSuccessfulConnection ?? null,
    lastErrorMessage: payload?.lastErrorMessage ?? null,
  };
}

async function getExistingRegistration() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  const rootRegistration = await navigator.serviceWorker.getRegistration("/");
  if (rootRegistration) {
    return rootRegistration;
  }

  return navigator.serviceWorker.getRegistration("/sw.js");
}

async function resetServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(async (registration) => {
      const subscription = await registration.pushManager.getSubscription().catch(() => null);
      if (subscription) {
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
      await registration.unregister().catch(() => false);
    }),
  );
}

async function registerServiceWorker(forceReconnect = false) {
  if (forceReconnect) {
    await resetServiceWorkers();
  }

  const registration = await withTimeout(
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }),
    "service worker registration",
  );

  registration.addEventListener("updatefound", () => {
    logNotificationStep("service worker update found", { scope: registration.scope });
    const installingWorker = registration.installing;
    installingWorker?.addEventListener("statechange", () => {
      logNotificationStep("service worker state changed", {
        state: installingWorker.state,
      });
    });
  });

  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      logNotificationStep("service worker controller changed");
    },
    { once: true },
  );

  await registration.update().catch((error) => {
    logNotificationStep("service worker update check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  await withTimeout(navigator.serviceWorker.ready, "service worker ready");
  logNotificationStep("service worker registered", { scope: registration.scope });
  return registration;
}

function normalizeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("Push subscription түлхүүр дутуу байна.");
  }

  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  };
}

async function saveSubscriptionToBackend(subscription: ReturnType<typeof normalizeSubscription>, userId?: number | null) {
  const response = await withTimeout(
    fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...subscription,
        browser: getBrowserName(),
        userAgent: navigator.userAgent,
        platform: navigator.platform || "",
        userId: userId ?? null,
      }),
    }),
    "backend subscription save",
  );
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    id?: number;
    savedAt?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Permission allow боловч серверт бүртгэгдээгүй.");
  }

  const savedAt = payload.savedAt || new Date().toISOString();
  storeLastSuccess(savedAt);
  logNotificationStep("backend saved", { id: payload.id });

  return {
    id: payload.id ?? null,
    savedAt,
  };
}

export async function diagnoseNotifications(): Promise<NotificationDiagnostics> {
  const localState = readLocalState();
  const base: NotificationDiagnostics = {
    notificationSupport: typeof window !== "undefined" && "Notification" in window,
    serviceWorkerSupport: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    pushManagerSupport: typeof window !== "undefined" && "PushManager" in window,
    secureContext: typeof window !== "undefined" && window.isSecureContext,
    privateModePossible: false,
    permissionStatus: getPermissionStatus(),
    connectionStatus: "not_started",
    serviceWorkerRegistered: false,
    pushSubscriptionCreated: false,
    backendSubscriptionSaved: false,
    lastSuccessfulConnection: localState.lastSuccessfulConnection,
    lastErrorMessage: localState.lastErrorMessage,
    publicKeyAvailable: false,
    serviceWorkerScope: null,
    browser: getBrowserName(),
    platform: typeof navigator !== "undefined" ? navigator.platform || "" : "",
    endpoint: null,
  };

  if (typeof window === "undefined") {
    return base;
  }

  base.privateModePossible = await detectPrivateModePossible().catch(() => false);

  if (!base.notificationSupport || !base.serviceWorkerSupport || !base.pushManagerSupport || !base.secureContext) {
    return base;
  }

  base.publicKeyAvailable = await loadPublicKey()
    .then(() => true)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      base.lastErrorMessage = message;
      storeLastError(message);
      return false;
    });

  const registration = await getExistingRegistration().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    base.lastErrorMessage = message;
    storeLastError(message);
    return null;
  });

  if (!registration) {
    return base;
  }

  base.serviceWorkerRegistered = Boolean(registration.active || registration.waiting || registration.installing);
  base.serviceWorkerScope = registration.scope;

  const subscription = await registration.pushManager.getSubscription().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    base.lastErrorMessage = message;
    storeLastError(message);
    return null;
  });

  if (!subscription) {
    return base;
  }

  base.pushSubscriptionCreated = true;
  base.endpoint = subscription.endpoint;

  try {
    const backend = await checkBackendSubscription(subscription.endpoint);
    base.backendSubscriptionSaved = backend.saved && backend.active !== false;
    base.connectionStatus = base.backendSubscriptionSaved ? "connected" : "failed";
    base.lastSuccessfulConnection =
      backend.lastSuccessfulConnection ?? base.lastSuccessfulConnection;
    base.lastErrorMessage = backend.lastErrorMessage ?? base.lastErrorMessage;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    base.connectionStatus = "failed";
    base.lastErrorMessage = message;
    storeLastError(message);
  }

  return base;
}

export async function connectNotifications(options: ConnectNotificationOptions = {}) {
  const emitStatus = (status: NotificationConnectionStatus) => {
    options.onStatusChange?.(status);
  };

  try {
    if (typeof window === "undefined" || !("Notification" in window)) {
      throw new Error("Browser мэдэгдэл дэмжихгүй байна.");
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Browser мэдэгдэл дэмжихгүй байна.");
    }

    if (!window.isSecureContext) {
      throw new Error("HTTPS холболт шаардлагатай.");
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await withTimeout(
        Notification.requestPermission(),
        "notification permission request",
        PERMISSION_TIMEOUT_MS,
      );
    }

    logNotificationStep(`permission ${permission}`);

    if (permission === "denied") {
      throw new Error("Мэдэгдэл browser дээр хаагдсан байна. Browser-ийн Site settings → Notifications хэсгээс Allow болгоно уу.");
    }

    if (permission !== "granted") {
      throw new Error("Мэдэгдлийн зөвшөөрөл өгөөгүй байна.");
    }

    const publicKey = await loadPublicKey();
    emitStatus("registering_service_worker");
    const registration = await registerServiceWorker(Boolean(options.forceReconnect));

    emitStatus("subscribing_push");
    const existingSubscription = await withTimeout(
      registration.pushManager.getSubscription(),
      "existing subscription lookup",
    );
    logNotificationStep(existingSubscription ? "existing subscription found" : "no existing subscription");

    const subscription =
      existingSubscription ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }),
        "push subscription",
      ));
    logNotificationStep(existingSubscription ? "existing subscription reused" : "new subscription created");

    emitStatus("saving_to_server");
    const normalizedSubscription = normalizeSubscription(subscription);
    await saveSubscriptionToBackend(normalizedSubscription, options.userId);

    emitStatus("connected");
    return {
      ok: true as const,
      diagnostics: await diagnoseNotifications(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    storeLastError(message);
    emitStatus("failed");
    logNotificationStep("failed", { error: message });
    return {
      ok: false as const,
      error: message,
      diagnostics: await diagnoseNotifications().catch(() => null),
    };
  }
}

export async function sendTestNotification() {
  const response = await withTimeout(
    fetch("/api/notifications/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    }),
    "test notification",
  );
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { sent?: number; failed?: number; skipped?: string };
    error?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Тест мэдэгдэл илгээхэд алдаа гарлаа.");
  }

  if (payload.result?.skipped) {
    throw new Error("Идэвхтэй төхөөрөмж олдсонгүй эсвэл push тохиргоо дутуу байна.");
  }

  if ((payload.result?.sent ?? 0) < 1) {
    throw new Error("Тест мэдэгдэл илгээгдсэнгүй. Холболт сэргээнэ үү.");
  }

  return payload.result;
}

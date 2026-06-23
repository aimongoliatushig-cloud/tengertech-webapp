"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  connectNotifications,
  diagnoseNotifications,
  getNotificationStatusMessage,
  syncExistingNotificationSubscription,
  type NotificationConnectionStatus,
  type NotificationDiagnostics,
} from "@/app/_components/notification-push-client";

type PushCardStatus = "checking" | "hidden" | "ready" | "warning" | "error";

// Хаасан banner дахин дахин гарч агуулга дарахаас сэргийлж хаалтыг localStorage-д
// хадгална. Хэрэглэгч нэг хаавал 24 цаг чимээгүй (мэдэгдлийн холболтын логик хэвээр).
const DISMISS_STORAGE_KEY = "notification-permission-card-dismissed-until";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

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

function resolveCardStatus(diagnostics: NotificationDiagnostics | null): PushCardStatus {
  if (!diagnostics) {
    return "checking";
  }

  if (diagnostics.connectionStatus === "connected" && diagnostics.backendSubscriptionSaved) {
    return "hidden";
  }

  if (diagnostics.permissionStatus === "granted" && diagnostics.pushSubscriptionCreated) {
    return "hidden";
  }

  if (diagnostics.permissionStatus === "denied") {
    return "hidden";
  }

  if (
    !diagnostics.notificationSupport ||
    !diagnostics.serviceWorkerSupport ||
    !diagnostics.pushManagerSupport ||
    !diagnostics.secureContext ||
    diagnostics.privateModePossible
  ) {
    return "warning";
  }

  if (diagnostics.connectionStatus === "failed") {
    return "error";
  }

  return "ready";
}

export function NotificationPermissionButton() {
  const pathname = usePathname();
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<NotificationConnectionStatus>("not_started");
  const [busy, setBusy] = useState(false);
  const [secureUrl, setSecureUrl] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [lastActionError, setLastActionError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    // Анхны утгыг localStorage-аас уншина (24 цаг дотор хаасан бол нуунa).
    // Card нь diagnostics ачаалагдтал "checking" төлөвт null буцаадаг тул
    // hydration зөрчил үүсэхгүй.
    if (typeof window === "undefined") {
      return false;
    }
    try {
      const until = Number(window.localStorage.getItem(DISMISS_STORAGE_KEY) || 0);
      return Boolean(until && Date.now() < until);
    } catch {
      return false;
    }
  });
  const silentSyncEndpoints = useRef(new Set<string>());
  const shouldPromptForNotifications =
    Boolean(pathname) && pathname !== "/login" && !pathname.startsWith("/auth/");

  const refreshDiagnostics = useCallback(async () => {
    const nextDiagnostics = await diagnoseNotifications();
    setDiagnostics(nextDiagnostics);
    setConnectionStatus(nextDiagnostics.connectionStatus);
    setSecureUrl(getConfiguredSecureUrl());
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(
        DISMISS_STORAGE_KEY,
        String(Date.now() + DISMISS_DURATION_MS),
      );
    } catch {
      // Хадгалж чадахгүй бол ядаж энэ удаад хаагдана.
    }
  }, []);

  useEffect(() => {
    if (!shouldPromptForNotifications) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshDiagnostics();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refreshDiagnostics, shouldPromptForNotifications]);

  useEffect(() => {
    if (
      !shouldPromptForNotifications ||
      !diagnostics?.endpoint ||
      diagnostics.permissionStatus !== "granted" ||
      !diagnostics.pushSubscriptionCreated ||
      diagnostics.backendSubscriptionSaved ||
      silentSyncEndpoints.current.has(diagnostics.endpoint)
    ) {
      return;
    }

    silentSyncEndpoints.current.add(diagnostics.endpoint);
    void syncExistingNotificationSubscription({
      onStatusChange: setConnectionStatus,
    }).then((result) => {
      if (result.diagnostics) {
        setDiagnostics(result.diagnostics);
        setConnectionStatus(result.diagnostics.connectionStatus);
      }
    });
  }, [diagnostics, shouldPromptForNotifications]);

  useEffect(() => {
    if (!shouldPromptForNotifications) {
      return;
    }

    const syncMobileMenuState = () => {
      setIsMobileMenuOpen(document.body.dataset.mobileMenuOpen === "true");
    };

    syncMobileMenuState();

    const observer = new MutationObserver(syncMobileMenuState);
    observer.observe(document.body, {
      attributeFilter: ["data-mobile-menu-open"],
      attributes: true,
    });

    return () => observer.disconnect();
  }, [shouldPromptForNotifications]);

  const cardStatus = resolveCardStatus(diagnostics);
  const statusMessage = useMemo(() => {
    if (!diagnostics) {
      return "Мэдэгдлийн төлөв шалгаж байна";
    }

    return getNotificationStatusMessage({
      ...diagnostics,
      connectionStatus,
    });
  }, [connectionStatus, diagnostics]);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    setLastActionError(null);

    const result = await connectNotifications({
      forceReconnect:
        diagnostics?.permissionStatus === "granted" &&
        !diagnostics.backendSubscriptionSaved,
      onStatusChange: setConnectionStatus,
    });

    if (result.ok) {
      setDiagnostics(result.diagnostics);
    } else {
      setLastActionError(result.error);
      if (result.diagnostics) {
        setDiagnostics(result.diagnostics);
      }
    }

    setBusy(false);
  }, [diagnostics]);

  if (
    !shouldPromptForNotifications ||
    dismissed ||
    isMobileMenuOpen ||
    cardStatus === "checking" ||
    cardStatus === "hidden"
  ) {
    return null;
  }

  const isDenied = diagnostics?.permissionStatus === "denied";
  const isInsecure = diagnostics ? !diagnostics.secureContext : false;
  const canConnect =
    !busy &&
    !isDenied &&
    diagnostics?.notificationSupport &&
    diagnostics.serviceWorkerSupport &&
    diagnostics.pushManagerSupport &&
    diagnostics.secureContext;
  const titleText =
    cardStatus === "ready"
      ? "Мэдэгдэл авахыг зөвшөөрөх үү?"
      : "Мэдэгдлийн холболт шалгах шаардлагатай";
  const bodyText = lastActionError || statusMessage;
  const buttonText = busy
    ? connectionStatus === "registering_service_worker"
      ? "Service worker бүртгэж байна"
      : connectionStatus === "subscribing_push"
        ? "Push subscription үүсгэж байна"
        : connectionStatus === "saving_to_server"
          ? "Серверт хадгалж байна"
          : "Мэдэгдэл идэвхжүүлж байна"
    : diagnostics?.permissionStatus === "granted"
      ? "Холболт сэргээх"
      : "Мэдэгдэл идэвхжүүлэх";

  const buttonStyle = {
    display: "block",
    width: "100%",
    marginTop: 12,
    border: 0,
    borderRadius: 999,
    background: canConnect ? "#2E7D32" : "#9CA3AF",
    color: "#fff",
    cursor: canConnect ? "pointer" : "not-allowed",
    fontSize: 14,
    fontWeight: 700,
    padding: "12px 16px",
    textAlign: "center" as const,
    textDecoration: "none",
  };
  const linkButtonStyle = {
    ...buttonStyle,
    background: "#2E7D32",
    cursor: "pointer",
  };

  return (
    <div
      data-notification-permission-card
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
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Мэдэгдлийн сануулгыг хаах"
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          border: 0,
          background: "transparent",
          color: "#526157",
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1,
          padding: 4,
        }}
      >
        ×
      </button>
      <strong style={{ display: "block", fontSize: 15, marginBottom: 6 }}>
        {titleText}
      </strong>
      <span style={{ display: "block", color: "#526157", fontSize: 13, lineHeight: 1.45 }}>
        {bodyText}
      </span>
      {isDenied ? (
        <button
          type="button"
          onClick={() => setShowGuide((current) => !current)}
          style={linkButtonStyle}
        >
          {showGuide ? "Заавар хаах" : "Заавар харах"}
        </button>
      ) : null}
      {showGuide ? (
        <div
          style={{
            marginTop: 12,
            border: "1px solid rgba(46, 125, 50, 0.16)",
            borderRadius: 14,
            background: "rgba(241, 248, 240, 0.95)",
            padding: 12,
          }}
        >
          <strong style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
            Browser дээр мэдэгдэл нээх
          </strong>
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "#44524a",
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            <li>Хаягийн мөрний зүүн талын цоож / site icon дээр дарна.</li>
            <li>Notifications хэсгийг Allow болгоно.</li>
            <li>Хуудсаа refresh хийгээд дахин нэвтэрнэ.</li>
            <li>Private/Incognito цонх ашиглаж байгаа бол энгийн цонхоор орно.</li>
          </ol>
        </div>
      ) : null}
      {isInsecure && secureUrl ? (
        <a href={secureUrl} style={linkButtonStyle}>
          HTTPS хаягаар нээх
        </a>
      ) : null}
      {!isDenied && !isInsecure ? (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={!canConnect}
          style={buttonStyle}
        >
          {buttonText}
        </button>
      ) : null}
      <a
        href="/settings/notifications"
        style={{
          display: "inline-block",
          marginTop: 10,
          color: "#1c7c35",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Дэлгэрэнгүй оношилгоо
      </a>
    </div>
  );
}

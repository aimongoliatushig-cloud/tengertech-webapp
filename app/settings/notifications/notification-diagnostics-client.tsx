"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  CircleAlert,
  Info,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";

import {
  connectNotifications,
  diagnoseNotifications,
  getNotificationStatusMessage,
  sendTestNotification,
  type NotificationConnectionStatus,
  type NotificationDiagnostics,
} from "@/app/_components/notification-push-client";

import styles from "./notifications-settings.module.css";

type NotificationDiagnosticsClientProps = {
  userId: number;
};

type Flash = {
  kind: "success" | "error" | "warning";
  text: string;
};

function boolValue(value: boolean, warning = false) {
  if (value) {
    return {
      state: warning ? "warning" : "ok",
      text: warning ? "Анхаарах" : "Хэвийн",
    };
  }

  return {
    state: "bad",
    text: "Асуудалтай",
  };
}

function permissionLabel(value: NotificationDiagnostics["permissionStatus"]) {
  switch (value) {
    case "granted":
      return "Allow";
    case "denied":
      return "Denied";
    case "default":
      return "Асуух төлөвтэй";
    default:
      return "Дэмжихгүй";
  }
}

function connectionLabel(value: NotificationConnectionStatus) {
  switch (value) {
    case "registering_service_worker":
      return "Service worker бүртгэж байна";
    case "subscribing_push":
      return "Push subscription үүсгэж байна";
    case "saving_to_server":
      return "Серверт хадгалж байна";
    case "connected":
      return "Мэдэгдэл идэвхтэй";
    case "failed":
      return "Амжилтгүй";
    default:
      return "Эхлээгүй";
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Бүртгэлгүй";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function DiagnosticCard({
  label,
  description,
  state,
  value,
}: {
  label: string;
  description: string;
  state: "ok" | "bad" | "warning";
  value: string;
}) {
  const Icon = state === "ok" ? CheckCircle2 : state === "warning" ? ShieldAlert : CircleAlert;

  return (
    <article className={styles.diagnosticCard}>
      <strong>{label}</strong>
      <span className={styles.diagnosticValue} data-state={state}>
        <Icon size={17} aria-hidden />
        {value}
      </span>
      <span>{description}</span>
    </article>
  );
}

export function NotificationDiagnosticsClient({ userId }: NotificationDiagnosticsClientProps) {
  const [diagnostics, setDiagnostics] = useState<NotificationDiagnostics | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<NotificationConnectionStatus>("not_started");
  const [busyAction, setBusyAction] = useState<"enable" | "reconnect" | "test" | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const refreshDiagnostics = useCallback(async () => {
    const nextDiagnostics = await diagnoseNotifications();
    setDiagnostics(nextDiagnostics);
    setConnectionStatus(nextDiagnostics.connectionStatus);
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);

  const statusMessage = useMemo(() => {
    if (!diagnostics) {
      return "Мэдэгдлийн төлөв шалгаж байна";
    }

    return getNotificationStatusMessage({
      ...diagnostics,
      connectionStatus,
    });
  }, [connectionStatus, diagnostics]);

  const badgeState = useMemo(() => {
    if (!diagnostics) {
      return "warning";
    }
    if (diagnostics.permissionStatus === "denied" || connectionStatus === "failed") {
      return "failed";
    }
    if (
      diagnostics.privateModePossible ||
      !diagnostics.secureContext ||
      !diagnostics.notificationSupport ||
      !diagnostics.serviceWorkerSupport ||
      !diagnostics.pushManagerSupport
    ) {
      return "warning";
    }
    return diagnostics.backendSubscriptionSaved && connectionStatus === "connected"
      ? "connected"
      : "warning";
  }, [connectionStatus, diagnostics]);

  const runConnect = useCallback(
    async (forceReconnect: boolean) => {
      setBusyAction(forceReconnect ? "reconnect" : "enable");
      setFlash(null);

      const result = await connectNotifications({
        forceReconnect,
        userId,
        onStatusChange: setConnectionStatus,
      });

      if (result.ok) {
        setDiagnostics(result.diagnostics);
        setFlash({ kind: "success", text: "Мэдэгдэл идэвхтэй" });
      } else {
        if (result.diagnostics) {
          setDiagnostics(result.diagnostics);
        }
        setFlash({ kind: "error", text: result.error || "Сервертэй холбогдож чадсангүй" });
      }

      setBusyAction(null);
    },
    [userId],
  );

  const runTest = useCallback(async () => {
    setBusyAction("test");
    setFlash(null);

    try {
      await sendTestNotification();
      setFlash({ kind: "success", text: "Тест мэдэгдэл илгээгдлээ" });
    } catch (error) {
      setFlash({
        kind: "error",
        text: error instanceof Error ? error.message : "Тест мэдэгдэл илгээхэд алдаа гарлаа.",
      });
    } finally {
      setBusyAction(null);
      await refreshDiagnostics();
    }
  }, [refreshDiagnostics]);

  const notReady = !diagnostics;
  const permissionDenied = diagnostics?.permissionStatus === "denied";
  const connected = diagnostics?.backendSubscriptionSaved && connectionStatus === "connected";

  const support = diagnostics
    ? [
        {
          label: "Browser notification support",
          description: "Notification API дэмжиж байгаа эсэх.",
          ...boolValue(diagnostics.notificationSupport),
        },
        {
          label: "Service worker support",
          description: "PWA service worker ажиллах боломжтой эсэх.",
          ...boolValue(diagnostics.serviceWorkerSupport),
        },
        {
          label: "PushManager support",
          description: "Browser push subscription үүсгэх чадвартай эсэх.",
          ...boolValue(diagnostics.pushManagerSupport),
        },
        {
          label: "HTTPS secure context",
          description: "Push мэдэгдэлд HTTPS эсвэл localhost шаардлагатай.",
          ...boolValue(diagnostics.secureContext),
        },
        {
          label: "Private/Incognito горим",
          description: "Private горим дээр мэдэгдэл тогтвортой ажиллахгүй байж болно.",
          state: diagnostics.privateModePossible ? "warning" : "ok",
          text: diagnostics.privateModePossible ? "Байж магадгүй" : "Илрээгүй",
        },
        {
          label: "Notification permission",
          description:
            diagnostics.permissionStatus === "denied"
              ? "Browser-ийн Site settings → Notifications хэсгээс Allow болгоно уу."
              : "Browser дээрх зөвшөөрлийн төлөв.",
          state: diagnostics.permissionStatus === "denied" ? "bad" : diagnostics.permissionStatus === "granted" ? "ok" : "warning",
          text: permissionLabel(diagnostics.permissionStatus),
        },
        {
          label: "Service worker registered",
          description: diagnostics.serviceWorkerScope || "Service worker бүртгэл олдоогүй.",
          ...boolValue(diagnostics.serviceWorkerRegistered),
        },
        {
          label: "Push subscription",
          description: diagnostics.endpoint ? "Endpoint үүссэн байна." : "Push subscription хараахан үүсээгүй.",
          ...boolValue(diagnostics.pushSubscriptionCreated),
        },
        {
          label: "Backend device subscription",
          description: "Сервер дээр тухайн төхөөрөмж хадгалагдсан эсэх.",
          ...boolValue(diagnostics.backendSubscriptionSaved),
        },
        {
          label: "Last successful connection time",
          description: "Сүүлд амжилттай серверт хадгалсан хугацаа.",
          state: diagnostics.lastSuccessfulConnection ? "ok" : "warning",
          text: formatDateTime(diagnostics.lastSuccessfulConnection),
        },
        {
          label: "Last error message",
          description: "Сүүлийн алдааны мэдээлэл.",
          state: diagnostics.lastErrorMessage ? "bad" : "ok",
          text: diagnostics.lastErrorMessage || "Алдаа алга",
        },
        {
          label: "Browser / device",
          description: diagnostics.platform || "Төхөөрөмжийн мэдээлэл олдсонгүй.",
          state: "ok",
          text: diagnostics.browser,
        },
      ]
    : [];

  return (
    <div className={styles.diagnosticShell}>
      <section className={styles.statusPanel}>
        <div className={styles.statusHeader}>
          <div className={styles.statusTitle}>
            <h2>Мэдэгдлийн холболт</h2>
            <p>
              Permission allow болсон эсэхээс гадна service worker, push subscription,
              сервер дээрх төхөөрөмжийн бүртгэлийг тус тусад нь шалгана.
            </p>
          </div>
          <span className={styles.statusBadge} data-state={badgeState}>
            {connected ? <CheckCircle2 size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            {statusMessage}
          </span>
        </div>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={notReady || permissionDenied || busyAction !== null}
            onClick={() => void runConnect(false)}
          >
            <BellRing size={18} aria-hidden />
            {busyAction === "enable" ? connectionLabel(connectionStatus) : "Мэдэгдэл идэвхжүүлэх"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={notReady || permissionDenied || busyAction !== null}
            onClick={() => void runConnect(true)}
          >
            <RefreshCw size={18} aria-hidden />
            {busyAction === "reconnect" ? connectionLabel(connectionStatus) : "Холболт сэргээх"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!connected || busyAction !== null}
            onClick={() => void runTest()}
          >
            <Send size={18} aria-hidden />
            {busyAction === "test" ? "Илгээж байна" : "Тест мэдэгдэл илгээх"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowGuide((value) => !value)}
          >
            <Info size={18} aria-hidden />
            Заавар харах
          </button>
        </div>

        {flash ? (
          <div className={styles.message} data-kind={flash.kind}>
            {flash.text}
          </div>
        ) : null}

        {diagnostics?.permissionStatus === "denied" ? (
          <div className={styles.message} data-kind="warning">
            Browser-ийн Site settings → Notifications хэсгээс Allow болгоно уу.
          </div>
        ) : null}

        {diagnostics?.privateModePossible ? (
          <div className={styles.message} data-kind="warning">
            Private/Incognito горим дээр мэдэгдэл тогтвортой ажиллахгүй. Энгийн browser цонхоор нэвтэрнэ үү.
          </div>
        ) : null}
      </section>

      {showGuide ? (
        <section className={styles.guidePanel}>
          <h3>Мэдэгдэл ажиллуулах богино заавар</h3>
          <p>Chrome болон Edge дээр хаягийн мөрний зүүн талын site settings хэсгээс Notifications → Allow болгож болно.</p>
          <p>Android Chrome PWA дээр app icon-оор орж “Мэдэгдэл идэвхжүүлэх” дараад browser-ийн зөвшөөрлийг Allow болгоно.</p>
          <p>Allow болсон ч сервер дээр хадгалагдаагүй бол “Холболт сэргээх” дарж хуучин subscription-ийг шинэчилнэ.</p>
        </section>
      ) : null}

      <section className={styles.statusPanel}>
        <div className={styles.statusHeader}>
          <div className={styles.statusTitle}>
            <h2>Compatibility diagnostic</h2>
            <p>Chrome, Microsoft Edge, Android Chrome PWA, desktop browser дээр ижил шалгалтаар төлөв харуулна.</p>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={() => void refreshDiagnostics()}>
            <RefreshCw size={18} aria-hidden />
            Шинэчлэх
          </button>
        </div>

        <div className={styles.diagnosticGrid}>
          {support.map((item) => (
            <DiagnosticCard
              key={item.label}
              label={item.label}
              description={item.description}
              state={item.state as "ok" | "bad" | "warning"}
              value={item.text}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

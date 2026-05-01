import "server-only";

import webpush from "web-push";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

export type BrowserPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushEventType =
  | "new_work_assigned"
  | "work_changed"
  | "report_under_review"
  | "work_returned"
  | "work_approved"
  | "deadline_near"
  | "deadline_overdue"
  | "route_changed"
  | "vehicle_broken"
  | "attendance_issue"
  | "discipline_issue"
  | "test";

type StoredPushSubscription = BrowserPushSubscription & {
  id: number;
  user_id: number;
};

type PushEventInput = {
  eventType: PushEventType;
  title?: string;
  body?: string;
  targetUrl?: string;
  userIds?: number[];
};

const EVENT_DEFAULTS: Record<PushEventType, { title: string; body: string; targetUrl: string }> = {
  new_work_assigned: {
    title: "Шинэ ажил оноогдлоо",
    body: "Танд шинэ ажил оноогдсон байна.",
    targetUrl: "/tasks",
  },
  work_changed: {
    title: "Ажил өөрчлөгдлөө",
    body: "Ажлын мэдээлэл шинэчлэгдсэн байна.",
    targetUrl: "/tasks",
  },
  report_under_review: {
    title: "Тайлан хяналтад ирлээ",
    body: "Шинэ тайлан шалгах дараалалд орлоо.",
    targetUrl: "/review",
  },
  work_returned: {
    title: "Ажил буцаагдлаа",
    body: "Засвар шаардсан ажил байна.",
    targetUrl: "/tasks",
  },
  work_approved: {
    title: "Ажил баталгаажлаа",
    body: "Ажлын гүйцэтгэл баталгаажсан байна.",
    targetUrl: "/tasks",
  },
  deadline_near: {
    title: "Хугацаа дөхөж байна",
    body: "Ажлын хугацаа ойртож байна.",
    targetUrl: "/tasks",
  },
  deadline_overdue: {
    title: "Хугацаа хэтэрлээ",
    body: "Хугацаа хэтэрсэн ажил байна.",
    targetUrl: "/notifications",
  },
  route_changed: {
    title: "Маршрут өөрчлөгдлөө",
    body: "Өдрийн маршрутын мэдээлэл шинэчлэгдлээ.",
    targetUrl: "/garbage-routes/today",
  },
  vehicle_broken: {
    title: "Машины эвдрэл бүртгэгдлээ",
    body: "Засварын хүсэлт дээр шинэ өөрчлөлт гарлаа.",
    targetUrl: "/fleet-repair",
  },
  attendance_issue: {
    title: "Ирцийн асуудал бүртгэгдлээ",
    body: "Ирцийн бүртгэлд анхаарах зүйл байна.",
    targetUrl: "/hr/discipline",
  },
  discipline_issue: {
    title: "Сахилгын асуудал бүртгэгдлээ",
    body: "Сахилгын бүртгэлд анхаарах зүйл байна.",
    targetUrl: "/hr/discipline",
  },
  test: {
    title: "Туршилтын мэдэгдэл",
    body: "Push мэдэгдэл хэвийн ажиллаж байна.",
    targetUrl: "/notifications",
  },
};

function getConnectionOverrides(session?: AppSession | null) {
  return session
    ? {
        login: session.login,
        password: session.password,
      }
    : {};
}

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.invalid";

  return {
    publicKey,
    privateKey,
    subject,
    enabled: Boolean(publicKey && privateKey),
  };
}

function configureWebPush() {
  const config = getVapidConfig();
  if (!config.enabled || !config.publicKey || !config.privateKey) {
    return null;
  }

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
}

export function getPublicVapidKey() {
  return getVapidConfig().publicKey ?? null;
}

export function isPushConfigured() {
  return getVapidConfig().enabled;
}

export async function savePushSubscription(
  session: AppSession,
  subscription: BrowserPushSubscription,
  userAgent?: string | null,
) {
  return executeOdooKw<number>(
    "tengertech.push.subscription",
    "upsert_for_current_user",
    [subscription],
    { user_agent: userAgent || "" },
    getConnectionOverrides(session),
  );
}

export async function removePushSubscription(session: AppSession, endpoint: string) {
  return executeOdooKw<boolean>(
    "tengertech.push.subscription",
    "deactivate_for_current_user",
    [endpoint],
    {},
    getConnectionOverrides(session),
  );
}

async function loadSubscriptions(userIds?: number[]) {
  return executeOdooKw<StoredPushSubscription[]>(
    "tengertech.push.subscription",
    "active_payloads_for_users",
    [userIds && userIds.length ? userIds : false],
  );
}

async function logPushEvent(input: PushEventInput, sentCount: number, failedCount: number) {
  const defaults = EVENT_DEFAULTS[input.eventType];
  await executeOdooKw<number>(
    "tengertech.push.event",
    "log_event",
    [
      {
        name: input.title || defaults.title,
        event_type: input.eventType,
        body: input.body || defaults.body,
        target_url: input.targetUrl || defaults.targetUrl,
        target_user_ids: input.userIds?.length ? [[6, 0, input.userIds]] : false,
        sent_count: sentCount,
        failed_count: failedCount,
      },
    ],
  ).catch((error) => {
    console.warn("Push event log failed:", error);
  });
}

export async function notifyPushEvent(input: PushEventInput) {
  const config = configureWebPush();
  if (!config) {
    return { sent: 0, failed: 0, skipped: "missing_vapid" as const };
  }

  const defaults = EVENT_DEFAULTS[input.eventType];
  const subscriptions = await loadSubscriptions(input.userIds).catch((error) => {
    console.warn("Push subscription load failed:", error);
    return [];
  });

  if (!subscriptions.length) {
    await logPushEvent(input, 0, 0);
    return { sent: 0, failed: 0 };
  }

  const payload = JSON.stringify({
    title: input.title || defaults.title,
    body: input.body || defaults.body,
    url: input.targetUrl || defaults.targetUrl,
    icon: "/icon.png",
    badge: "/apple-icon.png",
    eventType: input.eventType,
    tag: `municipal-${input.eventType}`,
  });

  const results = await Promise.allSettled(
    subscriptions.map((subscription) => webpush.sendNotification(subscription, payload)),
  );
  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;
  await logPushEvent(input, sent, failed);
  return { sent, failed };
}

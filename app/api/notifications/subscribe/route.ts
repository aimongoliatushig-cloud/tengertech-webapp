import { getSession } from "@/lib/auth";
import {
  getCurrentUserPushSubscriptionStatus,
  removePushSubscription,
  savePushSubscription,
  type BrowserPushSubscription,
} from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

type SubscribePayload = BrowserPushSubscription & {
  browser?: string | null;
  userAgent?: string | null;
  platform?: string | null;
  userId?: number | null;
  subscription?: BrowserPushSubscription;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function normalizePayload(payload: SubscribePayload | null) {
  const subscription = payload?.subscription ?? payload;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return null;
  }

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    browser: payload?.browser ?? null,
    userAgent: payload?.userAgent ?? null,
    platform: payload?.platform ?? null,
  };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const endpoint = new URL(request.url).searchParams.get("endpoint")?.trim();
  if (!endpoint) {
    return jsonError("Push endpoint дутуу байна.", 400);
  }

  try {
    const status = await getCurrentUserPushSubscriptionStatus(session, endpoint);
    return Response.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(`Сервер дээрх төхөөрөмжийн бүртгэл шалгахад алдаа гарлаа: ${message}`, 500);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const payload = normalizePayload(
    (await request.json().catch(() => null)) as SubscribePayload | null,
  );
  if (!payload) {
    return jsonError("Push subscription мэдээлэл дутуу байна.", 400);
  }

  try {
    const id = await savePushSubscription(session, payload, {
      browser: payload.browser,
      userAgent: payload.userAgent || request.headers.get("user-agent"),
      platform: payload.platform,
    });
    const savedAt = new Date().toISOString();
    return Response.json({ ok: true, id, savedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(`Permission allow боловч серверт бүртгэгдээгүй: ${message}`, 500);
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const payload = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!payload?.endpoint) {
    return jsonError("Push endpoint дутуу байна.", 400);
  }

  try {
    await removePushSubscription(session, payload.endpoint);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(`Push subscription идэвхгүй болгох үед алдаа гарлаа: ${message}`, 500);
  }
}

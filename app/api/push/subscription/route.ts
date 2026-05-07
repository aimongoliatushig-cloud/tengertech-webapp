import { getSession } from "@/lib/auth";
import {
  removePushSubscription,
  savePushSubscription,
  type BrowserPushSubscription,
} from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  return jsonError("Push subscription зөвхөн POST хүсэлтээр хадгалагдана.", 405);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const payload = (await request.json().catch(() => null)) as {
    subscription?: BrowserPushSubscription;
  } | null;
  if (!payload?.subscription?.endpoint || !payload.subscription.keys?.p256dh || !payload.subscription.keys?.auth) {
    return jsonError("Push subscription мэдээлэл дутуу байна.", 400);
  }

  try {
    const id = await savePushSubscription(
      session,
      payload.subscription,
      request.headers.get("user-agent"),
    );
    return Response.json({ ok: true, id });
  } catch (error) {
    console.error(error);
    return jsonError("Push subscription хадгалах үед алдаа гарлаа.", 500);
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
    console.error(error);
    return jsonError("Push subscription идэвхгүй болгох үед алдаа гарлаа.", 500);
  }
}

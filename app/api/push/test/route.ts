import { getSession } from "@/lib/auth";
import { notifyPushEvent } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function POST() {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const result = await notifyPushEvent({
    eventType: "test",
    userIds: [session.uid],
  });
  return Response.json({ ok: true, result });
}

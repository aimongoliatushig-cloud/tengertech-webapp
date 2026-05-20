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

  try {
    const result = await notifyPushEvent({
      eventType: "test",
      userIds: [session.uid],
    });

    if (result.skipped) {
      return jsonError("Идэвхтэй төхөөрөмж олдсонгүй эсвэл push тохиргоо дутуу байна.", 409);
    }

    if (result.sent < 1) {
      return jsonError("Тест мэдэгдэл илгээгдсэнгүй. Холболт сэргээнэ үү.", 409);
    }

    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(`Тест мэдэгдэл илгээх үед алдаа гарлаа: ${message}`, 500);
  }
}

import { completePoint } from "@/lib/garbage-routes";
import { notifyPushEvent } from "@/lib/push-notifications";
import { jsonError, numberParam, withSession } from "../../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const stopLineId = numberParam(id);
  if (!stopLineId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  const payload = await request.json().catch(() => ({}));
  return withSession(async (session) => {
    const result = await completePoint(
      session,
      stopLineId,
      typeof payload.note === "string" ? payload.note : undefined,
      typeof payload.issueReason === "string" ? payload.issueReason : undefined,
    );
    await notifyPushEvent({
      eventType: "work_changed",
      title: "Маршрутын цэг дууслаа",
      body: "Маршрутын гүйцэтгэл шинэчлэгдлээ.",
      targetUrl: "/garbage-routes/today",
    }).catch((error) => console.warn("Point completion push failed:", error));
    return result;
  });
}

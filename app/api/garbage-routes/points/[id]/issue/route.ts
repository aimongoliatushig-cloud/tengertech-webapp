import { reportPointIssue } from "@/lib/garbage-routes";
import { notifyPushEvent } from "@/lib/push-notifications";
import { formFiles, jsonError, numberParam, withSession } from "../../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const stopLineId = numberParam(id);
  if (!stopLineId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  const formData = await request.formData();
  const issueType = String(formData.get("issueType") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!issueType) {
    return jsonError("Асуудлын төрөл сонгоно уу.", 400);
  }
  return withSession(async (session) => {
    const result = await reportPointIssue(session, stopLineId, issueType, note, formFiles(formData)[0]);
    await notifyPushEvent({
      eventType: "route_changed",
      title: "Маршрут дээр зөрчил бүртгэгдлээ",
      body: note || "Хяналтын тайланд шинэ зөрчил нэмэгдлээ.",
      targetUrl: "/garbage-routes/inspections",
    }).catch((error) => console.warn("Point issue push failed:", error));
    return result;
  });
}

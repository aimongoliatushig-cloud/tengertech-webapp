import { reportPointIssue } from "@/lib/garbage-routes";
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
  return withSession((session) => reportPointIssue(session, stopLineId, issueType, note, formFiles(formData)[0]));
}

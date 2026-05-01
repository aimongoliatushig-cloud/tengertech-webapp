import { createInspectionReport, loadInspections } from "@/lib/garbage-routes";
import { formFiles, jsonError, withSession } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSession((session) => loadInspections(session));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const taskId = Number(formData.get("taskId") ?? "");
  const stopLineId = Number(formData.get("stopLineId") ?? "");
  if (!Number.isInteger(taskId) || taskId <= 0) {
    return jsonError("Маршрут сонгоно уу.", 400);
  }
  return withSession((session) =>
    createInspectionReport(session, {
      taskId,
      stopLineId: Number.isInteger(stopLineId) && stopLineId > 0 ? stopLineId : null,
      title: String(formData.get("title") ?? "Хяналтын тайлан"),
      comment: String(formData.get("comment") ?? ""),
      hasViolation: formData.get("hasViolation") === "on",
      violationType: String(formData.get("violationType") ?? ""),
      rating: String(formData.get("rating") ?? ""),
      file: formFiles(formData)[0],
    }),
  );
}

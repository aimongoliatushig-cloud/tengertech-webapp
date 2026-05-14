import { getSession } from "@/lib/auth";
import { getGeneratedHrReportPdf, requireHrSpecialistAccess } from "@/lib/hr";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function safeFileName(value: string) {
  return encodeURIComponent(value || "hr-report.pdf");
}

export async function GET(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrSpecialistAccess(session);
    const { id } = await ctx.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return jsonError("Тайлангийн дугаар буруу байна.", 400);
    }
    const payload = await getGeneratedHrReportPdf(session, reportId);
    const buffer = Buffer.from(payload.datas, "base64");
    const fileName = safeFileName(payload.name || "hr-report.pdf");
    const url = new URL(request.url);
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    return new Response(buffer, {
      headers: {
        "Content-Type": payload.mimetype || "application/pdf",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${fileName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("HR тайлан татах эрх хүрэлцэхгүй байна.", 403);
    }
    return jsonError(error instanceof Error ? error.message : "HR тайлан татахад алдаа гарлаа.", 400);
  }
}

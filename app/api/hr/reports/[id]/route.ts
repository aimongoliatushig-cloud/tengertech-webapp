import { getSession } from "@/lib/auth";
import { deleteGeneratedHrReport, requireHrSpecialistAccess } from "@/lib/hr";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrSpecialistAccess(session);
    const { id } = await ctx.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return jsonError("Тайлангийн дугаар буруу байна.", 400);
    }
    return Response.json({ report: await deleteGeneratedHrReport(session, reportId) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("HR тайлан устгах эрх хүрэлцэхгүй байна.", 403);
    }
    return jsonError(error instanceof Error ? error.message : "HR тайлан устгахад алдаа гарлаа.", 400);
  }
}

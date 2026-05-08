import { getSession } from "@/lib/auth";
import { deleteClearanceRecord, requireHrSpecialistAccess } from "@/lib/hr";

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
    const clearanceId = Number(id);
    if (!Number.isFinite(clearanceId) || clearanceId <= 0) {
      return jsonError("Тойрох хуудасны дугаар буруу байна.", 400);
    }

    return Response.json({ clearance: await deleteClearanceRecord(session, clearanceId) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд тойрох хуудас устгах HR эрх байхгүй байна.", 403);
    }
    console.error("DELETE /api/hr/clearance/[id] failed:", error);
    return jsonError(error instanceof Error ? error.message : "Тойрох хуудас устгахад алдаа гарлаа.", 400);
  }
}

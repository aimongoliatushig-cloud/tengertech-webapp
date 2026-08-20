import { getSession } from "@/lib/auth";
import { deleteEmployeeTransfer } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    const { id } = await params;
    const recordId = Number(id);
    if (!Number.isFinite(recordId) || recordId <= 0) {
      return jsonError("Шилжилтийн бүртгэлийн дугаар буруу байна.", 400);
    }
    await deleteEmployeeTransfer(session, recordId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Шилжилтийн түүх устгах эрх хүрэлцэхгүй байна.", 403);
    }
    console.error("DELETE /api/hr/transfers/[id] failed:", error);
    return jsonError(error instanceof Error ? error.message : "Шилжилтийн бүртгэл устгахад алдаа гарлаа.");
  }
}

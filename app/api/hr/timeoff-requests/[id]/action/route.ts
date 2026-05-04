import { getSession } from "@/lib/auth";
import { actionTimeoffRequest } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Хүсэлтийн үйлдэл хийхэд алдаа гарлаа.";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    const { id } = await params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return jsonError("Хүсэлтийн дугаар буруу байна.", 400);
    }
    const payload = await request.json().catch(() => ({}));
    const action = String(payload.action || "");
    if (!["hr_review", "approve", "reject", "cancel"].includes(action)) {
      return jsonError("Тодорхойгүй үйлдэл.", 400);
    }
    const result = await actionTimeoffRequest(
      session,
      requestId,
      action as "hr_review" | "approve" | "reject" | "cancel",
      {
        hrNote: String(payload.hrNote || ""),
        rejectionReason: String(payload.rejectionReason || ""),
      },
    );
    return Response.json({ request: result });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Энэ үйлдлийг хийх HR эрх хүрэлцэхгүй байна.", 403);
    }
    if (error instanceof Error && error.message === "HR_TIMEOFF_REQUESTER_ONLY") {
      return jsonError("Зөвхөн хэлтсийн дарга өөрийн илгээсэн хүсэлтийг цуцлах боломжтой.", 403);
    }
    console.error("POST /api/hr/timeoff-requests/[id]/action failed:", error);
    return jsonError(errorMessage(error));
  }
}

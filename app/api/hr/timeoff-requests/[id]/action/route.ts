import { getSession } from "@/lib/auth";
import { actionTimeoffRequest } from "@/lib/hr";
import { notifyHrTimeoffRequestStatusChanged } from "@/lib/hr-notifications";

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
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data");
    const formData = isMultipart ? await request.formData() : null;
    const payload = formData
      ? {
          action: String(formData.get("action") || ""),
          earlyReturnDate: String(formData.get("earlyReturnDate") || ""),
          unusedDays: Number(formData.get("unusedDays") || 0),
          recallOrderNumber: String(formData.get("recallOrderNumber") || ""),
          recallNote: String(formData.get("recallNote") || ""),
          files: formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0),
        }
      : await request.json().catch(() => ({}));
    const action = String(payload.action || "");
    if (!["hr_review", "approve", "reject", "cancel", "recall"].includes(action)) {
      return jsonError("Тодорхойгүй үйлдэл.", 400);
    }
    if (action === "recall" && !String(payload.earlyReturnDate || "")) {
      return jsonError("Ажилдаа эргэн орсон огноог оруулна уу.", 400);
    }
    const result = await actionTimeoffRequest(
      session,
      requestId,
      action as "hr_review" | "approve" | "reject" | "cancel" | "recall",
      {
        hrNote: String(payload.hrNote || ""),
        rejectionReason: String(payload.rejectionReason || ""),
        earlyReturnDate: String(payload.earlyReturnDate || ""),
        unusedDays: Number(payload.unusedDays || 0),
        recallOrderNumber: String(payload.recallOrderNumber || ""),
        recallNote: String(payload.recallNote || ""),
        files: payload.files,
      },
    );
    await notifyHrTimeoffRequestStatusChanged(result, session).catch((error) => {
      console.warn("HR time off status push failed:", error);
    });

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

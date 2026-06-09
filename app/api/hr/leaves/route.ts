import { getSession } from "@/lib/auth";
import { createTimeoffRequest, getLeaves, requireHrAccess, type HrTimeoffRequestCreateInput } from "@/lib/hr";
import { notifyHrTimeoffRequestSubmitted } from "@/lib/hr-notifications";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? "");
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function files(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "");
}

function isMongolianMessage(message: string) {
  return /[\u0400-\u04ff]/.test(message);
}

function translateHrLeaveError(error: unknown) {
  const message = getErrorMessage(error).trim();
  const normalized = message.toLocaleLowerCase("en-US");

  if (isMongolianMessage(message)) return message;

  if (normalized.includes("do not have any allocation") || normalized.includes("request an allocation")) {
    return "Энэ төрлийн чөлөөнд тухайн ажилтанд ашиглах эрх олгогдоогүй байна. Тухайн ажилтанд энэ чөлөөний эрхийг олгох эсвэл эрх шаарддаггүй чөлөөний төрөл сонгоно уу.";
  }

  if (normalized.includes("doesn't have 'create' access") || normalized.includes("have create access")) {
    return "Энэ хэрэглэгчид чөлөөний бүртгэл үүсгэх эрх хүрэлцэхгүй байна. Хэрэглэгчийн HR эрхийг шалгана уу.";
  }

  if (normalized.includes("access denied") || normalized.includes("access error") || normalized.includes("not allowed")) {
    return "Энэ үйлдлийг хийх эрх хүрэлцэхгүй байна. Хэрэглэгчийн HR эрхийг шалгана уу.";
  }

  if (normalized.includes("missing required") || normalized.includes("required field")) {
    return "Заавал бөглөх шаардлагатай мэдээлэл дутуу байна. Формын утгуудыг шалгана уу.";
  }

  if (normalized.includes("validation error") || normalized.includes("user error")) {
    return "Чөлөөний бүртгэлийн шалгалт амжилтгүй боллоо. Чөлөөний төрөл, огноо, ажилтны тохиргоог шалгана уу.";
  }

  if (message) {
    return "Чөлөөний бүртгэл үүсгэхэд алдаа гарлаа. Дэлгэрэнгүй мэдээлэл серверийн логт хадгалагдсан.";
  }

  return "Чөлөө бүртгэхэд алдаа гарлаа.";
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    return Response.json({ leaves: await getLeaves(session) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/leaves failed:", error);
    return jsonError("Чөлөөний бүртгэл уншихад алдаа гарлаа.");
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const formData = await request.formData();
    const leaveTypeName = getString(formData, "leaveTypeName");
    const input: HrTimeoffRequestCreateInput = {
      employeeId: getNumber(formData, "employeeId") ?? 0,
      requestType: leaveTypeName.toLocaleLowerCase("mn-MN").includes("өвч")
        ? "sick"
        : leaveTypeName.toLocaleLowerCase("mn-MN").includes("ээлж")
          ? "annual_leave"
          : "time_off",
      dateFrom: getString(formData, "dateFrom"),
      dateTo: getString(formData, "dateTo"),
      orderNumber: getString(formData, "orderNumber"),
      reason: getString(formData, "note") || leaveTypeName || "Чөлөө / өвчтэй хүсэлт",
      note: leaveTypeName,
      submit: formData.get("confirm") === "on",
      files: files(formData, "files"),
    };

    if (!input.employeeId) return jsonError("Ажилтан сонгоно уу.", 400);
    if (!input.dateFrom || !input.dateTo) return jsonError("Эхлэх болон дуусах огноо заавал бөглөнө үү.", 400);
    if (input.dateTo < input.dateFrom) {
      return jsonError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.", 400);
    }
    if (!input.reason && input.requestType === "annual_leave") input.reason = "Ээлжийн амралт";
    if (input.submit && input.requestType === "annual_leave" && !input.files?.length) {
      return jsonError("Ээлжийн амралт бүртгэхэд баримт файл заавал хавсаргана уу.", 400);
    }

    const createdRequest = await createTimeoffRequest(session, input);
    if (input.submit) {
      await notifyHrTimeoffRequestSubmitted(createdRequest, session).catch((error) => {
        console.warn("HR leave request push failed:", error);
      });
    }

    return Response.json({ request: createdRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("POST /api/hr/leaves failed:", error);
    return jsonError(translateHrLeaveError(error));
  }
}

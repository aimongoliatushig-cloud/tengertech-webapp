import { getSession } from "@/lib/auth";
import {
  deleteDiscipline,
  requireHrSpecialistAccess,
  updateDiscipline,
  type HrDisciplineUpdateInput,
} from "@/lib/hr";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ id: string }>;
};

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

function disciplineIdFromParam(id: string) {
  const value = Number(id);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isMongolianMessage(message: string) {
  return /[\u0400-\u04ff]/.test(message);
}

function translateDisciplineError(error: unknown) {
  const message = error instanceof Error && error.message ? error.message.trim() : String(error ?? "").trim();
  const normalized = message.toLocaleLowerCase("en-US");

  if (normalized.includes("access denied") || normalized.includes("access error") || normalized.includes("not allowed")) {
    return "Сахилгын бүртгэл засах/устгах эрх Odoo дээр хараахан идэвхжээгүй байна. Хэрэв устгах үйлдэл амжилтгүй хэвээр байвал hr_custom_mn module upgrade хийнэ үү.";
  }

  if (isMongolianMessage(message)) return message;

  if (normalized.includes("missing required") || normalized.includes("required field")) {
    return "Заавал бөглөх шаардлагатай мэдээлэл дутуу байна. Формын утгуудыг шалгана уу.";
  }

  if (normalized.includes("wrong value") || normalized.includes("invalid")) {
    return "Odoo дээр сонгосон зөрчлийн төрөл эсвэл арга хэмжээний утга тохирохгүй байна. Module шинэчлэгдсэн эсэхийг шалгана уу.";
  }

  if (message) {
    console.error("HR discipline update/delete failed:", error);
    return "Сахилгын бүртгэл засах/устгахад Odoo дээр алдаа гарлаа. Дэлгэрэнгүй мэдээлэл серверийн логт хадгалагдсан.";
  }

  return "Сахилгын бүртгэл засах/устгахад алдаа гарлаа.";
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrSpecialistAccess(session);
    const { id } = await ctx.params;
    const disciplineId = disciplineIdFromParam(id);
    if (!disciplineId) return jsonError("Сахилгын бүртгэлийн дугаар буруу байна.", 400);

    const formData = await request.formData();
    const input: HrDisciplineUpdateInput = {
      employeeId: getNumber(formData, "employeeId") ?? 0,
      violationType: getString(formData, "violationType"),
      violationDate: getString(formData, "violationDate"),
      actionType: getString(formData, "actionType"),
      explanation: getString(formData, "explanation"),
      employeeExplanation: getString(formData, "employeeExplanation"),
      files: files(formData, "files"),
    };

    if (!input.employeeId) return jsonError("Ажилтан сонгоно уу.", 400);
    if (!input.violationType) return jsonError("Зөрчлийн төрөл сонгоно уу.", 400);
    if (!input.violationDate) return jsonError("Зөрчлийн огноо заавал оруулна уу.", 400);
    if (!input.actionType) return jsonError("Авсан арга хэмжээ сонгоно уу.", 400);

    return Response.json({ discipline: await updateDiscipline(session, disciplineId, input) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд сахилгын бүртгэл засах HR эрх байхгүй байна.", 403);
    }
    return jsonError(translateDisciplineError(error));
  }
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrSpecialistAccess(session);
    const { id } = await ctx.params;
    const disciplineId = disciplineIdFromParam(id);
    if (!disciplineId) return jsonError("Сахилгын бүртгэлийн дугаар буруу байна.", 400);

    return Response.json({ discipline: await deleteDiscipline(session, disciplineId) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд сахилгын бүртгэл устгах HR эрх байхгүй байна.", 403);
    }
    return jsonError(translateDisciplineError(error));
  }
}

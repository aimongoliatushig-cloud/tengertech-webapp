import { getSession } from "@/lib/auth";
import { getEmployee, requireHrAccess, updateEmployee } from "@/lib/hr";

export const dynamic = "force-dynamic";

const MAX_EMPLOYEE_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_EMPLOYEE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeEmployeeUpdatePayload(payload: Record<string, unknown>) {
  return {
    name: String(payload.name ?? "").trim(),
    employeeCode: String(payload.employeeCode ?? "").trim(),
    genderKey: String(payload.genderKey ?? "").trim(),
    birthDate: String(payload.birthDate ?? "").trim(),
    workPhone: String(payload.workPhone ?? "").trim(),
    mobilePhone: String(payload.mobilePhone ?? "").trim(),
    workEmail: String(payload.workEmail ?? "").trim(),
  };
}

async function parseEmployeeUpdatePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const payload = (await request.json()) as Record<string, unknown>;
    return normalizeEmployeeUpdatePayload(payload);
  }

  const formData = await request.formData();
  const payload: Record<string, unknown> = normalizeEmployeeUpdatePayload({
    name: formString(formData, "name"),
    employeeCode: formString(formData, "employeeCode"),
    genderKey: formString(formData, "genderKey"),
    birthDate: formString(formData, "birthDate"),
    workPhone: formString(formData, "workPhone"),
    mobilePhone: formString(formData, "mobilePhone"),
    workEmail: formString(formData, "workEmail"),
  });
  const photo = formData.get("profilePhoto");

  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_EMPLOYEE_PHOTO_TYPES.has(photo.type)) {
      throw new Error("INVALID_EMPLOYEE_PHOTO_TYPE");
    }
    if (photo.size > MAX_EMPLOYEE_PHOTO_SIZE) {
      throw new Error("EMPLOYEE_PHOTO_TOO_LARGE");
    }
    payload.profilePhotoBase64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
  }

  return payload;
}

type RouteCtx = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employee = await getEmployee(session, Number(id));
    if (!employee) return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees/[id] failed:", error);
    return jsonError("Ажилтны мэдээлэл уншихад алдаа гарлаа.");
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employeeId = Number(id);
    const visibleEmployee = await getEmployee(session, employeeId);
    if (!visibleEmployee) return jsonError("Энэ ажилтны мэдээллийг засах эрхгүй байна.", 403);

    const payload = await parseEmployeeUpdatePayload(request);
    const employee = await updateEmployee(session, employeeId, payload);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    if (error instanceof Error && error.message === "INVALID_EMPLOYEE_PHOTO_TYPE") {
      return jsonError("Зөвхөн JPG, PNG эсвэл WebP зураг оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_PHOTO_TOO_LARGE") {
      return jsonError("Профайл зураг 5MB-аас бага байх ёстой.", 400);
    }
    console.error("PATCH /api/hr/employees/[id] failed:", error);
    return jsonError("Ажилтны мэдээлэл шинэчлэхэд алдаа гарлаа.");
  }
}

import { getSession } from "@/lib/auth";
import { getEmployee, requireHrAccess, requireHrSpecialistAccess, updateEmployee } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

type RouteCtx = {
  params: Promise<{ id: string }>;
};

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

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
    await requireHrSpecialistAccess(session);
    const { id } = await ctx.params;
    const contentType = request.headers.get("content-type") || "";
    const payload = contentType.includes("multipart/form-data")
      ? await request.formData().then((formData) => ({
          name: getString(formData, "name"),
          employeeCode: getString(formData, "employeeCode"),
          genderKey: getString(formData, "genderKey"),
          birthDate: getString(formData, "birthDate"),
          probationStartDate: getString(formData, "probationStartDate"),
          probationEndDate: getString(formData, "probationEndDate"),
          workPhone: getString(formData, "workPhone"),
          mobilePhone: getString(formData, "mobilePhone"),
          workEmail: getString(formData, "workEmail"),
          employeePhoto: getFiles(formData, "employeePhoto")[0],
          files: getFiles(formData, "files"),
        }))
      : await request.json();
    const employee = await updateEmployee(session, Number(id), payload);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    if (error instanceof Error && error.message.startsWith("HR_EMPLOYEE_UPDATE_VALIDATION:")) {
      return jsonError(error.message.replace("HR_EMPLOYEE_UPDATE_VALIDATION:", ""), 400);
    }
    console.error("PATCH /api/hr/employees/[id] failed:", error);
    return jsonError(error instanceof Error ? error.message : "Ажилтны мэдээлэл шинэчлэхэд алдаа гарлаа.", 400);
  }
}

import { getSession } from "@/lib/auth";
import { createEmployee, getEmployees, requireHrAccess, type HrEmployeeCreateInput } from "@/lib/hr";

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

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    return Response.json({ employees: await getEmployees(session) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees failed:", error);
    return jsonError("Ажилтны мэдээлэл уншихад алдаа гарлаа.");
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const formData = await request.formData();
    const input: HrEmployeeCreateInput = {
      lastName: getString(formData, "lastName"),
      firstName: getString(formData, "firstName"),
      registerNumber: getString(formData, "registerNumber"),
      phone: getString(formData, "phone"),
      email: getString(formData, "email"),
      departmentId: getNumber(formData, "departmentId"),
      jobId: getNumber(formData, "jobId"),
      jobTitle: getString(formData, "jobTitle"),
      managerId: getNumber(formData, "managerId"),
      startDate: getString(formData, "startDate"),
      workType: getString(formData, "workType"),
      isFieldEmployee: formData.get("isFieldEmployee") === "on",
      fieldRole: getString(formData, "fieldRole"),
      workLocation: getString(formData, "workLocation"),
      emergencyContact: getString(formData, "emergencyContact"),
      note: getString(formData, "note"),
    };

    if (!input.firstName) {
      return jsonError("Ажилтны нэр заавал бөглөнө үү.", 400);
    }

    const employee = await createEmployee(session, input);
    return Response.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("POST /api/hr/employees failed:", error);
    return jsonError("Ажилтан бүртгэхэд алдаа гарлаа. Odoo холболт болон эрхийн тохиргоог шалгана уу.");
  }
}

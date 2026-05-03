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
      gender: getString(formData, "gender"),
      birthDate: getString(formData, "birthDate"),
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
      emergencyPhone: getString(formData, "emergencyPhone"),
      homeAddress: getString(formData, "homeAddress"),
      note: getString(formData, "note"),
    };

    if (!input.lastName) {
      return jsonError("Ажилтны овог заавал бөглөнө үү.", 400);
    }
    if (!input.firstName) {
      return jsonError("Ажилтны нэр заавал бөглөнө үү.", 400);
    }
    if (!input.registerNumber) {
      return jsonError("Регистрийн дугаар заавал бөглөнө үү.", 400);
    }
    if (!input.departmentId) {
      return jsonError("Хэлтэс / алба заавал сонгоно уу.", 400);
    }
    if (!input.jobId) {
      return jsonError("Албан тушаал заавал сонгоно уу.", 400);
    }
    if (input.startDate) {
      const startDate = new Date(`${input.startDate}T00:00:00`);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (!Number.isNaN(startDate.getTime()) && startDate > today) {
        return jsonError("Ажилд орсон огноо ирээдүйн огноо байж болохгүй.", 400);
      }
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

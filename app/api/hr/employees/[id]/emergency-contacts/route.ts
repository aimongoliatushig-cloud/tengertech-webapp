import { getSession } from "@/lib/auth";
import { createEmployeeEmergencyContact, getEmployeeEmergencyContacts, requireHrAccess } from "@/lib/hr";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ id: string }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function emergencyContactErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Яаралтай холбоо хадгалахад алдаа гарлаа.";
  if (error.message === "HR_ACCESS_DENIED") return "Танд хүний нөөцийн мэдээлэл засах эрх байхгүй байна.";
  if (error.message === "HR_EMERGENCY_CONTACT_NAME_REQUIRED") return "Холбоо барих хүний нэрийг оруулна уу.";
  if (error.message === "HR_EMERGENCY_CONTACT_PHONE_REQUIRED") return "Холбоо барих утсыг оруулна уу.";
  return "Яаралтай холбоо хадгалахад алдаа гарлаа.";
}

export async function GET(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);
    return Response.json({ emergencyContacts: await getEmployeeEmergencyContacts(session, employeeId) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн мэдээлэл харах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees/[id]/emergency-contacts failed:", error);
    return jsonError("Яаралтай холбоо уншихад алдаа гарлаа.");
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    const { id } = await ctx.params;
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);

    const formData = await request.formData();
    const emergencyContact = await createEmployeeEmergencyContact(session, employeeId, {
      name: getString(formData, "name"),
      relation: getString(formData, "relation"),
      phone: getString(formData, "phone"),
      address: getString(formData, "address"),
      note: getString(formData, "note"),
    });

    return Response.json({ emergencyContact }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "HR_ACCESS_DENIED" ? 403 : 400;
    if (
      error instanceof Error &&
      !["HR_ACCESS_DENIED", "HR_EMERGENCY_CONTACT_NAME_REQUIRED", "HR_EMERGENCY_CONTACT_PHONE_REQUIRED"].includes(error.message)
    ) {
      console.error("POST /api/hr/employees/[id]/emergency-contacts failed:", error);
    }
    return jsonError(emergencyContactErrorMessage(error), status);
  }
}

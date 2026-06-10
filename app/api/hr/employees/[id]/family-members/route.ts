import { getSession } from "@/lib/auth";
import { createEmployeeFamilyMember, getEmployeeFamilyMembers, requireHrAccess } from "@/lib/hr";

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

function familyMemberErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Гэр бүлийн гишүүн хадгалахад алдаа гарлаа.";
  }

  if (error.message === "HR_ACCESS_DENIED") {
    return "Танд хүний нөөцийн мэдээлэл засах эрх байхгүй байна.";
  }
  if (error.message === "HR_FAMILY_MEMBER_NAME_REQUIRED") {
    return "Гэр бүлийн гишүүний нэрийг оруулна уу.";
  }
  if (error.message === "HR_FAMILY_MEMBER_SELF_NOT_ALLOWED") {
    return "Ажилтныг өөрийг нь гэр бүлийн гишүүнээр нэмэх боломжгүй.";
  }
  if (error.message === "HR_FAMILY_MEMBER_RELATED_NOT_FOUND") {
    return "Сонгосон ажилтан олдсонгүй эсвэл танд харагдахгүй байна.";
  }
  if (error.message === "HR_FAMILY_MEMBER_DUPLICATE") {
    return "Энэ ажилтан ижил хамаарлаар аль хэдийн нэмэгдсэн байна.";
  }

  return "Гэр бүлийн гишүүн хадгалахад алдаа гарлаа.";
}

export async function GET(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);
    }
    return Response.json({ familyMembers: await getEmployeeFamilyMembers(session, employeeId) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн мэдээлэл харах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees/[id]/family-members failed:", error);
    return jsonError("Гэр бүлийн гишүүдийг уншихад алдаа гарлаа.");
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);
    }

    const formData = await request.formData();
    const familyMember = await createEmployeeFamilyMember(session, employeeId, {
      relatedEmployeeId: Number(getString(formData, "relatedEmployeeId")) || null,
      name: getString(formData, "name"),
      birthYear: getString(formData, "birthYear"),
      school: getString(formData, "school"),
      phone: getString(formData, "phone"),
      relation: getString(formData, "relation"),
    });

    return Response.json({ familyMember }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "HR_ACCESS_DENIED" ? 403 : 400;
    if (status !== 400) {
      return jsonError(familyMemberErrorMessage(error), status);
    }
    if (
      error instanceof Error &&
      ![
        "HR_FAMILY_MEMBER_NAME_REQUIRED",
        "HR_FAMILY_MEMBER_SELF_NOT_ALLOWED",
        "HR_FAMILY_MEMBER_RELATED_NOT_FOUND",
        "HR_FAMILY_MEMBER_DUPLICATE",
      ].includes(error.message)
    ) {
      console.error("POST /api/hr/employees/[id]/family-members failed:", error);
    }
    return jsonError(familyMemberErrorMessage(error), status);
  }
}

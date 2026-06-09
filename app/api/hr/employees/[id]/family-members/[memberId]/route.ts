import { getSession } from "@/lib/auth";
import {
  deleteEmployeeFamilyMember,
  requireHrAccess,
  updateEmployeeFamilyMember,
} from "@/lib/hr";

export const dynamic = "force-dynamic";

type RouteCtx = {
  params: Promise<{ id: string; memberId: string }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function familyMemberErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Гэр бүлийн гишүүний мэдээлэл хадгалахад алдаа гарлаа.";
  }
  if (error.message === "HR_ACCESS_DENIED") {
    return "Танд хүний нөөцийн мэдээлэл засах эрх байхгүй байна.";
  }
  if (error.message === "HR_FAMILY_MEMBER_NAME_REQUIRED") {
    return "Гэр бүлийн гишүүний нэрийг оруулна уу.";
  }
  if (error.message === "HR_FAMILY_MEMBER_NOT_FOUND") {
    return "Гэр бүлийн гишүүний бүртгэл олдсонгүй.";
  }
  if (error.message === "HR_FAMILY_MEMBER_DUPLICATE") {
    return "Энэ гэр бүлийн гишүүн ижил хамаарлаар аль хэдийн нэмэгдсэн байна.";
  }
  return "Гэр бүлийн гишүүний мэдээлэл хадгалахад алдаа гарлаа.";
}

function parseIds(id: string, memberId: string) {
  const employeeId = Number(id);
  const familyMemberId = Number(memberId);
  if (!Number.isFinite(employeeId) || employeeId <= 0 || !Number.isFinite(familyMemberId) || familyMemberId <= 0) {
    return null;
  }
  return { employeeId, familyMemberId };
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id, memberId } = await ctx.params;
    const ids = parseIds(id, memberId);
    if (!ids) return jsonError("Гэр бүлийн гишүүний бүртгэл олдсонгүй.", 404);

    const formData = await request.formData();
    const familyMember = await updateEmployeeFamilyMember(session, ids.employeeId, ids.familyMemberId, {
      name: getString(formData, "name"),
      phone: getString(formData, "phone"),
      relation: getString(formData, "relation"),
    });

    return Response.json({ familyMember });
  } catch (error) {
    const status =
      error instanceof Error && error.message === "HR_ACCESS_DENIED"
        ? 403
        : error instanceof Error && error.message === "HR_FAMILY_MEMBER_NOT_FOUND"
          ? 404
          : 400;
    if (status === 400 && error instanceof Error && !["HR_FAMILY_MEMBER_NAME_REQUIRED", "HR_FAMILY_MEMBER_DUPLICATE"].includes(error.message)) {
      console.error("PATCH /api/hr/employees/[id]/family-members/[memberId] failed:", error);
    }
    return jsonError(familyMemberErrorMessage(error), status);
  }
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id, memberId } = await ctx.params;
    const ids = parseIds(id, memberId);
    if (!ids) return jsonError("Гэр бүлийн гишүүний бүртгэл олдсонгүй.", 404);

    return Response.json(await deleteEmployeeFamilyMember(session, ids.employeeId, ids.familyMemberId));
  } catch (error) {
    const status =
      error instanceof Error && error.message === "HR_ACCESS_DENIED"
        ? 403
        : error instanceof Error && error.message === "HR_FAMILY_MEMBER_NOT_FOUND"
          ? 404
          : 400;
    if (status === 400) {
      console.error("DELETE /api/hr/employees/[id]/family-members/[memberId] failed:", error);
    }
    return jsonError(familyMemberErrorMessage(error), status);
  }
}

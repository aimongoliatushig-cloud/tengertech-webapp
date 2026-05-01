import { getSession } from "@/lib/auth";
import { getEmployee, requireHrAccess, updateEmployee } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
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
    const payload = await request.json();
    const employee = await updateEmployee(session, Number(id), payload);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("PATCH /api/hr/employees/[id] failed:", error);
    return jsonError("Ажилтны мэдээлэл шинэчлэхэд алдаа гарлаа.");
  }
}

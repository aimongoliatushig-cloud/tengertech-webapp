import { getSession } from "@/lib/auth";
import { createEmployeeTalentSkill, getEmployeeTalentSkills, requireHrAccess } from "@/lib/hr";

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

function talentSkillErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Авьяас, чадвар хадгалахад алдаа гарлаа.";
  if (error.message === "HR_ACCESS_DENIED") return "Танд хүний нөөцийн мэдээлэл засах эрх байхгүй байна.";
  if (error.message === "HR_TALENT_SKILL_NAME_REQUIRED") return "Авьяас, чадварын нэрийг оруулна уу.";
  return "Авьяас, чадвар хадгалахад алдаа гарлаа.";
}

export async function GET(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employeeId = Number(id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);
    return Response.json({ talentSkills: await getEmployeeTalentSkills(session, employeeId) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн мэдээлэл харах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees/[id]/talent-skills failed:", error);
    return jsonError("Авьяас, чадвар уншихад алдаа гарлаа.");
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
    const talentSkill = await createEmployeeTalentSkill(session, employeeId, {
      name: getString(formData, "name"),
      type: getString(formData, "type"),
      level: getString(formData, "level"),
      acquiredDate: getString(formData, "acquiredDate"),
      note: getString(formData, "note"),
    });

    return Response.json({ talentSkill }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "HR_ACCESS_DENIED" ? 403 : 400;
    if (error instanceof Error && !["HR_ACCESS_DENIED", "HR_TALENT_SKILL_NAME_REQUIRED"].includes(error.message)) {
      console.error("POST /api/hr/employees/[id]/talent-skills failed:", error);
    }
    return jsonError(talentSkillErrorMessage(error), status);
  }
}

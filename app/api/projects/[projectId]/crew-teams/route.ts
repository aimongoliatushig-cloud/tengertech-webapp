import { getSession, hasCapability } from "@/lib/auth";
import { createWorkspaceCrewTeam, loadProjectDetail } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

type CrewTeamCreatePayload = {
  name?: string;
  memberUserIds?: unknown[];
};

function jsonError(message: string, status = 500) {
  return Response.json({ ok: false, error: message }, { status });
}

function parseMemberUserIds(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(String(value ?? "")))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }
  if (!hasCapability(session, "create_tasks")) {
    return jsonError("Баг үүсгэх эрхгүй байна.", 403);
  }

  const { projectId } = await context.params;
  const parsedProjectId = Number(projectId);
  if (!Number.isFinite(parsedProjectId) || parsedProjectId <= 0) {
    return jsonError("Ажлын дугаар буруу байна.", 400);
  }

  const payload = (await request.json().catch(() => null)) as CrewTeamCreatePayload | null;
  const name = String(payload?.name ?? "").trim();
  const memberUserIds = parseMemberUserIds(payload?.memberUserIds ?? []);

  if (!name) {
    return jsonError("Багийн нэр оруулна уу.", 400);
  }
  if (!memberUserIds.length) {
    return jsonError("Багийн гишүүдээс дор хаяж нэг ажилтан сонгоно уу.", 400);
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  try {
    const project = await loadProjectDetail(parsedProjectId, connectionOverrides);
    const createdTeam = await createWorkspaceCrewTeam(
      {
        name,
        departmentId: project.departmentId,
        operationType: project.operationType || undefined,
        memberUserIds,
      },
      connectionOverrides,
    );

    return Response.json({
      ok: true,
      team: {
        id: createdTeam.id,
        label: name,
        memberUserIds: createdTeam.memberUserIds,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(`Баг хадгалах үед алдаа гарлаа: ${message}`, 500);
  }
}

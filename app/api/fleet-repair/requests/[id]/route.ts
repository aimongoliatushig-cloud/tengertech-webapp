import { getSession } from "@/lib/auth";
import {
  FLEET_REPAIR_SAFE_ERROR,
  assertFleetRepairModelConfig,
  getFleetRepairPermissions,
  loadFleetRepairRequest,
} from "@/lib/fleet-repair";

export const dynamic = "force-dynamic";

type RequestContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RequestContext) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const { id } = await context.params;
  const requestId = Number(id);
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return jsonError("Хүсэлтийн дугаар буруу байна.", 400);
  }

  try {
    assertFleetRepairModelConfig();
    const result = await loadFleetRepairRequest(session, requestId);
    if (!result) {
      return jsonError("Засварын хүсэлт олдсонгүй.", 404);
    }
    return Response.json({
      request: result,
      permissions: getFleetRepairPermissions(session),
    });
  } catch (error) {
    console.error(error);
    return jsonError(FLEET_REPAIR_SAFE_ERROR);
  }
}

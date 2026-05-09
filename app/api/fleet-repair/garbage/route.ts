import { getSession } from "@/lib/auth";
import {
  FLEET_REPAIR_SAFE_ERROR,
  assertFleetRepairModelConfig,
  canAccessFleetRepair,
  loadFleetRepairGarbage,
} from "@/lib/fleet-repair";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  if (!canAccessFleetRepair(session)) {
    return Response.json({ error: "Засварын workflow харах эрхгүй байна." }, { status: 403 });
  }

  try {
    assertFleetRepairModelConfig();
    return Response.json(await loadFleetRepairGarbage(session));
  } catch (error) {
    console.error(error);
    return Response.json({ error: FLEET_REPAIR_SAFE_ERROR }, { status: 500 });
  }
}

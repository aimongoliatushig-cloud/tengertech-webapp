import { getSession } from "@/lib/auth";
import {
  FLEET_REPAIR_SAFE_ERROR,
  FleetRepairPermissionError,
  assertFleetRepairModelConfig,
  createFleetRepairRequest,
  getFleetRepairPermissions,
  loadFleetRepairRequests,
  type FleetRepairCreateInput,
} from "@/lib/fleet-repair";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function firstFileList(formData: FormData, name: string) {
  return formData.getAll(name).filter((value): value is File => value instanceof File);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  try {
    assertFleetRepairModelConfig();
    return Response.json(await loadFleetRepairRequests(session));
  } catch (error) {
    console.error(error);
    return jsonError(FLEET_REPAIR_SAFE_ERROR);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  const permissions = getFleetRepairPermissions(session);
  if (!permissions.request) {
    return jsonError("Засварын хүсэлт үүсгэх эрхгүй байна.", 403);
  }

  try {
    assertFleetRepairModelConfig();
    const formData = await request.formData();
    const vehicleId = Number(formData.get("vehicle_id") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const input: FleetRepairCreateInput = {
      vehicleId: Number.isFinite(vehicleId) && vehicleId > 0 ? vehicleId : undefined,
      issueSummary: String(formData.get("issue_summary") ?? "").trim() || description.slice(0, 120),
      description,
      partsNote: String(formData.get("parts_note") ?? "").trim(),
      mode: formData.get("mode") === "submit" ? "submit" : "draft",
      files: firstFileList(formData, "files"),
    };

    if (!input.issueSummary) {
      return jsonError("Асуудлын товч заавал бөглөнө үү.", 400);
    }

    if (!input.description) {
      return jsonError("Эвдрэлийн тайлбар заавал бөглөнө үү.", 400);
    }

    return Response.json(await createFleetRepairRequest(session, input), { status: 201 });
  } catch (error) {
    if (error instanceof FleetRepairPermissionError) {
      return jsonError(error.message, 403);
    }
    console.error(error);
    return jsonError(FLEET_REPAIR_SAFE_ERROR);
  }
}

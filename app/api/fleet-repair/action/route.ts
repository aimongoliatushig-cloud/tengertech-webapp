import { getSession } from "@/lib/auth";
import {
  FLEET_REPAIR_SAFE_ERROR,
  assertFleetRepairModelConfig,
  getFleetRepairPermissions,
  runFleetRepairAction,
  type FleetRepairPermissionKey,
} from "@/lib/fleet-repair";
import { notifyPushEvent } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

const ACTION_PERMISSION: Record<string, FleetRepairPermissionKey> = {
  submit: "request",
  add_quotes: "quote",
  select_supplier: "finance",
  make_payment: "finance",
  upload_contract_draft: "contract",
  upload_contract_final: "contract",
  director_approve: "director",
  director_return: "director",
  upload_order: "order",
  receive_parts: "quote",
  complete_repair: "repair",
};

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function filesFrom(formData: FormData) {
  return formData.getAll("files").filter((value): value is File => value instanceof File);
}

function collectPayload(formData: FormData) {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (["request_id", "action", "files"].includes(key) || value instanceof File) {
      continue;
    }
    if (key.endsWith("[]")) {
      const listKey = key.slice(0, -2);
      payload[listKey] = formData.getAll(key).map((item) => String(item));
      continue;
    }
    payload[key] = String(value);
  }
  return payload;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }

  try {
    assertFleetRepairModelConfig();
    const formData = await request.formData();
    const requestId = Number(formData.get("request_id") ?? "");
    const action = String(formData.get("action") ?? "").trim();
    if (!Number.isFinite(requestId) || requestId <= 0 || !action) {
      return jsonError("Үйлдлийн мэдээлэл дутуу байна.", 400);
    }

    const permissionKey = ACTION_PERMISSION[action];
    const permissions = getFleetRepairPermissions(session);
    if (!permissionKey || !permissions[permissionKey]) {
      return jsonError("Энэ үйлдлийг хийх эрхгүй байна.", 403);
    }

    await runFleetRepairAction(session, {
      requestId,
      action,
      payload: collectPayload(formData),
      files: filesFrom(formData),
    });

    if (action === "submit") {
      await notifyPushEvent({
        eventType: "vehicle_broken",
        title: "Машины эвдрэл бүртгэгдлээ",
        body: "Засварын шинэ хүсэлт ирлээ.",
        targetUrl: `/fleet-repair/requests/${requestId}`,
      }).catch((error) => console.warn("Repair submit push failed:", error));
    }

    if (action === "complete_repair") {
      await notifyPushEvent({
        eventType: "work_approved",
        title: "Засвар дууслаа",
        body: "Машины засварын хүсэлт дууссан төлөвт орлоо.",
        targetUrl: `/fleet-repair/requests/${requestId}`,
      }).catch((error) => console.warn("Repair completion push failed:", error));
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonError(FLEET_REPAIR_SAFE_ERROR);
  }
}

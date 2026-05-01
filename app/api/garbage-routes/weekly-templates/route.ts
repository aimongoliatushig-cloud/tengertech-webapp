import {
  createGarbageWeeklyTemplate,
  loadGarbageWeeklyTemplates,
} from "@/lib/garbage-weekly-template-store";
import type { GarbageWeeklyTemplateInput } from "@/lib/garbage-weekly-template-types";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { jsonError, withSession } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSession(async (session) => {
    const permissions = getGarbageRoutePermissions(session);
    if (!permissions.all_view && !permissions.today_view && !permissions.weekly_create) {
      throw new Error("Таны эрх хүрэхгүй байна.");
    }

    return { templates: await loadGarbageWeeklyTemplates() };
  });
}

export async function POST(request: Request) {
  let payload: GarbageWeeklyTemplateInput;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Хадгалах мэдээлэл буруу байна.", 400);
  }

  return withSession((session) => {
    if (!getGarbageRoutePermissions(session).weekly_create) {
      throw new Error("Таны эрх хүрэхгүй байна.");
    }
    return createGarbageWeeklyTemplate(payload);
  });
}

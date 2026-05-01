import {
  deleteGarbageWeeklyTemplate,
  updateGarbageWeeklyTemplate,
} from "@/lib/garbage-weekly-template-store";
import type { GarbageWeeklyTemplateInput } from "@/lib/garbage-weekly-template-types";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { jsonError, withSession } from "../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  let payload: GarbageWeeklyTemplateInput;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Хадгалах мэдээлэл буруу байна.", 400);
  }

  return withSession((session) => {
    if (!getGarbageRoutePermissions(session).weekly_edit) {
      throw new Error("Таны эрх хүрэхгүй байна.");
    }
    return updateGarbageWeeklyTemplate(id, payload);
  });
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  return withSession((session) => {
    if (!getGarbageRoutePermissions(session).weekly_edit) {
      throw new Error("Таны эрх хүрэхгүй байна.");
    }
    return deleteGarbageWeeklyTemplate(id);
  });
}

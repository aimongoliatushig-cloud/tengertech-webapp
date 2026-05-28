import "server-only";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import type { AppSession } from "@/lib/auth";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import { loadWorkspaceNotificationSummary } from "@/lib/workspace-notifications";

export async function warmCommonWorkspace(session: AppSession) {
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [snapshot, scopedDepartmentName] = await Promise.all([
    loadMunicipalSnapshot(connectionOverrides),
    loadSessionDepartmentName(session),
  ]);

  const notificationWarm = await Promise.allSettled([
    loadWorkspaceNotificationSummary(session, {
      snapshot,
      scopedDepartmentName,
    }),
  ]);

  const failed = notificationWarm.filter((result) => result.status === "rejected").length;
  return {
    ok: failed === 0,
    scopedDepartmentName,
    warmed: notificationWarm.length - failed,
    failed,
  };
}

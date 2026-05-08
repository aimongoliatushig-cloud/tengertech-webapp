import { NextResponse } from "next/server";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { requireSession } from "@/lib/auth";
import { loadGarbageWeeklyTemplates } from "@/lib/garbage-weekly-template-store";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import { loadWorkspaceNotificationSummary } from "@/lib/workspace-notifications";

export async function GET() {
  const session = await requireSession();
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [snapshot, scopedDepartmentName] = await Promise.all([
    loadMunicipalSnapshot(connectionOverrides),
    loadSessionDepartmentName(session),
    loadGarbageWeeklyTemplates(),
  ]);

  await loadWorkspaceNotificationSummary(session, {
    snapshot,
    scopedDepartmentName,
  });

  return NextResponse.json({ ok: true });
}

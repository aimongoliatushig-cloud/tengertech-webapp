import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { GarbageDashboardClient } from "../garbage-routes-client";

export default async function GarbageDashboardPage() {
  const session = await requireSession();
  const permissions = getGarbageRoutePermissions(session);
  if (!permissions.dashboard_view) {
    redirect(permissions.today_view ? "/garbage-routes/today" : "/");
  }

  return <GarbageDashboardClient />;
}

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { WeeklyPlanListClient } from "../garbage-routes-client";

export default async function WeeklyPlanPage() {
  const session = await requireSession();
  const permissions = getGarbageRoutePermissions(session);
  if (!permissions.all_view) {
    redirect(permissions.today_view ? "/garbage-routes/today" : "/");
  }

  return <WeeklyPlanListClient />;
}

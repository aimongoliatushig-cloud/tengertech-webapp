import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { WeeklyPlanFormClient } from "../../garbage-routes-client";

export default async function NewWeeklyPlanPage() {
  const session = await requireSession();
  const permissions = getGarbageRoutePermissions(session);
  if (!permissions.weekly_create) {
    redirect(permissions.all_view ? "/garbage-routes/weekly-plan" : "/garbage-routes/today");
  }

  return <WeeklyPlanFormClient />;
}

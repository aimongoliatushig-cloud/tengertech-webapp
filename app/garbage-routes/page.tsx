import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

export default async function GarbageRoutesIndexPage() {
  const session = await requireSession();
  const permissions = getGarbageRoutePermissions(session);

  if (permissions.dashboard_view) {
    redirect("/garbage-routes/dashboard");
  }
  if (permissions.all_view) {
    redirect("/garbage-routes/weekly-plan");
  }
  if (permissions.today_view) {
    redirect("/garbage-routes/today");
  }
  redirect("/");
}

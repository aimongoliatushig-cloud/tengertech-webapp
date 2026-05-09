import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { InspectionsClient } from "../garbage-routes-client";

export default async function InspectionsPage() {
  const session = await requireSession();
  const permissions = getGarbageRoutePermissions(session);
  if (!permissions.all_view) {
    redirect(permissions.today_view ? "/garbage-routes/today" : "/");
  }

  return <InspectionsClient />;
}

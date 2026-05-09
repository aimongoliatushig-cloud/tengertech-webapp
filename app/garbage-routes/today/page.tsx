import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { TodayRouteClient } from "../garbage-routes-client";

export default async function TodayRoutePage() {
  const session = await requireSession();
  if (!getGarbageRoutePermissions(session).today_view) {
    redirect("/");
  }

  return <TodayRouteClient />;
}

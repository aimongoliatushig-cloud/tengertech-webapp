import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions } from "@/lib/garbage-routes";

import { WeeklyPlanDetailClient } from "../../garbage-routes-client";

type Props = { params: Promise<{ id: string }> };

export default async function WeeklyPlanDetailPage({ params }: Props) {
  const session = await requireSession();
  const permissions = getGarbageRoutePermissions(session);
  if (!permissions.all_view) {
    redirect(permissions.today_view ? "/garbage-routes/today" : "/");
  }

  const { id } = await params;
  return <WeeklyPlanDetailClient planId={Number(id)} />;
}

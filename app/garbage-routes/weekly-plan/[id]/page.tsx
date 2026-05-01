import { WeeklyPlanDetailClient } from "../../garbage-routes-client";

type Props = { params: Promise<{ id: string }> };

export default async function WeeklyPlanDetailPage({ params }: Props) {
  const { id } = await params;
  return <WeeklyPlanDetailClient planId={Number(id)} />;
}

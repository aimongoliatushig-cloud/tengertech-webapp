import { FleetRepairDetailClient } from "../../fleet-repair-client";

type FleetRepairDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FleetRepairDetailPage({ params }: FleetRepairDetailPageProps) {
  const { id } = await params;
  return <FleetRepairDetailClient requestId={Number(id)} />;
}


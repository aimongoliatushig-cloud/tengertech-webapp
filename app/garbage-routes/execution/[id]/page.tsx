import { ExecutionClient } from "../../garbage-routes-client";

type Props = { params: Promise<{ id: string }> };

export default async function ExecutionPage({ params }: Props) {
  const { id } = await params;
  return <ExecutionClient routeId={Number(id)} />;
}

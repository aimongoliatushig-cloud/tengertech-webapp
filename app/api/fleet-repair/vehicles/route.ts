import { getSession } from "@/lib/auth";
import { getFleetRepairPermissions, loadFleetRepairVehicleOptions } from "@/lib/fleet-repair";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  if (!getFleetRepairPermissions(session).request) {
    return Response.json({ error: "Засварын хүсэлт үүсгэх эрхгүй байна." }, { status: 403 });
  }

  try {
    return Response.json(await loadFleetRepairVehicleOptions(session));
  } catch {
    return Response.json(
      { error: "Машины жагсаалтыг уншиж чадсангүй." },
      { status: 500 },
    );
  }
}

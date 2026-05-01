import { getSession } from "@/lib/auth";
import { loadFleetRepairVehicleOptions } from "@/lib/fleet-repair";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }

  try {
    return Response.json(await loadFleetRepairVehicleOptions(session));
  } catch {
    return Response.json(
      { error: "Машины жагсаалтыг Odoo Fleet-ээс уншиж чадсангүй." },
      { status: 500 },
    );
  }
}

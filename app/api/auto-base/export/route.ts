import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  canAccessAutoBaseOverview,
  getSession,
  isWorkerOnly,
} from "@/lib/auth";
import {
  isGreenOrImprovementVehicleScope,
  scopeFleetVehicleBoardByDepartment,
} from "@/lib/fleet-vehicle-board-scope";
import {
  buildFleetVehicleDocx,
  buildFleetVehiclePdf,
  buildFleetVehicleXlsx,
  prepareFleetVehiclesForExport,
} from "@/lib/fleet-vehicle-list-export";
import { loadFleetVehicleBoard } from "@/lib/odoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseIds(value: string | null) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => Number(item))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }

  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const canViewAll = canAccessAutoBaseOverview(session, scopedDepartmentName);
  const canViewOwnDepartment = Boolean(
    !isWorkerOnly(session) &&
      isGreenOrImprovementVehicleScope(scopedDepartmentName) &&
      (session.role === "project_manager" ||
        session.groupFlags?.municipalDepartmentHead ||
        session.groupFlags?.municipalManager ||
        session.groupFlags?.environmentManager ||
        session.groupFlags?.improvementManager),
  );
  if (!canViewAll && !canViewOwnDepartment) {
    return Response.json({ error: "Машины жагсаалт татах эрхгүй байна." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const selectedIds = parseIds(params.get("ids"));
  const board = scopeFleetVehicleBoardByDepartment(
    await loadFleetVehicleBoard(),
    canViewAll ? null : scopedDepartmentName,
  );
  const selectedVehicles = board.allVehicles.filter(
    (vehicle) => !selectedIds.size || selectedIds.has(vehicle.id),
  );
  const vehicles = await prepareFleetVehiclesForExport(selectedVehicles);
  const format = params.get("format")?.toLowerCase() || "xlsx";
  const fileBase = `fleet-vehicles-${new Date().toISOString().slice(0, 10)}`;

  if (format === "docx" || format === "word") {
    const buffer = await buildFleetVehicleDocx(vehicles);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileBase}.docx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  }
  if (format === "pdf") {
    const buffer = await buildFleetVehiclePdf(vehicles);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  }

  const buffer = await buildFleetVehicleXlsx(vehicles);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

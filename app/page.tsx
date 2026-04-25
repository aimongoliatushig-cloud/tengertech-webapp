import { DashboardView } from "@/app/dashboard-view";
import { hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { loadAssignedGarbageTasks } from "@/lib/field-ops";
import { loadFleetVehicleBoard, loadMunicipalSnapshot } from "@/lib/odoo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession();
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  const canUseFieldConsole = hasCapability(session, "use_field_console");
  let todayAssignments: Awaited<ReturnType<typeof loadAssignedGarbageTasks>>["assignments"] = [];
  let fleetBoard: Awaited<ReturnType<typeof loadFleetVehicleBoard>> = {
    allVehicles: [],
    activeVehicles: [],
    repairVehicles: [],
    totalVehicles: 0,
    activeCount: 0,
    repairCount: 0,
  };
  let fleetLoadError = "";

  try {
    fleetBoard = await loadFleetVehicleBoard({
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    console.warn("Fleet vehicle board could not be loaded for dashboard:", error);
    fleetLoadError = "Техникийн мэдээллийг Odoo Fleet-ээс уншиж чадсангүй.";
  }

  if (isWorkerOnly(session) && canUseFieldConsole) {
    try {
      const bundle = await loadAssignedGarbageTasks(
        {
          userId: session.uid,
        },
        {
          login: session.login,
          password: session.password,
        },
      );
      todayAssignments = bundle.assignments;
    } catch (error) {
      console.warn("Worker daily assignments could not be loaded:", error);
    }
  }

  return (
    <DashboardView
      session={session}
      snapshot={snapshot}
      todayAssignments={todayAssignments}
      fleetBoard={fleetBoard}
      fleetLoadError={fleetLoadError}
    />
  );
}

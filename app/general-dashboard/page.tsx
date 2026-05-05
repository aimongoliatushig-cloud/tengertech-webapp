import { redirect } from "next/navigation";

import { GeneralDashboardView } from "@/app/general-dashboard/general-dashboard-view";
import { requireSession } from "@/lib/auth";
import { canAccessGeneralDashboard } from "@/lib/general-dashboard-access";
import { canAccessHr } from "@/lib/hr";
import {
  loadFleetVehicleBoard,
  loadHrDailyAttendanceSummary,
  loadMunicipalSnapshot,
  type DashboardSnapshot,
  type FleetVehicleBoard,
  type HrDailyAttendanceSummary,
} from "@/lib/odoo";
import { loadUlaanbaatarWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

type ConnectionOverrides = NonNullable<Parameters<typeof loadMunicipalSnapshot>[0]>;

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  source: "live",
  generatedAt: "",
  metrics: [],
  qualityMetrics: [],
  departments: [],
  projects: [],
  taskDirectory: [],
  liveTasks: [],
  reviewQueue: [],
  qualityAlerts: [],
  reports: [],
  teamLeaders: [],
  odooBaseUrl: "",
  totalTasks: 0,
};

const EMPTY_FLEET_BOARD: FleetVehicleBoard = {
  allVehicles: [],
  activeVehicles: [],
  repairVehicles: [],
  driverOptions: [],
  loaderOptions: [],
  departmentOptions: [],
  modelOptions: [],
  vehicleTypeOptions: [],
  categoryOptions: [],
  totalVehicles: 0,
  activeCount: 0,
  repairCount: 0,
  insuranceDueCount: 0,
  inspectionDueCount: 0,
  todayWeightLabel: "0 кг",
  todayFuelLabel: "0 л",
  highestFuelVehicle: "",
  mostRepairedVehicle: "",
  failedImportCount: 0,
};

const EMPTY_HR_ATTENDANCE_SUMMARY: HrDailyAttendanceSummary = {
  totalEmployees: 0,
  workingToday: 0,
  absentToday: 0,
  sickToday: 0,
  leaveToday: 0,
  generatedAt: "",
  source: "empty",
};

async function loadGeneralSnapshot(connectionOverrides: ConnectionOverrides) {
  return loadMunicipalSnapshot(connectionOverrides, { allowFallback: false }).catch((error) => {
    console.warn("General dashboard live Odoo snapshot could not be loaded:", error);
    return EMPTY_SNAPSHOT;
  });
}

export default async function GeneralDashboardPage() {
  const session = await requireSession();
  if (!canAccessGeneralDashboard(session)) {
    redirect("/");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [snapshot, fleetBoard, hrAttendanceSummary, weather, canViewHr] = await Promise.all([
    loadGeneralSnapshot(connectionOverrides),
    loadFleetVehicleBoard().catch((error) => {
      console.warn("General dashboard fleet board could not be loaded:", error);
      return EMPTY_FLEET_BOARD;
    }),
    loadHrDailyAttendanceSummary(connectionOverrides).catch((error) => {
      console.warn("General dashboard HR summary could not be loaded:", error);
      return EMPTY_HR_ATTENDANCE_SUMMARY;
    }),
    loadUlaanbaatarWeather(),
    canAccessHr(session).catch((error) => {
      console.warn("HR access could not be resolved for general dashboard menu:", error);
      return false;
    }),
  ]);

  return (
    <GeneralDashboardView
      session={session}
      snapshot={snapshot}
      fleetBoard={fleetBoard}
      hrAttendanceSummary={hrAttendanceSummary}
      weather={weather}
      canViewHr={canViewHr}
    />
  );
}

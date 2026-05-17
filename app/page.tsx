import { Suspense } from "react";

import { DashboardView } from "@/app/dashboard-view";
import { LoadingShell } from "@/app/_components/loading-shell";
import { redirect } from "next/navigation";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  hasCapability,
  isHrOnlyRole,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadAssignedGarbageTasks } from "@/lib/field-ops";
import { canAccessGeneralDashboard } from "@/lib/general-dashboard-access";
import { canAccessHr } from "@/lib/hr";
import {
  loadFleetVehicleBoard,
  loadHrDailyAttendanceSummary,
  loadHrEmployeeDirectory,
  loadMunicipalSnapshot,
  type HrDailyAttendanceSummary,
} from "@/lib/odoo";
import { loadUlaanbaatarWeather } from "@/lib/weather";
import {
  loadDepartmentOptions,
  loadGarbagePointOptions,
  loadGarbageVehicleOptions,
  type GarbagePointOption,
  type GarbageVehicleOption,
} from "@/lib/workspace";
import { loadWorkspaceNotificationSummary } from "@/lib/workspace-notifications";

export const dynamic = "force-dynamic";

type ConnectionOverrides = NonNullable<Parameters<typeof loadMunicipalSnapshot>[0]>;
type DashboardSession = Awaited<ReturnType<typeof requireSession>>;

const EMPTY_FLEET_BOARD: Awaited<ReturnType<typeof loadFleetVehicleBoard>> = {
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

const EMPTY_WEATHER_SNAPSHOT: Awaited<ReturnType<typeof loadUlaanbaatarWeather>> = {
  city: "Улаанбаатар",
  temperature: null,
  condition: "Шинэчилж байна",
  aqi: null,
  aqiLabel: "AQI",
  windSpeed: null,
  observedAt: null,
  weeklyForecast: [],
};

const EMPTY_MUNICIPAL_SNAPSHOT: Awaited<ReturnType<typeof loadMunicipalSnapshot>> = {
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

const AUTO_BASE_GARBAGE_DEPARTMENT_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";

function departmentNeedsFleetSummary(departmentName?: string | null) {
  const value = departmentName ?? "";
  return (
    value.includes("Авто") ||
    value.includes("Хог") ||
    value.includes("хог")
  );
}

function isTransportInspectorSession(session: DashboardSession) {
  return Boolean(
    session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher &&
        !session.groupFlags?.municipalDepartmentHead),
  );
}

function shouldResolveDashboardHrAccess(
  session: DashboardSession,
  options: {
    workerMode: boolean;
    generalDashboardMode: boolean;
  },
) {
  const flags = session.groupFlags;
  return Boolean(
    !options.workerMode &&
      (options.generalDashboardMode ||
        session.role === "project_manager" ||
        session.role === "hr_specialist" ||
        session.role === "hr_manager" ||
        flags?.municipalDepartmentHead ||
        flags?.municipalManager ||
        flags?.municipalHr ||
        flags?.hrUser ||
        flags?.hrManager),
  );
}

function shouldLoadDashboardFleetBoard(
  session: DashboardSession,
  options: {
    workerMode: boolean;
    generalDashboardMode: boolean;
    transportInspectorMode: boolean;
    scopedDepartmentName: string | null;
  },
) {
  const flags = session.groupFlags;
  return Boolean(
    !options.workerMode &&
      (options.generalDashboardMode ||
        options.transportInspectorMode ||
        departmentNeedsFleetSummary(options.scopedDepartmentName) ||
        flags?.mfoManager ||
        flags?.mfoDispatcher ||
        flags?.mfoInspector ||
        flags?.mfoDriver ||
        flags?.fleetRepairAny),
  );
}

async function loadScopedHrAttendanceSummary(
  scopedDepartmentName: string,
  connectionOverrides: ConnectionOverrides,
): Promise<HrDailyAttendanceSummary> {
  try {
    const scopedEmployees = filterByDepartment(
      await loadHrEmployeeDirectory(connectionOverrides),
      scopedDepartmentName,
    );
    const activeEmployees = scopedEmployees.filter((employee) => employee.active);
    const workingToday = activeEmployees.filter((employee) => employee.statusKey === "working").length;
    const sickToday = activeEmployees.filter((employee) => employee.statusKey === "sick").length;
    const absentToday = activeEmployees.filter((employee) => employee.statusKey === "absent").length;

    return {
      totalEmployees: activeEmployees.length,
      workingToday,
      absentToday,
      sickToday,
      leaveToday: 0,
      generatedAt: new Date().toISOString(),
      source: scopedEmployees.length ? "employee_status" : "empty",
    };
  } catch (error) {
    console.warn("Scoped HR summary could not be loaded for dashboard:", error);
    return EMPTY_HR_ATTENDANCE_SUMMARY;
  }
}

export default async function Home() {
  const session = await requireSession();
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  if (!workerMode && isHrOnlyRole(session)) {
    redirect("/hr");
  }

  return (
    <Suspense fallback={<LoadingShell />}>
      <DashboardPageContent
        session={session}
        workerMode={workerMode}
        masterMode={masterMode}
      />
    </Suspense>
  );
}

async function DashboardPageContent({
  session,
  workerMode,
  masterMode,
}: {
  session: DashboardSession;
  workerMode: boolean;
  masterMode: boolean;
}) {

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const transportInspectorMode = isTransportInspectorSession(session);
  const canViewGeneralDashboard = !transportInspectorMode && canAccessGeneralDashboard(session);
  const generalDashboardMode = canViewGeneralDashboard;
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canViewHrPromise = shouldResolveDashboardHrAccess(session, {
    workerMode,
    generalDashboardMode,
  })
    ? canAccessHr(session).catch((error) => {
        console.warn("HR access could not be resolved for dashboard menu:", error);
        return false;
      })
    : Promise.resolve(false);

  const snapshotPromise = loadMunicipalSnapshot(
    connectionOverrides,
    generalDashboardMode ? { allowFallback: false } : {},
  ).catch((error) => {
    console.warn("Municipal snapshot could not be loaded for dashboard:", error);
    return EMPTY_MUNICIPAL_SNAPSHOT;
  });
  const departmentScopeNamePromise = loadSessionDepartmentName(session);
  const weatherPromise =
    workerMode || transportInspectorMode
      ? Promise.resolve(EMPTY_WEATHER_SNAPSHOT)
      : loadUlaanbaatarWeather();
  const todayAssignmentsPromise =
    workerMode && canUseFieldConsole
      ? loadAssignedGarbageTasks(
          {
            userId: session.uid,
          },
          connectionOverrides,
        )
          .then((bundle) => bundle.assignments)
          .catch((error) => {
            console.warn("Worker daily assignments could not be loaded:", error);
            return [];
          })
      : Promise.resolve([]);
  const assignedGarbageVehiclesPromise: Promise<GarbageVehicleOption[]> = transportInspectorMode
    ? loadGarbageVehicleOptions(connectionOverrides, { requireCurrentEmployeeScope: true }).catch((error) => {
        console.warn("Inspector vehicle scope could not be loaded for dashboard:", error);
        return [];
      })
    : Promise.resolve([]);
  const assignedGarbagePointOptionsPromise: Promise<GarbagePointOption[]> = transportInspectorMode
    ? loadGarbagePointOptions(connectionOverrides, { requireCurrentEmployeeScope: true }).catch((error) => {
        console.warn("Inspector point scope could not be loaded for dashboard:", error);
        return [];
      })
    : Promise.resolve([]);
  const garbageDepartmentIdPromise: Promise<number | null> = transportInspectorMode
    ? loadDepartmentOptions(connectionOverrides)
        .then((departments) => {
          const exact = departments.find((department) => department.name === AUTO_BASE_GARBAGE_DEPARTMENT_NAME);
          const fuzzy = departments.find(
            (department) =>
              department.name.includes("хог") ||
              department.name.includes("Хог") ||
              department.name.includes("Авто"),
          );
          return (exact ?? fuzzy)?.id ?? null;
        })
        .catch((error) => {
          console.warn("Garbage department could not be resolved for inspector popup:", error);
          return null;
        })
    : Promise.resolve(null);

  let scopedDepartmentName = await departmentScopeNamePromise;
  if (transportInspectorMode) {
    scopedDepartmentName = AUTO_BASE_GARBAGE_DEPARTMENT_NAME;
  } else if (generalDashboardMode) {
    scopedDepartmentName = null;
  }
  const fleetBoardPromise = shouldLoadDashboardFleetBoard(session, {
    workerMode,
    generalDashboardMode,
    transportInspectorMode,
    scopedDepartmentName,
  })
    ? loadFleetVehicleBoard()
        .then((fleetBoard) => ({
          fleetBoard,
          fleetLoadError: "",
        }))
        .catch((error) => {
          console.warn("Fleet vehicle board could not be loaded for dashboard:", error);
          return {
            fleetBoard: EMPTY_FLEET_BOARD,
            fleetLoadError: "Авто баазын техникийн мэдээллийг уншиж чадсангүй.",
          };
        })
    : Promise.resolve({
        fleetBoard: EMPTY_FLEET_BOARD,
        fleetLoadError: "",
      });
  const hrAttendanceSummaryPromise = workerMode
    ? Promise.resolve(EMPTY_HR_ATTENDANCE_SUMMARY)
    : scopedDepartmentName
      ? loadScopedHrAttendanceSummary(scopedDepartmentName, connectionOverrides)
      : loadHrDailyAttendanceSummary(connectionOverrides).catch((error) => {
          console.warn("HR attendance summary could not be loaded for dashboard:", error);
          return EMPTY_HR_ATTENDANCE_SUMMARY;
        });

  const [
    snapshot,
    weather,
    fleetResult,
    hrAttendanceSummary,
    todayAssignments,
    canViewHr,
    assignedGarbageVehicles,
    assignedGarbagePointOptions,
    garbageDepartmentId,
  ] = await Promise.all([
    snapshotPromise,
    weatherPromise,
    fleetBoardPromise,
    hrAttendanceSummaryPromise,
    todayAssignmentsPromise,
    canViewHrPromise,
    assignedGarbageVehiclesPromise,
    assignedGarbagePointOptionsPromise,
    garbageDepartmentIdPromise,
  ]);

  if (!scopedDepartmentName && workerMode) {
    const currentUserId = String(session.uid);
    scopedDepartmentName =
      snapshot.taskDirectory.find((task) =>
        (task.assigneeIds ?? []).some((assigneeId) => String(assigneeId) === currentUserId),
      )?.departmentName ?? null;
  }
  const notificationSummaryPromise = loadWorkspaceNotificationSummary(session, {
    snapshot,
    scopedDepartmentName,
  });

  const scopedDepartments = scopedDepartmentName
    ? snapshot.departments.filter(
        (department) =>
          filterByDepartment([{ departmentName: department.name }], scopedDepartmentName).length > 0,
      )
    : snapshot.departments;
  const departmentScopedProjects = scopedDepartmentName
    ? filterByDepartment(snapshot.projects, scopedDepartmentName)
    : snapshot.projects;
  const departmentScopedTasks = scopedDepartmentName
    ? filterByDepartment(snapshot.taskDirectory, scopedDepartmentName)
    : snapshot.taskDirectory;
  const departmentScopedProjectIds = new Set(departmentScopedProjects.map((project) => project.id));
  const departmentScopedProjectNames = new Set(departmentScopedProjects.map((project) => project.name));
  const departmentScopedReviewQueue = scopedDepartmentName
    ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
    : snapshot.reviewQueue;
  const visibleSnapshot = {
    ...snapshot,
    departments: scopedDepartments,
    projects: departmentScopedProjects,
    taskDirectory: departmentScopedTasks,
    liveTasks: scopedDepartmentName ? filterByDepartment(snapshot.liveTasks, scopedDepartmentName) : snapshot.liveTasks,
    reviewQueue: departmentScopedReviewQueue,
    qualityAlerts: (scopedDepartmentName
      ? filterByDepartment(snapshot.qualityAlerts, scopedDepartmentName)
      : snapshot.qualityAlerts
    ).filter((alert) =>
      masterMode && scopedDepartmentName ? departmentScopedProjectNames.has(alert.projectName) : true,
    ),
    reports: (scopedDepartmentName
      ? filterByDepartment(snapshot.reports, scopedDepartmentName)
      : snapshot.reports
    ).filter((report) =>
      masterMode && scopedDepartmentName ? departmentScopedProjectIds.has(report.projectId ?? -1) : true,
    ),
    totalTasks: departmentScopedTasks.length,
  };
  const notificationSummary = await notificationSummaryPromise;
  const notificationNote =
    notificationSummary.unreadCount > 0
      ? `${notificationSummary.newCount} шинэ ажил, ${notificationSummary.reviewCount} хянах, ${notificationSummary.overdueCount} хугацаа хэтэрсэн`
      : "Шинэ ажил, хянах зүйл алга";

  return (
    <DashboardView
      session={session}
      snapshot={visibleSnapshot}
      departmentScopeName={scopedDepartmentName}
      todayAssignments={todayAssignments}
      assignedGarbageVehicles={assignedGarbageVehicles}
      assignedGarbagePointOptions={assignedGarbagePointOptions}
      garbageDepartmentId={garbageDepartmentId}
      fleetBoard={fleetResult.fleetBoard}
      fleetLoadError={fleetResult.fleetLoadError}
      hrAttendanceSummary={hrAttendanceSummary}
      weather={weather}
      canViewHr={canViewHr}
      canViewGeneralDashboard={canViewGeneralDashboard}
      notificationCount={notificationSummary.unreadCount}
      notificationNote={notificationNote}
    />
  );
}

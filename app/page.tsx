import { DashboardView } from "@/app/dashboard-view";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadAssignedGarbageTasks } from "@/lib/field-ops";
import { canAccessHr } from "@/lib/hr";
import {
  loadFleetVehicleBoard,
  loadHrDailyAttendanceSummary,
  loadHrEmployeeDirectory,
  loadMunicipalSnapshot,
  type HrDailyAttendanceSummary,
} from "@/lib/odoo";
import { loadUlaanbaatarWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

type ConnectionOverrides = NonNullable<Parameters<typeof loadMunicipalSnapshot>[0]>;

const EMPTY_FLEET_BOARD: Awaited<ReturnType<typeof loadFleetVehicleBoard>> = {
  allVehicles: [],
  activeVehicles: [],
  repairVehicles: [],
  totalVehicles: 0,
  activeCount: 0,
  repairCount: 0,
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
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const workerMode = isWorkerOnly(session);
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canViewHrPromise = canAccessHr(session).catch((error) => {
    console.warn("HR access could not be resolved for dashboard menu:", error);
    return false;
  });

  const snapshotPromise = loadMunicipalSnapshot(connectionOverrides);
  const departmentScopeNamePromise = loadSessionDepartmentName(session);
  const weatherPromise = loadUlaanbaatarWeather();
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

  let scopedDepartmentName = await departmentScopeNamePromise;
  const fleetBoardPromise = workerMode
    ? Promise.resolve({
        fleetBoard: EMPTY_FLEET_BOARD,
        fleetLoadError: "",
      })
    : loadFleetVehicleBoard(connectionOverrides)
        .then((fleetBoard) => ({
          fleetBoard,
          fleetLoadError: "",
        }))
        .catch((error) => {
          console.warn("Fleet vehicle board could not be loaded for dashboard:", error);
          return {
            fleetBoard: EMPTY_FLEET_BOARD,
            fleetLoadError: "Техникийн мэдээллийг Odoo Fleet-ээс уншиж чадсангүй.",
          };
        });
  const hrAttendanceSummaryPromise = workerMode
    ? Promise.resolve(EMPTY_HR_ATTENDANCE_SUMMARY)
    : scopedDepartmentName
      ? loadScopedHrAttendanceSummary(scopedDepartmentName, connectionOverrides)
      : loadHrDailyAttendanceSummary(connectionOverrides).catch((error) => {
          console.warn("HR attendance summary could not be loaded for dashboard:", error);
          return EMPTY_HR_ATTENDANCE_SUMMARY;
        });

  const [snapshot, weather, fleetResult, hrAttendanceSummary, todayAssignments, canViewHr] =
    await Promise.all([
      snapshotPromise,
      weatherPromise,
      fleetBoardPromise,
      hrAttendanceSummaryPromise,
      todayAssignmentsPromise,
      canViewHrPromise,
    ]);

  if (!scopedDepartmentName && workerMode) {
    const currentUserId = String(session.uid);
    scopedDepartmentName =
      snapshot.taskDirectory.find((task) =>
        (task.assigneeIds ?? []).some((assigneeId) => String(assigneeId) === currentUserId),
      )?.departmentName ?? null;
  }

  const scopedDepartments = scopedDepartmentName
    ? snapshot.departments.filter(
        (department) =>
          filterByDepartment([{ departmentName: department.name }], scopedDepartmentName).length > 0,
      )
    : snapshot.departments;
  const visibleSnapshot = scopedDepartmentName
    ? {
        ...snapshot,
        departments: scopedDepartments,
        projects: filterByDepartment(snapshot.projects, scopedDepartmentName),
        taskDirectory: filterByDepartment(snapshot.taskDirectory, scopedDepartmentName),
        liveTasks: filterByDepartment(snapshot.liveTasks, scopedDepartmentName),
        reviewQueue: filterByDepartment(snapshot.reviewQueue, scopedDepartmentName),
        qualityAlerts: filterByDepartment(snapshot.qualityAlerts, scopedDepartmentName),
        reports: filterByDepartment(snapshot.reports, scopedDepartmentName),
        totalTasks: filterByDepartment(snapshot.taskDirectory, scopedDepartmentName).length,
      }
    : snapshot;

  return (
    <DashboardView
      session={session}
      snapshot={visibleSnapshot}
      departmentScopeName={scopedDepartmentName}
      todayAssignments={todayAssignments}
      fleetBoard={fleetResult.fleetBoard}
      fleetLoadError={fleetResult.fleetLoadError}
      hrAttendanceSummary={hrAttendanceSummary}
      weather={weather}
      canViewHr={canViewHr}
    />
  );
}

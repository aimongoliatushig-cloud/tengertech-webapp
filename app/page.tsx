import { DashboardView } from "@/app/dashboard-view";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadAssignedGarbageTasks } from "@/lib/field-ops";
import {
  loadFleetVehicleBoard,
  loadHrDailyAttendanceSummary,
  loadHrEmployeeDirectory,
  loadMunicipalSnapshot,
  type HrDailyAttendanceSummary,
} from "@/lib/odoo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession();
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });
  let scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!scopedDepartmentName && isWorkerOnly(session)) {
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
  let hrAttendanceSummary: HrDailyAttendanceSummary = {
    totalEmployees: 0,
    workingToday: 0,
    absentToday: 0,
    sickToday: 0,
    leaveToday: 0,
    generatedAt: "",
    source: "empty",
  };

  try {
    fleetBoard = await loadFleetVehicleBoard({
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    console.warn("Fleet vehicle board could not be loaded for dashboard:", error);
    fleetLoadError = "Техникийн мэдээллийг Odoo Fleet-ээс уншиж чадсангүй.";
  }

  try {
    hrAttendanceSummary = await loadHrDailyAttendanceSummary({
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    console.warn("HR attendance summary could not be loaded for dashboard:", error);
  }

  if (scopedDepartmentName) {
    try {
      const scopedEmployees = filterByDepartment(
        await loadHrEmployeeDirectory({
          login: session.login,
          password: session.password,
        }),
        scopedDepartmentName,
      );
      const activeEmployees = scopedEmployees.filter((employee) => employee.active);
      const workingToday = activeEmployees.filter((employee) => employee.statusKey === "working").length;
      const sickToday = activeEmployees.filter((employee) => employee.statusKey === "sick").length;
      const absentToday = activeEmployees.filter((employee) => employee.statusKey === "absent").length;

      hrAttendanceSummary = {
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
    }
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
      snapshot={visibleSnapshot}
      departmentScopeName={scopedDepartmentName}
      todayAssignments={todayAssignments}
      fleetBoard={fleetBoard}
      fleetLoadError={fleetLoadError}
      hrAttendanceSummary={hrAttendanceSummary}
    />
  );
}

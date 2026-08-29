import { Suspense } from "react";

import { DashboardView } from "@/app/dashboard-view";
import { LoadingShell } from "@/app/_components/loading-shell";
import { ProcurementActionRequiredList } from "@/app/procurement/_components/procurement-dashboard-client";
import { redirect } from "next/navigation";
import { loadSessionDepartmentName, shouldScopeToOwnDepartment } from "@/lib/access-scope";
import {
  hasCapability,
  isHrOnlyRole,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { isRecordsClerk } from "@/lib/roles";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadAssignedGarbageTasks } from "@/lib/field-ops";
import { canAccessGeneralDashboard } from "@/lib/general-dashboard-access";
import { fetchGaihamDailyRoutes } from "@/lib/gaiham-fuel-report";
import { scopeFleetVehicleBoardByDepartment } from "@/lib/fleet-vehicle-board-scope";
import { canAccessHr } from "@/lib/hr";
import {
  loadFleetVehicleBoard,
  loadHrDailyAttendanceSummary,
  loadHrEmployeeDirectory,
  loadMunicipalSnapshot,
  loadUserAssignedTasks,
  type AssignedTaskItem,
  type HrDailyAttendanceSummary,
} from "@/lib/odoo";
import {
  createEmptyProcurementDashboard,
  createFallbackProcurementUser,
  loadProcurementDashboard,
  loadProcurementMe,
  loadProcurementMeta,
  loadProcurementRequests,
  loadProcurementRequestDetail,
  type ProcurementMeta,
  type ProcurementRequestDetail,
  type ProcurementRequestSummary,
  type ProcurementUser,
} from "@/lib/procurement";
import { loadUlaanbaatarWeather } from "@/lib/weather";
import {
  loadDepartmentOptions,
  loadGarbagePointOptions,
  loadGarbageVehicleOptions,
  type GarbagePointOption,
  type GarbageVehicleOption,
} from "@/lib/workspace";
import { loadWorkspaceNotificationSummary } from "@/lib/workspace-notifications";
import { getAllWastePointsFiltered } from "@/lib/waste-points/service";

export const dynamic = "force-dynamic";

type ConnectionOverrides = NonNullable<Parameters<typeof loadMunicipalSnapshot>[0]>;
type DashboardSession = Awaited<ReturnType<typeof requireSession>>;

type HomeProcurementActions = {
  items: ProcurementRequestDetail[];
  suppliers: ProcurementMeta["suppliers"];
  userFlags: ProcurementUser["flags"];
} | null;

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
  fuelSummaryDateKey: "",
  weightReportRows: [],
  fuelReportRows: [],
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

const EMPTY_WASTE_POINT_SUMMARY = {
  total: 0,
  active: 0,
  full: 0,
  maintenance: 0,
  inactive: 0,
  khorooCount: 0,
  available: false,
};

const EMPTY_GPS_ROUTE_SUMMARY = {
  trackerCount: 0,
  activeVehicleCount: 0,
  totalDistanceKm: 0,
  available: false,
};

function dashboardDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
}

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
  return Boolean(departmentName?.trim());
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

function isProcurementActionHomeSession(session: DashboardSession) {
  const flags = session.groupFlags;
  return Boolean(
    flags?.procurementStorekeeper ||
      flags?.procurementPurchaseManager ||
      flags?.fleetRepairPurchaser ||
      flags?.opsStorekeeper ||
      flags?.procurementFinance ||
      flags?.procurementAdministration ||
      flags?.procurementLegal,
  );
}

function isHomeProcurementWorker(procurementUser: ProcurementUser) {
  return Boolean(
    procurementUser.flags.storekeeper ||
      procurementUser.flags.finance ||
      procurementUser.flags.office_clerk ||
      procurementUser.flags.contract_officer,
  );
}

function emptyProcurementMeta(): ProcurementMeta {
  return {
    projects: [],
    tasks: [],
    vehicles: [],
    departments: [],
    storekeepers: [],
    suppliers: [],
    uoms: [],
  };
}

function createProcurementDetailFallback(item: ProcurementRequestSummary): ProcurementRequestDetail {
  return {
    ...item,
    lines: [],
    quotations: [],
    packages: item.packages || [...(item.low_value_packages || []), ...(item.high_value_packages || [])],
    unassigned_lines: [],
    documents: [],
    audit: [],
    attachments: [],
  };
}

function uniqueProcurementsById(items: ProcurementRequestSummary[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function shouldShowOfficeClerkProcurementBacklog(item: ProcurementRequestDetail) {
  if (!["quote_collection", "quotations_ready", "legal_contract_draft"].includes(item.state.code)) return false;
  if (item.state.code === "legal_contract_draft") {
    return item.packages.some((pack) => pack.is_over_threshold || pack.amount_total > 1000000);
  }
  const unassignedCount =
    item.unassigned_lines?.length ??
    item.lines.filter((line) => !line.package_id).length;
  if (unassignedCount > 0) return false;
  return item.packages.some(
    (pack) =>
      pack.is_complete &&
      !pack.ceo_order_ready &&
      (pack.is_over_threshold || pack.amount_total > 1000000),
  );
}

function getHomeProcurementBacklogStates(procurementUser: ProcurementUser) {
  const states = new Set<string>();
  if (procurementUser.flags.storekeeper) {
    ["payment_recorded", "paid"].forEach((state) => states.add(state));
  }
  if (procurementUser.flags.finance) {
    ["finance_review", "payment_pending", "payment_waiting", "payment"].forEach((state) => states.add(state));
  }
  if (procurementUser.flags.office_clerk) {
    ["quote_collection", "quotations_ready", "legal_contract_draft"].forEach((state) => states.add(state));
  }
  if (procurementUser.flags.contract_officer) {
    ["legal_contract_draft", "contract_review"].forEach((state) => states.add(state));
  }
  return [...states];
}

async function loadHomeProcurementActions(
  session: DashboardSession,
  connectionOverrides: ConnectionOverrides,
): Promise<HomeProcurementActions> {
  const procurementUser = await loadProcurementMe(connectionOverrides).catch(() => createFallbackProcurementUser(session));
  if (!isHomeProcurementWorker(procurementUser)) {
    return null;
  }

  const [meta, dashboard] = await Promise.all([
    loadProcurementMeta(connectionOverrides).catch(() => emptyProcurementMeta()),
    loadProcurementDashboard({ scope: "assigned" }, connectionOverrides).catch(() => createEmptyProcurementDashboard()),
  ]);
  const backlogStates = getHomeProcurementBacklogStates(procurementUser);
  const roleBacklogItems =
    backlogStates.length
      ? await Promise.all(
          backlogStates.map((state) =>
            loadProcurementRequests(
              {
                state,
                limit: 50,
              },
              connectionOverrides,
            )
              .then((bundle) => bundle.items)
              .catch(() => []),
          ),
        ).then((groups) => groups.flat())
      : [];
  const scopedItems = uniqueProcurementsById([...dashboard.items, ...roleBacklogItems]);
  const backlogIds = new Set(roleBacklogItems.map((item) => item.id));
  const loadedDetails = await Promise.all(
    scopedItems.map((item) =>
      loadProcurementRequestDetail(item.id, connectionOverrides).catch(() => createProcurementDetailFallback(item)),
    ),
  );
  const items = loadedDetails.filter(
    (item) =>
      !backlogIds.has(item.id) ||
      !procurementUser.flags.office_clerk ||
      !["quote_collection", "quotations_ready"].includes(item.state.code) ||
      shouldShowOfficeClerkProcurementBacklog(item),
  );

  return {
    items,
    suppliers: meta.suppliers,
    userFlags: procurementUser.flags,
  };
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

function resolveImmediateDashboardHrAccess(session: DashboardSession) {
  const flags = session.groupFlags;
  if (
    session.role === "system_admin" ||
    session.role === "director" ||
    session.role === "general_manager" ||
    session.role === "hr_specialist" ||
    session.role === "hr_manager" ||
    flags?.municipalDirector ||
    flags?.fleetRepairCeo ||
    flags?.hrUser ||
    flags?.hrManager ||
    flags?.municipalHr ||
    flags?.municipalDepartmentHead ||
    flags?.municipalManager ||
    flags?.mfoManager ||
    flags?.environmentManager ||
    flags?.improvementManager
  ) {
    return true;
  }

  if (
    session.role === "worker" ||
    session.role === "senior_master" ||
    session.role === "team_leader" ||
    flags?.municipalMaster ||
    flags?.greenMaster ||
    flags?.fleetRepairTeamLeader
  ) {
    return false;
  }

  return null;
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
  if (isRecordsClerk(session)) {
    redirect("/employees");
  }
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  if (!workerMode && isHrOnlyRole(session)) {
    redirect("/hr");
  }

  return (
    <Suspense fallback={<LoadingShell />}>
      <DashboardPageContent session={session} workerMode={workerMode} masterMode={masterMode} />
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
  const procurementHomeMode = isProcurementActionHomeSession(session);
  const canViewGeneralDashboard = !transportInspectorMode && canAccessGeneralDashboard(session);
  const generalDashboardMode = canViewGeneralDashboard;
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const shouldResolveHrAccess = shouldResolveDashboardHrAccess(session, {
    workerMode,
    generalDashboardMode,
  });
  const immediateHrAccess = shouldResolveHrAccess
    ? resolveImmediateDashboardHrAccess(session)
    : false;
  const canViewHrPromise =
    immediateHrAccess !== null
      ? Promise.resolve(immediateHrAccess)
      : canAccessHr(session).catch((error) => {
          console.warn("HR access could not be resolved for dashboard menu:", error);
          return false;
        });

  const snapshotPromise = loadMunicipalSnapshot(
    connectionOverrides,
    generalDashboardMode ? { allowFallback: false } : {},
  ).catch((error) => {
    console.warn("Municipal snapshot could not be loaded for dashboard:", error);
    return EMPTY_MUNICIPAL_SNAPSHOT;
  });
  const departmentScopeNamePromise = loadSessionDepartmentName(session);
  const weatherPromise =
    (workerMode && !procurementHomeMode) || transportInspectorMode
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
  const procurementActionsPromise = procurementHomeMode
    ? loadHomeProcurementActions(session, connectionOverrides).catch((error) => {
        console.warn("Procurement action list could not be loaded for dashboard:", error);
        return null;
      })
    : Promise.resolve(null);
  const wastePointSummaryPromise = generalDashboardMode
    ? getAllWastePointsFiltered()
        .then((points) => ({
          total: points.length,
          active: points.filter((point) => point.currentStatus === "active").length,
          full: points.filter((point) => point.currentStatus === "full").length,
          maintenance: points.filter((point) => point.currentStatus === "maintenance").length,
          inactive: points.filter((point) => point.currentStatus === "inactive").length,
          khorooCount: new Set(points.map((point) => point.khorooName).filter(Boolean)).size,
          available: true,
        }))
        .catch((error) => {
          console.warn("Waste point summary could not be loaded for dashboard:", error);
          return EMPTY_WASTE_POINT_SUMMARY;
        })
    : Promise.resolve(EMPTY_WASTE_POINT_SUMMARY);
  const gpsRouteSummaryPromise = generalDashboardMode
    ? fetchGaihamDailyRoutes(dashboardDateKey())
        .then((result) => ({
          trackerCount: result.trackerCount,
          activeVehicleCount: result.activeTrackerCount,
          totalDistanceKm: result.routes.reduce((sum, route) => sum + route.distanceKm, 0),
          available: true,
        }))
        .catch((error) => {
          console.warn("GPS route summary could not be loaded for dashboard:", error);
          return EMPTY_GPS_ROUTE_SUMMARY;
        })
    : Promise.resolve(EMPTY_GPS_ROUTE_SUMMARY);

  let scopedDepartmentName = await departmentScopeNamePromise;
  if (transportInspectorMode) {
    scopedDepartmentName = AUTO_BASE_GARBAGE_DEPARTMENT_NAME;
  } else if (generalDashboardMode && !shouldScopeToOwnDepartment(session)) {
    scopedDepartmentName = null;
  }
  const fleetBoardPromise = shouldLoadDashboardFleetBoard(session, {
    workerMode,
    generalDashboardMode,
    transportInspectorMode,
    scopedDepartmentName,
  })
    ? loadFleetVehicleBoard(connectionOverrides)
        .then((fleetBoard) => ({
          fleetBoard: scopeFleetVehicleBoardByDepartment(fleetBoard, scopedDepartmentName),
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
  const canViewHr = await canViewHrPromise;
  const hrAttendanceSummaryPromise = !canViewHr || workerMode
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
    assignedGarbageVehicles,
    assignedGarbagePointOptions,
    garbageDepartmentId,
    procurementActions,
    wastePointSummary,
    gpsRouteSummary,
  ] = await Promise.all([
    snapshotPromise,
    weatherPromise,
    fleetBoardPromise,
    hrAttendanceSummaryPromise,
    todayAssignmentsPromise,
    assignedGarbageVehiclesPromise,
    assignedGarbagePointOptionsPromise,
    garbageDepartmentIdPromise,
    procurementActionsPromise,
    wastePointSummaryPromise,
    gpsRouteSummaryPromise,
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
    ? snapshot.taskDirectory.filter((task) => {
        // Хувь ажилтны даалгаврыг ГҮЙЦЭТГЭГЧИЙН жинхэнэ хэлтсээр scope хийнэ.
        // Захирлын үүрэг даалгаврын төсөл нэг хэлтэст холбоотой ч гишүүд нь
        // өөр хэлтсийнх байвал төслийн хэлтсээр scope хийхгүй — ингэснээр
        // хэлтсийн дарга өөрт хамааралгүй ажилтны даалгаврыг харахгүй.
        const effectiveDepartmentName =
          !task.isDepartmentTask && task.assigneeDepartmentName
            ? task.assigneeDepartmentName
            : task.departmentName;
        return (
          filterByDepartment(
            [{ departmentName: effectiveDepartmentName }],
            scopedDepartmentName,
          ).length > 0
        );
      })
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
  const assignedTasks = await loadUserAssignedTasks(session.uid).catch(() => [] as AssignedTaskItem[]);
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
      assignedTasks={assignedTasks}
      showProcurementHomePanels={Boolean(procurementActions)}
      wastePointSummary={wastePointSummary}
      gpsRouteSummary={gpsRouteSummary}
      procurementActionPanel={
        procurementActions ? (
          <ProcurementActionRequiredList
            items={procurementActions.items}
            suppliers={procurementActions.suppliers}
            returnPath="/"
            userFlags={procurementActions.userFlags}
          />
        ) : null
      }
    />
  );
}

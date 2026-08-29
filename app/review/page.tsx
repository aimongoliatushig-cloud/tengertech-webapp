import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import {
  loadFleetVehicleBoard,
  loadMunicipalSnapshot,
  type DashboardSnapshot,
  type FleetVehicleBoard,
} from "@/lib/odoo";
import { fixMojibakeText } from "@/lib/text-normalize";

import { ReviewInspectorBoard, type ReviewInspectorBoardTask } from "./review-inspector-board";

const AUTO_BASE_GARBAGE_DEPARTMENT_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";

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
  todayWeightLabel: "0 тн",
  todayFuelLabel: "0 л",
  fuelSummaryDateKey: "",
  weightReportRows: [],
  fuelReportRows: [],
  highestFuelVehicle: "-",
  mostRepairedVehicle: "-",
  failedImportCount: 0,
};

type DashboardSession = Awaited<ReturnType<typeof requireSession>>;
type ReviewQueueItem = DashboardSnapshot["reviewQueue"][number];
type TaskDirectoryItem = DashboardSnapshot["taskDirectory"][number];

function isTransportInspectorSession(session: DashboardSession) {
  return Boolean(
    session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher &&
        !session.groupFlags?.municipalDepartmentHead),
  );
}

function normalizeSearchText(value: string) {
  return fixMojibakeText(value)
    .toLocaleLowerCase("mn-MN")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function resolveReviewVehicle(
  reviewItem: ReviewQueueItem,
  directoryTask: TaskDirectoryItem | undefined,
  fleetBoard: FleetVehicleBoard,
) {
  const taskText = normalizeSearchText(
    [
      reviewItem.name,
      reviewItem.projectName,
      reviewItem.departmentName,
      directoryTask?.name,
      directoryTask?.projectName,
      directoryTask?.operationTypeLabel,
    ]
      .filter(Boolean)
      .join(" "),
  );

  return fleetBoard.allVehicles.find((vehicle) => {
    const plate = normalizeSearchText(vehicle.plate);
    return plate ? taskText.includes(plate) : false;
  });
}

function mapReviewBoardTask(
  item: ReviewQueueItem,
  taskById: Map<number, TaskDirectoryItem>,
  fleetBoard: FleetVehicleBoard,
): ReviewInspectorBoardTask {
  const directoryTask = taskById.get(item.id);
  const vehicle = resolveReviewVehicle(item, directoryTask, fleetBoard);
  const vehiclePlate = vehicle?.plate || item.projectName || "Тодорхойгүй машин";
  const vehicleModel = vehicle?.modelName || vehicle?.name || directoryTask?.operationTypeLabel || item.projectName;

  return {
    id: item.id,
    name: fixMojibakeText(item.name),
    departmentName: fixMojibakeText(item.departmentName),
    projectName: fixMojibakeText(item.projectName),
    leaderName: fixMojibakeText(item.leaderName || directoryTask?.leaderName || "Хариуцагчгүй"),
    href: item.href,
    progress: item.progress,
    deadline: fixMojibakeText(item.deadline || directoryTask?.deadline || "Огноо тодорхойгүй"),
    scheduledDate: directoryTask?.scheduledDate ?? null,
    operationTypeLabel: fixMojibakeText(directoryTask?.operationTypeLabel || "Тайлан хянах"),
    vehicleId: vehicle?.id ?? null,
    vehiclePlate: fixMojibakeText(vehiclePlate),
    vehicleModel: fixMojibakeText(vehicleModel),
    vehicleImageUrl: vehicle?.imageUrl || "",
  };
}

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const session = await requireSession();
  if (isWorkerOnly(session) || isMasterRole(session.role)) {
    redirect("/");
  }

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  if (!canViewQualityCenter && !canCreateTasks) {
    redirect("/");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const transportInspectorMode = isTransportInspectorSession(session);
  const scopedDepartmentName = transportInspectorMode
    ? AUTO_BASE_GARBAGE_DEPARTMENT_NAME
    : await loadSessionDepartmentName(session);

  const [snapshot, fleetResult] = await Promise.all([
    loadMunicipalSnapshot(connectionOverrides),
    loadFleetVehicleBoard()
      .then((fleetBoard) => ({
        fleetBoard,
        fleetLoadError: "",
      }))
      .catch((error) => {
        console.warn("Fleet vehicle board could not be loaded for review board:", error);
        return {
          fleetBoard: EMPTY_FLEET_BOARD,
          fleetLoadError: "Авто баазын техникийн мэдээллийг уншиж чадсангүй.",
        };
      }),
  ]);

  const sourceTaskDirectory = scopedDepartmentName
    ? filterByDepartment(snapshot.taskDirectory, scopedDepartmentName)
    : snapshot.taskDirectory;
  const sourceReviewQueue = scopedDepartmentName
    ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
    : snapshot.reviewQueue;
  const taskById = new Map(sourceTaskDirectory.map((task) => [task.id, task]));
  const reviewBoardTasks = sourceReviewQueue
    .map((item) => mapReviewBoardTask(item, taskById, fleetResult.fleetBoard))
    .sort((left, right) => left.vehiclePlate.localeCompare(right.vehiclePlate, "mn") || left.name.localeCompare(right.name, "mn"));
  const notificationCount = reviewBoardTasks.length;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container} id="review-top">
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="review"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              departmentScopeName={scopedDepartmentName}
              notificationCount={notificationCount}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Тайлан хянах"
              subtitle={transportInspectorMode ? "Авто бааз, хог тээвэрлэлтийн хэлтэс" : "Шийдвэр хүлээж буй ажлын тайлангууд"}
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
              notificationCount={notificationCount}
              notificationNote={
                notificationCount
                  ? `${notificationCount} хянах ажил байна`
                  : "Хянах тайлан алга"
              }
            />

            <ReviewInspectorBoard
              tasks={reviewBoardTasks}
              totalTaskCount={sourceTaskDirectory.length}
              scopedDepartmentName={scopedDepartmentName}
              fleetLoadError={fleetResult.fleetLoadError}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

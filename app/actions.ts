"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canSubmitWorkspaceReport, hasCapability, isMasterRole, isWorkerOnly, requireSession } from "@/lib/auth";
import { getTodayDateKey, pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import { filterTasksForResponsibleMaster } from "@/lib/master-scope";
import {
  createFieldStopIssue,
  markFieldStopArrived,
  markFieldStopDone,
  markFieldStopSkipped,
  saveFieldStopNote,
  startFieldShift,
  submitFieldShift,
  uploadFieldStopProof,
} from "@/lib/field-ops";
import { executeOdooKw, loadFleetVehicleBoard, loadMunicipalSnapshot } from "@/lib/odoo";
import { createProcurementRequest, uploadProcurementAttachment } from "@/lib/procurement";
import { notifyPushEvent, type PushEventType } from "@/lib/push-notifications";
import { createLocalRoadCleaningArea } from "@/lib/road-cleaning-area-store";
import {
  createRoadCleaningWork,
  createSeasonalWorkspacePlan,
  createWorkspaceCrewTeam,
  createWorkspaceProject,
  createWorkspaceProjectAttachments,
  createWorkspaceTask,
  createWorkspaceTaskAttachments,
  createWorkspaceTaskReport,
  createWorkspaceWorkUnit,
  deleteWorkspaceTaskReport,
  deleteWorkspaceTask,
  forceWorkspaceTaskDone,
  generateSeasonalWorkspaceExecution,
  loadGarbagePointOptions,
  loadGarbageVehicleOptions,
  loadTaskDetail,
  loadProjectDetail,
  loadWorkspaceTaskReportOwner,
  markWorkspaceTaskDone,
  notifyWorkspaceTaskReportReviewers,
  postWorkspaceTaskMessage,
  loadDepartmentOptions,
  loadWorkTypeOptions,
  returnWorkspaceTaskForChanges,
  sendWorkspaceTaskReportToReview,
  updateWorkspaceProjectDescription,
  updateWorkspaceTask,
  updateWorkspaceTaskReport,
} from "@/lib/workspace";

const CUSTOM_WORK_TYPE_VALUE = "__new_work__";
const REPORT_SUBMIT_LOCK_TTL_MS = 2 * 60_000;
const reportSubmitLocks = new Map<string, number>();

function createReportTiming(flow: string, base: Record<string, unknown> = {}) {
  const startedAt = Date.now();
  let lastMarkAt = startedAt;

  return {
    mark(step: string, extra: Record<string, unknown> = {}) {
      const now = Date.now();
      console.info("[report-submit-timing]", {
        flow,
        step,
        totalMs: now - startedAt,
        stepMs: now - lastMarkAt,
        ...base,
        ...extra,
      });
      lastMarkAt = now;
    },
    async step<T>(step: string, fn: () => Promise<T>, extra: Record<string, unknown> = {}) {
      const stepStartedAt = Date.now();
      try {
        return await fn();
      } finally {
        const now = Date.now();
        console.info("[report-submit-timing]", {
          flow,
          step,
          totalMs: now - startedAt,
          stepMs: now - stepStartedAt,
          ...base,
          ...extra,
        });
        lastMarkAt = now;
      }
    },
  };
}

function cleanupReportSubmitLocks() {
  const now = Date.now();
  for (const [key, expiresAt] of reportSubmitLocks.entries()) {
    if (expiresAt <= now) {
      reportSubmitLocks.delete(key);
    }
  }
}

function acquireReportSubmitLock(mode: string, taskId: number, token: string) {
  if (!token) {
    return { key: "", acquired: true };
  }

  cleanupReportSubmitLocks();
  const key = `${mode}:${taskId}:${token}`;
  if (reportSubmitLocks.has(key)) {
    return { key, acquired: false };
  }
  reportSubmitLocks.set(key, Date.now() + REPORT_SUBMIT_LOCK_TTL_MS);
  return { key, acquired: true };
}

function releaseReportSubmitLock(key: string) {
  if (key) {
    reportSubmitLocks.delete(key);
  }
}

function canMutateReportOwner(session: { uid: number; role: string }, ownerId: number | null) {
  return session.role === "system_admin" || ownerId === session.uid;
}

function isFutureDateKey(dateKey: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey > getTodayDateKey();
}

async function assertWorkerTaskReportDateIsOpen(
  taskId: number,
  session: Awaited<ReturnType<typeof requireSession>>,
  connectionOverrides: { login: string; password: string },
  reportPath: string,
) {
  const task = await loadTaskDetail(taskId, connectionOverrides);
  const isAssignedWorker = isWorkerOnly(session) || task.assigneeUserIds.includes(session.uid);

  if (isAssignedWorker && isFutureDateKey(task.scheduledDate)) {
    redirectWithMessage(reportPath, "error", "Тайланг зөвхөн тухайн ажлын өдөр оруулна уу.");
  }
}

async function assertCanReviewTaskAction(
  taskId: number,
  session: Awaited<ReturnType<typeof requireSession>>,
  connectionOverrides: { login: string; password: string },
) {
  const task = await loadTaskDetail(taskId, connectionOverrides);
  if (isMasterRole(session.role)) {
    const snapshot = await loadMunicipalSnapshot(connectionOverrides);
    const directoryTask = snapshot.taskDirectory.find((item) => item.id === taskId);
    if (
      !directoryTask ||
      filterTasksForResponsibleMaster([directoryTask], snapshot.projects, session).length === 0
    ) {
      redirectWithMessage(
        `/tasks/${taskId}`,
        "error",
        "Даалгавар олдсонгүй эсвэл танд харах эрх алга.",
      );
    }
  }
  const isAssignedToCurrentUser = task.assigneeUserIds.includes(session.uid);
  const hasOwnSubmittedReport = task.reports.some((report) => report.reporterId === session.uid);
  const canInspectAssignedTransportTask = session.role === "transport_inspector";
  const canReviewTask =
    !hasOwnSubmittedReport &&
    (isMasterRole(session.role) ||
      (canInspectAssignedTransportTask &&
        (hasCapability(session, "view_quality_center") || hasCapability(session, "create_tasks"))) ||
      (!isAssignedToCurrentUser &&
        (hasCapability(session, "view_quality_center") || hasCapability(session, "create_tasks"))));

  if (!canReviewTask) {
    redirectWithMessage(
      `/tasks/${taskId}`,
      "error",
      "Өөрт оноогдсон ажил эсвэл өөрийн илгээсэн тайланг өөрөө хянах боломжгүй.",
    );
  }
}

function getConnectionOverrides() {
  return requireSession().then((session) => ({
    login: session.login,
    password: session.password,
  }));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Үйлдлийг гүйцэтгэх үед алдаа гарлаа.";
}

function isRedirectException(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT"),
  );
}

function rethrowIfRedirectError(error: unknown) {
  if (isRedirectException(error)) {
    throw error;
  }
}

function redirectWithMessage(
  path: string,
  kind: "error" | "notice",
  message: string,
  hash = "",
) {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}${hash}`);
}

function getNumberValue(formData: FormData, key: string) {
  return Number(String(formData.get(key) ?? ""));
}

function relationIdValue(value: unknown) {
  if (Array.isArray(value)) {
    const id = Number(value[0]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

type GarbageVehicleCrewRecord = {
  id: number;
  name?: string | false;
  license_plate?: string | false;
  municipal_responsible_driver_id?: [number, string] | false;
  municipal_loader_1_id?: [number, string] | false;
  municipal_loader_2_id?: [number, string] | false;
  driver_id?: [number, string] | false;
  driver_employee_id?: [number, string] | false;
  mfo_driver_employee_id?: [number, string] | false;
  loader_employee_id?: [number, string] | false;
};

type EmployeeUserAssignmentRecord = {
  id: number;
  name?: string | false;
  user_id?: [number, string] | false;
  job_title?: string | false;
  job_id?: [number, string] | false;
};

async function loadEmployeeUserAssignments(
  employeeIds: number[],
  connectionOverrides: Record<string, never> | { login: string; password: string },
) {
  const uniqueEmployeeIds = Array.from(new Set(employeeIds)).filter((id) => Number.isFinite(id) && id > 0);
  if (!uniqueEmployeeIds.length) {
    return { userIds: [] as number[], labels: [] as string[] };
  }

  const employees = await executeOdooKw<EmployeeUserAssignmentRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "in", uniqueEmployeeIds]]],
    {
      fields: ["name", "user_id", "job_title", "job_id"],
      limit: uniqueEmployeeIds.length,
    },
    connectionOverrides,
  ).catch(() =>
    executeOdooKw<EmployeeUserAssignmentRecord[]>(
      "hr.employee",
      "search_read",
      [[["id", "in", uniqueEmployeeIds]]],
      {
        fields: ["name", "user_id"],
        limit: uniqueEmployeeIds.length,
      },
      connectionOverrides,
    ).catch(() => []),
  );

  return {
    userIds: uniquePositiveUserIds(employees.map((employee) => relationIdValue(employee.user_id))),
    labels: employees.map((employee) => {
      const role = employee.job_title || (Array.isArray(employee.job_id) ? employee.job_id[1] : "");
      return [employee.name || "", role].filter(Boolean).join(" - ");
    }).filter(Boolean),
  };
}

async function assignSeasonalPlanVehicles(
  planId: number,
  lines: Array<{ sequence: number; vehicleIds?: number[] }>,
  connectionOverrides: { login: string; password: string },
) {
  const scopedLines = lines.filter((line) => line.vehicleIds?.length);
  if (!scopedLines.length) {
    return;
  }

  const sequences = scopedLines.map((line) => line.sequence);
  const planLines = await executeOdooKw<Array<{ id: number; sequence?: number }>>(
    "mfo.seasonal.plan.line",
    "search_read",
    [[["plan_id", "=", planId], ["sequence", "in", sequences]]],
    {
      fields: ["sequence"],
      order: "sequence asc, id asc",
      limit: 1000,
    },
    connectionOverrides,
  );
  const lineIdBySequence = new Map(
    planLines.map((line) => [Number(line.sequence ?? 0), line.id] as const),
  );
  const lineIds = planLines.map((line) => line.id);
  if (!lineIds.length) {
    return;
  }

  const days = await executeOdooKw<
    Array<{ id: number; plan_line_id?: [number, string] | false; work_date?: string | false }>
  >(
    "mfo.seasonal.plan.day",
    "search_read",
    [[["plan_line_id", "in", lineIds]]],
    {
      fields: ["plan_line_id", "work_date"],
      order: "plan_line_id asc, work_date asc, id asc",
      limit: 5000,
    },
    connectionOverrides,
  );
  const daysByLineId = new Map<number, typeof days>();
  for (const day of days) {
    const lineId = relationIdValue(day.plan_line_id ?? false);
    if (!lineId) {
      continue;
    }
    daysByLineId.set(lineId, [...(daysByLineId.get(lineId) ?? []), day]);
  }

  for (const line of scopedLines) {
    const lineId = lineIdBySequence.get(line.sequence);
    const vehicleIds = line.vehicleIds ?? [];
    const lineDays = lineId ? daysByLineId.get(lineId) ?? [] : [];
    if (!lineDays.length || !vehicleIds.length) {
      continue;
    }

    const slotIndexByDate = new Map<string, number>();
    for (const day of lineDays) {
      const dateKey = day.work_date || "single";
      const slotIndex = slotIndexByDate.get(dateKey) ?? 0;
      slotIndexByDate.set(dateKey, slotIndex + 1);
      await executeOdooKw<boolean>(
        "mfo.seasonal.plan.day",
        "write",
        [[day.id], { assigned_vehicle_id: vehicleIds[slotIndex % vehicleIds.length] }],
        {},
        connectionOverrides,
      );
    }
  }
}

async function sendTaskToReviewWithSystemFallback(
  taskId: number,
  options: {
    forceComplete?: boolean;
  },
  connectionOverrides: {
    login: string;
    password: string;
  },
) {
  try {
    await sendWorkspaceTaskReportToReview(taskId, options, connectionOverrides);
    return connectionOverrides;
  } catch (error) {
    console.warn("Task review submit failed with user credentials, retrying as system:", error);
    await sendWorkspaceTaskReportToReview(taskId, options, {});
    return {};
  }
}

async function notifyTaskReviewersWithSystemFallback(
  taskId: number,
  reporterName: string,
  connectionOverrides: {
    login: string;
    password: string;
  } | Record<string, never>,
) {
  try {
    const recipientIds = await notifyWorkspaceTaskReportReviewers(taskId, reporterName, connectionOverrides);
    if (recipientIds.length) {
      return recipientIds;
    }
  } catch (error) {
    console.warn("Task reviewer notification failed with current credentials, retrying as system:", error);
  }
  return notifyWorkspaceTaskReportReviewers(taskId, reporterName, {});
}

async function notifyPushQuietly(input: {
  eventType: PushEventType;
  title?: string;
  body?: string;
  targetUrl?: string;
  userIds?: number[];
}) {
  try {
    const result = await notifyPushEvent(input);
    console.info("[push] event result", {
      eventType: input.eventType,
      userIds: input.userIds ?? [],
      result,
    });
  } catch (error) {
    console.warn("Push notification failed:", error);
  }
}

function uniquePositiveUserIds(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(
      values.filter((value): value is number => Number.isFinite(value ?? NaN) && Number(value) > 0),
    ),
  );
}

function getUploadedFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

async function encodeProcurementUpload(file: File) {
  return {
    name: file.name || "Хавсралт",
    mimetype: file.type || "application/octet-stream",
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
  };
}

type LabeledUploadFile = {
  file: File;
  label: string;
};

function getTaskReportImageUploads(formData: FormData): LabeledUploadFile[] {
  return [
    ...getUploadedFiles(formData, "report_before_images").map((file) => ({
      file,
      label: "Өмнөх зураг",
    })),
    ...getUploadedFiles(formData, "report_after_images").map((file) => ({
      file,
      label: "Дараах зураг",
    })),
    ...getUploadedFiles(formData, "report_images").map((file) => ({
      file,
      label: "Зураг",
    })),
  ];
}

function getLabeledAttachmentName(upload: LabeledUploadFile) {
  const fileName = upload.file.name.trim();
  return fileName ? `${upload.label} - ${fileName}` : upload.label;
}

type RoadCleaningLineInput = {
  sequence: number;
  cleaningAreaId: number | null;
  employeeId: number | null;
  masterId: number | null;
  areaName: string;
  newAreaName: string;
};

function parseRoadCleaningLines(rawJson: string): RoadCleaningLineInput[] {
  if (!rawJson) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const cleaningAreaId = Number(record.cleaningAreaId);
      const employeeId = Number(record.employeeId);
      const masterId = Number(record.masterId);
      const areaName = String(record.areaName ?? "").trim();
      const newAreaName = String(record.newAreaName ?? "").trim();

      return {
        sequence: Number(record.sequence) || index + 1,
        cleaningAreaId:
          Number.isFinite(cleaningAreaId) && cleaningAreaId !== 0 ? cleaningAreaId : null,
        employeeId: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
        masterId: Number.isFinite(masterId) && masterId > 0 ? masterId : null,
        areaName,
        newAreaName,
      };
    })
    .filter((line) => line.employeeId && (line.cleaningAreaId || line.areaName || line.newAreaName));
}

function getFallbackMimeType(fileName: string, family: "image" | "audio") {
  const normalizedName = fileName.trim().toLowerCase();
  const extension = normalizedName.includes(".")
    ? normalizedName.slice(normalizedName.lastIndexOf("."))
    : "";

  if (family === "image") {
    switch (extension) {
      case ".png":
        return "image/png";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      default:
        return "image/jpeg";
    }
  }

  switch (extension) {
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    default:
      return "audio/mpeg";
  }
}

function revalidateFieldPaths(taskId?: number) {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/review");
  revalidatePath("/reports");
  revalidatePath("/quality");
  revalidatePath("/field");
  if (taskId) {
    revalidatePath(`/tasks/${taskId}`);
  }
}

function buildFieldPath(taskId: number, stopLineId?: number) {
  return {
    path: `/field?taskId=${taskId}`,
    hash: stopLineId ? `#stop-${stopLineId}` : "",
  };
}

export async function createProjectAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  const managerIdRaw = String(formData.get("manager_id") ?? "").trim();
  const departmentIdRaw = String(formData.get("department_id") ?? "").trim();
  const operationUnit = String(formData.get("operation_unit") ?? "").trim();
  const operationType = String(formData.get("operation_type") ?? "").trim();
  const isCustomWorkType = operationType === CUSTOM_WORK_TYPE_VALUE;
  const normalizedOperationType = isCustomWorkType ? "" : operationType;
  const trackQuantity = String(formData.get("track_quantity") ?? "").trim() === "1";
  const plannedQuantityRaw = String(formData.get("planned_quantity") ?? "").trim();
  const unitIdRaw = String(formData.get("unit_id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const garbageVehicleIdRaw = String(formData.get("garbage_vehicle_id") ?? "").trim();
  const garbageSubdistrictIdRaw = String(formData.get("garbage_subdistrict_id") ?? "").trim();
  const garbagePointIds = formData
    .getAll("garbage_point_ids")
    .map((value) => Number(String(value ?? "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  const garbageLoaderOverride = String(formData.get("garbage_loader_override") ?? "") === "1";
  const garbageLoaderEmployeeIds = formData
    .getAll("garbage_loader_employee_ids")
    .map((value) => Number(String(value ?? "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  const autoBaseVehicleIdRaw = String(formData.get("auto_base_vehicle_id") ?? "").trim();
  const autoBaseVehicleLabel = String(formData.get("auto_base_vehicle_label") ?? "").trim();
  const autoBaseItemName = String(formData.get("auto_base_item_name") ?? "").trim();
  const autoBaseItemDescription = String(formData.get("auto_base_item_description") ?? "").trim();
  const autoBaseItemQuantityRaw = String(formData.get("auto_base_item_quantity") ?? "").trim();
  const autoBaseItemUnitPriceRaw = String(formData.get("auto_base_item_unit_price") ?? "").trim();
  const autoBaseRequiredDate = String(formData.get("auto_base_required_date") ?? "").trim();
  const autoBaseItemImages = getUploadedFiles(formData, "auto_base_item_images");
  const autoBaseExtraLinesJson = String(formData.get("auto_base_extra_lines_json") ?? "").trim();
  const seasonalWorkDaysJson = String(formData.get("seasonal_work_days_json") ?? "").trim();
  const seasonalLinesJson = String(formData.get("seasonal_lines_json") ?? "").trim();
  const seasonalNotes = String(formData.get("seasonal_notes") ?? "").trim();
  const roadCleaningLinesJson = String(formData.get("road_cleaning_lines_json") ?? "").trim();
  const cleaningWorkDate = String(formData.get("work_date") ?? "").trim();
  const projectDescription = String(formData.get("project_description") ?? "").trim();
  const projectFiles = getUploadedFiles(formData, "project_files");
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const transportInspectorMode = Boolean(
    session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher),
  );

  if (!hasCapability(session, "create_projects")) {
    redirectWithMessage(
      "/projects/new",
      "error",
      "Танд шинэ ажил үүсгэх эрх нээгдээгүй байна.",
    );
  }

  let effectiveDepartmentIdRaw = departmentIdRaw;

  if (isMasterRole(session.role)) {
    const [masterSnapshot, departmentOptions] = await Promise.all([
      loadMunicipalSnapshot(connectionOverrides),
      loadDepartmentOptions(connectionOverrides),
    ]);

    const masterDepartmentName = pickPrimaryDepartmentName({
      taskDirectory: masterSnapshot.taskDirectory,
      reports: masterSnapshot.reports,
      projects: masterSnapshot.projects,
      departments: masterSnapshot.departments,
    });
    const lockedDepartmentOption = masterDepartmentName
      ? departmentOptions.find((option) => option.name === masterDepartmentName) ?? null
      : null;

    if (!lockedDepartmentOption) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Таны харьяалах алба нэгжийг тодорхойлж чадсангүй. Дараа дахин оролдоно уу.",
      );
    }

    const lockedDepartmentId = lockedDepartmentOption?.id;
    if (!lockedDepartmentId) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Таны харьяалах алба нэгжийг тодорхойлж чадсангүй. Дараа дахин оролдоно уу.",
      );
    }

    effectiveDepartmentIdRaw = String(lockedDepartmentId);
  }

  if (operationUnit === "road_area_cleaning") {
    const roadCleaningLines = parseRoadCleaningLines(roadCleaningLinesJson);

    if (!cleaningWorkDate || !roadCleaningLines.length) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Цэвэрлэх талбай, хариуцсан ажилтан, ажлын огноог заавал сонгоно уу.",
      );
    }

    try {
      let createdCount = 0;
      const assignedRoadCleaningUserIds = new Set<number>();
      for (const line of roadCleaningLines) {
        let cleaningAreaId = line.cleaningAreaId;

        if (!line.masterId) {
          throw new Error("Хариуцсан мастерийг заавал сонгоно уу.");
        }

        if (!cleaningAreaId && line.newAreaName) {
          const localArea = await createLocalRoadCleaningArea({
            name: line.newAreaName,
            departmentId: effectiveDepartmentIdRaw ? Number(effectiveDepartmentIdRaw) : null,
            employeeId: line.employeeId,
            masterId: line.masterId,
          });
          cleaningAreaId = localArea.id;
        }

        if (!cleaningAreaId || !line.employeeId) {
          throw new Error("Цэвэрлэх талбай болон хариуцсан ажилтны мөр бүрийг бүрэн сонгоно уу.");
        }

        const createdWork = await createRoadCleaningWork(
          {
            cleaningAreaId,
            areaName: line.areaName || line.newAreaName,
            departmentId: effectiveDepartmentIdRaw ? Number(effectiveDepartmentIdRaw) : null,
            employeeId: line.employeeId,
            masterId: line.masterId,
            workDate: cleaningWorkDate,
          },
          connectionOverrides,
        );
        for (const userId of createdWork.assignedUserIds ?? []) {
          assignedRoadCleaningUserIds.add(userId);
        }
        createdCount += 1;
      }

      if (assignedRoadCleaningUserIds.size) {
        await notifyPushQuietly({
          eventType: "new_work_assigned",
          title: "Шинэ ажил оноогдлоо",
          body:
            createdCount > 1
              ? `${createdCount} зам талбайн цэвэрлэгээний ажил танд оноогдлоо.`
              : "Зам талбайн цэвэрлэгээний ажил танд оноогдлоо.",
          targetUrl: "/tasks",
          userIds: Array.from(assignedRoadCleaningUserIds),
        });
      }

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/notifications");
      revalidatePath("/field");
      revalidatePath("/projects/new");
      redirect(
        "/projects/new?notice=" +
          encodeURIComponent(createdCount + " зам талбайн цэвэрлэгээний ажил амжилттай үүслээ."),
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirectWithMessage("/projects/new", "error", getErrorMessage(error));
    }
  }

  if (operationUnit === "auto_base") {
    const vehicleLabel = autoBaseVehicleLabel || (autoBaseVehicleIdRaw ? `Машин #${autoBaseVehicleIdRaw}` : "");
    let extraAutoBaseLines: Array<{
      sequence?: number;
      itemName?: string;
      description?: string;
      quantity?: string | number;
      unitPrice?: string | number;
      imageFieldName?: string;
    }> = [];

    try {
      extraAutoBaseLines = autoBaseExtraLinesJson ? JSON.parse(autoBaseExtraLinesJson) : [];
    } catch {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Худалдан авалтын нэмэлт мөрийн мэдээлэл буруу байна.",
      );
    }

    const autoBaseLines = [
      {
        isPrimary: true,
        sequence: 1,
        itemName: autoBaseItemName,
        description: autoBaseItemDescription,
        quantity: autoBaseItemQuantityRaw,
        unitPrice: autoBaseItemUnitPriceRaw,
        imageFieldName: "auto_base_item_images",
      },
      ...extraAutoBaseLines.map((line) => ({ ...line, isPrimary: false })),
    ]
      .map((line, index) => ({
        isPrimary: Boolean(line.isPrimary),
        sequence: Number(line.sequence ?? index + 1),
        itemName: String(line.itemName ?? "").trim(),
        description: String(line.description ?? "").trim(),
        quantity: Number(line.quantity ?? 0),
        unitPrice: Number(line.unitPrice ?? 0),
        hasUnitPrice: String(line.unitPrice ?? "").trim() !== "",
        imageFieldName: String(line.imageFieldName ?? "").trim(),
      }))
      .filter((line) => line.isPrimary || line.itemName || line.description || line.hasUnitPrice);
    const requestTitle = name ||
      [
        vehicleLabel,
        autoBaseLines.length > 1
          ? `${autoBaseLines.length} төрлийн сэлбэг`
          : autoBaseLines[0]?.itemName,
      ].filter(Boolean).join(" - ");

    if (!effectiveDepartmentIdRaw || !autoBaseVehicleIdRaw || !autoBaseLines.length) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Авто баазын худалдан авалтын хүсэлтэд машин болон авах зүйлийн мөрийг заавал оруулна уу.",
      );
    }

    const invalidLine = autoBaseLines.find(
      (line) =>
        !line.itemName ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        (line.hasUnitPrice && (!Number.isFinite(line.unitPrice) || line.unitPrice < 0)),
    );

    if (invalidLine) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Мөр бүр дээр авах зүйлийн нэр, авах тоо, нэгж үнийг зөв оруулна уу.",
      );
    }

    try {
      const descriptionParts = [
        vehicleLabel ? `Машин: ${vehicleLabel}` : "",
        autoBaseVehicleIdRaw ? `Машины ID: ${autoBaseVehicleIdRaw}` : "",
        autoBaseLines.length > 1 ? `Мөрийн тоо: ${autoBaseLines.length}` : "",
      ].filter(Boolean);
      const createdRequest = await createProcurementRequest(
        {
          title: requestTitle || autoBaseLines[0]?.itemName,
          department_id: effectiveDepartmentIdRaw,
          description: descriptionParts.join("\n"),
          procurement_type: "spare_part",
          urgency: "medium",
          required_date: autoBaseRequiredDate || undefined,
          lines: autoBaseLines.map((line, index) => ({
            product_name: line.itemName,
            specification: line.description || (vehicleLabel ? `Машин: ${vehicleLabel}` : ""),
            quantity: line.quantity,
            approx_unit_price: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
            form_index: line.sequence || index + 1,
          })),
        },
        connectionOverrides,
      );

      for (const [index, line] of autoBaseLines.entries()) {
        const createdLine = createdRequest.lines[index];
        const lineImages = line.imageFieldName === "auto_base_item_images"
          ? autoBaseItemImages
          : getUploadedFiles(formData, line.imageFieldName);
        if (!createdLine || !lineImages.length) {
          continue;
        }
        for (const file of lineImages) {
          await uploadProcurementAttachment(
            createdRequest.id,
            {
              ...(await encodeProcurementUpload(file)),
              target: "line",
              document_type: "product_image",
              line_id: createdLine.id,
              note: line.itemName,
            },
            connectionOverrides,
          );
        }
      }

      revalidatePath("/procurement");
      revalidatePath("/procurement/assigned");
      revalidatePath("/procurement/dashboard");
      revalidatePath("/projects/new");
      revalidatePath(`/procurement/${createdRequest.id}`);
      redirect(
        `/procurement/${createdRequest.id}?notice=${encodeURIComponent(
          "Авто баазын худалдан авалтын хүсэлт амжилттай үүслээ.",
        )}`,
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirectWithMessage("/projects/new", "error", getErrorMessage(error));
    }
  }

  if (operationUnit === "garbage_transport") {
    if (!effectiveDepartmentIdRaw || !garbageVehicleIdRaw || !garbageSubdistrictIdRaw || !garbagePointIds.length || !startDate) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Хог тээвэрлэлтийн ажилд машин, хороо, хогийн цэг, огноог заавал сонгоно уу.",
      );
    }

    try {
      const garbageWorkConnection = transportInspectorMode ? {} : connectionOverrides;
      if (transportInspectorMode) {
        const [allowedVehicles, allowedPoints] = await Promise.all([
          loadGarbageVehicleOptions(connectionOverrides, { requireCurrentEmployeeScope: true }),
          loadGarbagePointOptions(connectionOverrides, { requireCurrentEmployeeScope: true }),
        ]);
        const selectedVehicleId = Number(garbageVehicleIdRaw);
        const allowedVehicleIds = new Set(allowedVehicles.map((vehicle) => vehicle.id));
        const allowedPointIds = new Set(allowedPoints.map((point) => point.id));
        const hasOutOfScopePoint = garbagePointIds.some((pointId) => !allowedPointIds.has(pointId));

        if (!allowedVehicleIds.has(selectedVehicleId) || hasOutOfScopePoint) {
          redirectWithMessage(
            "/projects/new",
            "error",
            "Танд оноогдоогүй машин, хороо болон хогийн цэгээр ажил үүсгэх боломжгүй.",
          );
        }
      }

      const [vehicles, points, currentEmployees, fleetBoard] = await Promise.all([
        executeOdooKw<GarbageVehicleCrewRecord[]>(
          "fleet.vehicle",
          "search_read",
          [[["id", "=", Number(garbageVehicleIdRaw)]]],
          {
            fields: [
              "name",
              "license_plate",
              "municipal_responsible_driver_id",
              "municipal_loader_1_id",
              "municipal_loader_2_id",
              "driver_id",
              "driver_employee_id",
              "mfo_driver_employee_id",
              "loader_employee_id",
            ],
            limit: 1,
          },
          garbageWorkConnection,
        ).catch(() =>
          executeOdooKw<GarbageVehicleCrewRecord[]>(
            "fleet.vehicle",
            "search_read",
            [[["id", "=", Number(garbageVehicleIdRaw)]]],
            { fields: ["name", "license_plate"], limit: 1 },
            garbageWorkConnection,
          ).catch(() => []),
        ),
        executeOdooKw<Array<{ id: number; name: string; subdistrict_id?: [number, string] | false }>>(
          "mfo.collection.point",
          "search_read",
          [[["id", "in", garbagePointIds]]],
          { fields: ["name", "subdistrict_id"], order: "subdistrict_id asc, name asc", limit: 500 },
          garbageWorkConnection,
        ).catch(() => []),
        executeOdooKw<Array<{ id: number }>>(
          "hr.employee",
          "search_read",
          [[["user_id", "=", session.uid]]],
          { fields: ["id"], limit: 1 },
          garbageWorkConnection,
        ).catch(() => []),
        loadFleetVehicleBoard().catch(() => null),
      ]);
      const selectedVehicle = vehicles[0] ?? null;
      const boardVehicle = fleetBoard?.allVehicles.find((vehicle) => vehicle.id === Number(garbageVehicleIdRaw)) ?? null;
      const vehicleName = selectedVehicle?.license_plate || selectedVehicle?.name || `Машин #${garbageVehicleIdRaw}`;
      const resolvedVehicleName = boardVehicle?.plate || vehicleName;
      const vehicleDriverId =
        relationIdValue(selectedVehicle?.municipal_responsible_driver_id) ??
        relationIdValue(selectedVehicle?.driver_employee_id) ??
        relationIdValue(selectedVehicle?.mfo_driver_employee_id) ??
        relationIdValue(selectedVehicle?.driver_id) ??
        boardVehicle?.responsibleDriverId ??
        null;
      const defaultVehicleCollectorIds = Array.from(
        new Set(
          [
            relationIdValue(selectedVehicle?.municipal_loader_1_id),
            relationIdValue(selectedVehicle?.municipal_loader_2_id),
            relationIdValue(selectedVehicle?.loader_employee_id),
            boardVehicle?.loader1Id ?? null,
            boardVehicle?.loader2Id ?? null,
          ].filter((id): id is number => Boolean(id)),
        ),
      );
      const vehicleCollectorIds = garbageLoaderOverride
        ? Array.from(new Set(garbageLoaderEmployeeIds))
        : defaultVehicleCollectorIds;
      const vehicleWorkerAssignments = await loadEmployeeUserAssignments(
        [vehicleDriverId, ...vehicleCollectorIds].filter((id): id is number => Boolean(id)),
        garbageWorkConnection,
      );
      const fallbackCrewNames = [
        boardVehicle?.responsibleDriverName,
        boardVehicle?.loader1Name,
        boardVehicle?.loader2Name,
      ].filter((value): value is string => Boolean(value));
      const fallbackCrewUsers = fallbackCrewNames.length
        ? (
            await Promise.all(
              fallbackCrewNames.map((crewName) =>
                executeOdooKw<Array<{ id: number; name?: string | false }>>(
                  "res.users",
                  "search_read",
                  [[["name", "ilike", crewName]]],
                  { fields: ["name"], limit: 1 },
                  garbageWorkConnection,
                ).catch(() => []),
              ),
            )
          ).flat()
        : [];
      const assignedGarbageUserIds = uniquePositiveUserIds([
        session.uid,
        ...vehicleWorkerAssignments.userIds,
        ...fallbackCrewUsers.map((user) => user.id),
      ]);
      const vehicleWorkerLabels = vehicleWorkerAssignments.labels.length
        ? vehicleWorkerAssignments.labels
        : fallbackCrewNames;
      const vehicleWorkerSummary = vehicleWorkerLabels.length
        ? `Жолооч/ачигч: ${vehicleWorkerLabels.join(", ")}`
        : "";
      const subdistrict = points.find((point) => Array.isArray(point.subdistrict_id))?.subdistrict_id;
      const subdistrictName = Array.isArray(subdistrict) ? subdistrict[1] : "Сонгосон хороо";
      const createdProjectId = await createWorkspaceProject(
        {
          name: name || `${resolvedVehicleName} - ${subdistrictName} / ${startDate}`,
          managerId: session.uid,
          departmentId: Number(effectiveDepartmentIdRaw),
          operationType: "garbage",
          startDate,
          deadline: startDate,
          description: [projectDescription, vehicleWorkerSummary].filter(Boolean).join("\n") || undefined,
        },
        garbageWorkConnection,
      );
      const parentTaskId = await createWorkspaceTask(
        {
          projectId: createdProjectId,
          name: name
            ? `${name} - ${points[0]?.name ?? "Хогийн цэг"}`
            : `${resolvedVehicleName} - ${subdistrictName} - ${points[0]?.name ?? "Хогийн цэг"} - ${startDate}`,
          deadline: startDate,
          plannedQuantity: 1,
          description: [projectDescription || "Хяналтын ажилтны оруулсан хог тээвэрлэлтийн даалгавар.", vehicleWorkerSummary]
            .filter(Boolean)
            .join("\n"),
          assigneeUserIds: assignedGarbageUserIds,
        },
        garbageWorkConnection,
      );
      await executeOdooKw<boolean>(
        "project.task",
        "write",
        [[parentTaskId], {
          mfo_operation_type: "garbage",
          mfo_state: "dispatched",
          mfo_shift_date: startDate,
          mfo_vehicle_id: Number(garbageVehicleIdRaw),
          ...(vehicleDriverId ? { mfo_driver_employee_id: vehicleDriverId } : {}),
          ...(vehicleCollectorIds.length
            ? { mfo_collector_employee_ids: [[6, 0, vehicleCollectorIds]] }
            : {}),
          mfo_inspector_employee_id: currentEmployees[0]?.id || false,
        }],
        {},
        garbageWorkConnection,
      ).catch(() => false);
      for (const [index, point] of points.entries()) {
        const taskId = index === 0
          ? parentTaskId
          : await createWorkspaceTask(
              {
                projectId: createdProjectId,
                name: name
                  ? `${name} - ${point.name}`
                  : `${resolvedVehicleName} - ${
                      Array.isArray(point.subdistrict_id) ? point.subdistrict_id[1] : subdistrictName
                    } - ${point.name} - ${startDate}`,
                deadline: startDate,
                plannedQuantity: 1,
                description: [
                  projectDescription || `Хяналтын ажилтны оруулсан хог тээвэрлэлтийн даалгавар. Хогийн цэг: ${point.name}.`,
                  vehicleWorkerSummary,
                ]
                  .filter(Boolean)
                  .join("\n"),
                sequence: (index + 1) * 10,
                assigneeUserIds: assignedGarbageUserIds,
              },
              garbageWorkConnection,
            );

        if (index > 0) {
          await executeOdooKw<boolean>(
            "project.task",
            "write",
            [[taskId], {
              mfo_operation_type: "garbage",
              mfo_state: "dispatched",
              mfo_shift_date: startDate,
              mfo_vehicle_id: Number(garbageVehicleIdRaw),
              ...(vehicleDriverId ? { mfo_driver_employee_id: vehicleDriverId } : {}),
              ...(vehicleCollectorIds.length
                ? { mfo_collector_employee_ids: [[6, 0, vehicleCollectorIds]] }
                : {}),
              mfo_inspector_employee_id: currentEmployees[0]?.id || false,
            }],
            {},
            garbageWorkConnection,
          ).catch(() => false);
        }

        await executeOdooKw<number>(
          "mfo.stop.execution.line",
          "create",
          [{
            task_id: taskId,
            collection_point_id: point.id,
            sequence: 10,
          }],
          {},
          garbageWorkConnection,
        );
      }

      if (projectFiles.length) {
        const attachments = await Promise.all(
          projectFiles.map(async (file) => ({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
          })),
        );
        await createWorkspaceProjectAttachments(
          createdProjectId,
          attachments,
          garbageWorkConnection,
        );
      }

      if (assignedGarbageUserIds.length) {
        await notifyPushQuietly({
          eventType: "new_work_assigned",
          title: "Шинэ хог тээврийн ажил оноогдлоо",
          body: `${resolvedVehicleName} дээр ${points.length} хогийн цэгийн даалгавар оноогдлоо.`,
          targetUrl: `/projects/${createdProjectId}`,
          userIds: assignedGarbageUserIds,
        });
      }

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/notifications");
      revalidatePath("/review");
      revalidatePath("/reports");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/${createdProjectId}`);
      redirect(
        `/projects/${createdProjectId}?notice=${encodeURIComponent(
          `Хог тээвэрлэлтийн ажил амжилттай үүслээ. ${points.length} хогийн цэг нэмэгдлээ.`,
        )}`,
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirectWithMessage("/projects/new", "error", getErrorMessage(error));
    }
  }

  if (operationUnit === "garbage_seasonal") {
    if (!name || !effectiveDepartmentIdRaw || !startDate || !deadline) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Гэнэтийн ажилд нэр, хэлтэс, эхлэх болон дуусах огноог заавал оруулна уу.",
      );
    }

    if (startDate > deadline) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Гэнэтийн ажлын дуусах огноо эхлэх огнооноос өмнө байж болохгүй.",
      );
    }

    const allWorkDays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    let selectedWorkDays: string[] = allWorkDays;
    let seasonalLines: Array<{
      sequence?: number;
      khorooLabel?: string;
      locationName?: string;
      plannedVehicleCount?: number;
      plannedTonnage?: number;
      workDate?: string | null;
      routeId?: number | string | null;
      vehicleIds?: Array<number | string>;
      remarks?: string;
    }> = [];

    try {
      selectedWorkDays = seasonalWorkDaysJson ? JSON.parse(seasonalWorkDaysJson) : selectedWorkDays;
      seasonalLines = seasonalLinesJson ? JSON.parse(seasonalLinesJson) : [];
    } catch {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Гэнэтийн ажлын мөрийн мэдээлэл буруу байна.",
      );
    }

    if (!selectedWorkDays.length) {
      selectedWorkDays = allWorkDays;
    }

    const normalizedLines = seasonalLines
      .map((line, index) => {
        const vehicleIds = Array.isArray(line.vehicleIds)
          ? line.vehicleIds
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0)
          : [];

        return {
          sequence: Number(line.sequence ?? index + 1),
          khorooLabel: String(line.khorooLabel ?? "").trim(),
          locationName: String(line.locationName ?? "").trim(),
          vehicleIds,
          plannedVehicleCount: vehicleIds.length || Number(line.plannedVehicleCount ?? 0),
          plannedTonnage: Number(line.plannedTonnage ?? 0),
          workDate: String(line.workDate ?? "").trim(),
          routeId:
            line.routeId === null || line.routeId === undefined || line.routeId === ""
              ? null
              : Number(line.routeId),
          remarks: String(line.remarks ?? "").trim(),
        };
      })
      .filter((line) => line.khorooLabel || line.locationName);

    if (!normalizedLines.length) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Гэнэтийн ажлын байршлын мөрөөс дор хаяж нэгийг оруулна уу.",
      );
    }

    const invalidLine = normalizedLines.find(
      (line) =>
        !line.locationName ||
        !Number.isFinite(line.plannedVehicleCount) ||
        line.plannedVehicleCount <= 0 ||
        !Number.isFinite(line.plannedTonnage) ||
        line.plannedTonnage <= 0 ||
        (Boolean(line.workDate) && (line.workDate < startDate || line.workDate > deadline)),
    );

    if (invalidLine) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Мөр бүр дээр байршил, машин, тонн талбаруудыг зөв бөглөнө үү.",
      );
    }

    try {
      const result = await createSeasonalWorkspacePlan(
        {
          name,
          departmentId: Number(effectiveDepartmentIdRaw),
          startDate,
          endDate: deadline,
          workDays: selectedWorkDays as Array<
            "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
          >,
          notes: seasonalNotes || projectDescription,
          lines: normalizedLines,
        },
        connectionOverrides,
      );
      await assignSeasonalPlanVehicles(result.planId, normalizedLines, connectionOverrides).catch((error) => {
        console.warn("Ad hoc work vehicle assignment failed:", error);
      });

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/seasonal/${result.planId}`);
      redirect(
        `/projects/seasonal/${result.planId}?notice=${encodeURIComponent(
          result.message || "Гэнэтийн ажил амжилттай үүслээ.",
        )}`,
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirectWithMessage("/projects/new", "error", getErrorMessage(error));
    }
  }

  if (!name || !effectiveDepartmentIdRaw) {
    redirectWithMessage(
      "/projects/new",
      "error",
      "Төслийн нэр болон алба нэгжээ заавал сонгоно уу.",
    );
  }

  const selectedWorkType =
    operationUnit !== "garbage_transport" && normalizedOperationType
      ? (await loadWorkTypeOptions(connectionOverrides)).find(
          (option) => option.operationType === normalizedOperationType,
        ) ?? null
      : null;
  const allowedUnitIds = new Set(selectedWorkType?.allowedUnits.map((unit) => unit.id) ?? []);
  const measurementUnitId =
    unitIdRaw && Number.isFinite(Number(unitIdRaw))
      ? Number(unitIdRaw)
      : selectedWorkType?.defaultUnitId ?? selectedWorkType?.allowedUnits[0]?.id ?? null;

  if (operationUnit !== "garbage_transport" && !isCustomWorkType && !selectedWorkType) {
    redirectWithMessage("/projects/new", "error", "Ажлын төрлөө сонгоно уу.");
  }

  if (trackQuantity) {
    if (operationUnit !== "garbage_transport" && !selectedWorkType) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Төлөвлөсөн хэмжээ ашиглах бол бүртгэлтэй ажлын төрөл сонгоно уу.",
      );
    }

    const plannedQuantity = Number(plannedQuantityRaw);
    if (!plannedQuantityRaw || Number.isNaN(plannedQuantity) || plannedQuantity <= 0) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Checkbox идэвхтэй бол төлөвлөсөн хэмжээг 0-ээс их тоогоор оруулна уу.",
      );
    }

    if (!measurementUnitId) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Checkbox идэвхтэй бол хэмжих нэгжээ заавал оруулна уу.",
      );
    }
  }

  if (
    operationUnit !== "garbage_transport" &&
    measurementUnitId &&
    allowedUnitIds.size &&
    !allowedUnitIds.has(measurementUnitId)
  ) {
    redirectWithMessage(
      "/projects/new",
      "error",
      "Сонгосон хэмжих нэгж энэ ажлын төрөлд зөвшөөрөгдөөгүй байна.",
    );
  }

  try {
    const projectId = await createWorkspaceProject(
      {
        name,
        managerId: managerIdRaw ? Number(managerIdRaw) : null,
        departmentId: effectiveDepartmentIdRaw ? Number(effectiveDepartmentIdRaw) : null,
        operationType: normalizedOperationType || undefined,
        trackQuantity,
        plannedQuantity:
          trackQuantity && plannedQuantityRaw ? Number(plannedQuantityRaw) : null,
        measurementUnitId: trackQuantity ? measurementUnitId : null,
        startDate: startDate || undefined,
        deadline: deadline || undefined,
        description: projectDescription || undefined,
      },
      connectionOverrides,
    );

    if (projectFiles.length) {
      const attachments = await Promise.all(
        projectFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      );
      await createWorkspaceProjectAttachments(projectId, attachments, connectionOverrides);
    }
    if (projectDescription) {
      await updateWorkspaceProjectDescription(projectId, projectDescription, connectionOverrides);
    }

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/field");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath("/projects/new");
    redirect(`/projects/${projectId}?notice=${encodeURIComponent("Төсөл амжилттай үүслээ.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("/projects/new", "error", getErrorMessage(error));
  }
}

export async function createTaskAction(formData: FormData) {
  const projectId = Number(String(formData.get("project_id") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const garbageTaskMode = String(formData.get("garbage_task_mode") ?? "") === "1";
  const garbageTaskPointIds = formData
    .getAll("garbage_task_point_ids")
    .map((value) => Number(String(value ?? "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  const garbageTaskVehicleId = Number(String(formData.get("garbage_vehicle_id") ?? ""));
  const garbageTaskDriverEmployeeId = Number(
    String(formData.get("garbage_driver_employee_id") ?? ""),
  );
  const garbageTaskCollectorEmployeeIds = formData
    .getAll("garbage_collector_employee_ids")
    .map((value) => Number(String(value ?? "")))
    .filter((value) => Number.isFinite(value) && value > 0);
  const taskKhoroo = String(formData.get("task_khoroo") ?? "").trim();
  const taskLocation = String(formData.get("task_location") ?? "").trim();
  const newTaskLocation = String(formData.get("new_task_location") ?? "").trim();
  const teamLeaderIdRaw = String(formData.get("team_leader_id") ?? "").trim();
  const crewTeamIdRaw = String(formData.get("crew_team_id") ?? "").trim();
  const newCrewTeamName = String(formData.get("new_crew_team_name") ?? "").trim();
  const newCrewMemberUserIds = formData
    .getAll("new_crew_member_user_ids")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const startDate = String(formData.get("start_date") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const unitIdValues = formData.getAll("unit_id").map((value) => String(value).trim());
  const plannedQuantityValues = formData
    .getAll("planned_quantity")
    .map((value) => String(value).trim());
  const newUnitNameValues = formData
    .getAll("new_unit_name")
    .map((value) => String(value).trim());
  const description = String(formData.get("description") ?? "").trim();
  const taskFiles = getUploadedFiles(formData, "task_files");
  const effectiveTaskLocation = newTaskLocation || taskLocation;
  const locationSummary = [
    taskKhoroo ? `Хороо: ${taskKhoroo}` : "",
    effectiveTaskLocation ? `Байршил: ${effectiveTaskLocation}` : "",
  ].filter(Boolean);
  const taskDescription = [locationSummary.join("\n"), description]
    .filter(Boolean)
    .join("\n\n");

  if (!projectId || !name) {
    redirectWithMessage(
      `/projects/${projectId || ""}`,
      "error",
      "Ажил үүсгэхэд шаардлагатай талбар дутуу байна.",
      "#task-create-form",
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "create_tasks")) {
      redirectWithMessage(
        `/projects/${projectId}`,
        "error",
        "Танд энэ ажил дээр даалгавар нэмэх эрх нээгдээгүй байна.",
        "#task-create-form",
      );
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    const project = await loadProjectDetail(projectId, connectionOverrides);

    if (garbageTaskMode && project.operationType === "garbage") {
      if (!garbageTaskVehicleId || !garbageTaskPointIds.length) {
        redirectWithMessage(
          `/projects/${projectId}`,
          "error",
          "Хог тээврийн даалгаварт машин болон хогийн цэг заавал сонгогдсон байх ёстой.",
          "#task-create-form",
        );
      }

      const [points, currentEmployees, vehicleRecords] = await Promise.all([
        executeOdooKw<Array<{ id: number; name: string; subdistrict_id?: [number, string] | false }>>(
          "mfo.collection.point",
          "search_read",
          [[["id", "in", garbageTaskPointIds]]],
          {
            fields: ["name", "subdistrict_id"],
            order: "subdistrict_id asc, name asc",
            limit: garbageTaskPointIds.length,
          },
          connectionOverrides,
        ).catch(() => []),
        executeOdooKw<Array<{ id: number }>>(
          "hr.employee",
          "search_read",
          [[["user_id", "=", session.uid]]],
          { fields: ["id"], limit: 1 },
          connectionOverrides,
        ).catch(() => []),
        executeOdooKw<Array<{ id: number; name?: string | false; license_plate?: string | false }>>(
          "fleet.vehicle",
          "search_read",
          [[["id", "=", garbageTaskVehicleId]]],
          { fields: ["name", "license_plate"], limit: 1 },
          connectionOverrides,
        ).catch(() => []),
      ]);

      if (!points.length) {
        redirectWithMessage(
          `/projects/${projectId}`,
          "error",
          "Сонгосон хогийн цэгүүд Odoo дээр олдсонгүй.",
          "#task-create-form",
        );
      }

      const vehicleRecord = vehicleRecords[0] ?? null;
      const vehicleName =
        vehicleRecord?.license_plate || vehicleRecord?.name || `Машин #${garbageTaskVehicleId}`;
      const driverEmployeeId = Number.isFinite(garbageTaskDriverEmployeeId)
        ? garbageTaskDriverEmployeeId
        : null;
      const collectorEmployeeIds = Array.from(new Set(garbageTaskCollectorEmployeeIds));
      const workerAssignments = await loadEmployeeUserAssignments(
        [driverEmployeeId, ...collectorEmployeeIds].filter((id): id is number => Boolean(id)),
        connectionOverrides,
      );
      const assignedUserIds = uniquePositiveUserIds([
        session.uid,
        ...workerAssignments.userIds,
      ]);
      const inspectorEmployeeId = currentEmployees[0]?.id ?? null;
      const effectiveDate = deadline || project.deadline || project.startDate || getTodayDateKey();
      const createdTaskIds: number[] = [];

      for (const [index, point] of points.entries()) {
        const subdistrictName = Array.isArray(point.subdistrict_id)
          ? point.subdistrict_id[1]
          : taskKhoroo || "Хороо";
        const taskName =
          name && name !== "Нэмэлт хогийн цэг"
            ? `${name} - ${point.name}`
            : `${vehicleName} - ${subdistrictName} - ${point.name} - ${effectiveDate}`;
        const crewSummary = workerAssignments.labels.length
          ? `Жолооч/ачигч: ${workerAssignments.labels.join(", ")}`
          : "";
        const taskId = await createWorkspaceTask(
          {
            projectId,
            name: taskName,
            teamLeaderId: session.uid,
            assigneeUserIds: assignedUserIds,
            deadline: effectiveDate,
            plannedQuantity: 1,
            description: [
              `Хог тээвэрлэлтийн нэмэлт цэг: ${subdistrictName} · ${point.name}.`,
              crewSummary,
            ]
              .filter(Boolean)
              .join("\n"),
            sequence: (project.taskCount + index + 1) * 10,
            operationType: "garbage",
            shiftDate: effectiveDate,
            vehicleId: garbageTaskVehicleId,
            driverEmployeeId,
            collectorEmployeeIds,
            inspectorEmployeeId,
          },
          connectionOverrides,
        );

        await executeOdooKw<number>(
          "mfo.stop.execution.line",
          "create",
          [
            {
              task_id: taskId,
              collection_point_id: point.id,
              sequence: 10,
            },
          ],
          {},
          connectionOverrides,
        ).catch(() => 0);

        createdTaskIds.push(taskId);
      }

      await notifyPushQuietly({
        eventType: "new_work_assigned",
        title: "Шинэ хог тээврийн даалгавар",
        body: `${vehicleName} дээр ${createdTaskIds.length} хогийн цэг нэмэгдлээ.`,
        targetUrl: `/projects/${projectId}`,
        userIds: assignedUserIds,
      });

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/notifications");
      revalidatePath("/review");
      revalidatePath("/reports");
      revalidatePath(`/projects/${projectId}`);
      redirect(
        `/projects/${projectId}?notice=${encodeURIComponent(
          `${createdTaskIds.length} хогийн цэг даалгавар болж нэмэгдлээ.`,
        )}`,
      );
    }

    const validUnitIds = new Set(project.allUnitOptions.map((unit) => unit.id));
    let selectedCrewTeam = crewTeamIdRaw
      ? project.crewTeamOptions.find((team) => team.id === Number(crewTeamIdRaw)) ?? null
      : null;
    const quantityRows: Array<{
      plannedQuantity: number;
      measurementUnitId: number | null;
      unitLabel: string;
    }> = [];
    const rowCount = Math.max(
      plannedQuantityValues.length,
      unitIdValues.length,
      newUnitNameValues.length,
    );

    for (let index = 0; index < rowCount; index += 1) {
      const plannedQuantityRaw = plannedQuantityValues[index] ?? "";
      const unitIdRaw = unitIdValues[index] ?? "";
      const newUnitName = newUnitNameValues[index] ?? "";

      if (!plannedQuantityRaw && !unitIdRaw && !newUnitName) {
        continue;
      }

      const plannedQuantity = Number(plannedQuantityRaw);
      if (!plannedQuantityRaw || Number.isNaN(plannedQuantity) || plannedQuantity <= 0) {
        redirectWithMessage(
          `/projects/${projectId}`,
          "error",
          "Төлөвлөсөн хэмжээ 0-ээс их байх ёстой.",
          "#task-create-form",
        );
      }

      let measurementUnitId =
        !newUnitName && unitIdRaw && Number.isFinite(Number(unitIdRaw))
          ? Number(unitIdRaw)
          : null;
      let unitLabel =
        project.allUnitOptions.find((unit) => unit.id === measurementUnitId)?.name ??
        newUnitName;

      if (newUnitName) {
        try {
          const createdUnit = await createWorkspaceWorkUnit(newUnitName, connectionOverrides);
          measurementUnitId = createdUnit.id;
          unitLabel = createdUnit.name;
          validUnitIds.add(createdUnit.id);
        } catch (error) {
          console.warn("Хэмжих нэгж үүсгэх эрхгүй тул нэрийг даалгаврын тайлбарт хадгална.", error);
          measurementUnitId = null;
          unitLabel = newUnitName;
        }
      }

      if (measurementUnitId === null && !newUnitName) {
        redirectWithMessage(
          `/projects/${projectId}`,
          "error",
          "Хэмжээ ашиглах бол хэмжих нэгж сонгоно уу эсвэл шинэ нэгжийн нэр оруулна уу.",
          "#task-create-form",
        );
      }
      const resolvedMeasurementUnitId =
        measurementUnitId === null ? null : Number(measurementUnitId);

      if (
        resolvedMeasurementUnitId !== null &&
        validUnitIds.size &&
        !validUnitIds.has(resolvedMeasurementUnitId)
      ) {
        redirectWithMessage(
          `/projects/${projectId}`,
          "error",
          "Сонгосон хэмжих нэгж Odoo дээр олдсонгүй.",
          "#task-create-form",
        );
      }

      quantityRows.push({
        plannedQuantity,
        measurementUnitId: resolvedMeasurementUnitId,
        unitLabel,
      });
    }


    if (crewTeamIdRaw && !selectedCrewTeam) {
      redirectWithMessage(
        `/projects/${projectId}`,
        "error",
        "Сонгосон баг энэ ажилд хамаарахгүй байна.",
        "#task-create-form",
      );
    }

    if (!selectedCrewTeam && newCrewTeamName) {
      if (!newCrewMemberUserIds.length) {
        redirectWithMessage(
          `/projects/${projectId}`,
          "error",
          "Шинэ баг үүсгэх бол гишүүдээс дор хаяж нэг ажилтан сонгоно уу.",
          "#task-create-form",
        );
      }

      const createdTeam = await createWorkspaceCrewTeam(
        {
          name: newCrewTeamName,
          departmentId: project.departmentId,
          operationType: project.operationType || undefined,
          memberUserIds: newCrewMemberUserIds,
        },
        connectionOverrides,
      );
      selectedCrewTeam = {
        id: createdTeam.id,
        label: newCrewTeamName,
        memberUserIds: createdTeam.memberUserIds,
      };
    }

    const defaultTeamLeaderId = isMasterRole(session.role) ? session.uid : null;
    const effectiveTeamLeaderId = teamLeaderIdRaw ? Number(teamLeaderIdRaw) : defaultTeamLeaderId;
    const quantitySummary = quantityRows
      .map((row, index) => `${index + 1}. ${row.plannedQuantity} ${row.unitLabel || ""}`.trim())
      .join("\n");
    const effectiveTaskDescription = [
      taskDescription,
      quantitySummary ? `Тоо хэмжээ:\n${quantitySummary}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const taskId = await createWorkspaceTask(
      {
        projectId,
        name,
        teamLeaderId: effectiveTeamLeaderId,
        crewTeamId: selectedCrewTeam?.id ?? null,
        assigneeUserIds: selectedCrewTeam?.memberUserIds ?? [],
        startDate: startDate || undefined,
        deadline: deadline || undefined,
        measurementUnitId: quantityRows[0]?.measurementUnitId ?? null,
        plannedQuantity: quantityRows[0]?.plannedQuantity ?? null,
        description: effectiveTaskDescription || undefined,
      },
      connectionOverrides,
    );

    if (taskFiles.length) {
      const attachments = await Promise.all(
        taskFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      );
      await createWorkspaceTaskAttachments(taskId, attachments, connectionOverrides);
    }

    await notifyPushQuietly({
      eventType: "new_work_assigned",
      title: "Шинэ ажил оноогдлоо",
      body: name,
      targetUrl: `/tasks/${taskId}`,
      userIds: Array.from(
        new Set(
          [
            effectiveTeamLeaderId,
            ...(selectedCrewTeam?.memberUserIds ?? []),
          ].filter((value): value is number => Number.isFinite(value ?? NaN) && Number(value) > 0),
        ),
      ),
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/projects/${projectId}`);
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Шинэ ажил амжилттай үүслээ.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(`/projects/${projectId}`, "error", getErrorMessage(error), "#task-create-form");
  }
}

export async function updateTaskAction(formData: FormData) {
  const projectId = Number(String(formData.get("project_id") ?? ""));
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const target = projectId ? `/projects/${projectId}` : "/projects";

  if (!projectId || !taskId || !name) {
    redirectWithMessage(
      target,
      "error",
      "Даалгавар засахад шаардлагатай мэдээлэл дутуу байна.",
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "create_tasks")) {
      redirectWithMessage(target, "error", "Танд даалгавар засах эрх байхгүй байна.");
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };

    await updateWorkspaceTask(
      taskId,
      {
        name,
        deadline,
      },
      connectionOverrides,
    );

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/tasks/${taskId}`);
    redirect(`${target}?notice=${encodeURIComponent("Даалгавар амжилттай шинэчлэгдлээ.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(target, "error", getErrorMessage(error));
  }
}

export async function deleteTaskAction(formData: FormData) {
  const projectId = Number(String(formData.get("project_id") ?? ""));
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const target = projectId ? `/projects/${projectId}` : "/projects";

  if (!projectId || !taskId) {
    redirectWithMessage(
      target,
      "error",
      "Даалгавар устгахад шаардлагатай мэдээлэл дутуу байна.",
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "create_tasks")) {
      redirectWithMessage(target, "error", "Танд даалгавар устгах эрх байхгүй байна.");
    }

    await deleteWorkspaceTask(taskId, {
      login: session.login,
      password: session.password,
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    redirect(`${target}?notice=${encodeURIComponent("Даалгавар устгагдлаа.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(target, "error", getErrorMessage(error));
  }
}

export async function generateSeasonalExecutionAction(formData: FormData) {
  const planId = Number(String(formData.get("plan_id") ?? ""));
  const workDate = String(formData.get("work_date") ?? "").trim();

  if (!planId || !workDate) {
    redirectWithMessage(
      `/projects/seasonal/${planId || ""}`,
      "error",
      "Гүйцэтгэл үүсгэх өдөр дутуу байна.",
    );
  }

  const connectionOverrides = await getConnectionOverrides();

  try {
    const result = await generateSeasonalWorkspaceExecution(
      {
        planId,
        workDate,
      },
      connectionOverrides,
    );

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/seasonal/${planId}`);
    const notice =
      typeof result === "object" && result?.message
        ? result.message
        : `${workDate} өдрийн гүйцэтгэлийг амжилттай үүсгэлээ.`;
    redirect(
      `/projects/seasonal/${planId}?notice=${encodeURIComponent(notice)}`,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(
      `/projects/seasonal/${planId}`,
      "error",
      getErrorMessage(error),
    );
  }
}

export async function createTaskReportAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const timer = createReportTiming("create", { taskId });
  timer.mark("server_action_received");
  const reportText = String(formData.get("report_text") ?? "").trim();
  const workItemName = String(formData.get("report_work_item_name") ?? "").trim();
  const submitToken = String(formData.get("report_submit_token") ?? "").trim();
  const quantityRaw = String(formData.get("reported_quantity") ?? "").trim();
  const reportedQuantity = quantityRaw ? Number(quantityRaw) : 0;
  const quantityLineValues = formData
    .getAll("reported_quantity_line")
    .map((value) => String(value).trim());
  const quantityLineUnits = formData
    .getAll("reported_quantity_unit")
    .map((value) => String(value).trim());
  const beforeImageFiles = getUploadedFiles(formData, "report_before_images");
  const afterImageFiles = getUploadedFiles(formData, "report_after_images");
  const imageUploads = getTaskReportImageUploads(formData);
  const imageFiles = imageUploads.map((upload) => upload.file);
  const audioFiles = getUploadedFiles(formData, "report_audios");
  const reportPath = taskId ? `/tasks/${taskId}` : "/tasks";
  let submitLockKey = "";

  if (!taskId || !reportText) {
    redirect(`${reportPath}?error=${encodeURIComponent("Тайлангийн текстээ оруулна уу.")}`);
  }

  if (!beforeImageFiles.length || !afterImageFiles.length) {
    redirect(
      `${reportPath}?error=${encodeURIComponent("Өмнөх зураг болон дараах зургийг заавал оруулна уу.")}`,
    );
  }

  if (imageFiles.some((file) => file.type && !file.type.startsWith("image/"))) {
    redirect(
      `${reportPath}?error=${encodeURIComponent("Зураг хэсэгт зөвхөн зургийн файл сонгоно уу.")}`,
    );
  }

  if (imageFiles.length > 10) {
    redirect(`${reportPath}?error=${encodeURIComponent("Нэг тайланд дээд тал нь 10 зураг оруулна уу.")}`);
  }

  if (audioFiles.some((file) => file.type && !file.type.startsWith("audio/"))) {
    redirect(
      `${reportPath}?error=${encodeURIComponent("Аудио хэсэгт зөвхөн аудио файл сонгоно уу.")}`,
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "write_workspace_reports") || !canSubmitWorkspaceReport(session)) {
      redirect(
        `${reportPath}?error=${encodeURIComponent("Танд гүйцэтгэлийн тайлан илгээх эрх нээгдээгүй байна.")}`,
      );
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    await timer.step("validation_task_date", () =>
      assertWorkerTaskReportDateIsOpen(taskId, session, connectionOverrides, reportPath),
    );
    const lock = acquireReportSubmitLock("create", taskId, submitToken);
    submitLockKey = lock.key;
    if (!lock.acquired) {
      timer.mark("duplicate_submit_blocked");
      redirect(`${reportPath}?notice=${encodeURIComponent("Тайлан илгээгдэж байна. Давхар илгээх шаардлагагүй.")}`);
    }
    if (quantityRaw && (Number.isNaN(reportedQuantity) || reportedQuantity < 0)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ буруу байна.")}`);
    }
    timer.mark("validation_done", {
      imageCount: imageFiles.length,
      audioCount: audioFiles.length,
      imageBytes: imageFiles.reduce((total, file) => total + file.size, 0),
      audioBytes: audioFiles.reduce((total, file) => total + file.size, 0),
    });
    const quantityLineSummaries = quantityLineValues
      .map((value, index) => {
        if (!value) {
          return null;
        }
        const quantity = Number(value);
        if (Number.isNaN(quantity) || quantity < 0) {
          redirect(`${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ буруу байна.")}`);
        }
        const unit = quantityLineUnits[index] || "нэгж";
        return `${index + 1}. ${unit} ${quantity}`.trim();
      })
      .filter((value): value is string => Boolean(value));
    const firstLineQuantity = quantityLineValues
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0);
    const odooReportedQuantity =
      firstLineQuantity ?? (quantityRaw && reportedQuantity > 0 ? reportedQuantity : 1);
    const effectiveReportText = [
      workItemName ? `Даалгавар: ${workItemName}` : "",
      quantityLineSummaries.length
        ? `Гүйцэтгэсэн хэмжээ:\n${quantityLineSummaries.join("\n")}`
        : "",
      reportText,
    ]
      .filter(Boolean)
      .join("\n\n");

    const [imageAttachments, audioAttachments] = await timer.step("file_upload_prepare", () => Promise.all([
      Promise.all(
        imageUploads.map(async (upload) => ({
          name: getLabeledAttachmentName(upload),
          mimeType: upload.file.type || getFallbackMimeType(upload.file.name, "image"),
          base64: Buffer.from(await upload.file.arrayBuffer()).toString("base64"),
        })),
      ),
      Promise.all(
        audioFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, "audio"),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
    ]));

    await timer.step("odoo_create_report", () => createWorkspaceTaskReport(
      {
        taskId,
        reportText: effectiveReportText,
        reportedQuantity: odooReportedQuantity,
        imageAttachments,
        audioAttachments,
      },
      connectionOverrides,
    ));

    const reviewConnectionOverrides = await timer.step("odoo_submit_for_review", () => sendTaskToReviewWithSystemFallback(
      taskId,
      { forceComplete: true },
      connectionOverrides,
    ));
    const reviewerIds = await timer.step("odoo_notify_reviewers", () => notifyTaskReviewersWithSystemFallback(
      taskId,
      session.name,
      reviewConnectionOverrides,
    ));
    await timer.step("push_notify", () => notifyPushQuietly({
      eventType: "report_under_review",
      title: "Тайлан хяналтад ирлээ",
      body: `${session.name} тайлан илгээлээ.`,
      targetUrl: `/tasks/${taskId}`,
      userIds: reviewerIds,
    }));

    timer.mark("cache_invalidation_start");
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/field");
    revalidatePath("/projects");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    timer.mark("cache_invalidation_end");
    timer.mark("redirect_start");
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Тайлан илгээгдэж, хяналт руу орлоо.")}`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }
    releaseReportSubmitLock(submitLockKey);
    timer.mark("submit_error", { message: getErrorMessage(error) });
    redirect(`${reportPath}?error=${encodeURIComponent(getErrorMessage(error))}`);
  }
}

export async function updateTaskReportAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const reportId = Number(String(formData.get("report_id") ?? ""));
  const timer = createReportTiming("update", { taskId, reportId });
  timer.mark("server_action_received");
  const submitToken = String(formData.get("report_submit_token") ?? "").trim();
  const reportText = String(formData.get("report_text") ?? "").trim();
  const reportedQuantityRaw = String(formData.get("reported_quantity") ?? "").trim();
  const reportedQuantity = reportedQuantityRaw ? Number(reportedQuantityRaw) : null;
  const quantityLineValues = formData
    .getAll("reported_quantity_line")
    .map((value) => String(value).trim());
  const quantityLineUnits = formData
    .getAll("reported_quantity_unit")
    .map((value) => String(value).trim());
  const imageUploads = getTaskReportImageUploads(formData);
  const imageFiles = imageUploads.map((upload) => upload.file);
  const audioFiles = getUploadedFiles(formData, "report_audios");
  const removeImageAttachmentIds = formData
    .getAll("remove_image_attachment_ids")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const removeAudioAttachmentIds = formData
    .getAll("remove_audio_attachment_ids")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const reportPath = taskId ? `/tasks/${taskId}` : "/tasks";
  let submitLockKey = "";

  if (!taskId || !reportId || !reportText) {
    redirect(`${reportPath}?error=${encodeURIComponent("Тайлан засахад шаардлагатай мэдээлэл дутуу байна.")}`);
  }

  if (
    reportedQuantityRaw &&
    (reportedQuantity === null || Number.isNaN(reportedQuantity) || reportedQuantity < 0)
  ) {
    redirect(`${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ буруу байна.")}`);
  }

  if (imageFiles.some((file) => file.type && !file.type.startsWith("image/"))) {
    redirect(`${reportPath}?error=${encodeURIComponent("Зураг хэсэгт зөвхөн зургийн файл сонгоно уу.")}`);
  }

  if (imageFiles.length > 10) {
    redirect(`${reportPath}?error=${encodeURIComponent("Нэг тайланд дээд тал нь 10 зураг оруулна уу.")}`);
  }

  if (audioFiles.some((file) => file.type && !file.type.startsWith("audio/"))) {
    redirect(`${reportPath}?error=${encodeURIComponent("Аудио хэсэгт зөвхөн аудио файл сонгоно уу.")}`);
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "write_workspace_reports") || !canSubmitWorkspaceReport(session)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Танд тайлан засах эрх нээгдээгүй байна.")}`);
    }
    const reportOwnerId = await timer.step("odoo_report_owner", () => loadWorkspaceTaskReportOwner(reportId, {
      login: session.login,
      password: session.password,
    }));
    if (!canMutateReportOwner(session, reportOwnerId)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Та зөвхөн өөрийн илгээсэн тайланг засах боломжтой.")}`);
    }
    await timer.step("validation_task_date", () => assertWorkerTaskReportDateIsOpen(
      taskId,
      session,
      {
        login: session.login,
        password: session.password,
      },
      reportPath,
    ));
    const lock = acquireReportSubmitLock("update", taskId, submitToken);
    submitLockKey = lock.key;
    if (!lock.acquired) {
      timer.mark("duplicate_submit_blocked");
      redirect(`${reportPath}?notice=${encodeURIComponent("Тайлан хадгалагдаж байна. Давхар хадгалах шаардлагагүй.")}#task-reports`);
    }

    const quantityLineSummaries = quantityLineValues
      .map((value, index) => {
        if (!value) {
          return null;
        }
        const quantity = Number(value);
        if (Number.isNaN(quantity) || quantity < 0) {
          redirect(`${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ буруу байна.")}`);
        }
        const unit = quantityLineUnits[index] || "нэгж";
        return `${index + 1}. ${unit} ${quantity}`.trim();
      })
      .filter((value): value is string => Boolean(value));
    const firstLineQuantity = quantityLineValues
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0);
    const effectiveReportedQuantity =
      firstLineQuantity ?? (reportedQuantityRaw ? reportedQuantity : null);
    const effectiveReportText = [
      quantityLineSummaries.length
        ? `Гүйцэтгэсэн хэмжээ:\n${quantityLineSummaries.join("\n")}`
        : "",
      reportText,
    ]
      .filter(Boolean)
      .join("\n\n");
    const [imageAttachments, audioAttachments] = await timer.step("file_upload_prepare", () => Promise.all([
      Promise.all(
        imageUploads.map(async (upload) => ({
          name: getLabeledAttachmentName(upload),
          mimeType: upload.file.type || getFallbackMimeType(upload.file.name, "image"),
          base64: Buffer.from(await upload.file.arrayBuffer()).toString("base64"),
        })),
      ),
      Promise.all(
        audioFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, "audio"),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
    ]));

    await timer.step("odoo_update_report", () => updateWorkspaceTaskReport(
      reportId,
      {
        reportText: effectiveReportText,
        reportedQuantity: effectiveReportedQuantity,
        imageAttachments,
        audioAttachments,
        removeImageAttachmentIds,
        removeAudioAttachmentIds,
      },
      {
        login: session.login,
        password: session.password,
      },
    ));

    timer.mark("cache_invalidation_start");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    timer.mark("cache_invalidation_end");
    timer.mark("redirect_start");
    redirect(`${reportPath}?notice=${encodeURIComponent("Тайлан шинэчлэгдлээ.")}#task-reports`);
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }
    releaseReportSubmitLock(submitLockKey);
    timer.mark("submit_error", { message: getErrorMessage(error) });
    redirect(`${reportPath}?error=${encodeURIComponent(getErrorMessage(error))}#task-reports`);
  }
}

export async function deleteTaskReportAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const reportId = Number(String(formData.get("report_id") ?? ""));
  const reportPath = taskId ? `/tasks/${taskId}` : "/tasks";

  if (!taskId || !reportId) {
    redirect(`${reportPath}?error=${encodeURIComponent("Устгах тайлан олдсонгүй.")}`);
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "write_workspace_reports") || !canSubmitWorkspaceReport(session)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Танд тайлан устгах эрх нээгдээгүй байна.")}`);
    }
    const reportOwnerId = await loadWorkspaceTaskReportOwner(reportId, {
      login: session.login,
      password: session.password,
    });
    if (!canMutateReportOwner(session, reportOwnerId)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Та зөвхөн өөрийн илгээсэн тайланг устгах боломжтой.")}`);
    }

    await deleteWorkspaceTaskReport(reportId, {
      login: session.login,
      password: session.password,
    });

    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(`${reportPath}?notice=${encodeURIComponent("Тайлан устгагдлаа.")}#task-reports`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`${reportPath}?error=${encodeURIComponent(getErrorMessage(error))}#task-reports`);
  }
}

export async function submitTaskForReviewAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));

  try {
    const session = await requireSession();
    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    await assertCanReviewTaskAction(taskId, session, connectionOverrides);
    const reviewConnectionOverrides = await sendTaskToReviewWithSystemFallback(
      taskId,
      {},
      connectionOverrides,
    );
    const reviewerIds = await notifyTaskReviewersWithSystemFallback(
      taskId,
      session.name,
      reviewConnectionOverrides,
    );
    await notifyPushQuietly({
      eventType: "report_under_review",
      title: "Тайлан хяналтад ирлээ",
      body: `${session.name} тайлан илгээлээ.`,
      targetUrl: `/review`,
      userIds: reviewerIds,
    });
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/projects");
    revalidatePath("/field");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(
      `/tasks/${taskId}?notice=${encodeURIComponent(
        isMasterRole(session.role) ? "Тайланг илгээлээ." : "Ажлыг шалгалтад илгээлээ.",
      )}`,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(`/tasks/${taskId}`, "error", getErrorMessage(error));
  }
}

export async function markTaskDoneAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));

  try {
    const session = await requireSession();
    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    await assertCanReviewTaskAction(taskId, session, connectionOverrides);
    const taskBeforeReview = await loadTaskDetail(taskId, connectionOverrides).catch(() => null);
    try {
      await markWorkspaceTaskDone(taskId, connectionOverrides);
    } catch (error) {
      console.warn("Task done action failed with user credentials, retrying as system:", error);
      try {
        await markWorkspaceTaskDone(taskId, {});
      } catch (systemActionError) {
        console.warn("Task done action failed with system credentials, forcing stage update:", systemActionError);
        await forceWorkspaceTaskDone(taskId, {});
      }
    }
    await notifyPushQuietly({
      eventType: "work_approved",
      title: "Ажил баталгаажлаа",
      body: "Ажлын гүйцэтгэл баталгаажсан байна.",
      targetUrl: `/tasks/${taskId}`,
      userIds: uniquePositiveUserIds([
        ...(taskBeforeReview?.assigneeUserIds ?? []),
        ...(taskBeforeReview?.reports.map((report) => report.reporterId) ?? []),
      ]),
    });
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/field");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Ажил дууссан төлөвт орлоо.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(`/tasks/${taskId}`, "error", getErrorMessage(error));
  }
}

export async function returnTaskForChangesAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const reason = String(formData.get("return_reason") ?? "").trim();

  if (!reason) {
    redirectWithMessage(`/tasks/${taskId}`, "error", "Буцаах шалтгаанаа бичнэ үү.");
  }

  try {
    const session = await requireSession();
    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    await assertCanReviewTaskAction(taskId, session, connectionOverrides);
    const taskBeforeReturn = await loadTaskDetail(taskId, connectionOverrides).catch(() => null);
    try {
      await returnWorkspaceTaskForChanges(taskId, reason, connectionOverrides);
    } catch (error) {
      console.warn("Task return action failed with user credentials, retrying as system:", error);
      await returnWorkspaceTaskForChanges(taskId, reason, {});
    }
    const taskAfterReturn = await loadTaskDetail(taskId, connectionOverrides).catch(() => null);
    await notifyPushQuietly({
      eventType: "work_returned",
      title: "Ажил буцаагдлаа",
      body: reason,
      targetUrl: `/tasks?filter=problem`,
      userIds: uniquePositiveUserIds([
        ...(taskBeforeReturn?.assigneeUserIds ?? []),
        ...(taskBeforeReturn?.reports.map((report) => report.reporterId) ?? []),
        ...(taskAfterReturn?.assigneeUserIds ?? []),
        ...(taskAfterReturn?.reports.map((report) => report.reporterId) ?? []),
      ]),
    });
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/notifications");
    revalidatePath("/projects");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Ажлыг засвар нэхэж буцаалаа.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(`/tasks/${taskId}`, "error", getErrorMessage(error));
  }
}

export async function postTaskMessageAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const body = String(formData.get("message_body") ?? "").trim();
  const kind = String(formData.get("message_kind") ?? "") === "note" ? "note" : "message";
  const imageFiles = getUploadedFiles(formData, "message_images");
  const audioFiles = getUploadedFiles(formData, "message_audio");

  if (!taskId || (!body && !imageFiles.length && !audioFiles.length)) {
    redirectWithMessage(
      `/tasks/${taskId || ""}`,
      "error",
      "Зурвас, зураг эсвэл аудио хавсаргана уу.",
      "#task-chatter",
    );
  }

  try {
    const connectionOverrides = await getConnectionOverrides();
    const attachments = await Promise.all(
      [...imageFiles, ...audioFiles].map(async (file) => {
        const family = file.type.startsWith("audio/") ? "audio" : "image";
        return {
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, family),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        };
      }),
    );
    await postWorkspaceTaskMessage(taskId, { body, kind, attachments }, connectionOverrides);
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/notifications");
    redirectWithMessage(
      `/tasks/${taskId}`,
      "notice",
      kind === "note" ? "Тэмдэглэл хадгалагдлаа." : "Зурвас илгээгдлээ.",
      "#task-chatter",
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(`/tasks/${taskId}`, "error", getErrorMessage(error), "#task-chatter");
  }
}

export async function startFieldShiftAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const { path } = buildFieldPath(taskId);

  try {
    const connectionOverrides = await getConnectionOverrides();
    await startFieldShift(taskId, connectionOverrides);
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Ээлжийг эхлүүллээ.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error));
  }
}

export async function submitFieldShiftAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const summary = String(formData.get("summary") ?? "").trim();
  const { path } = buildFieldPath(taskId);

  if (!summary) {
    redirectWithMessage(path, "error", "Ээлжийн тайлангаа бөглөнө үү.");
  }

  try {
    const connectionOverrides = await getConnectionOverrides();
    await submitFieldShift(taskId, summary, connectionOverrides);
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Ээлжийг шалгалтад илгээлээ.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error));
  }
}

export async function saveFieldStopNoteAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const stopLineId = getNumberValue(formData, "stop_line_id");
  const note = String(formData.get("note") ?? "");
  const { path, hash } = buildFieldPath(taskId, stopLineId);

  try {
    const connectionOverrides = await getConnectionOverrides();
    await saveFieldStopNote(stopLineId, note, connectionOverrides);
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Тэмдэглэлийг хадгаллаа.")}${hash}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error), hash);
  }
}

export async function markFieldStopArrivedAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const stopLineId = getNumberValue(formData, "stop_line_id");
  const { path, hash } = buildFieldPath(taskId, stopLineId);

  try {
    const connectionOverrides = await getConnectionOverrides();
    await markFieldStopArrived(stopLineId, connectionOverrides);
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Цэг дээр ирснийг тэмдэглэлээ.")}${hash}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error), hash);
  }
}

export async function markFieldStopDoneAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const stopLineId = getNumberValue(formData, "stop_line_id");
  const { path, hash } = buildFieldPath(taskId, stopLineId);

  try {
    const connectionOverrides = await getConnectionOverrides();
    await markFieldStopDone(stopLineId, connectionOverrides);
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Цэгийг дууссан төлөвт орууллаа.")}${hash}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error), hash);
  }
}

export async function markFieldStopSkippedAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const stopLineId = getNumberValue(formData, "stop_line_id");
  const skipReason = String(formData.get("skip_reason") ?? "").trim();
  const { path, hash } = buildFieldPath(taskId, stopLineId);

  if (!skipReason) {
    redirectWithMessage(path, "error", "Алгассан шалтгаанаа оруулна уу.", hash);
  }

  try {
    const connectionOverrides = await getConnectionOverrides();
    await markFieldStopSkipped(stopLineId, skipReason, connectionOverrides);
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Цэгийг алгассан төлөвт орууллаа.")}${hash}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error), hash);
  }
}

export async function uploadFieldStopProofAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const stopLineId = getNumberValue(formData, "stop_line_id");
  const proofType = String(formData.get("proof_type") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const imageFile = formData.get("image");
  const { path, hash } = buildFieldPath(taskId, stopLineId);

  if (!(imageFile instanceof File) || imageFile.size <= 0) {
    redirectWithMessage(path, "error", "Зураг сонгоно уу.", hash);
  }

  const uploadedFile = imageFile as File;

  if (!["before", "after"].includes(proofType)) {
    redirectWithMessage(path, "error", "Өмнөх эсвэл дараах зургийг сонгоно уу.", hash);
  }

  try {
    const connectionOverrides = await getConnectionOverrides();
    await uploadFieldStopProof(
      {
        taskId,
        stopLineId,
        proofType,
        imageBase64: Buffer.from(await uploadedFile.arrayBuffer()).toString("base64"),
        fileName: uploadedFile.name,
        description,
        latitude: latitudeRaw ? Number(latitudeRaw) : null,
        longitude: longitudeRaw ? Number(longitudeRaw) : null,
      },
      connectionOverrides,
    );
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Зургийг орууллаа.")}${hash}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error), hash);
  }
}

export async function createFieldStopIssueAction(formData: FormData) {
  const taskId = getNumberValue(formData, "task_id");
  const stopLineId = getNumberValue(formData, "stop_line_id");
  const title = String(formData.get("title") ?? "").trim();
  const issueType = String(formData.get("issue_type") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const { path, hash } = buildFieldPath(taskId, stopLineId);

  if (!title || !description) {
    redirectWithMessage(path, "error", "Асуудлын гарчиг, тайлбар хоёрыг бөглөнө үү.", hash);
  }

  try {
    const connectionOverrides = await getConnectionOverrides();
    await createFieldStopIssue(
      {
        taskId,
        stopLineId,
        title,
        issueType: issueType || "other",
        severity: severity || "medium",
        description,
      },
      connectionOverrides,
    );
    revalidateFieldPaths(taskId);
    redirect(`${path}&notice=${encodeURIComponent("Асуудлыг бүртгэлээ.")}${hash}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(path, "error", getErrorMessage(error), hash);
  }
}

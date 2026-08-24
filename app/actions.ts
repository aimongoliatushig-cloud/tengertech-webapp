"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canDeleteWorkspaceItems,
  canEditWorkspaceTaskContent,
  canSubmitWorkspaceReport,
  hasCapability,
  isMasterRole,
  requireSession,
} from "@/lib/auth";
import { isRecordsClerk } from "@/lib/roles";
import { loadSessionDepartmentName, loadSessionEmployeeDepartmentName } from "@/lib/access-scope";
import { filterByDepartment, getTodayDateKey, pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import { prepareAttachment, prepareUploadFromFile } from "@/lib/image-compress";
import {
  isAutoGarbageDepartment,
  isGarbageTransportDepartment,
} from "@/lib/department-permissions";
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
import {
  clearOdooReadCaches,
  executeOdooKw,
  loadFleetVehicleBoard,
  loadMunicipalSnapshot,
  type OdooConnection,
} from "@/lib/odoo";
import { loadDepartmentHeadUserIds } from "@/lib/notification-recipients";
import { createProcurementRequest, uploadProcurementAttachment } from "@/lib/procurement";
import { notifyPushEvent, type PushEventType } from "@/lib/push-notifications";
import { createLocalRoadCleaningArea } from "@/lib/road-cleaning-area-store";
import { pathWithActionMessage, safeInternalPath } from "@/lib/ui-context";
import {
  canReviewWorkspaceTaskReport,
  loadTaskReportReviewAccess,
} from "@/lib/task-report-review-access";
import {
  createRoadCleaningWork,
  createWorkspaceCrewTeam,
  createWorkspaceProject,
  createWorkspaceProjectAttachments,
  createWorkspaceTask,
  createWorkspaceTaskAttachments,
  createWorkspaceTaskReport,
  createWorkspaceWorkUnit,
  deleteWorkspaceTaskReport,
  deleteWorkspaceProject,
  deleteWorkspaceTask,
  deleteWorkspaceTaskAttachment,
  findOrCreateWorkspaceSubdistrictOption,
  forceWorkspaceTaskDone,
  generateSeasonalWorkspaceExecution,
  getOrCreateGarbageMonthlyWorkspaceProject,
  loadGarbagePointOptions,
  loadGarbageVehicleOptions,
  loadRoadCleaningMasterEmployeeForUser,
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
  updateWorkspaceProject,
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) {
          return;
        }

        results[index] = await mapper(items[index], index);
      }
    }),
  );

  return results;
}

function canMutateReportOwner(session: { uid: number; role: string }, ownerId: number | null) {
  return session.role === "system_admin" || ownerId === session.uid;
}

async function loadTaskForReportSubmission(
  taskId: number,
  connectionOverrides: { login: string; password: string },
) {
  return loadTaskDetail(taskId, connectionOverrides);
}

async function assertCanReviewTaskAction(
  taskId: number,
  session: Awaited<ReturnType<typeof requireSession>>,
  connectionOverrides: { login: string; password: string },
) {
  const task = await loadTaskDetail(taskId, connectionOverrides);
  const hasOwnSubmittedReport = task.reports.some((report) => report.reporterId === session.uid);
  const reviewAccess = await loadTaskReportReviewAccess(taskId, session.uid, connectionOverrides);
  const canReviewTask = canReviewWorkspaceTaskReport(session, {
    ...reviewAccess,
    hasOwnSubmittedReport,
  });

  if (!canReviewTask) {
    redirectWithMessage(
      `/tasks/${taskId}`,
      "error",
      "Энэ тайланг зөвхөн ахлах мастер, хэлтсийн дарга эсвэл үйл ажиллагаа хариуцсан менежер хянана.",
    );
  }

  return task;
}

function isGarbageTransportTaskOperation(operationType: string) {
  return operationType === "garbage" || operationType === "garbage_seasonal";
}

function isPhotoFirstReportOperation(operationType: string) {
  return isGarbageTransportTaskOperation(operationType) || operationType === "road_area_cleaning";
}

function isRoadAreaCleaningReportName(name: string) {
  const normalizedName = name.trim().toLocaleLowerCase("mn-MN");
  return (
    normalizedName.includes("явган зам") ||
    normalizedName.includes("замын нүх") ||
    normalizedName.includes("хогийн сав") ||
    normalizedName.includes("жижиг хог") ||
    normalizedName.includes("шарилж") ||
    normalizedName.includes("зарын хуудас")
  );
}

function photoFirstReportDefaultText(operationType: string) {
  return operationType === "road_area_cleaning" ? "Зам талбайн цэвэрлэгээний тайлан" : "Хог тээврийн тайлан";
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
  redirect(pathWithActionMessage(path, kind, message, hash));
}

function getSafeInternalReturnPath(value: FormDataEntryValue | null, fallback: string) {
  return safeInternalPath(String(value ?? ""), fallback);
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

function isDriverEmployeeOption(option: { jobTitle?: string }) {
  const title = String(option.jobTitle ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return title.includes("жолооч") || title.includes("driver") || title.includes("chauffeur");
}

function isClearlyNotDriverEmployeeOption(option: { jobTitle?: string }) {
  const title = String(option.jobTitle ?? "").trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
  return (
    title.includes("ачигч") ||
    title.includes("хяналт") ||
    title.includes("байцаагч") ||
    title.includes("дарга") ||
    title.includes("менежер") ||
    title.includes("диспетчер") ||
    title.includes("засвар") ||
    title.includes("loader") ||
    title.includes("inspector") ||
    title.includes("manager") ||
    title.includes("dispatcher") ||
    title.includes("mechanic")
  );
}

function isGarbageTransportDriverOption(option: { departmentName?: string; jobTitle?: string }) {
  return (
    (isAutoGarbageDepartment(option.departmentName) ||
      isGarbageTransportDepartment(option.departmentName)) &&
    isDriverEmployeeOption(option)
  );
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

async function notifyTaskApprovedAfterRedirect(
  taskId: number,
  connectionOverrides: Record<string, never> | { login: string; password: string },
) {
  const task = await loadTaskDetail(taskId, connectionOverrides).catch(() => null);
  await notifyPushQuietly({
    eventType: "work_approved",
    title: "Ажил баталгаажлаа",
    body: "Ажлын гүйцэтгэл баталгаажсан байна.",
    targetUrl: `/tasks/${taskId}`,
    userIds: uniquePositiveUserIds([
      ...(task?.assigneeUserIds ?? []),
      ...(task?.reports.map((report) => report.reporterId) ?? []),
    ]),
  });
}

async function notifyDepartmentHeadsOfWork(input: {
  departmentId?: number | null;
  actorUserId: number;
  connectionOverrides: Record<string, never> | { login: string; password: string };
  title?: string;
  workName: string;
  targetUrl: string;
}) {
  let userIds: number[] = [];
  try {
    userIds = (await loadDepartmentHeadUserIds(input.departmentId, input.connectionOverrides)).filter(
      (userId) => userId !== input.actorUserId,
    );
    if (!userIds.length) {
      return;
    }
  } catch (error) {
    console.warn("Department head notification recipients failed:", error);
    return;
  }

  await notifyPushQuietly({
    eventType: "new_work_assigned",
    title: input.title || "Шинэ захирамж, үүрэг даалгавар бүртгэгдлээ",
    body: input.workName,
    targetUrl: input.targetUrl,
    userIds,
  });
}

async function notifySharedWorkDepartmentHeads(input: {
  departmentIds: number[];
  actorUserId: number;
  connectionOverrides: Record<string, never> | { login: string; password: string };
  workId: number;
  workName: string;
}) {
  const recipientIds = new Set<number>();
  for (const departmentId of input.departmentIds) {
    const headIds = await loadDepartmentHeadUserIds(departmentId, input.connectionOverrides).catch(
      () => [],
    );
    for (const headId of headIds) {
      if (headId !== input.actorUserId) {
        recipientIds.add(headId);
      }
    }
  }

  if (!recipientIds.size) {
    return;
  }

  await notifyPushQuietly({
    eventType: "shared_work_created",
    title: "Хамтарсан ажил үүслээ",
    body: input.workName,
    targetUrl: `/shared-work/${input.workId}`,
    userIds: Array.from(recipientIds),
  });
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

function getPositiveIds(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((value) => Number(String(value ?? "")))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
}

function normalizeSharedWorkDate(value: string, boundary: "start" | "end") {
  if (!value) {
    return false;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value} ${boundary === "end" ? "23:59:59" : "00:00:00"}`;
  }
  return value.length === 16 ? `${value}:00` : value;
}

function findDepartmentOptionByName<
  T extends {
    name: string;
    label: string;
  },
>(departmentOptions: T[], departmentName: string | null) {
  const normalizedDepartmentName = (departmentName ?? "").trim().toLowerCase();
  if (!normalizedDepartmentName) {
    return null;
  }

  return (
    departmentOptions.find((option) => {
      const names = [option.name, option.label]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      return names.some(
        (value) =>
          value === normalizedDepartmentName ||
          value.includes(normalizedDepartmentName) ||
          normalizedDepartmentName.includes(value),
      );
    }) ?? null
  );
}

async function createOdooAttachment(
  file: File,
  resModel: string,
  resId: number,
  connectionOverrides: Record<string, never> | { login: string; password: string },
) {
  const prepared = await prepareUploadFromFile(file);
  return executeOdooKw<number>(
    "ir.attachment",
    "create",
    [
      {
        name: prepared.filename || "Хавсралт",
        datas: prepared.base64,
        mimetype: prepared.mimeType,
        res_model: resModel,
        res_id: resId,
      },
    ],
    {},
    connectionOverrides,
  );
}

async function encodeProcurementUpload(file: File) {
  const prepared = await prepareUploadFromFile(file);
  return {
    name: prepared.filename || "Хавсралт",
    mimetype: prepared.mimeType,
    data: prepared.base64,
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
  clearOdooReadCaches();
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

async function resolveDepartmentProjectManagerId(input: {
  submittedManagerId: number | null;
  departmentId: number | null;
  connectionOverrides: Partial<OdooConnection>;
}) {
  if (!input.departmentId) {
    return input.submittedManagerId;
  }

  const departmentHeadIds = await loadDepartmentHeadUserIds(
    input.departmentId,
    input.connectionOverrides,
  ).catch((error) => {
    console.warn("Department head could not be resolved for project manager assignment:", error);
    return [] as number[];
  });

  return departmentHeadIds[0] ?? input.submittedManagerId;
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
  const hasGarbageDriverField = formData.has("garbage_driver_employee_id");
  const garbageDriverEmployeeId = Number(String(formData.get("garbage_driver_employee_id") ?? ""));
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
  const roadCleaningLinesJson = String(formData.get("road_cleaning_lines_json") ?? "").trim();
  const cleaningWorkDate = String(formData.get("work_date") ?? "").trim();
  const projectDescription = String(formData.get("project_description") ?? "").trim();
  const projectFiles = getUploadedFiles(formData, "project_files");
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const projectMutationConnection: Partial<OdooConnection> = {};
  const departmentHeadMode = Boolean(
    session.role === "project_manager" || session.groupFlags?.municipalDepartmentHead,
  );
  const transportInspectorMode = Boolean(
    (session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher)) &&
      !departmentHeadMode,
  );
  const canCreateSharedWork =
    session.role === "director" || session.role === "general_manager";
  const shouldForceOwnDepartment = !canCreateSharedWork;

  if (!hasCapability(session, "create_projects")) {
    redirectWithMessage(
      "/projects/new",
      "error",
      "Танд шинэ ажил үүсгэх эрх нээгдээгүй байна.",
    );
  }

  if (operationUnit === "shared_work") {
    if (!canCreateSharedWork) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Хамтарсан ажлыг зөвхөн захирал болон үйл ажиллагаа хариуцсан менежер үүсгэх боломжтой.",
      );
    }

    const sharedDepartmentIds = getPositiveIds(formData, "shared_department_ids");
    if (!name) {
      redirectWithMessage("/projects/new", "error", "Хамтарсан ажлын нэр оруулна уу.");
    }
    if (sharedDepartmentIds.length < 2) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Хамтарсан ажилд дор хаяж хоёр хэлтэс сонгоно уу.",
      );
    }

    try {
      const workId = await executeOdooKw<number>(
        "shared.work",
        "create",
        [
          {
            name,
            description: projectDescription,
            priority: "1",
            planned_start_date: normalizeSharedWorkDate(startDate, "start"),
            planned_end_date: normalizeSharedWorkDate(deadline, "end"),
            involved_department_ids: [[6, 0, sharedDepartmentIds]],
          },
        ],
        {},
        connectionOverrides,
      );

      if (projectFiles.length) {
        const attachmentIds = await Promise.all(
          projectFiles.slice(0, 8).map((file) =>
            createOdooAttachment(file, "shared.work", workId, connectionOverrides),
          ),
        );
        await executeOdooKw<boolean>(
          "shared.work",
          "write",
          [[workId], { attachment_ids: [[6, 0, attachmentIds]] }],
          {},
          connectionOverrides,
        );
      }

      await notifySharedWorkDepartmentHeads({
        departmentIds: sharedDepartmentIds,
        actorUserId: session.uid,
        connectionOverrides,
        workId,
        workName: name,
      });

      revalidatePath("/projects/new");
      revalidatePath("/shared-work");
      revalidatePath(`/shared-work/${workId}`);
      revalidatePath("/notifications");
      redirect(
        `/shared-work/${workId}?notice=${encodeURIComponent(
          "Хамтарсан ажил үүсэж, сонгосон хэлтэс бүр дээр ажил автоматаар үүслээ.",
        )}`,
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirectWithMessage("/projects/new", "error", getErrorMessage(error));
    }
  }

  let effectiveDepartmentIdRaw = departmentIdRaw;

  if (shouldForceOwnDepartment) {
    const [sessionDepartmentName, departmentOptions] = await Promise.all([
      loadSessionEmployeeDepartmentName(session),
      loadDepartmentOptions(connectionOverrides),
    ]);
    const lockedDepartmentOption = findDepartmentOptionByName(
      departmentOptions,
      sessionDepartmentName,
    );
    const lockedDepartmentId = lockedDepartmentOption?.id ?? null;

    if (!lockedDepartmentId) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Таны харьяалах хэлтсийг тодорхойлж чадсангүй. Админд хандаж ажилтны хэлтсийн тохиргоогоо шалгуулна уу.",
      );
    }

    effectiveDepartmentIdRaw = String(lockedDepartmentId);
  }

  if (!shouldForceOwnDepartment && isMasterRole(session.role)) {
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
      ? findDepartmentOptionByName(departmentOptions, masterDepartmentName)
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

    const currentRoadCleaningMaster = isMasterRole(session.role)
      ? await loadRoadCleaningMasterEmployeeForUser(session.uid, connectionOverrides)
      : null;
    if (isMasterRole(session.role) && !currentRoadCleaningMaster) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Таны хэрэглэгчтэй холбогдсон зам талбайн мастер олдсонгүй. Админд хандаж ажилтны бүртгэлээ шалгуулна уу.",
      );
    }
    const lockedRoadCleaningMasterId = currentRoadCleaningMaster?.id ?? null;

    try {
      let createdCount = 0;
      const assignedRoadCleaningUserIds = new Set<number>();
      for (const line of roadCleaningLines) {
        let cleaningAreaId = line.cleaningAreaId;
        const effectiveMasterId = lockedRoadCleaningMasterId ?? line.masterId;

        if (!effectiveMasterId) {
          throw new Error("Хариуцсан мастерийг заавал сонгоно уу.");
        }

        if (!cleaningAreaId && line.newAreaName) {
          const localArea = await createLocalRoadCleaningArea({
            name: line.newAreaName,
            departmentId: effectiveDepartmentIdRaw ? Number(effectiveDepartmentIdRaw) : null,
            employeeId: line.employeeId,
            masterId: effectiveMasterId,
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
            masterId: effectiveMasterId,
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
          title: "Шинэ захирамж, үүрэг даалгавар оноогдлоо",
          body:
            createdCount > 1
              ? `${createdCount} зам талбайн цэвэрлэгээний ажил танд оноогдлоо.`
              : "Зам талбайн цэвэрлэгээний ажил танд оноогдлоо.",
          targetUrl: "/tasks",
          userIds: Array.from(assignedRoadCleaningUserIds),
        });
      }
      await notifyDepartmentHeadsOfWork({
        departmentId: Number(effectiveDepartmentIdRaw),
        actorUserId: session.uid,
        connectionOverrides,
        title: "Шинэ зам талбайн ажил бүртгэгдлээ",
        workName:
          createdCount > 1
            ? `${createdCount} зам талбайн цэвэрлэгээний ажил үүслээ.`
            : "Зам талбайн цэвэрлэгээний ажил үүслээ.",
        targetUrl: "/projects",
      });

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
    const garbageTransportReturnPath = transportInspectorMode ? "/" : "/projects/new";

    if (!effectiveDepartmentIdRaw || !garbageVehicleIdRaw || !garbageSubdistrictIdRaw || !garbagePointIds.length || !startDate) {
      redirectWithMessage(
        garbageTransportReturnPath,
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
        const selectedAllowedVehicle = allowedVehicles.find((vehicle) => vehicle.id === selectedVehicleId);
        const allowedVehicleIds = new Set(allowedVehicles.map((vehicle) => vehicle.id));
        const allowedPointIds = new Set(allowedPoints.map((point) => point.id));
        const hasOutOfScopePoint = garbagePointIds.some((pointId) => !allowedPointIds.has(pointId));

        if (!allowedVehicleIds.has(selectedVehicleId) || hasOutOfScopePoint) {
          redirectWithMessage(
            garbageTransportReturnPath,
            "error",
            "Танд оноогдоогүй машин, хороо болон хогийн цэгээр ажил үүсгэх боломжгүй.",
          );
        }
        if (
          selectedAllowedVehicle?.isRepair ||
          selectedAllowedVehicle?.isArchived ||
          selectedAllowedVehicle?.isOperational === false
        ) {
          const blockedVehicleName = selectedAllowedVehicle.plate || selectedAllowedVehicle.label;
          redirectWithMessage(
            garbageTransportReturnPath,
            "error",
            `${blockedVehicleName} машин засвартай эсвэл ашиглалтаас хаагдсан тул хяналтын ажил үүсгэх боломжгүй.`,
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
      if (boardVehicle?.isRepair || boardVehicle?.isArchived || boardVehicle?.isOperational === false) {
        redirectWithMessage(
          garbageTransportReturnPath,
          "error",
          `${resolvedVehicleName} машин засвартай эсвэл ашиглалтаас хаагдсан тул хяналтын ажил үүсгэх боломжгүй.`,
        );
      }
      const defaultVehicleDriverId =
        relationIdValue(selectedVehicle?.municipal_responsible_driver_id) ??
        relationIdValue(selectedVehicle?.driver_employee_id) ??
        relationIdValue(selectedVehicle?.mfo_driver_employee_id) ??
        relationIdValue(selectedVehicle?.driver_id) ??
        boardVehicle?.responsibleDriverId ??
        null;
      const requestedDriverId =
        Number.isFinite(garbageDriverEmployeeId) && garbageDriverEmployeeId > 0 ? garbageDriverEmployeeId : null;
      const allowedDriverIds = new Set(
        [
          defaultVehicleDriverId,
          ...(fleetBoard?.driverOptions ?? [])
            .filter((driver) => driver.active && isGarbageTransportDriverOption(driver))
            .map((driver) => driver.id),
        ].filter((driverId): driverId is number => Boolean(driverId)),
      );
      if (requestedDriverId && !allowedDriverIds.has(requestedDriverId)) {
        redirectWithMessage(
          garbageTransportReturnPath,
          "error",
          "Сонгосон жолоочийг энэ даалгаварт оноох боломжгүй байна. Жолоочоо дахин сонгоно уу.",
        );
      }
      const vehicleDriverId = hasGarbageDriverField ? requestedDriverId : defaultVehicleDriverId;
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
      const selectedDriverOption = vehicleDriverId
        ? fleetBoard?.driverOptions.find((driver) => driver.id === vehicleDriverId)
        : null;
      const fallbackCrewNames = [
        selectedDriverOption?.name || (vehicleDriverId === defaultVehicleDriverId ? boardVehicle?.responsibleDriverName : ""),
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
      if (!points.length) {
        redirectWithMessage(
          garbageTransportReturnPath,
          "error",
          "Сонгосон хогийн цэг олдсонгүй. Хороо болон цэгээ дахин сонгоно уу.",
        );
      }

      const monthlyProject = await getOrCreateGarbageMonthlyWorkspaceProject(
        {
          workDate: startDate,
          managerId: session.uid,
          departmentId: Number(effectiveDepartmentIdRaw),
          description: projectDescription || undefined,
        },
        projectMutationConnection,
      );
      const createdProjectId = monthlyProject.projectId;
      const existingVehicleTasks = await executeOdooKw<Array<{ id: number; project_id?: [number, string] | false }>>(
        "project.task",
        "search_read",
        [[
          ["mfo_operation_type", "=", "garbage"],
          ["mfo_shift_date", "=", startDate],
          ["mfo_vehicle_id", "=", Number(garbageVehicleIdRaw)],
        ]],
        { fields: ["project_id"], order: "id asc", limit: 500 },
        garbageWorkConnection,
      ).catch(() => []);
      const existingTaskIds = existingVehicleTasks.map((task) => task.id).filter((id) => Number.isFinite(id));
      const existingStopLines = existingTaskIds.length
        ? await executeOdooKw<Array<{ collection_point_id?: [number, string] | false }>>(
            "mfo.stop.execution.line",
            "search_read",
            [[
              ["task_id", "in", existingTaskIds],
              ["collection_point_id", "in", garbagePointIds],
            ]],
            { fields: ["collection_point_id"], limit: 1000 },
            garbageWorkConnection,
          ).catch(() => [])
        : [];
      const existingPointIds = new Set(
        existingStopLines
          .map((line) => relationIdValue(line.collection_point_id))
          .filter((pointId): pointId is number => Boolean(pointId)),
      );
      const pointsToCreate = points.filter((point) => !existingPointIds.has(point.id));

      if (!pointsToCreate.length) {
        const duplicateMonthlyNotice = `Сонгосон хогийн цэгүүд ${monthlyProject.name} дээр энэ машин, энэ огноогоор аль хэдийн нэмэгдсэн байна.`;
        revalidatePath("/");
        revalidatePath("/projects");
        revalidatePath("/tasks");
        revalidatePath("/projects/new");
        revalidatePath(`/projects/${createdProjectId}`);
        if (transportInspectorMode) {
          redirect(
            `/?notice=${encodeURIComponent(duplicateMonthlyNotice)}`,
          );
        }
        redirect(
          `/projects/${createdProjectId}?notice=${encodeURIComponent(duplicateMonthlyNotice)}`,
        );
      }

      await mapWithConcurrency(pointsToCreate, 4, async (point, index) => {
        const pointSubdistrictName = Array.isArray(point.subdistrict_id) ? point.subdistrict_id[1] : subdistrictName;
        const taskId = await createWorkspaceTask(
          {
            projectId: createdProjectId,
            name: `${resolvedVehicleName} - ${pointSubdistrictName} - ${point.name} - ${startDate}`,
            deadline: startDate,
            plannedQuantity: 1,
            description: [
              projectDescription || `Хяналтын ажилтны оруулсан хог тээвэрлэлтийн даалгавар. Хогийн цэг: ${point.name}.`,
              vehicleWorkerSummary,
            ]
              .filter(Boolean)
              .join("\n"),
            sequence: (existingTaskIds.length + index + 1) * 10,
            assigneeUserIds: assignedGarbageUserIds,
            operationType: "garbage",
            shiftDate: startDate,
            vehicleId: Number(garbageVehicleIdRaw),
            driverEmployeeId: vehicleDriverId || null,
            collectorEmployeeIds: vehicleCollectorIds,
            inspectorEmployeeId: currentEmployees[0]?.id || null,
          },
          projectMutationConnection,
        );

        await executeOdooKw<number>(
          "mfo.stop.execution.line",
          "create",
          [{
            task_id: taskId,
            collection_point_id: point.id,
            sequence: 10,
          }],
          {},
          projectMutationConnection,
        );
      });

      if (projectFiles.length) {
        const attachments = await Promise.all(
          projectFiles.map((file) => prepareAttachment(file)),
        );
        await createWorkspaceProjectAttachments(
          createdProjectId,
          attachments,
          projectMutationConnection,
        );
      }

      await Promise.all([
        assignedGarbageUserIds.length
          ? notifyPushQuietly({
              eventType: "new_work_assigned",
              title: "Шинэ хог тээврийн ажил оноогдлоо",
              body: `${resolvedVehicleName} дээр ${pointsToCreate.length} хогийн цэгийн даалгавар нэмэгдлээ.`,
              targetUrl: `/projects/${createdProjectId}`,
              userIds: assignedGarbageUserIds,
            })
          : Promise.resolve(),
        notifyDepartmentHeadsOfWork({
          departmentId: Number(effectiveDepartmentIdRaw),
          actorUserId: session.uid,
          connectionOverrides: garbageWorkConnection,
          title: "Шинэ хог тээврийн ажил бүртгэгдлээ",
          workName: `${resolvedVehicleName} дээр ${pointsToCreate.length} хогийн цэгийн ажил нэмэгдлээ.`,
          targetUrl: `/projects/${createdProjectId}`,
        }),
      ]);

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/notifications");
      revalidatePath("/review");
      revalidatePath("/reports");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/${createdProjectId}`);
      const garbageMonthlyNotice = monthlyProject.created
        ? `${monthlyProject.name} үүсэж, ${resolvedVehicleName} машинд ${pointsToCreate.length} хогийн цэг нэмэгдлээ.`
        : `${monthlyProject.name} дээр ${resolvedVehicleName} машины ${pointsToCreate.length} хогийн цэг нэмэгдлээ.`;
      if (transportInspectorMode) {
        redirect(
          `/?notice=${encodeURIComponent(garbageMonthlyNotice)}`,
        );
      }
      redirect(
        `/projects/${createdProjectId}?notice=${encodeURIComponent(garbageMonthlyNotice)}`,
      );
    } catch (error) {
      rethrowIfRedirectError(error);
      redirectWithMessage(garbageTransportReturnPath, "error", getErrorMessage(error));
    }
  }

  if (operationUnit === "garbage_seasonal") {
    if (!name || !effectiveDepartmentIdRaw || !managerIdRaw || !startDate || !deadline) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Гэнэтийн ажилд нэр, хэлтэс, хариуцах хүн, эхлэх болон дуусах огноо заавал оруулна уу.",
      );
    }

    if (startDate > deadline) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Гэнэтийн ажлын дуусах огноо эхлэх огнооноос өмнө байж болохгүй.",
      );
    }

    try {
      const projectId = await createWorkspaceProject(
        {
          name,
          managerId: Number(managerIdRaw),
          departmentId: Number(effectiveDepartmentIdRaw),
          operationType: "garbage_seasonal",
          startDate,
          deadline,
          description: projectDescription,
        },
        connectionOverrides,
      );

      if (projectFiles.length) {
        const attachments = await Promise.all(
          projectFiles.map((file) => prepareAttachment(file)),
        );
        await createWorkspaceProjectAttachments(projectId, attachments, connectionOverrides);
      }

      await notifyDepartmentHeadsOfWork({
        departmentId: Number(effectiveDepartmentIdRaw),
        actorUserId: session.uid,
        connectionOverrides,
        title: "Шинэ гэнэтийн ажил бүртгэгдлээ",
        workName: name,
        targetUrl: `/projects/${projectId}`,
      });

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/${projectId}`);
      redirect(
        `/projects/${projectId}?notice=${encodeURIComponent(
          "Гэнэтийн ажил амжилттай үүслээ. Даалгаврыг энэ ажил дотор нэмж оруулна уу.",
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
    const submittedManagerId = managerIdRaw && Number.isFinite(Number(managerIdRaw)) ? Number(managerIdRaw) : null;
    const selectedDepartmentId =
      effectiveDepartmentIdRaw && Number.isFinite(Number(effectiveDepartmentIdRaw))
        ? Number(effectiveDepartmentIdRaw)
        : null;
    const resolvedManagerId = await resolveDepartmentProjectManagerId({
      submittedManagerId,
      departmentId: selectedDepartmentId,
      connectionOverrides,
    });
    const projectId = await createWorkspaceProject(
      {
        name,
        managerId: resolvedManagerId,
        departmentId: selectedDepartmentId,
        operationType: normalizedOperationType || undefined,
        trackQuantity,
        plannedQuantity:
          trackQuantity && plannedQuantityRaw ? Number(plannedQuantityRaw) : null,
        measurementUnitId: trackQuantity ? measurementUnitId : null,
        startDate: startDate || undefined,
        deadline: deadline || undefined,
        description: projectDescription || undefined,
      },
      projectMutationConnection,
    );

    if (projectFiles.length) {
      const attachments = await Promise.all(
        projectFiles.map((file) => prepareAttachment(file)),
      );
      await createWorkspaceProjectAttachments(projectId, attachments, projectMutationConnection);
    }
    if (projectDescription) {
      await updateWorkspaceProjectDescription(projectId, projectDescription, projectMutationConnection);
    }
    await notifyDepartmentHeadsOfWork({
      departmentId: effectiveDepartmentIdRaw ? Number(effectiveDepartmentIdRaw) : null,
      actorUserId: session.uid,
      connectionOverrides,
      title: "Шинэ захирамж, үүрэг даалгавар бүртгэгдлээ",
      workName: name,
      targetUrl: `/projects/${projectId}`,
    });

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
  const newTaskKhoroo = String(formData.get("new_task_khoroo") ?? "").trim();
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
  let effectiveTaskKhoroo = newTaskKhoroo || taskKhoroo;
  const effectiveTaskLocation = newTaskLocation || taskLocation;

  if (!projectId || !name) {
    redirectWithMessage(
      `/projects/${projectId || ""}`,
      "error",
      "Захирамж, үүрэг даалгавар үүсгэхэд шаардлагатай талбар дутуу байна.",
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

    // Архив, бичиг хэргийн ажилтан захирлаас ирсэн даалгаврыг бүх хэлтсийн
    // ажилтанд хуваарилна. Түүний Odoo дансанд төслийн/HR лавлахын өргөн ACL
    // өгөхгүйгээр зөвхөн баталгаажсан create_tasks үйлдлийг service эрхээр хийнэ.
    const connectionOverrides: Record<string, never> | { login: string; password: string } = isRecordsClerk(session)
      ? {}
      : {
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
          "Сонгосон хогийн цэгүүд олдсонгүй.",
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
      const monthlyProject = await getOrCreateGarbageMonthlyWorkspaceProject(
        {
          workDate: effectiveDate,
          managerId: session.uid,
          departmentId: project.departmentId,
        },
        connectionOverrides,
      );
      const targetProjectId = monthlyProject.projectId;
      const createdTaskIds = await mapWithConcurrency(points, 4, async (point, index) => {
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
            projectId: targetProjectId,
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

        return taskId;
      });

      await Promise.all([
        notifyPushQuietly({
          eventType: "new_work_assigned",
          title: "Шинэ хог тээврийн даалгавар",
          body: `${vehicleName} дээр ${createdTaskIds.length} хогийн цэг нэмэгдлээ.`,
          targetUrl: `/projects/${targetProjectId}`,
          userIds: assignedUserIds,
        }),
        notifyDepartmentHeadsOfWork({
          departmentId: project.departmentId,
          actorUserId: session.uid,
          connectionOverrides,
          title: "Шинэ хог тээврийн даалгавар бүртгэгдлээ",
          workName: `${vehicleName} дээр ${createdTaskIds.length} хогийн цэг нэмэгдлээ.`,
          targetUrl: `/projects/${targetProjectId}`,
        }),
      ]);

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/notifications");
      revalidatePath("/review");
      revalidatePath("/reports");
      revalidatePath("/settings");
      revalidatePath("/settings/garbage-transport");
      revalidatePath(`/projects/${projectId}`);
      revalidatePath(`/projects/${targetProjectId}`);
      redirect(
        `/projects/${targetProjectId}?notice=${encodeURIComponent(
          `${monthlyProject.name} дээр ${createdTaskIds.length} хогийн цэг даалгавар болж нэмэгдлээ.`,
        )}`,
      );
    }

    if (newTaskKhoroo) {
      const subdistrict = await findOrCreateWorkspaceSubdistrictOption(
        newTaskKhoroo,
        connectionOverrides,
      );
      effectiveTaskKhoroo = subdistrict?.name ?? newTaskKhoroo;
    }

    const locationSummary = [
      effectiveTaskKhoroo ? `Хороо: ${effectiveTaskKhoroo}` : "",
      effectiveTaskLocation ? `Байршил: ${effectiveTaskLocation}` : "",
    ].filter(Boolean);
    const taskDescription = [locationSummary.join("\n"), description]
      .filter(Boolean)
      .join("\n\n");
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
          "Сонгосон хэмжих нэгж олдсонгүй.",
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

    // Даалгаврыг хэлтсийн даргад автоматаар оногдуулна (гараар хариуцагч сонгохгүй)
    const departmentHeadUserIds = project.departmentId
      ? await loadDepartmentHeadUserIds(project.departmentId, connectionOverrides).catch(
          () => [] as number[],
        )
      : [];
    const defaultTeamLeaderId =
      departmentHeadUserIds[0] ?? (isMasterRole(session.role) ? session.uid : null);
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
        // Баг (crew) сонгоогүй бол сонгосон ажилтныг (баг ахлагч) гүйцэтгэгч
        // болгоно. Эс бөгөөс "Ажилтны даалгавар" (гүйцэтгэгчээр бүлэглэдэг)
        // жагсаалтад оноосон даалгавар харагдахгүй байсан.
        assigneeUserIds: selectedCrewTeam?.memberUserIds?.length
          ? selectedCrewTeam.memberUserIds
          : effectiveTeamLeaderId
            ? [effectiveTeamLeaderId]
            : [],
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
        taskFiles.map((file) => prepareAttachment(file)),
      );
      await createWorkspaceTaskAttachments(taskId, attachments, connectionOverrides);
    }

    await Promise.all([
      notifyPushQuietly({
        eventType: "new_work_assigned",
        title: "Шинэ захирамж, үүрэг даалгавар оноогдлоо",
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
      }),
      notifyDepartmentHeadsOfWork({
        departmentId: project.departmentId,
        actorUserId: session.uid,
        connectionOverrides,
        title: "Шинэ даалгавар бүртгэгдлээ",
        workName: name,
        targetUrl: `/tasks/${taskId}`,
      }),
    ]);

    clearOdooReadCaches();
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath("/settings");
    revalidatePath("/settings/garbage-transport");
    revalidatePath(`/projects/${projectId}`);
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Шинэ захирамж, үүрэг даалгавар амжилттай үүслээ.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(`/projects/${projectId}`, "error", getErrorMessage(error), "#task-create-form");
  }
}

export async function updateTaskAction(formData: FormData) {
  const projectId = Number(String(formData.get("project_id") ?? ""));
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const teamLeaderIdRaw = String(formData.get("team_leader_id") ?? "").trim();
  const crewTeamIdRaw = String(formData.get("crew_team_id") ?? "").trim();
  const newCrewTeamName = String(formData.get("new_crew_team_name") ?? "").trim();
  const newCrewMemberUserIds = formData
    .getAll("new_crew_member_user_ids")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const startDate = String(formData.get("start_date") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const plannedQuantityRaw = String(formData.get("planned_quantity") ?? "").trim();
  const unitIdRaw = String(formData.get("unit_id") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const defaultTarget = projectId ? `/projects/${projectId}` : "/projects";
  const target = safeInternalPath(String(formData.get("return_to") ?? ""), defaultTarget);

  if (!projectId || !taskId) {
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
    const [project, task] = await Promise.all([
      loadProjectDetail(projectId, connectionOverrides),
      loadTaskDetail(taskId, connectionOverrides),
    ]);

    if (task.projectId !== projectId) {
      redirectWithMessage(target, "error", "Даалгавар энэ ажилд хамаарахгүй байна.");
    }

    const canEditTaskContent =
      task.createdById === session.uid || canEditWorkspaceTaskContent(session);
    const selectedTeamLeaderId = teamLeaderIdRaw ? Number(teamLeaderIdRaw) : null;
    let selectedCrewTeam = crewTeamIdRaw
      ? project.crewTeamOptions.find((team) => team.id === Number(crewTeamIdRaw)) ?? null
      : null;
    const measurementUnitId = unitIdRaw ? Number(unitIdRaw) : null;
    const plannedQuantity = plannedQuantityRaw ? Number(plannedQuantityRaw) : null;

    if (selectedTeamLeaderId) {
      const allowedUserIds = new Set([
        project.managerId,
        ...project.departmentUserOptions.map((user) => user.id),
        ...project.teamLeaderOptions.map((user) => user.id),
      ].filter((id): id is number => Boolean(id)));
      if (!allowedUserIds.has(selectedTeamLeaderId)) {
        redirectWithMessage(target, "error", "Сонгосон хариуцсан ажилтан энэ ажилд хамаарахгүй байна.");
      }
    }

    if (crewTeamIdRaw && !selectedCrewTeam) {
      redirectWithMessage(target, "error", "Сонгосон баг энэ ажилд хамаарахгүй байна.");
    }

    if (!selectedCrewTeam && newCrewTeamName) {
      if (!newCrewMemberUserIds.length) {
        redirectWithMessage(target, "error", "Шинэ баг үүсгэх бол гишүүдээс дор хаяж нэг ажилтан сонгоно уу.");
      }

      const allowedUserIds = new Set(
        [
          project.managerId,
          ...project.departmentUserOptions.map((user) => user.id),
          ...project.teamLeaderOptions.map((user) => user.id),
        ].filter((id): id is number => Boolean(id)),
      );
      const invalidMemberIds = newCrewMemberUserIds.filter((userId) => !allowedUserIds.has(userId));
      if (invalidMemberIds.length) {
        redirectWithMessage(target, "error", "Шинэ багийн гишүүд энэ ажилд хамаарах хэлтсийн ажилтан байх ёстой.");
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

    if (canEditTaskContent && !name) {
      redirectWithMessage(target, "error", "Даалгаврын нэр хоосон байж болохгүй.");
    }

    if (canEditTaskContent && measurementUnitId) {
      const validUnitIds = new Set(project.allUnitOptions.map((unit) => unit.id));
      if (!validUnitIds.has(measurementUnitId)) {
        redirectWithMessage(target, "error", "Сонгосон хэмжих нэгж олдсонгүй.");
      }
    }

    if (
      canEditTaskContent &&
      plannedQuantityRaw &&
      (!Number.isFinite(plannedQuantity) || Number(plannedQuantity) <= 0)
    ) {
      redirectWithMessage(target, "error", "Төлөвлөсөн хэмжээ 0-ээс их байх ёстой.");
    }

    const assignmentValues = {
      teamLeaderId: selectedTeamLeaderId,
      crewTeamId: selectedCrewTeam?.id ?? null,
      assigneeUserIds: selectedCrewTeam?.memberUserIds ?? [],
    };

    await updateWorkspaceTask(
      taskId,
      canEditTaskContent
        ? {
            name,
            ...assignmentValues,
            startDate,
            deadline,
            measurementUnitId,
            plannedQuantity,
            description,
          }
        : assignmentValues,
      connectionOverrides,
    );

    clearOdooReadCaches();
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/tasks/${taskId}`);
    redirect(
      `${target}?notice=${encodeURIComponent(
        canEditTaskContent
          ? "Даалгавар амжилттай шинэчлэгдлээ."
          : "Баг ба хариуцсан ажилтан амжилттай хуваарилагдлаа.",
      )}`,
    );
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
    if (!canDeleteWorkspaceItems(session)) {
      redirectWithMessage(target, "error", "Танд даалгавар устгах эрх байхгүй байна.");
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    const task = await loadTaskDetail(taskId, connectionOverrides);
    if (task.projectId !== projectId) {
      redirectWithMessage(target, "error", "Даалгавар энэ ажилд хамаарахгүй байна.");
    }

    await deleteWorkspaceTask(taskId, {
      url: session.odooUrl,
      db: session.odooDb,
    });

    clearOdooReadCaches();
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    redirect(`${target}?notice=${encodeURIComponent("Даалгавар архивлагдлаа.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(target, "error", getErrorMessage(error));
  }
}

export async function addTaskAttachmentsAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const target = taskId ? `/tasks/${taskId}` : "/tasks";
  const files = getUploadedFiles(formData, "attachment_files");

  if (!taskId) {
    redirectWithMessage(target, "error", "Файл хавсаргахад шаардлагатай мэдээлэл дутуу байна.");
  }
  if (!files.length) {
    redirectWithMessage(target, "error", "Хавсаргах файлаа сонгоно уу.", "#task-attachments");
  }

  try {
    const session = await requireSession();
    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    const task = await loadTaskDetail(taskId, connectionOverrides);
    const canManageAttachments =
      task.createdById === session.uid ||
      canEditWorkspaceTaskContent(session) ||
      hasCapability(session, "create_tasks");
    if (!canManageAttachments) {
      redirectWithMessage(target, "error", "Танд энэ даалгаварт файл хавсаргах эрх байхгүй байна.");
    }

    const attachments = await Promise.all(files.map((file) => prepareAttachment(file)));
    try {
      await createWorkspaceTaskAttachments(taskId, attachments, connectionOverrides);
    } catch {
      // Odoo талын хандалтын эрх хүрэлцэхгүй бол системийн холболтоор хавсаргана.
      await createWorkspaceTaskAttachments(taskId, attachments, {
        url: session.odooUrl,
        db: session.odooDb,
      });
    }

    clearOdooReadCaches();
    revalidatePath(`/tasks/${taskId}`);
    redirectWithMessage(target, "notice", "Файл амжилттай хавсаргалаа.", "#task-attachments");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(target, "error", getErrorMessage(error), "#task-attachments");
  }
}

export async function deleteTaskAttachmentAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const attachmentId = Number(String(formData.get("attachment_id") ?? ""));
  const target = taskId ? `/tasks/${taskId}` : "/tasks";

  if (!taskId || !attachmentId) {
    redirectWithMessage(target, "error", "Файл устгахад шаардлагатай мэдээлэл дутуу байна.");
  }

  try {
    const session = await requireSession();
    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    const task = await loadTaskDetail(taskId, connectionOverrides);
    const canManageAttachments =
      task.createdById === session.uid ||
      canEditWorkspaceTaskContent(session) ||
      hasCapability(session, "create_tasks");
    if (!canManageAttachments) {
      redirectWithMessage(target, "error", "Танд энэ даалгаврын файл устгах эрх байхгүй байна.");
    }

    await deleteWorkspaceTaskAttachment(taskId, attachmentId, {
      url: session.odooUrl,
      db: session.odooDb,
    });

    clearOdooReadCaches();
    revalidatePath(`/tasks/${taskId}`);
    redirectWithMessage(target, "notice", "Хавсаргасан файл устгагдлаа.", "#task-attachments");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(target, "error", getErrorMessage(error), "#task-attachments");
  }
}

export async function deleteProjectAction(formData: FormData) {
  const projectId = Number(String(formData.get("project_id") ?? ""));
  const target = "/projects";

  if (!projectId) {
    redirectWithMessage(
      target,
      "error",
      "Ажил устгахад шаардлагатай мэдээлэл дутуу байна.",
    );
  }

  try {
    const session = await requireSession();
    if (!canDeleteWorkspaceItems(session)) {
      redirectWithMessage(target, "error", "Танд ажил устгах эрх байхгүй байна.");
    }

    await loadProjectDetail(projectId, {
      login: session.login,
      password: session.password,
    });
    await deleteWorkspaceProject(projectId, {
      url: session.odooUrl,
      db: session.odooDb,
    });

    clearOdooReadCaches();
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    redirect(`${target}?notice=${encodeURIComponent("Ажил архивлагдлаа.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(target, "error", getErrorMessage(error));
  }
}

export async function updateProjectAction(formData: FormData) {
  const projectId = Number(String(formData.get("project_id") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const managerId = Number(String(formData.get("manager_id") ?? ""));
  const departmentId = Number(String(formData.get("department_id") ?? ""));
  const startDate = String(formData.get("start_date") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const target = projectId ? `/projects/${projectId}` : "/projects";

  if (!projectId || !name) {
    redirectWithMessage(target, "error", "Ажил засахад нэр болон ажлын дугаар шаардлагатай.");
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "create_projects")) {
      redirectWithMessage(target, "error", "Танд ажил засах эрх байхгүй байна.");
    }

    const scopedDepartmentName = await loadSessionDepartmentName(session);
    const project = await loadProjectDetail(projectId, {
      login: session.login,
      password: session.password,
    });
    if (
      scopedDepartmentName &&
      filterByDepartment([{ departmentName: project.departmentName }], scopedDepartmentName).length === 0
    ) {
      redirectWithMessage(target, "error", "Танд энэ ажлыг засах эрх байхгүй байна.");
    }

    await updateWorkspaceProject(
      projectId,
      {
        name,
        managerId: Number.isFinite(managerId) && managerId > 0 ? managerId : null,
        departmentId: scopedDepartmentName
          ? project.departmentId
          : Number.isFinite(departmentId) && departmentId > 0
            ? departmentId
            : null,
        startDate,
        deadline,
        description,
      },
      {
        login: session.login,
        password: session.password,
      },
    );

    clearOdooReadCaches();
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    redirect(`${target}?notice=${encodeURIComponent("Ажлын мэдээлэл шинэчлэгдлээ.")}`);
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
  const gpsLatitudeRaw = String(formData.get("gps_latitude") ?? "").trim();
  const gpsLongitudeRaw = String(formData.get("gps_longitude") ?? "").trim();
  const gpsLatitude = gpsLatitudeRaw ? Number(gpsLatitudeRaw) : null;
  const gpsLongitude = gpsLongitudeRaw ? Number(gpsLongitudeRaw) : null;
  const locationName = String(formData.get("location_name") ?? "").trim();
  const wateredTreeCountRaw = String(formData.get("watered_tree_count") ?? "").trim();
  const litersPerTreeRaw = String(formData.get("liters_per_tree") ?? "").trim();
  const wateredTreeCount = wateredTreeCountRaw ? Number(wateredTreeCountRaw) : null;
  const litersPerTree = litersPerTreeRaw ? Number(litersPerTreeRaw) : null;
  const startDatetime = String(formData.get("start_datetime") ?? "").trim();
  const endDatetime = String(formData.get("end_datetime") ?? "").trim();
  const wateringVehicleId = Number(String(formData.get("watering_vehicle_id") ?? "")) || null;
  const wateringDriverId = Number(String(formData.get("watering_driver_id") ?? "")) || null;
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
  const reportReturnPath = getSafeInternalReturnPath(formData.get("report_return_to"), reportPath);
  let submitLockKey = "";

  if (!taskId) {
    redirect(`${reportPath}?error=${encodeURIComponent("Тайлангийн текстээ оруулна уу.")}`);
  }

  // Зураг заавал биш — гэхдээ огт хоосон (текст ч, зураг ч, аудио ч үгүй)
  // тайлан оруулахыг хориглоно.
  if (!reportText && !imageFiles.length && !audioFiles.length) {
    redirectWithMessage(
      reportReturnPath,
      "error",
      "Тайлангийн текст, зураг эсвэл аудионы аль нэгийг оруулна уу.",
    );
  }

  if (imageFiles.some((file) => file.type && !file.type.startsWith("image/"))) {
    redirectWithMessage(reportReturnPath, "error", "Зураг хэсэгт зөвхөн зургийн файл сонгоно уу.");
  }

  if (imageFiles.length > 20) {
    redirectWithMessage(reportReturnPath, "error", "Нэг тайланд дээд тал нь 20 зураг оруулна уу.");
  }

  if (audioFiles.some((file) => file.type && !file.type.startsWith("audio/"))) {
    redirectWithMessage(reportReturnPath, "error", "Аудио хэсэгт зөвхөн аудио файл сонгоно уу.");
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "write_workspace_reports") || !canSubmitWorkspaceReport(session)) {
      redirectWithMessage(reportReturnPath, "error", "Танд гүйцэтгэлийн тайлан илгээх эрх нээгдээгүй байна.");
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    const taskForReport = await timer.step("validation_task_load", () =>
      loadTaskForReportSubmission(taskId, connectionOverrides),
    );
    const isPhotoFirstReport =
      isPhotoFirstReportOperation(taskForReport.operationType) ||
      isRoadAreaCleaningReportName(workItemName || taskForReport.name);
    if (!isPhotoFirstReport && !reportText) {
      redirectWithMessage(reportReturnPath, "error", "Тайлангийн текстээ оруулна уу.");
    }
    const lock = acquireReportSubmitLock("create", taskId, submitToken);
    submitLockKey = lock.key;
    if (!lock.acquired) {
      timer.mark("duplicate_submit_blocked");
      redirectWithMessage(reportReturnPath, "notice", "Тайлан илгээгдэж байна. Давхар илгээх шаардлагагүй.");
    }
    if (quantityRaw && (Number.isNaN(reportedQuantity) || reportedQuantity < 0)) {
      redirectWithMessage(reportReturnPath, "error", "Гүйцэтгэсэн хэмжээ буруу байна.");
    }
    if (
      (gpsLatitudeRaw && (gpsLatitude === null || !Number.isFinite(gpsLatitude))) ||
      (gpsLongitudeRaw && (gpsLongitude === null || !Number.isFinite(gpsLongitude)))
    ) {
      redirectWithMessage(reportReturnPath, "error", "GPS байршлын мэдээлэл буруу байна.");
    }
    if (
      (wateredTreeCountRaw && (wateredTreeCount === null || !Number.isFinite(wateredTreeCount) || wateredTreeCount < 0)) ||
      (litersPerTreeRaw && (litersPerTree === null || !Number.isFinite(litersPerTree) || litersPerTree < 0))
    ) {
      redirectWithMessage(reportReturnPath, "error", "Усалгааны тоо хэмжээ буруу байна.");
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
          redirectWithMessage(reportReturnPath, "error", "Гүйцэтгэсэн хэмжээ буруу байна.");
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
    const effectiveWorkItemName = workItemName || (isPhotoFirstReport ? taskForReport.name : "");
    const effectiveReportText = [
      effectiveWorkItemName ? `Даалгавар: ${effectiveWorkItemName}` : "",
      quantityLineSummaries.length
        ? `Гүйцэтгэсэн хэмжээ:\n${quantityLineSummaries.join("\n")}`
        : "",
      reportText,
      !reportText && isPhotoFirstReport && !effectiveWorkItemName && !quantityLineSummaries.length
        ? photoFirstReportDefaultText(taskForReport.operationType)
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const [imageAttachments, audioAttachments] = await timer.step("file_upload_prepare", () => Promise.all([
      Promise.all(
        imageUploads.map(async (upload) => {
          const prepared = await prepareUploadFromFile(upload.file);
          return {
            name: getLabeledAttachmentName(upload),
            mimeType: prepared.mimeType,
            base64: prepared.base64,
          };
        }),
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
        gpsLatitude,
        gpsLongitude,
        locationName,
        wateredTreeCount,
        litersPerTree,
        startDatetime,
        endDatetime,
        wateringVehicleId,
        wateringDriverId,
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
    if (taskForReport.projectId) {
      revalidatePath(`/projects/${taskForReport.projectId}`);
    }
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    timer.mark("cache_invalidation_end");
    timer.mark("redirect_start");
    redirectWithMessage(reportReturnPath, "notice", "Тайлан илгээгдэж, хяналт руу орлоо.");
  } catch (error) {
    if (isRedirectException(error)) {
      throw error;
    }
    releaseReportSubmitLock(submitLockKey);
    timer.mark("submit_error", { message: getErrorMessage(error) });
    redirectWithMessage(reportReturnPath, "error", getErrorMessage(error));
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
  const gpsLatitudeRaw = String(formData.get("gps_latitude") ?? "").trim();
  const gpsLongitudeRaw = String(formData.get("gps_longitude") ?? "").trim();
  const gpsLatitude = gpsLatitudeRaw ? Number(gpsLatitudeRaw) : null;
  const gpsLongitude = gpsLongitudeRaw ? Number(gpsLongitudeRaw) : null;
  const locationName = String(formData.get("location_name") ?? "").trim();
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

  if (!taskId || !reportId) {
    redirect(`${reportPath}?error=${encodeURIComponent("Тайлан засахад шаардлагатай мэдээлэл дутуу байна.")}`);
  }

  if (
    reportedQuantityRaw &&
    (reportedQuantity === null || Number.isNaN(reportedQuantity) || reportedQuantity < 0)
  ) {
    redirect(`${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ буруу байна.")}`);
  }

  if (
    (gpsLatitudeRaw && (gpsLatitude === null || !Number.isFinite(gpsLatitude))) ||
    (gpsLongitudeRaw && (gpsLongitude === null || !Number.isFinite(gpsLongitude)))
  ) {
    redirect(`${reportPath}?error=${encodeURIComponent("GPS байршлын мэдээлэл буруу байна.")}`);
  }

  if (imageFiles.some((file) => file.type && !file.type.startsWith("image/"))) {
    redirect(`${reportPath}?error=${encodeURIComponent("Зураг хэсэгт зөвхөн зургийн файл сонгоно уу.")}`);
  }

  if (imageFiles.length > 20) {
    redirect(`${reportPath}?error=${encodeURIComponent("Нэг тайланд дээд тал нь 20 зураг оруулна уу.")}`);
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
    const taskForReport = await timer.step("validation_task_load", () => loadTaskForReportSubmission(
      taskId,
      {
        login: session.login,
        password: session.password,
      },
    ));
    const isPhotoFirstReport =
      isPhotoFirstReportOperation(taskForReport.operationType) ||
      isRoadAreaCleaningReportName(taskForReport.name);
    if (!isPhotoFirstReport && !reportText) {
      redirect(`${reportPath}?error=${encodeURIComponent("Тайлан засахад шаардлагатай мэдээлэл дутуу байна.")}`);
    }
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
      !reportText && isPhotoFirstReport ? `Даалгавар: ${taskForReport.name}` : "",
      quantityLineSummaries.length
        ? `Гүйцэтгэсэн хэмжээ:\n${quantityLineSummaries.join("\n")}`
        : "",
      reportText,
      !reportText && isPhotoFirstReport && !quantityLineSummaries.length
        ? photoFirstReportDefaultText(taskForReport.operationType)
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const [imageAttachments, audioAttachments] = await timer.step("file_upload_prepare", () => Promise.all([
      Promise.all(
        imageUploads.map(async (upload) => {
          const prepared = await prepareUploadFromFile(upload.file);
          return {
            name: getLabeledAttachmentName(upload),
            mimeType: prepared.mimeType,
            base64: prepared.base64,
          };
        }),
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
        gpsLatitude,
        gpsLongitude,
        locationName,
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
    const task = await assertCanReviewTaskAction(taskId, session, connectionOverrides);
    if (isPhotoFirstReportOperation(task.operationType)) {
      redirectWithMessage(
        `/tasks/${taskId}`,
        "error",
        "Энэ төрлийн даалгаврыг өмнөх/дараах зурагтай гүйцэтгэлийн тайлан оруулж хяналт руу илгээнэ.",
      );
    }
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
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/field");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    void notifyTaskApprovedAfterRedirect(taskId, connectionOverrides).catch((error) => {
      console.warn("Task approved notification could not be queued:", error);
    });
    redirect(`/?notice=${encodeURIComponent("Ажил хянаж дууслаа.")}`);
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
        if (family === "audio") {
          return {
            name: file.name,
            mimeType: file.type || getFallbackMimeType(file.name, "audio"),
            base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
          };
        }
        const prepared = await prepareUploadFromFile(file);
        return {
          name: file.name,
          mimeType: prepared.mimeType,
          base64: prepared.base64,
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
    const proofPrepared = await prepareUploadFromFile(uploadedFile);
    await uploadFieldStopProof(
      {
        taskId,
        stopLineId,
        proofType,
        imageBase64: proofPrepared.base64,
        fileName: proofPrepared.filename,
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

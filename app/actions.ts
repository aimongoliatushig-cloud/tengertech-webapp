"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canSubmitWorkspaceReport, hasCapability, isMasterRole, requireSession } from "@/lib/auth";
import { pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
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
import { loadMunicipalSnapshot } from "@/lib/odoo";
import { notifyPushEvent, type PushEventType } from "@/lib/push-notifications";
import {
  assignGarbageProjectTasksFromRouteTeam,
  createGarbageWorkspaceProject,
  createRoadCleaningArea,
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

function canMutateReportOwner(session: { uid: number; role: string }, ownerId: number | null) {
  return session.role === "system_admin" || ownerId === session.uid;
}

async function assertCanReviewTaskAction(
  taskId: number,
  session: Awaited<ReturnType<typeof requireSession>>,
  connectionOverrides: { login: string; password: string },
) {
  const task = await loadTaskDetail(taskId, connectionOverrides);
  const isAssignedToCurrentUser = task.assigneeUserIds.includes(session.uid);
  const hasOwnSubmittedReport = task.reports.some((report) => report.reporterId === session.uid);
  const canReviewTask =
    !isAssignedToCurrentUser &&
    !hasOwnSubmittedReport &&
    (hasCapability(session, "view_quality_center") ||
      hasCapability(session, "create_tasks") ||
      isMasterRole(session.role));

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
    await notifyWorkspaceTaskReportReviewers(taskId, reporterName, connectionOverrides);
  } catch (error) {
    console.warn("Task reviewer notification failed with current credentials, retrying as system:", error);
    await notifyWorkspaceTaskReportReviewers(taskId, reporterName, {});
  }
}

async function notifyPushQuietly(input: {
  eventType: PushEventType;
  title?: string;
  body?: string;
  targetUrl?: string;
  userIds?: number[];
}) {
  try {
    await notifyPushEvent(input);
  } catch (error) {
    console.warn("Push notification failed:", error);
  }
}

function getStringListValues(formData: FormData, keys: string[], maxItems = 20) {
  const seenValues = new Set<string>();
  const normalizedValues: string[] = [];

  for (const key of keys) {
    for (const rawValue of formData.getAll(key)) {
      const normalizedValue = String(rawValue ?? "").trim().replace(/\s+/g, " ");
      const dedupeKey = normalizedValue.toLowerCase();

      if (!normalizedValue || seenValues.has(dedupeKey)) {
        continue;
      }

      seenValues.add(dedupeKey);
      normalizedValues.push(normalizedValue);

      if (normalizedValues.length >= maxItems) {
        return normalizedValues;
      }
    }
  }

  return normalizedValues;
}

function getUploadedFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

type RoadCleaningLineInput = {
  sequence: number;
  cleaningAreaId: number | null;
  employeeId: number | null;
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
      const newAreaName = String(record.newAreaName ?? "").trim();

      return {
        sequence: Number(record.sequence) || index + 1,
        cleaningAreaId: Number.isFinite(cleaningAreaId) && cleaningAreaId > 0 ? cleaningAreaId : null,
        employeeId: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : null,
        newAreaName,
      };
    })
    .filter((line) => line.employeeId && (line.cleaningAreaId || line.newAreaName));
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
  const garbageRouteIdRaw = String(formData.get("garbage_route_id") ?? "").trim();
  const seasonalWorkDaysJson = String(formData.get("seasonal_work_days_json") ?? "").trim();
  const seasonalLinesJson = String(formData.get("seasonal_lines_json") ?? "").trim();
  const seasonalNotes = String(formData.get("seasonal_notes") ?? "").trim();
  const roadCleaningLinesJson = String(formData.get("road_cleaning_lines_json") ?? "").trim();
  const cleaningWorkDate = String(formData.get("work_date") ?? "").trim();
  const projectDescription = String(formData.get("project_description") ?? "").trim();
  const projectFiles = getUploadedFiles(formData, "project_files");
  const additionalLocations = getStringListValues(formData, [
    "additional_locations",
    "additional_location_draft",
  ]);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

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
      for (const line of roadCleaningLines) {
        let cleaningAreaId = line.cleaningAreaId;

        if (!cleaningAreaId && line.newAreaName) {
          cleaningAreaId = await createRoadCleaningArea(
            {
              name: line.newAreaName,
              departmentId: effectiveDepartmentIdRaw ? Number(effectiveDepartmentIdRaw) : null,
              employeeId: line.employeeId,
            },
            connectionOverrides,
          );
        }

        if (!cleaningAreaId || !line.employeeId) {
          throw new Error("Цэвэрлэх талбай болон хариуцсан ажилтны мөр бүрийг бүрэн сонгоно уу.");
        }

        await createRoadCleaningWork(
          {
            cleaningAreaId,
            employeeId: line.employeeId,
            workDate: cleaningWorkDate,
          },
          connectionOverrides,
        );
        createdCount += 1;
      }

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
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

  if (operationUnit === "garbage_transport") {
    if (!effectiveDepartmentIdRaw || !garbageVehicleIdRaw || !garbageRouteIdRaw || !startDate) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Хог тээвэрлэлтийн ажилд машин, байршил, огноо гурвыг заавал сонгоно уу.",
      );
    }

    try {
      const result = await createGarbageWorkspaceProject(
        {
          vehicleId: Number(garbageVehicleIdRaw),
          routeId: Number(garbageRouteIdRaw),
          shiftDate: startDate,
        },
        connectionOverrides,
      );
      const assignmentResult = await assignGarbageProjectTasksFromRouteTeam(
        {
          projectId: result.project_id,
          routeId: Number(garbageRouteIdRaw),
          vehicleId: Number(garbageVehicleIdRaw),
        },
        connectionOverrides,
      ).catch(() => null);

      let extraLocationMessage = "";
      const assignmentMessage =
        assignmentResult?.assignedTaskCount
          ? ` ${assignmentResult.assignedTaskCount} ажилбар багт оноогдлоо.`
          : "";

      if (additionalLocations.length) {
        let createdLocationCount = 0;
        const projectDetail = await loadProjectDetail(
          result.project_id,
          connectionOverrides,
        ).catch(() => null);
        const measurementUnitId =
          projectDetail?.defaultUnitId ?? projectDetail?.allowedUnits[0]?.id ?? null;

        try {
          for (const location of additionalLocations) {
            await createWorkspaceTask(
              {
                projectId: result.project_id,
                name: location,
                deadline: startDate,
                measurementUnitId,
                description: "Нэмэлтээр бүртгэсэн байршил.",
              },
              connectionOverrides,
            );
            createdLocationCount += 1;
          }

          extraLocationMessage = ` Нэмэлт ${createdLocationCount} байршил ажилбар болж нэмэгдлээ.`;
        } catch (error) {
          extraLocationMessage =
            createdLocationCount > 0
              ? ` Нэмэлт ${createdLocationCount} байршил нэмэгдсэн. Зарим нэмэлт байршил нэмэхэд алдаа гарлаа: ${getErrorMessage(error)}`
              : ` Үндсэн ажил үүслээ, харин нэмэлт байршил нэмэхэд алдаа гарлаа: ${getErrorMessage(error)}`;
        }
      }

      if (additionalLocations.length && assignmentResult?.hasCrewTeam) {
        await assignGarbageProjectTasksFromRouteTeam(
          {
            projectId: result.project_id,
            routeId: Number(garbageRouteIdRaw),
            vehicleId: Number(garbageVehicleIdRaw),
          },
          connectionOverrides,
        ).catch(() => null);
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
          result.project_id,
          attachments,
          connectionOverrides,
        );
      }
      if (projectDescription) {
        await updateWorkspaceProjectDescription(
          result.project_id,
          projectDescription,
          connectionOverrides,
        );
      }

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/review");
      revalidatePath("/reports");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/${result.project_id}`);
      redirect(
        `/projects/${result.project_id}?notice=${encodeURIComponent(
          `${result.message || "Хог тээвэрлэлтийн ажил амжилттай үүслээ."}${assignmentMessage}${extraLocationMessage}`,
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
        "Улирлын төлөвлөгөөнд нэр, хэлтэс, эхлэх болон дуусах огноог заавал оруулна уу.",
      );
    }

    if (startDate > deadline) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Улирлын төлөвлөгөөний дуусах огноо эхлэх огнооноос өмнө байж болохгүй.",
      );
    }

    let selectedWorkDays: string[] = [];
    let seasonalLines: Array<{
      sequence?: number;
      khorooLabel?: string;
      locationName?: string;
      plannedVehicleCount?: number;
      plannedTonnage?: number;
      workDate?: string | null;
      routeId?: number | string | null;
      remarks?: string;
    }> = [];

    try {
      selectedWorkDays = seasonalWorkDaysJson ? JSON.parse(seasonalWorkDaysJson) : [];
      seasonalLines = seasonalLinesJson ? JSON.parse(seasonalLinesJson) : [];
    } catch {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Улирлын төлөвлөгөөний мөр эсвэл ажлын өдрийн мэдээлэл буруу байна.",
      );
    }

    if (!selectedWorkDays.length) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Ажиллах өдрүүдээс дор хаяж нэгийг сонгоно уу.",
      );
    }

    const normalizedLines = seasonalLines
      .map((line, index) => ({
        sequence: Number(line.sequence ?? index + 1),
        khorooLabel: String(line.khorooLabel ?? "").trim(),
        locationName: String(line.locationName ?? "").trim(),
        plannedVehicleCount: Number(line.plannedVehicleCount ?? 0),
        plannedTonnage: Number(line.plannedTonnage ?? 0),
        workDate: String(line.workDate ?? "").trim(),
        routeId:
          line.routeId === null || line.routeId === undefined || line.routeId === ""
            ? null
            : Number(line.routeId),
        remarks: String(line.remarks ?? "").trim(),
      }))
      .filter((line) => line.khorooLabel || line.locationName);

    if (!normalizedLines.length) {
      redirectWithMessage(
        "/projects/new",
        "error",
        "Байршлын мөрөөс дор хаяж нэгийг бүрэн оруулна уу.",
      );
    }

    const invalidLine = normalizedLines.find(
      (line) =>
        !line.khorooLabel ||
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
        "Мөр бүр дээр хороо, байршил, машин тоо, тонн талбаруудыг зөв бөглөж, ажлын өдөр нь төлөвлөгөөний хугацаанд байгаа эсэхийг шалгана уу.",
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

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/seasonal/${result.planId}`);
      redirect(
        `/projects/seasonal/${result.planId}?notice=${encodeURIComponent(
          result.message || "Улирлын хог ачилтын төлөвлөгөө амжилттай үүслээ.",
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
        "Танд энэ ажил дээр ажилбар нэмэх эрх нээгдээгүй байна.",
        "#task-create-form",
      );
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };
    const project = await loadProjectDetail(projectId, connectionOverrides);
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
          console.warn("Хэмжих нэгж үүсгэх эрхгүй тул нэрийг ажилбарын тайлбарт хадгална.", error);
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
      "Ажилбар засахад шаардлагатай мэдээлэл дутуу байна.",
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "create_tasks")) {
      redirectWithMessage(target, "error", "Танд ажилбар засах эрх байхгүй байна.");
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
    redirect(`${target}?notice=${encodeURIComponent("Ажилбар амжилттай шинэчлэгдлээ.")}`);
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
      "Ажилбар устгахад шаардлагатай мэдээлэл дутуу байна.",
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "create_tasks")) {
      redirectWithMessage(target, "error", "Танд ажилбар устгах эрх байхгүй байна.");
    }

    await deleteWorkspaceTask(taskId, {
      login: session.login,
      password: session.password,
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath(`/projects/${projectId}`);
    redirect(`${target}?notice=${encodeURIComponent("Ажилбар устгагдлаа.")}`);
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
  const reportText = String(formData.get("report_text") ?? "").trim();
  const quantityRaw = String(formData.get("reported_quantity") ?? "").trim();
  const reportedQuantity = quantityRaw ? Number(quantityRaw) : 0;
  const quantityLineValues = formData
    .getAll("reported_quantity_line")
    .map((value) => String(value).trim());
  const quantityLineUnits = formData
    .getAll("reported_quantity_unit")
    .map((value) => String(value).trim());
  const imageFiles = getUploadedFiles(formData, "report_images");
  const audioFiles = getUploadedFiles(formData, "report_audios");
  const reportPath = taskId ? `/tasks/${taskId}` : "/tasks";

  if (!taskId || !reportText) {
    redirect(`${reportPath}?error=${encodeURIComponent("Тайлангийн текстээ оруулна уу.")}`);
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
    if (quantityRaw && (Number.isNaN(reportedQuantity) || reportedQuantity < 0)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ буруу байна.")}`);
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
    const odooReportedQuantity =
      firstLineQuantity ?? (quantityRaw && reportedQuantity > 0 ? reportedQuantity : 1);
    const effectiveReportText = [
      quantityLineSummaries.length
        ? `Гүйцэтгэсэн хэмжээ:\n${quantityLineSummaries.join("\n")}`
        : "",
      reportText,
    ]
      .filter(Boolean)
      .join("\n\n");

    const [imageAttachments, audioAttachments] = await Promise.all([
      Promise.all(
        imageFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, "image"),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
      Promise.all(
        audioFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, "audio"),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
    ]);

    await createWorkspaceTaskReport(
      {
        taskId,
        reportText: effectiveReportText,
        reportedQuantity: odooReportedQuantity,
        imageAttachments,
        audioAttachments,
      },
      connectionOverrides,
    );

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Тайлан амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`${reportPath}?error=${encodeURIComponent(getErrorMessage(error))}`);
  }
}

export async function updateTaskReportAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const reportId = Number(String(formData.get("report_id") ?? ""));
  const reportText = String(formData.get("report_text") ?? "").trim();
  const reportedQuantityRaw = String(formData.get("reported_quantity") ?? "").trim();
  const reportedQuantity = reportedQuantityRaw ? Number(reportedQuantityRaw) : null;
  const quantityLineValues = formData
    .getAll("reported_quantity_line")
    .map((value) => String(value).trim());
  const quantityLineUnits = formData
    .getAll("reported_quantity_unit")
    .map((value) => String(value).trim());
  const imageFiles = getUploadedFiles(formData, "report_images");
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
    const reportOwnerId = await loadWorkspaceTaskReportOwner(reportId, {
      login: session.login,
      password: session.password,
    });
    if (!canMutateReportOwner(session, reportOwnerId)) {
      redirect(`${reportPath}?error=${encodeURIComponent("Та зөвхөн өөрийн илгээсэн тайланг засах боломжтой.")}`);
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
    const [imageAttachments, audioAttachments] = await Promise.all([
      Promise.all(
        imageFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, "image"),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
      Promise.all(
        audioFiles.map(async (file) => ({
          name: file.name,
          mimeType: file.type || getFallbackMimeType(file.name, "audio"),
          base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        })),
      ),
    ]);

    await updateWorkspaceTaskReport(
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
    );

    revalidatePath("/notifications");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(`${reportPath}?notice=${encodeURIComponent("Тайлан шинэчлэгдлээ.")}#task-reports`);
  } catch (error) {
    rethrowIfRedirectError(error);
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
    await notifyTaskReviewersWithSystemFallback(
      taskId,
      session.name,
      reviewConnectionOverrides,
    );
    await notifyPushQuietly({
      eventType: "report_under_review",
      title: "Тайлан хяналтад ирлээ",
      body: `${session.name} тайлан илгээлээ.`,
      targetUrl: `/review`,
    });
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/projects");
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
        const canForceDone =
          session.role === "system_admin" ||
          session.role === "director" ||
          session.role === "general_manager" ||
          session.role === "project_manager";

        if (!canForceDone) {
          throw systemActionError;
        }

        await forceWorkspaceTaskDone(taskId, {});
      }
    }
    await notifyPushQuietly({
      eventType: "work_approved",
      title: "Ажил баталгаажлаа",
      body: "Ажлын гүйцэтгэл баталгаажсан байна.",
      targetUrl: `/tasks/${taskId}`,
    });
    revalidatePath("/");
    revalidatePath("/projects");
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
    try {
      await returnWorkspaceTaskForChanges(taskId, reason, connectionOverrides);
    } catch (error) {
      console.warn("Task return action failed with user credentials, retrying as system:", error);
      await returnWorkspaceTaskForChanges(taskId, reason, {});
    }
    await notifyPushQuietly({
      eventType: "work_returned",
      title: "Ажил буцаагдлаа",
      body: reason,
      targetUrl: `/tasks/${taskId}`,
    });
    revalidatePath("/");
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

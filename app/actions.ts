"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, isMasterRole, requireSession } from "@/lib/auth";
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
import {
  createGarbageWorkspaceProject,
  createWorkspaceProject,
  createWorkspaceTask,
  createWorkspaceTaskReport,
  loadProjectDetail,
  markWorkspaceTaskDone,
  loadDepartmentOptions,
  loadWorkTypeOptions,
  returnWorkspaceTaskForChanges,
  submitWorkspaceTaskForReview,
} from "@/lib/workspace";

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
  const trackQuantity = String(formData.get("track_quantity") ?? "").trim() === "1";
  const plannedQuantityRaw = String(formData.get("planned_quantity") ?? "").trim();
  const unitIdRaw = String(formData.get("unit_id") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const garbageVehicleIdRaw = String(formData.get("garbage_vehicle_id") ?? "").trim();
  const garbageRouteIdRaw = String(formData.get("garbage_route_id") ?? "").trim();
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

      let extraLocationMessage = "";

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

      revalidatePath("/");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/review");
      revalidatePath("/reports");
      revalidatePath("/projects/new");
      revalidatePath(`/projects/${result.project_id}`);
      redirect(
        `/projects/${result.project_id}?notice=${encodeURIComponent(
          `${result.message || "Хог тээвэрлэлтийн ажил амжилттай үүслээ."}${extraLocationMessage}`,
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
    operationUnit !== "garbage_transport"
      ? (await loadWorkTypeOptions(connectionOverrides)).find(
          (option) => option.operationType === operationType,
        ) ?? null
      : null;
  const allowedUnitIds = new Set(selectedWorkType?.allowedUnits.map((unit) => unit.id) ?? []);
  const measurementUnitId =
    unitIdRaw && Number.isFinite(Number(unitIdRaw))
      ? Number(unitIdRaw)
      : selectedWorkType?.defaultUnitId ?? selectedWorkType?.allowedUnits[0]?.id ?? null;

  if (operationUnit !== "garbage_transport" && !selectedWorkType) {
    redirectWithMessage("/projects/new", "error", "Ажлын төрлөө сонгоно уу.");
  }

  if (trackQuantity) {
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
        operationType: operationType || undefined,
        trackQuantity,
        plannedQuantity:
          trackQuantity && plannedQuantityRaw ? Number(plannedQuantityRaw) : null,
        measurementUnitId: trackQuantity ? measurementUnitId : null,
        startDate: startDate || undefined,
        deadline: deadline || undefined,
      },
      connectionOverrides,
    );

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
  const teamLeaderIdRaw = String(formData.get("team_leader_id") ?? "").trim();
  const deadline = String(formData.get("deadline") ?? "").trim();
  const unitIdRaw = String(formData.get("unit_id") ?? "").trim();
  const plannedQuantityRaw = String(formData.get("planned_quantity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

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
    const allowedUnitIds = new Set(project.allowedUnits.map((unit) => unit.id));
    const measurementUnitId =
      unitIdRaw && Number.isFinite(Number(unitIdRaw))
        ? Number(unitIdRaw)
        : project.defaultUnitId ?? project.allowedUnits[0]?.id ?? null;

    if (!project.allowedUnits.length) {
      redirectWithMessage(
        `/projects/${projectId}`,
        "error",
        "Энэ ажил дээр ажлын төрөл ба хэмжих нэгжийн профайл тохируулаагүй байна.",
        "#task-create-form",
      );
    }

    if (
      measurementUnitId &&
      allowedUnitIds.size &&
      !allowedUnitIds.has(measurementUnitId)
    ) {
      redirectWithMessage(
        `/projects/${projectId}`,
        "error",
        "Сонгосон хэмжих нэгж энэ ажилд зөвшөөрөгдөөгүй байна.",
        "#task-create-form",
      );
    }

    const plannedQuantity = plannedQuantityRaw ? Number(plannedQuantityRaw) : null;
    if (plannedQuantityRaw && (plannedQuantity === null || Number.isNaN(plannedQuantity) || plannedQuantity <= 0)) {
      redirectWithMessage(
        `/projects/${projectId}`,
        "error",
        "Төлөвлөсөн хэмжээ 0-ээс их байх ёстой.",
        "#task-create-form",
      );
    }

    if (!measurementUnitId) {
      redirectWithMessage(
        `/projects/${projectId}`,
        "error",
        "Хэмжих нэгж сонгоно уу.",
        "#task-create-form",
      );
    }

    const defaultTeamLeaderId = isMasterRole(session.role) ? session.uid : null;
    const taskId = await createWorkspaceTask(
      {
        projectId,
        name,
        teamLeaderId: teamLeaderIdRaw ? Number(teamLeaderIdRaw) : defaultTeamLeaderId,
        deadline: deadline || undefined,
        measurementUnitId,
        plannedQuantity,
        description: description || undefined,
      },
      connectionOverrides,
    );

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

export async function createTaskReportAction(formData: FormData) {
  const taskId = Number(String(formData.get("task_id") ?? ""));
  const reportText = String(formData.get("report_text") ?? "").trim();
  const quantityRaw = String(formData.get("reported_quantity") ?? "").trim();
  const reportedQuantity = quantityRaw ? Number(quantityRaw) : 0;
  const imageFiles = getUploadedFiles(formData, "report_images");
  const audioFiles = getUploadedFiles(formData, "report_audios");
  const reportPath = taskId ? `/tasks/${taskId}` : "/tasks";

  if (!taskId || !reportText) {
    redirect(`${reportPath}?error=${encodeURIComponent("Тайлангийн текстээ оруулна уу.")}&composer=report`);
  }

  if (!quantityRaw || Number.isNaN(reportedQuantity) || reportedQuantity <= 0) {
    redirect(
      `${reportPath}?error=${encodeURIComponent("Гүйцэтгэсэн хэмжээ 0-ээс их байх ёстой.")}&composer=report`,
    );
  }

  if (imageFiles.some((file) => file.type && !file.type.startsWith("image/"))) {
    redirect(
      `${reportPath}?error=${encodeURIComponent("Зураг хэсэгт зөвхөн зургийн файл сонгоно уу.")}&composer=report`,
    );
  }

  if (audioFiles.some((file) => file.type && !file.type.startsWith("audio/"))) {
    redirect(
      `${reportPath}?error=${encodeURIComponent("Аудио хэсэгт зөвхөн аудио файл сонгоно уу.")}&composer=report`,
    );
  }

  try {
    const session = await requireSession();
    if (!hasCapability(session, "write_workspace_reports")) {
      redirect(
        `${reportPath}?error=${encodeURIComponent("Танд гүйцэтгэлийн тайлан илгээх эрх нээгдээгүй байна.")}&composer=report`,
      );
    }

    const connectionOverrides = {
      login: session.login,
      password: session.password,
    };

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
        reportText,
        reportedQuantity,
        imageAttachments,
        audioAttachments,
      },
      connectionOverrides,
    );

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/review");
    revalidatePath("/reports");
    revalidatePath(`/tasks/${taskId}`);
    redirect(`/tasks/${taskId}?notice=${encodeURIComponent("Тайлан амжилттай хадгалагдлаа.")}`);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(`${reportPath}?error=${encodeURIComponent(getErrorMessage(error))}&composer=report`);
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
    await submitWorkspaceTaskForReview(taskId, connectionOverrides);
    revalidatePath("/");
    revalidatePath("/tasks");
    revalidatePath("/projects");
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
    const connectionOverrides = await getConnectionOverrides();
    await markWorkspaceTaskDone(taskId, connectionOverrides);
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
    const connectionOverrides = await getConnectionOverrides();
    await returnWorkspaceTaskForChanges(taskId, reason, connectionOverrides);
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

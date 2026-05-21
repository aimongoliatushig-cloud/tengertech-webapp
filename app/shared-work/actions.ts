"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireSession } from "@/lib/auth";
import { loadDepartmentHeadUserIds } from "@/lib/notification-recipients";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { notifyPushEvent } from "@/lib/push-notifications";

function getConnection(session: Awaited<ReturnType<typeof requireSession>>): Partial<OdooConnection> {
  return {
    login: session.login,
    password: session.password,
  };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getIds(formData: FormData, key: string) {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );
}

function getFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

function redirectWithStatus(basePath: string, type: "notice" | "error", message: string) {
  const params = new URLSearchParams({ [type]: message });
  redirect(`${basePath}?${params.toString()}`);
}

function isNextRedirect(error: unknown) {
  return error instanceof Error && error.message.includes("NEXT_REDIRECT");
}

function normalizeDateTime(value: string) {
  if (!value) {
    return false;
  }
  return value.length === 16 ? `${value}:00` : value;
}

async function createAttachment(
  file: File,
  resModel: string,
  resId: number,
  connection: Partial<OdooConnection>,
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return executeOdooKw<number>(
    "ir.attachment",
    "create",
    [
      {
        name: file.name || "attachment",
        datas: buffer.toString("base64"),
        mimetype: file.type || "application/octet-stream",
        res_model: resModel,
        res_id: resId,
      },
    ],
    {},
    connection,
  );
}

async function notifyDepartmentsSharedWorkCreated(
  departmentIds: number[],
  workId: number,
  title: string,
  connection: Partial<OdooConnection>,
) {
  const recipientIds = new Set<number>();
  for (const departmentId of departmentIds) {
    const headIds = await loadDepartmentHeadUserIds(departmentId, connection).catch(() => []);
    for (const headId of headIds) {
      recipientIds.add(headId);
    }
  }

  if (!recipientIds.size) {
    return;
  }

  await notifyPushEvent({
    eventType: "shared_work_created",
    userIds: Array.from(recipientIds),
    title: "Хамтарсан ажил үүслээ",
    body: title,
    targetUrl: `/shared-work/${workId}`,
  }).catch((error) => {
    console.warn("Shared work creation push notification failed:", error);
  });
}

async function notifySharedTaskCompleted(
  departmentTaskId: number,
  connection: Partial<OdooConnection>,
) {
  const records = await executeOdooKw<
    Array<{
      shared_work_id?: [number, string] | false;
      department_id?: [number, string] | false;
    }>
  >(
    "shared.work.department.task",
    "search_read",
    [[["id", "=", departmentTaskId]]],
    { fields: ["shared_work_id", "department_id"], limit: 1 },
    connection,
  ).catch(() => []);
  const task = records[0];
  const workId = Array.isArray(task?.shared_work_id) ? task.shared_work_id[0] : null;
  const workName = Array.isArray(task?.shared_work_id) ? task.shared_work_id[1] : "Хамтарсан ажил";
  const departmentName = Array.isArray(task?.department_id) ? task.department_id[1] : "Хэлтэс";
  if (!workId) {
    return;
  }

  const works = await executeOdooKw<Array<{ created_by?: [number, string] | false }>>(
    "shared.work",
    "search_read",
    [[["id", "=", workId]]],
    { fields: ["created_by"], limit: 1 },
    connection,
  ).catch(() => []);
  const creatorId = Array.isArray(works[0]?.created_by) ? works[0].created_by[0] : null;
  if (!creatorId) {
    return;
  }

  await notifyPushEvent({
    eventType: "shared_work_task_completed",
    userIds: [creatorId],
    title: "Хэлтсийн ажил дууслаа",
    body: `${departmentName}: ${workName}`,
    targetUrl: `/shared-work/${workId}`,
  }).catch((error) => {
    console.warn("Shared work task completion push notification failed:", error);
  });
}

function assertCanCreateSharedWork(session: Awaited<ReturnType<typeof requireSession>>) {
  if (!hasCapability(session, "create_projects") && session.role !== "general_manager" && session.role !== "director") {
    throw new Error("Хамтарсан ажил үүсгэх эрх хүрэлцэхгүй байна.");
  }
}

export async function createSharedWorkAction(formData: FormData) {
  const session = await requireSession();
  const connection = getConnection(session);

  try {
    assertCanCreateSharedWork(session);
    const name = getString(formData, "name");
    const departmentIds = getIds(formData, "department_ids");
    if (!name) {
      throw new Error("Ажлын нэр оруулна уу.");
    }
    if (!departmentIds.length) {
      throw new Error("Оролцох хэлтэс сонгоно уу.");
    }

    const workId = await executeOdooKw<number>(
      "shared.work",
      "create",
      [
        {
          name,
          description: getString(formData, "description"),
          location_text: getString(formData, "location_text"),
          priority: getString(formData, "priority") || "1",
          planned_start_date: normalizeDateTime(getString(formData, "planned_start_date")),
          planned_end_date: normalizeDateTime(getString(formData, "planned_end_date")),
          involved_department_ids: [[6, 0, departmentIds]],
        },
      ],
      {},
      connection,
    );

    const files = getFiles(formData, "attachments");
    if (files.length) {
      const attachmentIds = [];
      for (const file of files.slice(0, 8)) {
        attachmentIds.push(await createAttachment(file, "shared.work", workId, connection));
      }
      await executeOdooKw<boolean>(
        "shared.work",
        "write",
        [[workId], { attachment_ids: [[6, 0, attachmentIds]] }],
        {},
        connection,
      );
    }

    await notifyDepartmentsSharedWorkCreated(departmentIds, workId, name, connection);
    revalidatePath("/shared-work");
    revalidatePath(`/shared-work/${workId}`);
    revalidatePath("/notifications");
    redirect(`/shared-work/${workId}?notice=${encodeURIComponent("Хамтарсан ажил үүсэж, хэлтэс тус бүрийн ажил автоматаар үүслээ.")}`);
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirectWithStatus("/shared-work", "error", error instanceof Error ? error.message : "Хамтарсан ажил үүсгэх үед алдаа гарлаа.");
  }
}

export async function updateSharedDepartmentTaskAction(formData: FormData) {
  const session = await requireSession();
  const connection = getConnection(session);
  const taskId = getNumber(formData.get("department_task_id"));
  const workId = getNumber(formData.get("shared_work_id"));

  try {
    if (!taskId || !workId) {
      throw new Error("Хэлтсийн ажил олдсонгүй.");
    }
    const progress = Math.max(0, Math.min(Number(getString(formData, "progress_percent") || 0), 100));
    await executeOdooKw<boolean>(
      "shared.work.department.task",
      "write",
      [
        [taskId],
        {
          assigned_employee_ids: [[6, 0, getIds(formData, "assigned_employee_ids")]],
          assigned_vehicle_ids: [[6, 0, getIds(formData, "assigned_vehicle_ids")]],
          team_ids: [[6, 0, getIds(formData, "team_ids")]],
          route_ids: [[6, 0, getIds(formData, "route_ids")]],
          status: getString(formData, "status") || "planned",
          progress_percent: progress,
          notes: getString(formData, "notes"),
        },
      ],
      {},
      connection,
    );
    revalidatePath("/shared-work");
    revalidatePath(`/shared-work/${workId}`);
    redirectWithStatus(`/shared-work/${workId}`, "notice", "Хэлтсийн ажил шинэчлэгдлээ.");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirectWithStatus(
      workId ? `/shared-work/${workId}` : "/shared-work",
      "error",
      error instanceof Error ? error.message : "Хэлтсийн ажил шинэчлэх үед алдаа гарлаа.",
    );
  }
}

export async function completeSharedDepartmentTaskAction(formData: FormData) {
  const session = await requireSession();
  const connection = getConnection(session);
  const taskId = getNumber(formData.get("department_task_id"));
  const workId = getNumber(formData.get("shared_work_id"));

  try {
    if (!taskId || !workId) {
      throw new Error("Хэлтсийн ажил олдсонгүй.");
    }
    await executeOdooKw<boolean>(
      "shared.work.department.task",
      "action_complete",
      [[taskId]],
      {},
      connection,
    );
    await notifySharedTaskCompleted(taskId, connection);
    revalidatePath("/shared-work");
    revalidatePath(`/shared-work/${workId}`);
    revalidatePath("/notifications");
    redirectWithStatus(`/shared-work/${workId}`, "notice", "Хэлтсийн ажил дууссан төлөвт орлоо.");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirectWithStatus(
      workId ? `/shared-work/${workId}` : "/shared-work",
      "error",
      error instanceof Error ? error.message : "Ажил дуусгах үед алдаа гарлаа.",
    );
  }
}

export async function createSharedWorkReportAction(formData: FormData) {
  const session = await requireSession();
  const connection = getConnection(session);
  const taskId = getNumber(formData.get("department_task_id"));
  const workId = getNumber(formData.get("shared_work_id"));

  try {
    if (!taskId || !workId) {
      throw new Error("Тайлан холбох хэлтсийн ажил олдсонгүй.");
    }
    const note = getString(formData, "note");
    if (!note) {
      throw new Error("Тайлангийн тайлбар оруулна уу.");
    }
    const reportId = await executeOdooKw<number>(
      "shared.work.report",
      "create",
      [
        {
          department_task_id: taskId,
          shared_work_id: workId,
          note,
          latitude: Number(getString(formData, "latitude")) || false,
          longitude: Number(getString(formData, "longitude")) || false,
        },
      ],
      {},
      connection,
    );

    const images = getFiles(formData, "images");
    if (images.length) {
      const imageIds = [];
      for (const image of images.slice(0, 8)) {
        imageIds.push(await createAttachment(image, "shared.work.report", reportId, connection));
      }
      await executeOdooKw<boolean>(
        "shared.work.report",
        "write",
        [[reportId], { image_ids: [[6, 0, imageIds]] }],
        {},
        connection,
      );
    }

    revalidatePath("/shared-work");
    revalidatePath(`/shared-work/${workId}`);
    redirectWithStatus(`/shared-work/${workId}`, "notice", "Тайлан хадгалагдлаа.");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirectWithStatus(
      workId ? `/shared-work/${workId}` : "/shared-work",
      "error",
      error instanceof Error ? error.message : "Тайлан хадгалах үед алдаа гарлаа.",
    );
  }
}

export async function createSharedOperationalTaskAction(formData: FormData) {
  const session = await requireSession();
  const connection = getConnection(session);
  const taskId = getNumber(formData.get("department_task_id"));
  const workId = getNumber(formData.get("shared_work_id"));

  try {
    if (!taskId || !workId) {
      throw new Error("Хэлтсийн ажил олдсонгүй.");
    }
    await executeOdooKw<boolean>(
      "shared.work.department.task",
      "action_create_operational_task",
      [[taskId]],
      {},
      connection,
    );
    revalidatePath("/shared-work");
    revalidatePath(`/shared-work/${workId}`);
    redirectWithStatus(`/shared-work/${workId}`, "notice", "Дотоод даалгавар үүслээ.");
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }
    redirectWithStatus(
      workId ? `/shared-work/${workId}` : "/shared-work",
      "error",
      error instanceof Error ? error.message : "Дотоод даалгавар үүсгэх үед алдаа гарлаа.",
    );
  }
}

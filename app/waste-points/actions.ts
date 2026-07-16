"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canAccessAutoBaseOverview, requireSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { executeOdooKw } from "@/lib/odoo";
import { getWastePointById } from "@/lib/waste-points/service";
import {
  WASTE_TASK_TYPES,
  WASTE_TYPE_LABELS,
  formatGps,
  type WasteTaskType,
} from "@/lib/waste-points/types";

const WASTE_TASK_PROJECT = "Хогийн цэгийн ажил (2026)";
const GARBAGE_DEPARTMENT = "Хог тээвэрлэлтийн хэлтэс";

function backPath(pointId: number, status: "notice" | "error", message: string) {
  const params = new URLSearchParams({ [status]: message });
  return `/waste-points/${pointId}?${params.toString()}`;
}

async function resolveDepartmentId(): Promise<number | null> {
  const rows = await executeOdooKw<{ id: number }[]>(
    "hr.department",
    "search_read",
    [[["name", "=", GARBAGE_DEPARTMENT]]],
    { fields: ["id"], limit: 1 },
  );
  return rows[0]?.id ?? null;
}

async function ensureProjectId(departmentId: number | null): Promise<number> {
  const existing = await executeOdooKw<{ id: number }[]>(
    "project.project",
    "search_read",
    [[["name", "=", WASTE_TASK_PROJECT]]],
    { fields: ["id"], limit: 1 },
  );
  if (existing[0]) return existing[0].id;
  return executeOdooKw<number>("project.project", "create", [
    departmentId ? { name: WASTE_TASK_PROJECT, ops_department_id: departmentId } : { name: WASTE_TASK_PROJECT },
  ]);
}

function deadlineFor(taskType: WasteTaskType): string {
  const now = new Date();
  const days = taskType === "urgent" ? 0 : taskType === "collection" ? 1 : 3;
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 17, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())} ${pad(due.getHours())}:00:00`;
}

export async function createWastePointTaskAction(formData: FormData) {
  const session = await requireSession();
  const pointId = Number(String(formData.get("point_id") ?? ""));
  const taskTypeRaw = String(formData.get("task_type") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, scopedDepartmentName)) {
    redirect(backPath(pointId, "error", "Танд ажил үүсгэх эрх байхгүй байна."));
  }

  const taskType = WASTE_TASK_TYPES.find((t) => t.key === taskTypeRaw);
  if (!Number.isFinite(pointId) || pointId <= 0 || !taskType) {
    redirect(backPath(pointId || 0, "error", "Мэдээлэл дутуу байна."));
  }

  const point = await getWastePointById(pointId);
  if (!point) {
    redirect(backPath(pointId, "error", "Хогийн цэг олдсонгүй."));
  }

  const departmentId = await resolveDepartmentId();
  const projectId = await ensureProjectId(departmentId);

  const description = [
    `Хогийн цэг: ${point.code} — ${point.name}`,
    `Төрөл: ${WASTE_TYPE_LABELS[point.type]}`,
    `Хаяг: ${point.address}`,
    `GPS: ${formatGps(point.latitude, point.longitude)}`,
    `Сав: ${point.containerType}${point.containerCount ? ` · ${point.containerCount}ш` : ""}${point.capacity ? ` · ${point.capacity}л` : ""}`,
    `Дүүргэлт: ${point.currentFillLevel}%`,
    note ? `\nТайлбар: ${note}` : "",
    `\nҮүсгэсэн: ${session.name} (Хогийн цэг модулиас)`,
  ]
    .filter(Boolean)
    .join("\n");

  await executeOdooKw("project.task", "create", [
    {
      name: `${taskType.label} — ${point.code} (${point.khorooName})`,
      project_id: projectId,
      ...(departmentId ? { ops_department_id: departmentId } : {}),
      date_deadline: deadlineFor(taskType.key),
      description,
    },
  ]);

  revalidatePath(`/waste-points/${pointId}`);
  redirect(backPath(pointId, "notice", `"${taskType.label}" ажил ERP-д үүслээ.`));
}

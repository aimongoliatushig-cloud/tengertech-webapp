import "server-only";

import { executeOdooKw } from "@/lib/odoo";
import {
  decodeEvalData,
  encodeEvalData,
  isValidEvalMonth,
  type EvalMonthData,
} from "@/lib/road-cleaning-evaluation";

// Гүйцэтгэлийн үнэлгээг Odoo-д хадгалах/унших (server-only). Хэлтэс тус бүрийн
// зориулалтын project доторх сар бүрийн project.task-ийн description-д хадгална.

const EVAL_PROJECT_TAG = "[ROAD-EVAL]";

function evalProjectName(departmentName: string): string {
  return `Зам талбайн цэвэрлэгээний үнэлгээ — ${departmentName} ${EVAL_PROJECT_TAG}`;
}

function evalMonthTaskName(month: string): string {
  return `Гүйцэтгэлийн үнэлгээ — ${month}`;
}

type OdooDepartment = { id: number; name: string };

async function resolveDepartmentId(departmentName: string): Promise<OdooDepartment | null> {
  const trimmed = departmentName.trim();
  if (!trimmed) {
    return null;
  }
  const records = await executeOdooKw<OdooDepartment[]>(
    "hr.department",
    "search_read",
    [[["name", "=", trimmed]]],
    { fields: ["id", "name"], limit: 1 },
  );
  return records[0] ?? null;
}

async function ensureEvalProject(department: OdooDepartment): Promise<number> {
  const name = evalProjectName(department.name);
  const existing = await executeOdooKw<{ id: number }[]>(
    "project.project",
    "search_read",
    [[["name", "=", name]]],
    { fields: ["id"], limit: 1 },
  );
  if (existing[0]) {
    return existing[0].id;
  }
  return executeOdooKw<number>("project.project", "create", [
    { name, ops_department_id: department.id },
  ]);
}

async function findEvalMonthTask(
  projectId: number,
  month: string,
): Promise<{ id: number; description: string } | null> {
  const records = await executeOdooKw<{ id: number; description: string | false }[]>(
    "project.task",
    "search_read",
    [[["project_id", "=", projectId], ["name", "=", evalMonthTaskName(month)]]],
    { fields: ["id", "description"], limit: 1 },
  );
  const record = records[0];
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    description: typeof record.description === "string" ? record.description : "",
  };
}

export async function loadEvalMonth(
  departmentName: string,
  month: string,
): Promise<EvalMonthData | null> {
  if (!isValidEvalMonth(month)) {
    return null;
  }
  const department = await resolveDepartmentId(departmentName);
  if (!department) {
    return null;
  }
  const projects = await executeOdooKw<{ id: number }[]>(
    "project.project",
    "search_read",
    [[["name", "=", evalProjectName(department.name)]]],
    { fields: ["id"], limit: 1 },
  );
  const projectId = projects[0]?.id;
  if (!projectId) {
    return null;
  }
  const task = await findEvalMonthTask(projectId, month);
  if (!task) {
    return null;
  }
  return decodeEvalData(task.description);
}

export async function saveEvalMonth(
  departmentName: string,
  data: EvalMonthData,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidEvalMonth(data.month)) {
    return { ok: false, error: "Сар буруу байна." };
  }
  const department = await resolveDepartmentId(departmentName);
  if (!department) {
    return { ok: false, error: "Хэлтэс тодорхойлж чадсангүй." };
  }
  const projectId = await ensureEvalProject(department);
  const description = encodeEvalData(data);
  const existing = await findEvalMonthTask(projectId, data.month);
  if (existing) {
    await executeOdooKw("project.task", "write", [[existing.id], { description }]);
  } else {
    await executeOdooKw("project.task", "create", [
      {
        name: evalMonthTaskName(data.month),
        project_id: projectId,
        ops_department_id: department.id,
        description,
      },
    ]);
  }
  return { ok: true };
}

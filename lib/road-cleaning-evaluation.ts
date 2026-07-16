import "server-only";

import { executeOdooKw } from "@/lib/odoo";

// Зам талбайн цэвэрлэгээний сарын гүйцэтгэлийн үнэлгээ (100 оноо).
// ТББ ("Хотын хөгжлийг дэмжих шинэ тосгон холбоо") байршил бүрээр 9 жинлэсэн
// шалгуураар үнэлж, захирал хүлээн зөвшөөрдөг албан ёсны загвар.
// Odoo-д тусдаа модел нэмэлгүйгээр хэлтсийн зориулалтын project доторх сар
// бүрийн project.task-ийн description-д бүтэцтэй хэлбэрээр хадгална.

export type EvalCriterion = { key: string; label: string; max: number };

export const EVAL_CRITERIA: EvalCriterion[] = [
  { key: "internal_control", label: "Байгууллагын дотоод хяналт хэрэгжүүлсэн байдал", max: 15 },
  { key: "technique_usage", label: "Замын цэвэрлэгээнд техник ашигласан байдал", max: 15 },
  { key: "pedestrian_clean", label: "Явган зам, цас, мөс хог цэвэрлэгээ", max: 15 },
  { key: "road_snow_clean", label: "Замын нуухны цас, хог цэвэрлэгээ", max: 15 },
  {
    key: "bin_wash",
    label: "Зам дагуух хог ачилт ба хогийн сав суллалт, угаалга цэвэрлэгээ",
    max: 10,
  },
  {
    key: "wall_to_wall",
    label:
      "Хананаас хана хүртлэх талбайн хог, шарилж лууль, гэрлийн шон дээрх зарын хуудсыг цэвэрлэсэн байдал",
    max: 10,
  },
  {
    key: "safety_uniform",
    label: "Хөдөлмөрийн аюулгүй ажиллагаа хангасан байдал, ажилчдын хувцас жигдрэлт",
    max: 10,
  },
  { key: "city_district_tasks", label: "Нийслэл, дүүргийн үүрэг даалгаврын биелэлт", max: 5 },
  { key: "ngo_tasks", label: "ТББ-ын чиглэлийн биелэлт", max: 5 },
];

export const EVAL_MAX_TOTAL = EVAL_CRITERIA.reduce((sum, c) => sum + c.max, 0); // 100

export type EvalRow = {
  location: string;
  segment: string;
  areaM2: number;
  scores: Record<string, number>;
};

export type EvalMonthData = {
  month: string; // YYYY-MM
  rows: EvalRow[];
  evaluatorOrg: string;
  evaluatorName: string;
  updatedBy: string;
  updatedAt: string;
};

export const DEFAULT_EVALUATOR_ORG = "«Хотын хөгжлийг дэмжих шинэ тосгон холбоо»";
export const DEFAULT_EVALUATOR_NAME = "Б.Жаргал";

// Тайланд байгаа 3 үндсэн байршил — шинэ сарын үнэлгээг эхлүүлэхэд өгөгдмөлөөр.
export const DEFAULT_EVAL_LOCATIONS: Omit<EvalRow, "scores">[] = [
  {
    location: "Наадамчдын зам (Яармагийн зам)",
    segment: "Яармагийн гүүрнээс Нисэхийн аюулгүйн тойрог хүртэл",
    areaM2: 190400,
  },
  {
    location: "Нүхтийн зам",
    segment: "Наадамчдын зам Яармагийн 2-р буудлаас урагш Нүхт зуслан хүртэл",
    areaM2: 38500,
  },
  {
    location: "Яармагийн давхар гүүр",
    segment:
      "Туул гол дээр шинээр барьсан гүүр, Богд уулын арын замтай холбосон гүүр, Чингисийн өргөн чөлөө Ажилчны гудамжны огтлолцол дээр барьсан жаазан гүүр, эргэлт, уулзварын өргөтгөл",
    areaM2: 97500,
  },
];

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidEvalMonth(month: string): boolean {
  return MONTH_PATTERN.test(month);
}

export function emptyScores(): Record<string, number> {
  return Object.fromEntries(EVAL_CRITERIA.map((c) => [c.key, 0]));
}

export function defaultEvalRows(): EvalRow[] {
  return DEFAULT_EVAL_LOCATIONS.map((base) => ({ ...base, scores: emptyScores() }));
}

function clampScore(value: unknown, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.min(max, Math.round(num * 100) / 100);
}

function toSafeArea(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return 0;
  }
  return Math.round(num);
}

export function sanitizeEvalRows(rawRows: unknown): EvalRow[] {
  if (!Array.isArray(rawRows)) {
    return [];
  }
  return rawRows
    .map((raw): EvalRow | null => {
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const row = raw as Record<string, unknown>;
      const rawScores = (row.scores && typeof row.scores === "object" ? row.scores : {}) as Record<
        string,
        unknown
      >;
      const scores: Record<string, number> = {};
      for (const criterion of EVAL_CRITERIA) {
        scores[criterion.key] = clampScore(rawScores[criterion.key], criterion.max);
      }
      const location = String(row.location ?? "").trim().slice(0, 200);
      const segment = String(row.segment ?? "").trim().slice(0, 500);
      const areaM2 = toSafeArea(row.areaM2);
      const hasContent =
        location ||
        segment ||
        areaM2 > 0 ||
        EVAL_CRITERIA.some((c) => scores[c.key] > 0);
      return hasContent ? { location, segment, areaM2, scores } : null;
    })
    .filter((row): row is EvalRow => row !== null)
    .slice(0, 40);
}

export function rowTotal(row: EvalRow): number {
  return EVAL_CRITERIA.reduce((sum, c) => sum + (Number(row.scores[c.key]) || 0), 0);
}

export function summarizeEval(rows: EvalRow[]) {
  const totalArea = rows.reduce((sum, row) => sum + row.areaM2, 0);
  const rowTotals = rows.map(rowTotal);
  const averageScore = rowTotals.length
    ? Math.round((rowTotals.reduce((a, b) => a + b, 0) / rowTotals.length) * 100) / 100
    : 0;
  return { locationCount: rows.length, totalArea, averageScore };
}

const EVAL_JSON_PREFIX = "<!--ROAD-EVAL-JSON:";
const EVAL_JSON_SUFFIX = "-->";

export function encodeEvalData(data: EvalMonthData): string {
  const summary = summarizeEval(data.rows);
  const lines: string[] = [];
  lines.push(`Зам талбайн цэвэрлэгээний гүйцэтгэлийн үнэлгээ — ${data.month}`);
  lines.push(`Үнэлгээ өгсөн: ${data.evaluatorOrg} (${data.evaluatorName})`);
  lines.push("");
  data.rows.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.location || "Тодорхойгүй"} — ${row.areaM2.toLocaleString("mn-MN")} м², нийт оноо ${rowTotal(row)}/${EVAL_MAX_TOTAL}`,
    );
  });
  lines.push("");
  lines.push(
    `Дундаж оноо: ${summary.averageScore}/${EVAL_MAX_TOTAL}, нийт талбай ${summary.totalArea.toLocaleString("mn-MN")} м²`,
  );
  lines.push(`Сүүлд шинэчилсэн: ${data.updatedBy} · ${data.updatedAt}`);
  lines.push("");
  const json = JSON.stringify({
    month: data.month,
    rows: data.rows,
    evaluatorOrg: data.evaluatorOrg,
    evaluatorName: data.evaluatorName,
    updatedBy: data.updatedBy,
    updatedAt: data.updatedAt,
  });
  lines.push(`${EVAL_JSON_PREFIX}${json}${EVAL_JSON_SUFFIX}`);
  return lines.join("\n");
}

export function decodeEvalData(description: unknown): EvalMonthData | null {
  if (typeof description !== "string") {
    return null;
  }
  const start = description.indexOf(EVAL_JSON_PREFIX);
  if (start === -1) {
    return null;
  }
  const end = description.indexOf(EVAL_JSON_SUFFIX, start + EVAL_JSON_PREFIX.length);
  if (end === -1) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      description.slice(start + EVAL_JSON_PREFIX.length, end),
    ) as Record<string, unknown>;
    const month = String(parsed.month ?? "");
    if (!isValidEvalMonth(month)) {
      return null;
    }
    return {
      month,
      rows: sanitizeEvalRows(parsed.rows),
      evaluatorOrg: String(parsed.evaluatorOrg ?? DEFAULT_EVALUATOR_ORG),
      evaluatorName: String(parsed.evaluatorName ?? DEFAULT_EVALUATOR_NAME),
      updatedBy: String(parsed.updatedBy ?? ""),
      updatedAt: String(parsed.updatedAt ?? ""),
    };
  } catch {
    return null;
  }
}

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

import { getSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import {
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { loadMunicipalSnapshot } from "@/lib/odoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MunicipalSnapshot = Awaited<ReturnType<typeof loadMunicipalSnapshot>>;
type ReportRow = MunicipalSnapshot["reports"][number];
type TaskRow = MunicipalSnapshot["taskDirectory"][number];
type ReviewRow = MunicipalSnapshot["reviewQueue"][number];

type ExportPayload = {
  generatedAt: string;
  scope: string;
  summary: {
    reports: number;
    tasks: number;
    reviewItems: number;
    images: number;
    audios: number;
    overdueTasks: number;
  };
  reports: ReportRow[];
  tasks: TaskRow[];
  reviewQueue: ReviewRow[];
};

function getParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function toExcelHtml(title: string, payload: ExportPayload) {
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const table = (caption: string, headers: string[], rows: unknown[][]) => `
    <table>
      <caption>${escapeHtml(caption)}</caption>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; }
    table { border-collapse: collapse; margin-bottom: 24px; width: 100%; }
    caption { font-weight: 700; margin: 8px 0; text-align: left; }
    th, td { border: 1px solid #ccd5cf; padding: 6px 8px; text-align: left; }
    th { background: #eef6f0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Хамрах хүрээ: ${escapeHtml(payload.scope)}</p>
  <p>Үүсгэсэн: ${escapeHtml(payload.generatedAt)}</p>
  ${table("Нэгтгэл", ["Үзүүлэлт", "Дүн"], [
    ["Тайлан", payload.summary.reports],
    ["Ажил", payload.summary.tasks],
    ["Хяналт хүлээж буй", payload.summary.reviewItems],
    ["Хугацаа хэтэрсэн", payload.summary.overdueTasks],
    ["Зураг", payload.summary.images],
    ["Аудио", payload.summary.audios],
  ])}
  ${table(
    "Зурагтай ажлын тайлан",
    ["ID", "Ажил", "Төсөл", "Хэлтэс", "Илгээсэн", "Тоо хэмжээ", "Нэгж", "Зураг", "Аудио", "Огноо", "Тайлбар"],
    payload.reports.map((report) => [
      report.id,
      report.taskName,
      report.projectName,
      report.departmentName,
      report.reporter,
      report.reportedQuantity,
      report.measurementUnit,
      report.imageCount,
      report.audioCount,
      report.submittedAt,
      report.summary,
    ]),
  )}
  ${table(
    "Ажлын жагсаалт",
    ["ID", "Ажил", "Төсөл", "Хэлтэс", "Төлөв", "Хариуцагч", "Явц", "Дуусах хугацаа", "Тоо хэмжээ", "Үлдэгдэл"],
    payload.tasks.map((task) => [
      task.id,
      task.name,
      task.projectName,
      task.departmentName,
      task.statusLabel,
      task.leaderName,
      `${task.progress}%`,
      task.deadline,
      `${task.completedQuantity} ${task.measurementUnit}`,
      `${task.remainingQuantity} ${task.measurementUnit}`,
    ]),
  )}
</body>
</html>`;
}

function buildExportPayload(snapshot: MunicipalSnapshot, request: Request, scopedDepartmentName: string | null) {
  const searchParams = new URL(request.url).searchParams;
  const requestedDepartment = getParam(searchParams, "department");
  const requestedUnit = getParam(searchParams, "unit");
  const selectedGroup = scopedDepartmentName
    ? findDepartmentGroupByName(scopedDepartmentName) ?? findDepartmentGroupByUnit(scopedDepartmentName)
    : requestedDepartment && requestedDepartment !== "all"
      ? findDepartmentGroupByName(requestedDepartment) ?? findDepartmentGroupByUnit(requestedDepartment)
      : null;
  const availableUnits = selectedGroup ? getAvailableUnits(selectedGroup) : [];
  const selectedUnit =
    requestedUnit && availableUnits.includes(requestedUnit)
      ? requestedUnit
      : requestedDepartment && availableUnits.includes(requestedDepartment)
        ? requestedDepartment
        : "";
  const matchesSelectedDepartment = (departmentName: string) =>
    selectedUnit
      ? departmentName === selectedUnit
      : selectedGroup
        ? matchesDepartmentGroup(selectedGroup, departmentName)
        : true;

  const reports = scopedDepartmentName
    ? filterByDepartment(snapshot.reports, scopedDepartmentName)
    : snapshot.reports.filter((report) => matchesSelectedDepartment(report.departmentName));
  const tasks = scopedDepartmentName
    ? filterByDepartment(snapshot.taskDirectory, scopedDepartmentName)
    : snapshot.taskDirectory.filter((task) => matchesSelectedDepartment(task.departmentName));
  const reviewQueue = scopedDepartmentName
    ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
    : snapshot.reviewQueue.filter((item) => matchesSelectedDepartment(item.departmentName));

  return {
    generatedAt: snapshot.generatedAt,
    scope: scopedDepartmentName || selectedUnit || selectedGroup?.name || "Бүх хэлтэс",
    summary: {
      reports: reports.length,
      tasks: tasks.length,
      reviewItems: reviewQueue.length,
      images: reports.reduce((sum, report) => sum + report.imageCount, 0),
      audios: reports.reduce((sum, report) => sum + report.audioCount, 0),
      overdueTasks: tasks.filter((task) => task.statusKey === "problem").length,
    },
    reports,
    tasks,
    reviewQueue,
  };
}

function getReportRows(payload: ExportPayload) {
  return [
    [
      "ID",
      "Ажил",
      "Төсөл",
      "Хэлтэс",
      "Илгээсэн",
      "Тоо хэмжээ",
      "Нэгж",
      "Зураг",
      "Аудио",
      "Огноо",
      "Тайлбар",
    ],
    ...payload.reports.map((report) => [
      report.id,
      report.taskName,
      report.projectName,
      report.departmentName,
      report.reporter,
      report.reportedQuantity,
      report.measurementUnit,
      report.imageCount,
      report.audioCount,
      report.submittedAt,
      report.summary,
    ]),
  ];
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }

  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const payload = buildExportPayload(snapshot, request, scopedDepartmentName);
  const format = getParam(new URL(request.url).searchParams, "format") || "csv";
  const dateKey = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    return Response.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.json"`,
      },
    });
  }

  if (format === "excel" || format === "xls") {
    return new Response(toExcelHtml("Хот тохижилтын тайлан", payload), {
      headers: {
        "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.xls"`,
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      },
    });
  }

  return new Response(toCsv(getReportRows(payload)), {
    headers: {
      "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

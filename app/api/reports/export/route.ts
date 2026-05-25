import { getSession, isMasterRole } from "@/lib/auth";
import { chromium } from "playwright";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import {
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toExcelHtml(title: string, payload: ExportPayload) {
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

function toPdfHtml(title: string, payload: ExportPayload) {
  const reportRows = payload.reports
    .map(
      (report, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(report.taskName || report.projectName)}</td>
        <td>${escapeHtml(report.departmentName)}</td>
        <td>${escapeHtml(report.reporter)}</td>
        <td>${escapeHtml(`${report.reportedQuantity} ${report.measurementUnit}`.trim())}</td>
        <td>${escapeHtml(report.submittedAt)}</td>
        <td>${escapeHtml(report.stateLabel)}</td>
        <td>${report.imageCount}</td>
        <td>${report.audioCount}</td>
      </tr>`,
    )
    .join("");
  const detailBlocks = payload.reports
    .slice(0, 20)
    .map(
      (report, index) => `<section class="detail-block">
        <h2>${index + 1}. ${escapeHtml(report.taskName || report.projectName)}</h2>
        <div class="meta-grid">
          <div><strong>Төсөл:</strong> ${escapeHtml(report.projectName)}</div>
          <div><strong>Хэлтэс:</strong> ${escapeHtml(report.departmentName)}</div>
          <div><strong>Илгээгч:</strong> ${escapeHtml(report.reporter)}</div>
          <div><strong>Огноо:</strong> ${escapeHtml(report.submittedAt)}</div>
          <div><strong>Хэмжээ:</strong> ${escapeHtml(`${report.reportedQuantity} ${report.measurementUnit}`.trim())}</div>
          <div><strong>Хавсралт:</strong> ${report.imageCount} зураг, ${report.audioCount} аудио</div>
        </div>
        <p>${escapeHtml(report.summary || "Тайлангийн нэмэлт тайлбар ороогүй байна.")}</p>
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body {
      color: #102016;
      font-family: Arial, "Noto Sans", sans-serif;
      font-size: 10pt;
      line-height: 1.35;
      margin: 0;
    }
    h1 { margin: 0 0 8px; font-size: 18pt; text-align: center; }
    h2 { margin: 12px 0 6px; font-size: 12pt; }
    .report-meta {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 10px 0 14px;
    }
    .metric {
      border: 1px solid #b9c7bd;
      border-radius: 8px;
      padding: 8px;
      background: #f4faf5;
    }
    .metric span { display: block; color: #4d5c52; font-size: 8pt; }
    .metric strong { display: block; margin-top: 2px; font-size: 14pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #9aa8a0; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #e8f3ea; font-weight: 700; }
    .detail-block {
      break-inside: avoid;
      border: 1px solid #c6d2ca;
      border-radius: 8px;
      margin-top: 10px;
      padding: 8px 10px;
    }
    .detail-block p { margin: 6px 0 0; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 12px;
      color: #25342b;
      font-size: 9pt;
    }
    .muted { color: #5f6f65; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="muted">Хамрах хүрээ: ${escapeHtml(payload.scope)} · Үүсгэсэн: ${escapeHtml(payload.generatedAt)}</div>
  <div class="report-meta">
    <div class="metric"><span>Тайлан</span><strong>${payload.summary.reports}</strong></div>
    <div class="metric"><span>Ажил</span><strong>${payload.summary.tasks}</strong></div>
    <div class="metric"><span>Хяналт хүлээж буй</span><strong>${payload.summary.reviewItems}</strong></div>
    <div class="metric"><span>Хавсралт</span><strong>${payload.summary.images} зураг / ${payload.summary.audios} аудио</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Тайлан</th>
        <th>Хэлтэс</th>
        <th>Илгээгч</th>
        <th>Хэмжээ</th>
        <th>Огноо</th>
        <th>Төлөв</th>
        <th>Зураг</th>
        <th>Аудио</th>
      </tr>
    </thead>
    <tbody>${reportRows || '<tr><td colspan="9">Тайлан олдсонгүй.</td></tr>'}</tbody>
  </table>
  ${detailBlocks}
</body>
</html>`;
}

async function renderPdf(html: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm",
      },
    });
  } finally {
    await browser.close();
  }
}

function buildExportPayload(
  snapshot: MunicipalSnapshot,
  request: Request,
  scopedDepartmentName: string | null,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
) {
  const searchParams = new URL(request.url).searchParams;
  const requestedDepartment = getParam(searchParams, "department");
  const requestedUnit = getParam(searchParams, "unit");
  const requestedReportId = Number(getParam(searchParams, "reportId"));
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

  let reports = scopedDepartmentName
    ? filterByDepartment(snapshot.reports, scopedDepartmentName)
    : snapshot.reports.filter((report) => matchesSelectedDepartment(report.departmentName));
  let tasks = scopedDepartmentName
    ? filterByDepartment(snapshot.taskDirectory, scopedDepartmentName)
    : snapshot.taskDirectory.filter((task) => matchesSelectedDepartment(task.departmentName));
  let reviewQueue = scopedDepartmentName
    ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
    : snapshot.reviewQueue.filter((item) => matchesSelectedDepartment(item.departmentName));

  if (isMasterRole(session.role)) {
    const candidateProjects = scopedDepartmentName
      ? filterByDepartment(snapshot.projects, scopedDepartmentName)
      : snapshot.projects.filter((project) => matchesSelectedDepartment(project.departmentName));
    const masterTasks = filterTasksForResponsibleMaster(tasks, candidateProjects, session);
    const masterProjects = filterProjectsForResponsibleMaster(candidateProjects, masterTasks, session);
    const masterProjectIds = new Set(masterProjects.map((project) => project.id));
    const masterTaskIds = new Set(masterTasks.map((task) => task.id));

    tasks = masterTasks;
    reviewQueue = filterTasksForResponsibleMaster(reviewQueue, masterProjects, session);
    reports = reports.filter((report) =>
      session.role === "senior_master"
        ? masterProjectIds.has(report.projectId ?? -1)
        : masterTaskIds.has(report.taskId ?? -1),
    );
  }

  if (Number.isFinite(requestedReportId) && requestedReportId > 0) {
    reports = reports.filter((report) => report.id === requestedReportId);
    const selectedTaskIds = new Set(
      reports
        .map((report) => report.taskId)
        .filter((taskId): taskId is number => typeof taskId === "number"),
    );
    const selectedProjectIds = new Set(
      reports
        .map((report) => report.projectId)
        .filter((projectId): projectId is number => typeof projectId === "number"),
    );

    tasks = tasks.filter(
      (task) =>
        selectedTaskIds.has(task.id) ||
        (typeof task.projectId === "number" && selectedProjectIds.has(task.projectId)),
    );
    reviewQueue = reviewQueue.filter(
      (item) =>
        selectedTaskIds.has(item.id) ||
        (typeof item.projectId === "number" && selectedProjectIds.has(item.projectId)),
    );
  }

  return {
    generatedAt: snapshot.generatedAt,
    scope: reports.length === 1
      ? reports[0].taskName || reports[0].projectName
      : scopedDepartmentName || selectedUnit || selectedGroup?.name || "Бүх хэлтэс",
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
  const scopedDepartmentName = canViewAllWorkspaceReports(session)
    ? null
    : await loadSessionDepartmentName(session);
  const payload = buildExportPayload(snapshot, request, scopedDepartmentName, session);
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

  if (format === "pdf") {
    const buffer = await renderPdf(toPdfHtml("Хот тохижилтын тайлан", payload));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.pdf"`,
        "Content-Type": "application/pdf",
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

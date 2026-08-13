import { chromium } from "playwright";

import { canAccessAutoBaseOverview, getSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { buildReportWorkbook, type XlsxSection } from "@/lib/report-xlsx";
import { WastePointsApiError } from "@/lib/waste-points/api";
import { buildWasteReport } from "@/lib/waste-points/service";
import { groupTaskRows, loadWasteTaskRows } from "@/lib/waste-points/task-report";
import {
  WASTE_STATUS_LABELS,
  WASTE_TYPE_LABELS,
  formatGps,
  type WastePointStatus,
  type WastePointType,
} from "@/lib/waste-points/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getParam(sp: URLSearchParams, key: string) {
  return sp.get(key)?.trim() ?? "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderPdf(html: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", right: "10mm", bottom: "14mm", left: "10mm" },
    });
  } finally {
    await browser.close();
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, scopedDepartmentName)) {
    return Response.json({ error: "Эрх хүрэлцэхгүй байна." }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const dateFromRaw = getParam(sp, "dateFrom");
  const dateToRaw = getParam(sp, "dateTo");
  const query = {
    type: (getParam(sp, "type") || "all") as WastePointType | "all",
    khoroo: getParam(sp, "khoroo") || "all",
    status: (getParam(sp, "status") || "all") as WastePointStatus | "all",
    dateFrom: DATE_RE.test(dateFromRaw) ? dateFromRaw : "",
    dateTo: DATE_RE.test(dateToRaw) ? dateToRaw : "",
  };
  const format = getParam(sp, "format") || "excel";

  let report: Awaited<ReturnType<typeof buildWasteReport>>;
  let taskRows: Awaited<ReturnType<typeof loadWasteTaskRows>>;
  try {
    [report, taskRows] = await Promise.all([
      buildWasteReport(query),
      loadWasteTaskRows({ dateFrom: query.dateFrom, dateTo: query.dateTo }),
    ]);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof WastePointsApiError
            ? error.friendly
            : "Тайлангийн мэдээллийг татаж чадсангүй.",
      },
      { status: 502 },
    );
  }
  const byVehicle = groupTaskRows(taskRows, "vehicle");
  const byDriver = groupTaskRows(taskRows, "driver");

  const scopeParts = [
    query.khoroo !== "all" ? query.khoroo : "Бүх хороо",
    query.type !== "all" ? WASTE_TYPE_LABELS[query.type as WastePointType] : "Бүх төрөл",
    query.status !== "all" ? WASTE_STATUS_LABELS[query.status as WastePointStatus] : "Бүх төлөв",
    query.dateFrom || query.dateTo ? `${query.dateFrom || "…"} — ${query.dateTo || "…"}` : "Бүх хугацаа",
  ];
  const title = "Хогийн цэгийн тайлан";

  if (format === "excel" || format === "xlsx") {
    const sections: XlsxSection[] = [
      {
        caption: "Хороогоор",
        headers: ["Хороо", "Цэгийн тоо", "Дундаж дүүргэлт (%)", "Дүүрсэн", "Багтаамж (л)"],
        rows: report.byKhoroo.map((g) => [g.label, g.count, g.avgFill, g.fullCount, g.capacity]),
        columnWidths: [16, 12, 18, 10, 14],
      },
      {
        caption: "Төрлөөр",
        headers: ["Төрөл", "Тоо", "Дундаж дүүргэлт (%)", "Дүүрсэн"],
        rows: report.byType.map((g) => [g.label, g.count, g.avgFill, g.fullCount]),
        columnWidths: [28, 10, 18, 10],
      },
      {
        caption: "Төлөвөөр",
        headers: ["Төлөв", "Тоо", "Дундаж дүүргэлт (%)"],
        rows: report.byStatus.map((g) => [g.label, g.count, g.avgFill]),
        columnWidths: [20, 10, 18],
      },
      {
        caption: "Машин, жолоочоор (ERP ажил)",
        headers: ["Ангилал", "Утга", "Ажлын тоо"],
        rows: [
          ...byVehicle.map((g) => ["Машин", g.label, g.count]),
          ...byDriver.map((g) => ["Жолооч", g.label, g.count]),
        ],
        columnWidths: [12, 30, 12],
      },
      {
        caption: "Дэлгэрэнгүй жагсаалт",
        headers: [
          "№",
          "Код",
          "Нэр",
          "Хороо",
          "Хаяг",
          "Төрөл",
          "GPS",
          "Савны төрөл",
          "Багтаамж (л)",
          "Дүүргэлт (%)",
          "Төлөв",
          "Шинэчилсэн",
        ],
        rows: report.points.map((p, i) => [
          i + 1,
          p.code,
          p.name,
          p.khorooName,
          p.address,
          WASTE_TYPE_LABELS[p.type],
          formatGps(p.latitude, p.longitude),
          p.containerType,
          p.capacity,
          p.currentFillLevel,
          WASTE_STATUS_LABELS[p.currentStatus],
          p.updatedAt.slice(0, 10),
        ]),
        columnWidths: [4, 12, 30, 12, 34, 18, 22, 20, 12, 12, 12, 12],
      },
    ];

    const buffer = await buildReportWorkbook({
      title,
      meta: [
        { label: "Хамрах хүрээ", value: scopeParts.join(" · ") },
        { label: "Нийт цэг", value: String(report.total) },
        { label: "Дүүрсэн", value: String(report.fullCount) },
        { label: "Дундаж дүүргэлт", value: `${report.avgFill}%` },
        { label: "ERP ажил", value: String(taskRows.length) },
      ],
      sections,
      sheetName: "Хогийн цэг",
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="hogiin-tseg-tailan.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }

  // --- PDF ---
  const row = (cells: (string | number)[], tag: "td" | "th" = "td") =>
    `<tr>${cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  @page { size: A4; margin: 14mm 10mm; }
  body { color: #111; font-family: Arial, sans-serif; font-size: 12pt; }
  h1 { font-size: 16pt; text-align: center; margin: 0 0 4px; }
  .scope { text-align: center; color: #475569; font-size: 12pt; margin: 0 0 14px; }
  h2 { font-size: 14pt; margin: 16px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #94a3b8; padding: 5px 7px; text-align: left; }
  th { background: #e8f3ea; font-size: 12pt; }
  .cards { display: flex; gap: 8px; margin-bottom: 10px; }
  .card { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; }
  .card b { display: block; font-size: 16pt; }
  .card span { font-size: 12pt; color: #475569; }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="scope">${escapeHtml(scopeParts.join(" · "))}</p>
  <div class="cards">
    <div class="card"><b>${report.total}</b><span>Нийт цэг</span></div>
    <div class="card"><b>${report.fullCount}</b><span>Дүүрсэн</span></div>
    <div class="card"><b>${report.avgFill}%</b><span>Дундаж дүүргэлт</span></div>
    <div class="card"><b>${report.totalCapacity.toLocaleString("mn-MN")}</b><span>Багтаамж (л)</span></div>
    <div class="card"><b>${taskRows.length}</b><span>ERP ажил</span></div>
  </div>

  <h2>Хороогоор</h2>
  <table>
    <thead>${row(["Хороо", "Цэг", "Дундаж дүүргэлт", "Дүүрсэн", "Багтаамж (л)"], "th")}</thead>
    <tbody>${report.byKhoroo.map((g) => row([g.label, g.count, `${g.avgFill}%`, g.fullCount, g.capacity.toLocaleString("mn-MN")])).join("")}</tbody>
  </table>

  <h2>Төрөл ба төлөвөөр</h2>
  <table>
    <thead>${row(["Ангилал", "Утга", "Тоо", "Дундаж дүүргэлт"], "th")}</thead>
    <tbody>${[
      ...report.byType.map((g) => row(["Төрөл", g.label, g.count, `${g.avgFill}%`])),
      ...report.byStatus.map((g) => row(["Төлөв", g.label, g.count, `${g.avgFill}%`])),
    ].join("")}</tbody>
  </table>

  <h2>Машин, жолоочоор (ERP ажил)</h2>
  <table>
    <thead>${row(["Ангилал", "Утга", "Ажлын тоо"], "th")}</thead>
    <tbody>${
      taskRows.length
        ? [
            ...byVehicle.map((g) => row(["Машин", g.label, g.count])),
            ...byDriver.map((g) => row(["Жолооч", g.label, g.count])),
          ].join("")
        : `<tr><td colspan="3">Сонгосон хугацаанд ажил үүсээгүй.</td></tr>`
    }</tbody>
  </table>
</body></html>`;

  const buffer = await renderPdf(html);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="hogiin-tseg-tailan.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

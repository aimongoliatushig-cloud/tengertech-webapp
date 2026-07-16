import { chromium } from "playwright";

import { getSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import { buildReportWorkbook, type XlsxSection } from "@/lib/report-xlsx";
import {
  EVAL_CRITERIA,
  EVAL_MAX_TOTAL,
  isValidEvalMonth,
  loadEvalMonth,
  rowTotal,
  summarizeEval,
} from "@/lib/road-cleaning-evaluation";
import {
  canManageEvaluation,
  resolveEvalDepartmentName,
} from "@/app/reports/evaluation/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthLabel(month: string) {
  return `${Number(month.slice(5, 7))}-р сар`;
}

function monthEndDate(month: string) {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const lastDay = new Date(year, mon, 0).getDate();
  return `${year}.${String(mon).padStart(2, "0")}.${String(lastDay).padStart(2, "0")}`;
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
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
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

  const canViewAll = canViewAllWorkspaceReports(session);
  if (!canManageEvaluation(session) && !canViewAll) {
    return Response.json({ error: "Эрх хүрэлцэхгүй байна." }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const departmentName = resolveEvalDepartmentName({
    scopedDepartmentName,
    canViewAll,
    requestedDepartment: getParam(searchParams, "department"),
  });
  const month = getParam(searchParams, "month");
  if (!isValidEvalMonth(month)) {
    return Response.json({ error: "Сар буруу байна." }, { status: 400 });
  }
  const format = getParam(searchParams, "format") || "pdf";

  const data = await loadEvalMonth(departmentName, month);
  const rows = data?.rows ?? [];
  const summary = summarizeEval(rows);
  const evaluatorOrg = data?.evaluatorOrg || "«Хотын хөгжлийг дэмжих шинэ тосгон холбоо»";
  const evaluatorName = data?.evaluatorName || "Б.Жаргал";
  const fileBase = `zam-tailbain-tsevergee-unelgee-${month}`;
  const title = `ХАН-УУЛ ТҮТ ОНӨААТҮГ-ийн зам талбайн цэвэрлэгээний ${monthLabel(month)}ын гүйцэтгэлийн үнэлгээ`;

  if (format === "excel" || format === "xlsx") {
    const sections: XlsxSection[] = [
      {
        caption: "Гүйцэтгэлийн үнэлгээ",
        headers: [
          "№",
          "Гудамж, талбайн нэршил",
          "Эхлэл, төгсгөлийн цэгийн байршил",
          "Талбай /м²/",
          ...EVAL_CRITERIA.map((c) => `${c.label} /${c.max}/`),
          `Нийт оноо /${EVAL_MAX_TOTAL}/`,
        ],
        rows: rows.map((row, index) => [
          index + 1,
          row.location,
          row.segment,
          row.areaM2,
          ...EVAL_CRITERIA.map((c) => row.scores[c.key] ?? 0),
          rowTotal(row),
        ]),
        columnWidths: [4, 24, 34, 12, ...EVAL_CRITERIA.map(() => 12), 12],
      },
    ];
    const buffer = await buildReportWorkbook({
      title,
      meta: [
        { label: "Хэлтэс", value: departmentName },
        { label: "Тайлант сар", value: month },
        { label: "Нийт талбай /м²/", value: String(summary.totalArea) },
        { label: "Дундаж оноо", value: `${summary.averageScore}/${EVAL_MAX_TOTAL}` },
        { label: "Үнэлгээ өгсөн", value: `${evaluatorOrg} (${evaluatorName})` },
      ],
      sections,
      sheetName: "Үнэлгээ",
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }

  // PDF — албан загварын дагуу
  const bodyRows = rows.length
    ? rows
        .map(
          (row, index) => `<tr>
        <td class="c">${index + 1}</td>
        <td>${escapeHtml(row.location)}</td>
        <td class="seg">${escapeHtml(row.segment)}</td>
        <td class="num">${row.areaM2.toLocaleString("mn-MN")}</td>
        ${EVAL_CRITERIA.map((c) => `<td class="num">${(row.scores[c.key] ?? 0).toFixed(2)}</td>`).join("")}
        <td class="num total">${rowTotal(row).toFixed(2)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="${EVAL_CRITERIA.length + 5}">Энэ сард үнэлгээ оруулаагүй байна.</td></tr>`;

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  body { color: #111; font-family: Arial, "Noto Sans", sans-serif; font-size: 8.5pt; }
  .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .head h1 { font-size: 11pt; margin: 0; font-weight: 700; }
  .head .date { font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #333; padding: 4px 5px; vertical-align: top; word-wrap: break-word; }
  th { font-size: 7.6pt; text-align: center; vertical-align: middle; background: #f2f7f3; }
  td { font-size: 8.2pt; }
  td.c { text-align: center; }
  td.num { text-align: center; font-variant-numeric: tabular-nums; }
  td.total { font-weight: 700; }
  td.seg { font-size: 7.6pt; }
  .max { display: block; color: #15803d; font-weight: 700; }
  .signs { display: flex; justify-content: space-between; margin-top: 22px; font-size: 9pt; }
  .signs .block { width: 48%; }
  .signs .role { margin: 0 0 14px; font-weight: 600; }
  .signs .line { margin: 0; }
</style></head>
<body>
  <div class="head">
    <h1>${escapeHtml(title)}</h1>
    <span class="date">${escapeHtml(monthEndDate(month))}</span>
  </div>
  <table>
    <colgroup>
      <col style="width:3%" /><col style="width:11%" /><col style="width:17%" /><col style="width:7%" />
      ${EVAL_CRITERIA.map(() => `<col style="width:${Math.floor(55 / EVAL_CRITERIA.length)}%" />`).join("")}
      <col style="width:6%" />
    </colgroup>
    <thead><tr>
      <th>№</th>
      <th>Гудамж, талбайн нэршил</th>
      <th>Эхлэл, төгсгөлийн цэгийн байршил</th>
      <th>Талбай /м²/<span class="max">Нийт: ${summary.totalArea.toLocaleString("mn-MN")}</span></th>
      ${EVAL_CRITERIA.map((c) => `<th>${escapeHtml(c.label)}<span class="max">/${c.max}/</span></th>`).join("")}
      <th>Нийт оноо<span class="max">/${EVAL_MAX_TOTAL}/</span></th>
    </tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="signs">
    <div class="block">
      <p class="role">ҮНЭЛГЭЭ ӨГСӨН: ${escapeHtml(evaluatorOrg)}</p>
      <p class="line">ТББ-ЫН ТЭРГҮҮН: __________________ / ${escapeHtml(evaluatorName)} /</p>
    </div>
    <div class="block">
      <p class="role">ҮНЭЛГЭЭГ ХҮЛЭЭН ЗӨВШӨӨРСӨН: ХАН-УУЛ ТҮТ ОНӨААТҮГ</p>
      <p class="line">ЗАХИРАЛ: __________________ / ________________ /</p>
    </div>
  </div>
</body></html>`;

  const buffer = await renderPdf(html);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${fileBase}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

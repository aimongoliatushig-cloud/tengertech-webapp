import { getSession, isMasterRole } from "@/lib/auth";
import { chromium } from "playwright";
import pptxgen from "pptxgenjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
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
import { executeOdooKw, loadMunicipalSnapshot } from "@/lib/odoo";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import { buildReportWorkbook, type XlsxSection } from "@/lib/report-xlsx";
import { buildReportDocx } from "@/lib/report-docx";
import {
  REPORT_ORG,
  REPORT_SIGNATURES,
  loadReportEmblemDataUrl,
  loadReportLogoDataUrl,
} from "@/lib/report-document";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MunicipalSnapshot = Awaited<ReturnType<typeof loadMunicipalSnapshot>>;
type ReportRow = MunicipalSnapshot["reports"][number];
type TaskRow = MunicipalSnapshot["taskDirectory"][number];
type ReviewRow = MunicipalSnapshot["reviewQueue"][number];
type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

type AttachmentPayload = {
  id: number;
  name?: string | false;
  mimetype?: string | false;
  datas?: string | false;
};

type ExportPayload = {
  generatedAt: string;
  scope: string;
  note?: string;
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

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_STATUS_FILTER_KEYS = new Set(["progress", "review", "done", "problem"]);

function getParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function getDateParam(searchParams: URLSearchParams, key: string) {
  const date = getParam(searchParams, key);
  return DATE_PARAM_PATTERN.test(date) ? date : "";
}

function extractReportDateKey(report: Pick<ReportRow, "submittedAt" | "submittedDateKey" | "taskName">) {
  if (report.submittedDateKey && DATE_PARAM_PATTERN.test(report.submittedDateKey)) {
    return report.submittedDateKey;
  }

  if (report.submittedAt.startsWith("Өнөөдөр")) {
    return getTodayDateKey();
  }

  return (
    report.submittedAt.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
    report.taskName.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
    ""
  );
}

function isReportInPeriod(
  report: Pick<ReportRow, "submittedAt" | "submittedDateKey" | "taskName" | "taskDateKey">,
  startDate: string,
  endDate: string,
  dateBasis: "report" | "task" = "report",
) {
  if (!startDate && !endDate) {
    return true;
  }

  // Даалгаврын огноогоор шүүхэд даалгаврын эхлэх/товлосон огноог хэрэглэнэ.
  const reportDate =
    dateBasis === "task" && report.taskDateKey && DATE_PARAM_PATTERN.test(report.taskDateKey)
      ? report.taskDateKey
      : extractReportDateKey(report);
  if (!reportDate) {
    return false;
  }

  if (startDate && reportDate < startDate) {
    return false;
  }

  if (endDate && reportDate > endDate) {
    return false;
  }

  return true;
}

function formatReportPeriodScope(startDate: string, endDate: string) {
  if (startDate && endDate) {
    return startDate === endDate ? `${startDate} өдөр` : `${startDate} - ${endDate}`;
  }
  if (startDate) {
    return `${startDate}-с хойш`;
  }
  if (endDate) {
    return `${endDate} хүртэл`;
  }
  return "";
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

function nl2br(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

const REPORT_DOC_TITLE = "Ажлын гүйцэтгэлийн тайлан";

function buildWorkReportDoc(payload: ExportPayload): {
  meta: { label: string; value: string }[];
  sections: XlsxSection[];
} {
  return {
    meta: [
      { label: "Хамрах хүрээ", value: payload.scope },
      { label: "Тайлан гаргасан огноо", value: payload.generatedAt },
      ...(payload.note ? [{ label: "Дүгнэлт", value: payload.note }] : []),
    ],
    sections: [
      {
        caption: "Нэгтгэл үзүүлэлт",
        headers: ["Үзүүлэлт", "Дүн"],
        rows: [
          ["Нийт тайлан", payload.summary.reports],
          ["Нийт ажил", payload.summary.tasks],
          ["Хяналт хүлээж буй", payload.summary.reviewItems],
          ["Хугацаа хэтэрсэн ажил", payload.summary.overdueTasks],
          ["Хавсаргасан зураг", payload.summary.images],
          ["Аудио бичлэг", payload.summary.audios],
        ],
        columnWidths: [34, 14],
      },
      {
        caption: "Ажлын тайлангийн дэлгэрэнгүй",
        headers: ["№", "Ажил", "Төсөл", "Хэлтэс", "Илгээсэн", "Тоо хэмжээ", "Нэгж", "Зураг", "Аудио", "Огноо", "Тайлбар"],
        rows: payload.reports.map((report, index) => [
          index + 1,
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
        columnWidths: [5, 28, 20, 18, 16, 11, 9, 8, 8, 16, 40],
      },
      {
        caption: "Ажлын жагсаалт",
        headers: ["№", "Ажил", "Төсөл", "Хэлтэс", "Төлөв", "Хариуцагч", "Явц", "Дуусах хугацаа", "Гүйцэтгэл", "Үлдэгдэл"],
        rows: payload.tasks.map((task, index) => [
          index + 1,
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
        columnWidths: [5, 28, 20, 18, 16, 16, 8, 16, 14, 14],
      },
    ],
  };
}

function reportNarrative(report: ReportRow) {
  return String(report.text || report.summary || "").trim() || "Ажил хийсэн тайлбар оруулаагүй.";
}

// "Даалгавар: ..." болон "Гүйцэтгэсэн хэмжээ:" хэсгийг хасч, хийсэн ажлын тайлбарыг гаргана.
function cleanReportNarrative(report: ReportRow) {
  const raw = String(report.text || report.summary || "").trim();
  if (!raw) {
    return "Ажил хийсэн тайлбар оруулаагүй.";
  }
  const blocks = raw
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const kept = blocks.filter(
    (block) => !/^Даалгавар\s*:/i.test(block) && !/^Гүйцэтгэсэн хэмжээ/i.test(block),
  );
  return (kept.length ? kept : blocks).join("\n\n").trim() || raw;
}

async function loadLogoDataUrl() {
  const logo = await readFile(path.join(process.cwd(), "public", "logo.png")).catch(() => null);
  return logo ? `data:image/png;base64,${logo.toString("base64")}` : "";
}

async function loadReportImagePayloads(
  reports: ReportRow[],
  credentials: { login: string; password: string },
) {
  const imageIds = Array.from(
    new Set(reports.flatMap((report) => report.images.map((image) => image.id))),
  );

  if (!imageIds.length) {
    return new Map<number, AttachmentPayload>();
  }

  const attachments = await executeOdooKw<AttachmentPayload[]>(
    "ir.attachment",
    "search_read",
    [[["id", "in", imageIds]]],
    {
      fields: ["name", "mimetype", "datas"],
      limit: imageIds.length,
    },
    credentials,
  ).catch((error) => {
    console.warn("Report export images could not be loaded:", error);
    return [];
  });

  return new Map(attachments.map((attachment) => [attachment.id, attachment]));
}

function reportPhotoGrid(report: ReportRow, imagePayloads: Map<number, AttachmentPayload>) {
  const photos = report.images
    .map((image) => {
      const attachment = imagePayloads.get(image.id);
      if (!attachment?.datas) {
        return "";
      }

      return `<figure class="photo"><img src="data:${
        attachment.mimetype || "image/jpeg"
      };base64,${attachment.datas}" alt="Тайлангийн зураг" /></figure>`;
    })
    .filter(Boolean)
    .join("");

  return photos ? `<div class="photo-grid">${photos}</div>` : '<p class="muted">Зураг хавсаргаагүй.</p>';
}

function toPptxText(value: unknown, fallback = "") {
  return String(value ?? fallback)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function clampPptxText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function reportImageDataUrls(report: ReportRow, imagePayloads: Map<number, AttachmentPayload>) {
  return report.images
    .map((image) => {
      const attachment = imagePayloads.get(image.id);
      if (!attachment?.datas) {
        return "";
      }

      return `data:${attachment.mimetype || "image/jpeg"};base64,${attachment.datas}`;
    })
    .filter(Boolean);
}

async function renderPptx(
  title: string,
  payload: ExportPayload,
  imagePayloads: Map<number, AttachmentPayload>,
  logoDataUrl: string,
) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "TengerTech";
  pptx.company = "Хот тохижилт";
  pptx.subject = title;
  pptx.title = title;
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
  };

  const addHeader = (slide: PptxSlide) => {
    if (logoDataUrl) {
      slide.addImage({ data: logoDataUrl, x: 0.45, y: 0.25, w: 0.48, h: 0.48 });
    }
    slide.addText(title, {
      x: 1.05,
      y: 0.26,
      w: 11.7,
      h: 0.45,
      fontFace: "Arial",
      fontSize: 18,
      bold: true,
      color: "111111",
      margin: 0,
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.45,
      y: 0.92,
      w: 12.4,
      h: 0,
      line: { color: "DDE9DF", width: 1 },
    });
  };

  const reports = payload.reports.slice(0, 30);

  if (!reports.length) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addHeader(slide);
    slide.addText("Тайлан олдсонгүй.", {
      x: 0.55,
      y: 1.45,
      w: 12.1,
      h: 0.5,
      fontSize: 18,
      bold: true,
      color: "25342B",
    });
  }

  reports.forEach((report, reportIndex) => {
    const narrative = clampPptxText(
      toPptxText(reportNarrative(report), "Ажил хийсэн тайлбар оруулаагүй."),
      1100,
    );
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    addHeader(slide);
    slide.addText(`${reportIndex + 1}. Ажил хийсэн тайлбар`, {
      x: 0.55,
      y: 1.18,
      w: 12.1,
      h: 0.42,
      fontSize: 17,
      bold: true,
      color: "111111",
      margin: 0,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.55,
      y: 1.78,
      w: 12.2,
      h: 2.35,
      fill: { color: "F6FAF7" },
      line: { color: "D6E4DA", width: 1 },
    });
    slide.addText(narrative, {
      x: 0.78,
      y: 2.0,
      w: 11.74,
      h: 1.9,
      fontSize: 15,
      color: "1F2D24",
      breakLine: false,
      fit: "shrink",
      valign: "top",
      margin: 0.04,
    });

    const photos = reportImageDataUrls(report, imagePayloads);
    if (!photos.length) {
      slide.addText("Зураг хавсаргаагүй.", {
        x: 0.62,
        y: 4.55,
        w: 11.9,
        h: 0.42,
        fontSize: 13,
        color: "56665C",
      });
      return;
    }

    let imageSlide: PptxSlide | null = null;
    photos.forEach((photo, photoIndex) => {
      const position = photoIndex % 4;
      if (position === 0) {
        imageSlide = pptx.addSlide();
        imageSlide.background = { color: "FFFFFF" };
        addHeader(imageSlide);
        imageSlide.addText(`${reportIndex + 1}. Зураг`, {
          x: 0.55,
          y: 1.18,
          w: 12.1,
          h: 0.42,
          fontSize: 17,
          bold: true,
          color: "111111",
          margin: 0,
        });
      }

      if (!imageSlide) {
        return;
      }

      const col = position % 2;
      const row = Math.floor(position / 2);
      const x = 0.55 + col * 6.15;
      const y = 1.78 + row * 2.55;
      imageSlide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w: 5.82,
        h: 2.25,
        fill: { color: "FFFFFF" },
        line: { color: "D6D6D6", width: 1 },
      });
      imageSlide.addImage({
        data: photo,
        x: x + 0.08,
        y: y + 0.08,
        w: 5.66,
        h: 2.09,
        sizing: { type: "contain", x: x + 0.08, y: y + 0.08, w: 5.66, h: 2.09 },
        altText: "Тайлангийн зураг",
      });
    });
  });

  const output = await pptx.write({ outputType: "nodebuffer", compression: true });
  return Buffer.from(output as Uint8Array);
}

function toOfficialPdfHtml(
  title: string,
  payload: ExportPayload,
  imagePayloads: Map<number, AttachmentPayload>,
  emblemDataUrl: string,
  logoDataUrl: string,
) {
  const year = new Date().getFullYear();
  const sections = payload.reports
    .slice(0, 30)
    .map(
      (report, index) => `<section class="report ${index > 0 ? "new-page" : ""}">
        <h2 class="report-title">${escapeHtml(report.taskName || report.projectName)}</h2>
        <div class="report-meta">
          <span><b>Хэлтэс:</b> ${escapeHtml(report.departmentName)}</span>
          <span><b>Илгээгч:</b> ${escapeHtml(report.reporter)}</span>
          <span><b>Огноо:</b> ${escapeHtml(report.submittedAt)}</span>
          <span><b>Хэмжээ:</b> ${escapeHtml(`${report.reportedQuantity} ${report.measurementUnit}`.trim())}</span>
        </div>
        <p class="narrative">${nl2br(reportNarrative(report))}</p>
        ${report.images.length ? `<div class="photo-label">Хавсаргасан зураг:</div>${reportPhotoGrid(report, imagePayloads)}` : ""}
      </section>`,
    )
    .join("");

  const signatureRows = REPORT_SIGNATURES.map(
    (sign) =>
      `<div class="sign"><div class="sign-role">${escapeHtml(sign.role)}:</div><div class="sign-line"><span>${escapeHtml(sign.position)}</span><b>${escapeHtml(sign.name)}</b></div></div>`,
  ).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 20mm 15mm 20mm 30mm; }
    body { color: #000; font-family: Arial, "Noto Sans", sans-serif; font-size: 12pt; line-height: 1.5; margin: 0; }
    .logos { display: flex; align-items: center; justify-content: center; gap: 26px; margin-bottom: 4px; }
    .logos .emblem { height: 50px; }
    .logos .eco { height: 40px; }
    .rule { border-bottom: 2px solid #1f7a3f; margin-bottom: 12px; }
    .cover { text-align: center; margin-bottom: 14px; }
    .cover .org { margin: 0; font-weight: bold; font-size: 13pt; }
    .cover h1 { margin: 6px 0; font-size: 15pt; font-weight: bold; text-transform: uppercase; }
    .cover .place { margin: 2px 0; }
    .meta { margin: 14px 0; }
    .meta div { margin-bottom: 2px; }
    .report { break-inside: avoid; margin-bottom: 14px; }
    .new-page { break-before: page; }
    .report-title { margin: 12px 0 8px; text-align: center; text-transform: uppercase; font-size: 12.5pt; font-weight: bold; }
    .report-meta { margin-bottom: 6px; font-size: 12pt; }
    .report-meta span { margin-right: 16px; }
    .narrative { margin: 0 0 8px; text-align: justify; }
    .photo-label { margin: 6px 0 4px; font-weight: bold; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .photo { margin: 0; padding: 3px; border: 1px solid #000; break-inside: avoid; }
    .photo img { display: block; width: 100%; max-height: 220px; object-fit: contain; }
    .signatures { margin-top: 36px; break-inside: avoid; }
    .sign { margin-bottom: 18px; }
    .sign-role { font-weight: bold; }
    .sign-line { display: flex; justify-content: space-between; gap: 16px; }
    .muted { color: #555; }
  </style>
</head>
<body>
  ${
    emblemDataUrl || logoDataUrl
      ? `<div class="logos">${emblemDataUrl ? `<img class="emblem" src="${emblemDataUrl}" alt="" />` : ""}${logoDataUrl ? `<img class="eco" src="${logoDataUrl}" alt="" />` : ""}</div><div class="rule"></div>`
      : ""
  }
  <div class="cover">
    <p class="org">${escapeHtml(REPORT_ORG.name)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="place">${escapeHtml(REPORT_ORG.place)}</p>
    <p class="place">${year} он</p>
  </div>
  <div class="meta">
    <div><b>Хамрах хүрээ:</b> ${escapeHtml(payload.scope)}</div>
    <div><b>Тайлан гаргасан огноо:</b> ${escapeHtml(payload.generatedAt)}</div>
  </div>
  ${sections || '<p class="muted">Тайлан олдсонгүй.</p>'}
  <div class="signatures">${signatureRows}</div>
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
  const requestedStartDate = getDateParam(searchParams, "startDate");
  const requestedEndDate = getDateParam(searchParams, "endDate");
  const selectedStartDate =
    requestedStartDate && requestedEndDate && requestedStartDate > requestedEndDate
      ? requestedEndDate
      : requestedStartDate;
  const selectedEndDate =
    requestedStartDate && requestedEndDate && requestedStartDate > requestedEndDate
      ? requestedStartDate
      : requestedEndDate;
  const requestedStatus = getParam(searchParams, "status");
  const selectedStatus = REPORT_STATUS_FILTER_KEYS.has(requestedStatus) ? requestedStatus : "all";
  const selectedDateBasis: "report" | "task" =
    getParam(searchParams, "basis") === "task" ? "task" : "report";
  const normalizedReportSearchQuery = getParam(searchParams, "q").toLocaleLowerCase("mn-MN");
  const hasReportContentFilter =
    Boolean(selectedStartDate || selectedEndDate || normalizedReportSearchQuery) ||
    selectedStatus !== "all";
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

  reports = reports.filter((report) => {
    if (!isReportInPeriod(report, selectedStartDate, selectedEndDate, selectedDateBasis)) {
      return false;
    }
    if (selectedStatus !== "all" && report.stateBucket !== selectedStatus) {
      return false;
    }
    if (!normalizedReportSearchQuery) {
      return true;
    }

    return [
      report.taskName,
      report.projectName,
      report.departmentName,
      report.reporter,
      report.summary,
      report.stateLabel,
    ].some((value) => value.toLocaleLowerCase("mn-MN").includes(normalizedReportSearchQuery));
  });

  if (Number.isFinite(requestedReportId) && requestedReportId > 0) {
    reports = reports.filter((report) => report.id === requestedReportId);
  }

  if (hasReportContentFilter || (Number.isFinite(requestedReportId) && requestedReportId > 0)) {
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

  const baseScope = reports.length === 1
    ? reports[0].taskName || reports[0].projectName
    : scopedDepartmentName || selectedUnit || selectedGroup?.name || "Бүх хэлтэс";
  const periodScope = formatReportPeriodScope(selectedStartDate, selectedEndDate);

  return {
    generatedAt: snapshot.generatedAt,
    scope: periodScope ? `${baseScope} / ${periodScope}` : baseScope,
    note: getParam(new URL(request.url).searchParams, "note").slice(0, 4000),
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

  // Татаж авах тайлан нь дэлгэц дээрхтэй ижил, шинэлэг байх ёстой.
  const snapshot = await loadMunicipalSnapshot(
    {
      login: session.login,
      password: session.password,
    },
    { skipCache: true },
  );
  const scopedDepartmentName = canViewAllWorkspaceReports(session)
    ? null
    : await loadSessionDepartmentName(session);
  const payload = buildExportPayload(snapshot, request, scopedDepartmentName, session);
  const format = getParam(new URL(request.url).searchParams, "format") || "csv";
  const dateKey = new Date().toISOString().slice(0, 10);

  // Сонгосон зургаар хязгаарлах (imageIds=1,2,3). Хоосон бол бүх зураг.
  const selectedImageIds = getParam(new URL(request.url).searchParams, "imageIds")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (selectedImageIds.length) {
    const allowedImageIds = new Set(selectedImageIds);
    for (const report of payload.reports) {
      report.images = report.images.filter((image) => allowedImageIds.has(image.id));
      report.imageCount = report.images.length;
    }
    payload.summary.images = payload.reports.reduce((sum, report) => sum + report.images.length, 0);
  }

  if (format === "json") {
    return Response.json(payload, {
      headers: {
        "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.json"`,
      },
    });
  }

  if (format === "excel" || format === "xls" || format === "xlsx") {
    const { meta, sections } = buildWorkReportDoc(payload);
    const buffer = await buildReportWorkbook({
      title: REPORT_DOC_TITLE,
      meta,
      sections,
      sheetName: "Ажлын тайлан",
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="ajliin-tailan-${dateKey}.xlsx"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }

  if (format === "word" || format === "docx") {
    const imagePayloads = await loadReportImagePayloads(payload.reports, {
      login: session.login,
      password: session.password,
    });
    const items = payload.reports.map((report) => ({
      title: report.taskName || report.projectName,
      basis: report.projectName,
      department: report.departmentName,
      reporter: report.reporter,
      date: report.submittedAt,
      narrative: cleanReportNarrative(report),
      images: report.images
        .map((image) => imagePayloads.get(image.id))
        .filter((attachment): attachment is NonNullable<typeof attachment> =>
          Boolean(attachment && attachment.datas),
        )
        .map((attachment) => ({
          base64: String(attachment.datas),
          mimetype: String(attachment.mimetype || "image/jpeg"),
        })),
    }));
    const intro = `Тус төв нь тайлант хугацаанд (${payload.scope}) нийт ${items.length} ажлын тайланг нэгтгэн дараах байдлаар тайлагнаж байна:`;
    const buffer = await buildReportDocx({ title: REPORT_DOC_TITLE, intro, items });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="ajliin-tailan-${dateKey}.docx"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  }

  if (format === "pdf") {
    const [imagePayloads, emblemDataUrl, logoDataUrl] = await Promise.all([
      loadReportImagePayloads(payload.reports, {
        login: session.login,
        password: session.password,
      }),
      loadReportEmblemDataUrl(),
      loadReportLogoDataUrl(),
    ]);
    const buffer = await renderPdf(
      toOfficialPdfHtml("Ажлын тайлан", payload, imagePayloads, emblemDataUrl, logoDataUrl),
    );
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.pdf"`,
        "Content-Type": "application/pdf",
      },
    });
  }

  if (format === "pptx") {
    const [imagePayloads, logoDataUrl] = await Promise.all([
      loadReportImagePayloads(payload.reports, {
        login: session.login,
        password: session.password,
      }),
      loadLogoDataUrl(),
    ]);
    const buffer = await renderPptx("Ажлын тайлан", payload, imagePayloads, logoDataUrl);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="municipal-report-${dateKey}.pptx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

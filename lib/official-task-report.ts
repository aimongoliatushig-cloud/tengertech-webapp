import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { chromium } from "playwright";

import { executeOdooKw } from "@/lib/odoo";
import type { TaskDetail, TaskReportFeedItem } from "@/lib/workspace";

type AttachmentPayload = {
  id: number;
  name?: string | false;
  mimetype?: string | false;
  datas?: string | false;
};

type OfficialReportContext = {
  task: TaskDetail;
  selectedReports: TaskReportFeedItem[];
  departmentName?: string;
  reviewerName?: string;
  authorName?: string;
  credentials: {
    login: string;
    password: string;
  };
};

const A4_MARGINS = {
  top: 1134,
  bottom: 1134,
  left: 1701,
  right: 850,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function officialReportFileName(taskId: number, extension: "docx" | "pdf") {
  return `iltgeh_huudas_task_${taskId}_${todayIso()}.${extension}`;
}

function displayDate() {
  return todayIso().replace(/-/g, ".");
}

function cleanText(value?: string | number | null) {
  const text = String(value ?? "").trim();
  return text || "—";
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

async function loadImagePayloads(
  reports: TaskReportFeedItem[],
  credentials: OfficialReportContext["credentials"],
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
  ).catch(() => []);

  return new Map(attachments.map((attachment) => [attachment.id, attachment]));
}

function quantityRows(task: TaskDetail) {
  if (task.quantityLines.length) {
    return task.quantityLines.map((line) => ({
      label: line.unit,
      planned: line.quantity,
      done: line.completedQuantity ?? 0,
    }));
  }

  return [
    {
      label: task.measurementUnit || "нэгж",
      planned: task.plannedQuantity || 0,
      done: task.completedQuantity || 0,
    },
  ];
}

function reportDescription(report: TaskReportFeedItem) {
  return cleanText(report.text || report.summary);
}

function textParagraph(text: string, options: { bold?: boolean; indent?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 160, line: 276 },
    indent: options.indent ? { firstLine: 567 } : undefined,
    children: [
      new TextRun({
        text,
        bold: options.bold,
        font: "Times New Roman",
        size: 24,
      }),
    ],
  });
}

function labelParagraph(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 80, line: 276 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: "Times New Roman", size: 24 }),
      new TextRun({ text: value, font: "Times New Roman", size: 24 }),
    ],
  });
}

function tableCell(text: string, bold = false) {
  return new TableCell({
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "666666" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "666666" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "666666" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "666666" },
    },
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [textParagraph(text, { bold })],
  });
}

export async function generateOfficialTaskDocx(context: OfficialReportContext) {
  const imagePayloads = await loadImagePayloads(context.selectedReports, context.credentials);
  const task = context.task;
  const departmentName = cleanText(context.departmentName);
  const authorName = cleanText(context.authorName || context.selectedReports[0]?.reporter);
  const reviewerName = cleanText(context.reviewerName || task.teamLeaderName);
  const rows = quantityRows(task);
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.TITLE,
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: "ИЛТГЭХ ХУУДАС",
          bold: true,
          font: "Times New Roman",
          size: 32,
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [textParagraph(displayDate())], width: { size: 50, type: WidthType.PERCENTAGE } }),
            new TableCell({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: "Улаанбаатар хот", font: "Times New Roman", size: 24 })],
                }),
              ],
              width: { size: 50, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
      ],
    }),
    textParagraph(
      `${departmentName} нь ${displayDate()} өдрийн байдлаар "${task.name}" ажлын хүрээнд дараах даалгавруудыг хийж гүйцэтгэсэн болно.`,
      { indent: true },
    ),
    labelParagraph("Нийт сонгосон даалгавар", String(context.selectedReports.length)),
    labelParagraph("Гүйцэтгэлийн хувь", `${task.progress}%`),
    labelParagraph("Төлөв", task.stageLabel),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [tableCell("Хэмжих нэгж", true), tableCell("Төлөвлөсөн", true), tableCell("Гүйцэтгэсэн", true)],
        }),
        ...rows.map(
          (row) =>
            new TableRow({
              children: [
                tableCell(cleanText(row.label)),
                tableCell(String(row.planned)),
                tableCell(String(row.done)),
              ],
            }),
        ),
      ],
    }),
  ];

  context.selectedReports.forEach((report, index) => {
    children.push(
      textParagraph(`${index + 1}. ${task.name}`, { bold: true }),
      labelParagraph("Огноо", report.submittedAt),
      labelParagraph("Байршил", "—"),
      labelParagraph("Хариуцсан ажилтан/баг", report.reporter || task.crewTeamName || "—"),
      labelParagraph("Төлөвлөсөн хэмжээ", rows.map((row) => `${row.planned} ${row.label}`).join(", ")),
      labelParagraph("Гүйцэтгэсэн хэмжээ", rows.map((row) => `${row.done} ${row.label}`).join(", ")),
      labelParagraph("Төлөв", task.stageLabel),
      textParagraph("Тайлбар:", { bold: true }),
      textParagraph(reportDescription(report), { indent: true }),
    );

    report.images.forEach((image) => {
      const attachment = imagePayloads.get(image.id);
      if (!attachment?.datas) {
        return;
      }
      children.push(
        new Paragraph({
          spacing: { after: 180 },
          children: [
            new ImageRun({
              data: Buffer.from(attachment.datas, "base64"),
              transformation: { width: 420, height: 300 },
              type: "jpg",
            }),
          ],
        }),
      );
    });
  });

  children.push(
    textParagraph("ТАЙЛАН ГАРГАСАН:", { bold: true }),
    textParagraph(`Албан тушаал ____________________ ${authorName}`),
    textParagraph("ХЯНАСАН:", { bold: true }),
    textParagraph(`Албан тушаал ____________________ ${reviewerName}`),
  );

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: A4_MARGINS,
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function buildOfficialHtml(context: OfficialReportContext, imagePayloads: Map<number, AttachmentPayload>) {
  const task = context.task;
  const rows = quantityRows(task);
  const departmentName = cleanText(context.departmentName);
  const authorName = cleanText(context.authorName || context.selectedReports[0]?.reporter);
  const reviewerName = cleanText(context.reviewerName || task.teamLeaderName);
  const quantityTableRows = rows
    .map(
      (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.planned}</td><td>${row.done}</td></tr>`,
    )
    .join("");
  const reportBlocks = context.selectedReports
    .map((report, index) => {
      const images = report.images
        .map((image) => {
          const attachment = imagePayloads.get(image.id);
          if (!attachment?.datas) {
            return "";
          }
          return `<figure><img src="data:${attachment.mimetype || "image/jpeg"};base64,${attachment.datas}" alt="${escapeHtml(
            attachment.name || image.name,
          )}" /></figure>`;
        })
        .join("");

      return `<section class="work-item">
        <h2>${index + 1}. ${escapeHtml(task.name)}</h2>
        <dl>
          <dt>Огноо</dt><dd>${escapeHtml(report.submittedAt)}</dd>
          <dt>Байршил</dt><dd>—</dd>
          <dt>Хариуцсан ажилтан/баг</dt><dd>${escapeHtml(report.reporter || task.crewTeamName || "—")}</dd>
          <dt>Төлөвлөсөн хэмжээ</dt><dd>${escapeHtml(rows.map((row) => `${row.planned} ${row.label}`).join(", "))}</dd>
          <dt>Гүйцэтгэсэн хэмжээ</dt><dd>${escapeHtml(rows.map((row) => `${row.done} ${row.label}`).join(", "))}</dd>
          <dt>Төлөв</dt><dd>${escapeHtml(task.stageLabel)}</dd>
        </dl>
        <h3>Тайлбар:</h3>
        <p>${nl2br(reportDescription(report))}</p>
        ${images ? `<div class="images">${images}</div>` : ""}
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 2cm 1.5cm 2cm 3cm; }
    body { font-family: "Times New Roman", "Noto Serif", serif; font-size: 12pt; line-height: 1.35; color: #111; }
    h1 { text-align: center; font-size: 16pt; margin: 0 0 18pt; font-weight: 700; }
    h2 { font-size: 12pt; margin: 16pt 0 8pt; font-weight: 700; }
    h3 { font-size: 12pt; margin: 10pt 0 4pt; font-weight: 700; }
    p { margin: 0 0 10pt; text-indent: 1cm; }
    .date-line { display: flex; justify-content: space-between; margin-bottom: 18pt; }
    .summary { margin: 10pt 0 14pt; }
    table { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; }
    th, td { border: 1px solid #444; padding: 5pt 6pt; text-align: left; vertical-align: top; }
    th { font-weight: 700; }
    dl { display: grid; grid-template-columns: 5cm 1fr; gap: 3pt 8pt; margin: 0 0 8pt; }
    dt { font-weight: 700; }
    dd { margin: 0; }
    .work-item { break-inside: avoid; margin-top: 12pt; }
    .images { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-top: 8pt; }
    figure { margin: 0; border: 1px solid #ccc; padding: 4pt; break-inside: avoid; }
    img { max-width: 100%; height: auto; display: block; }
    .signature { margin-top: 28pt; display: grid; gap: 18pt; }
    .signature p { text-indent: 0; font-weight: 700; }
  </style>
</head>
<body>
  <h1>ИЛТГЭХ ХУУДАС</h1>
  <div class="date-line"><span>${displayDate()}</span><span>Улаанбаатар хот</span></div>
  <p>${escapeHtml(departmentName)} нь ${displayDate()} өдрийн байдлаар "${escapeHtml(
    task.name,
  )}" ажлын хүрээнд дараах даалгавруудыг хийж гүйцэтгэсэн болно.</p>
  <div class="summary">
    <div>Нийт сонгосон даалгавар: ${context.selectedReports.length}</div>
    <div>Гүйцэтгэлийн хувь: ${task.progress}%</div>
    <div>Төлөв: ${escapeHtml(task.stageLabel)}</div>
  </div>
  <table>
    <thead><tr><th>Хэмжих нэгж</th><th>Төлөвлөсөн хэмжээ</th><th>Гүйцэтгэсэн хэмжээ</th></tr></thead>
    <tbody>${quantityTableRows}</tbody>
  </table>
  ${reportBlocks}
  <div class="signature">
    <p>ТАЙЛАН ГАРГАСАН:</p>
    <div>Албан тушаал ____________________ ${escapeHtml(authorName)}</div>
    <p>ХЯНАСАН:</p>
    <div>Албан тушаал ____________________ ${escapeHtml(reviewerName)}</div>
  </div>
</body>
</html>`;
}

export async function generateOfficialTaskPdf(context: OfficialReportContext) {
  const imagePayloads = await loadImagePayloads(context.selectedReports, context.credentials);
  const html = buildOfficialHtml(context, imagePayloads);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    return page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "2cm",
        bottom: "2cm",
        left: "3cm",
        right: "1.5cm",
      },
    });
  } finally {
    await browser.close();
  }
}

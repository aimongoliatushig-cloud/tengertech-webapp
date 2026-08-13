import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { chromium } from "playwright";
import pptxgen from "pptxgenjs";
import sharp from "sharp";

import { executeOdooKw } from "@/lib/odoo";
import { REPORT_ORG, REPORT_SIGNATURES } from "@/lib/report-document";
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

type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

const A4_MARGINS = {
  top: 850,
  bottom: 850,
  left: 1134,
  right: 850,
};

const BORDERLESS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
} as const;

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function officialReportFileName(taskId: number, extension: "docx" | "pdf" | "pptx") {
  return `ajliin_tailan_task_${taskId}_${todayIso()}.${extension}`;
}

function cleanText(value?: string | number | null) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
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

function parseIsoDate(value?: string | null) {
  const match = String(value ?? "").match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function contextDate(context: OfficialReportContext) {
  return (
    parseIsoDate(context.task.startDateValue) ??
    parseIsoDate(context.task.scheduledDate) ??
    parseIsoDate(context.task.deadlineValue) ??
    parseIsoDate(context.selectedReports[0]?.submittedAt) ??
    parseIsoDate(todayIso()) ?? { year: new Date().getFullYear(), month: 1, day: 1 }
  );
}

function twoDigit(value: number) {
  return String(value).padStart(2, "0");
}

function longDateText(date: ReturnType<typeof contextDate>) {
  return `${date.year} оны ${twoDigit(date.month)} дугаар сарын ${twoDigit(date.day)}-ны өдрийн`;
}

function coverYear(context: OfficialReportContext) {
  return `${contextDate(context).year} он`;
}

function toUpperMn(value: string) {
  return cleanText(value).toLocaleUpperCase("mn-MN");
}

function findDecreeNumber(context: OfficialReportContext) {
  const source = `${context.task.projectName} ${context.task.name} ${context.task.description}`;
  const match = source.match(/[АA]\s*[.\-/]?\s*(\d{1,5})/i);
  return match?.[1] ?? "";
}

function buildCoverTitle(context: OfficialReportContext) {
  const decreeNumber = findDecreeNumber(context);
  if (decreeNumber) {
    return `ХАН-УУЛ ДҮҮРГИЙН ЗАСАГ ДАРГЫН ${longDateText(contextDate(context)).toLocaleUpperCase(
      "mn-MN",
    )} ${decreeNumber} ДҮГЭЭР ЗАХИРАМЖ ДАГУУ ХОРООНД ХИЙГДСЭН АЖЛЫН ТАЙЛАН`;
  }

  const titleSource = context.task.projectName || context.task.name || "Ажлын тайлан";
  return `${toUpperMn(titleSource)} АЖЛЫН ТАЙЛАН`;
}

function buildWorkTitle(task: TaskDetail) {
  const title = toUpperMn(task.name || task.projectName || "Ажил");
  return title.includes("ТАЙЛАН") ? title : `${title} АЖЛЫН ТАЙЛАН`;
}

function reportDescription(task: TaskDetail, report: TaskReportFeedItem) {
  return cleanText(report.text || report.summary || task.description);
}

function textRun(text: string, options: { bold?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    bold: options.bold,
    font: "Arial",
    size: options.size ?? 24,
  });
}

function paragraph(
  text: string,
  options: {
    bold?: boolean;
    center?: boolean;
    right?: boolean;
    indent?: boolean;
    size?: number;
    before?: number;
    after?: number;
  } = {},
) {
  return new Paragraph({
    alignment: options.center
      ? AlignmentType.CENTER
      : options.right
        ? AlignmentType.RIGHT
        : AlignmentType.LEFT,
    spacing: { before: options.before ?? 0, after: options.after ?? 160, line: 300 },
    indent: options.indent ? { firstLine: 567 } : undefined,
    children: [textRun(text, { bold: options.bold, size: options.size })],
  });
}

function textParagraphs(text: string) {
  return text
    .split(/\r?\n+/)
    .map((line) => cleanText(line))
    .filter((line) => line !== "—")
    .map((line) => paragraph(line, { indent: true, after: 120 }));
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
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

async function reportImageRuns(
  report: TaskReportFeedItem,
  imagePayloads: Map<number, AttachmentPayload>,
): Promise<ImageRun[]> {
  const runs: ImageRun[] = [];
  for (const image of report.images) {
    const attachment = imagePayloads.get(image.id);
    if (!attachment?.datas) {
      continue;
    }

    try {
      // Бүх форматыг (webp, heic, png, эвдэрсэн mimetype г.м) Word найдвартай уншиж
      // чадах JPEG болгон дахин хувиргаж, EXIF эргэлтийг засна.
      const input = Buffer.from(attachment.datas, "base64");
      const data = await sharp(input)
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80 })
        .toBuffer();
      const meta = await sharp(data).metadata();
      const width = meta.width || 270;
      const height = meta.height || 175;
      const scale = Math.min(270 / width, 175 / height, 1);
      runs.push(
        new ImageRun({
          data,
          type: "jpg",
          transformation: {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
          },
        }),
      );
    } catch (error) {
      console.warn("Official report skipped unreadable image attachment.", {
        attachmentId: attachment.id,
        name: attachment.name || image.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return runs;
}

function blankImageCell() {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: BORDERLESS,
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    children: [new Paragraph({ children: [] })],
  });
}

function imageGridTable(images: ImageRun[]) {
  const rows: TableRow[] = [];
  for (let index = 0; index < images.length; index += 2) {
    const pair = images.slice(index, index + 2);
    rows.push(
      new TableRow({
        children: [
          ...pair.map(
            (image) =>
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: BORDERLESS,
                margins: { top: 80, bottom: 80, left: 80, right: 80 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 80 },
                    children: [image],
                  }),
                ],
              }),
          ),
          ...(pair.length === 1 ? [blankImageCell()] : []),
        ],
      }),
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERLESS,
    rows,
  });
}

async function buildDocxChildren(
  context: OfficialReportContext,
  imagePayloads: Map<number, AttachmentPayload>,
) {
  const task = context.task;
  const coverTitle = buildCoverTitle(context);

  const children: Array<Paragraph | Table> = [
    paragraph(REPORT_ORG.name, { center: true, bold: true, size: 24, after: 240 }),
    paragraph(coverTitle, { center: true, bold: true, size: 28, before: 200, after: 520 }),
    paragraph(REPORT_ORG.place, { center: true, bold: true, after: 60 }),
    paragraph(coverYear(context), { center: true, bold: true, after: 0 }),
    pageBreak(),
  ];

  for (let index = 0; index < context.selectedReports.length; index += 1) {
    const report = context.selectedReports[index];
    if (index > 0) {
      children.push(pageBreak());
    }

    children.push(
      paragraph(buildWorkTitle(task), { center: true, bold: true, size: 26, after: 220 }),
      paragraph(`Тайлангийн огноо: ${cleanText(report.submittedAt)}`, { right: true, after: 140 }),
    );

    children.push(...textParagraphs(reportDescription(task, report)));

    const images = await reportImageRuns(report, imagePayloads);
    if (images.length) {
      children.push(imageGridTable(images));
    }
  }

  children.push(paragraph("", { before: 480 }));
  for (const sign of REPORT_SIGNATURES) {
    children.push(
      paragraph(`${sign.role}:`, { bold: true, before: 160, after: 40 }),
      paragraph(`${sign.position}                              ${sign.name}`, { after: 200 }),
    );
  }

  return children;
}

export async function generateOfficialTaskDocx(context: OfficialReportContext) {
  const imagePayloads = await loadImagePayloads(context.selectedReports, context.credentials);
  const children = await buildDocxChildren(context, imagePayloads);
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

function pptxReportImages(
  report: TaskReportFeedItem,
  imagePayloads: Map<number, AttachmentPayload>,
) {
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

function clampPptxText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function addOfficialPptxHeader(
  slide: PptxSlide,
  pptx: InstanceType<typeof pptxgen>,
  title: string,
) {
  slide.addText(title, {
    x: 0.55,
    y: 0.34,
    w: 12.2,
    h: 0.44,
    fontFace: "Arial",
    fontSize: 17,
    bold: true,
    color: "111111",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 0.95,
    w: 12.2,
    h: 0,
    line: { color: "DDE9DF", width: 1 },
  });
}

export async function generateOfficialTaskPptx(context: OfficialReportContext) {
  const imagePayloads = await loadImagePayloads(context.selectedReports, context.credentials);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "TengerTech";
  pptx.company = "Хот тохижилт";
  pptx.subject = "Ажлын тайлан";
  pptx.title = "Ажлын тайлан";
  pptx.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
  };

  const cover = pptx.addSlide();
  cover.background = { color: "FFFFFF" };
  cover.addText(clampPptxText(buildCoverTitle(context), 260), {
    x: 1.0,
    y: 1.55,
    w: 11.35,
    h: 2.25,
    fontFace: "Arial",
    fontSize: 22,
    bold: true,
    color: "111111",
    align: "center",
    valign: "middle",
    fit: "shrink",
  });
  cover.addText("Улаанбаатар хот", {
    x: 1.0,
    y: 4.1,
    w: 11.35,
    h: 0.42,
    fontSize: 17,
    bold: true,
    align: "center",
    color: "111111",
  });
  cover.addText(coverYear(context), {
    x: 1.0,
    y: 6.25,
    w: 11.35,
    h: 0.42,
    fontSize: 17,
    bold: true,
    align: "center",
    color: "111111",
  });

  context.selectedReports.forEach((report, reportIndex) => {
    const title = buildWorkTitle(context.task);
    const narrative = clampPptxText(reportDescription(context.task, report), 1100);
    const detailSlide = pptx.addSlide();
    detailSlide.background = { color: "FFFFFF" };
    addOfficialPptxHeader(detailSlide, pptx, `${reportIndex + 1}. ${title}`);
    detailSlide.addText("Ажил хийсэн тайлбар", {
      x: 0.65,
      y: 1.25,
      w: 12.0,
      h: 0.36,
      fontSize: 16,
      bold: true,
      color: "111111",
      margin: 0,
    });
    detailSlide.addShape(pptx.ShapeType.rect, {
      x: 0.65,
      y: 1.85,
      w: 12.0,
      h: 3.35,
      fill: { color: "F8FAF8" },
      line: { color: "D6E4DA", width: 1 },
    });
    detailSlide.addText(narrative, {
      x: 0.9,
      y: 2.08,
      w: 11.5,
      h: 2.85,
      fontSize: 15,
      color: "1F2D24",
      fit: "shrink",
      valign: "top",
      margin: 0.04,
    });

    const images = pptxReportImages(report, imagePayloads);
    if (!images.length) {
      return;
    }

    let imageSlide: PptxSlide | null = null;
    images.forEach((imageData, imageIndex) => {
      const position = imageIndex % 4;
      if (position === 0) {
        imageSlide = pptx.addSlide();
        imageSlide.background = { color: "FFFFFF" };
        addOfficialPptxHeader(imageSlide, pptx, `${reportIndex + 1}. Зураг`);
      }

      if (!imageSlide) {
        return;
      }

      const col = position % 2;
      const row = Math.floor(position / 2);
      const x = 0.6 + col * 6.12;
      const y = 1.3 + row * 2.75;
      imageSlide.addShape(pptx.ShapeType.rect, {
        x,
        y,
        w: 5.75,
        h: 2.42,
        fill: { color: "FFFFFF" },
        line: { color: "D6D6D6", width: 1 },
      });
      imageSlide.addImage({
        data: imageData,
        x: x + 0.08,
        y: y + 0.08,
        w: 5.59,
        h: 2.26,
        sizing: { type: "contain", x: x + 0.08, y: y + 0.08, w: 5.59, h: 2.26 },
        altText: "Тайлангийн зураг",
      });
    });
  });

  const output = await pptx.write({ outputType: "nodebuffer", compression: true });
  return Buffer.from(output as Uint8Array);
}

function htmlReportImages(report: TaskReportFeedItem, imagePayloads: Map<number, AttachmentPayload>) {
  return report.images
    .map((image) => {
      const attachment = imagePayloads.get(image.id);
      if (!attachment?.datas) {
        return "";
      }

      return `<figure><img src="data:${attachment.mimetype || "image/jpeg"};base64,${
        attachment.datas
      }" alt="Тайлангийн зураг" /></figure>`;
    })
    .filter(Boolean)
    .join("");
}

function buildOfficialHtml(context: OfficialReportContext, imagePayloads: Map<number, AttachmentPayload>) {
  const task = context.task;
  const departmentName = cleanText(context.departmentName);
  const authorName = cleanText(context.authorName || context.selectedReports[0]?.reporter);
  const reviewerName = cleanText(context.reviewerName || task.teamLeaderName);
  const reportBlocks = context.selectedReports
    .map((report, index) => {
      const images = htmlReportImages(report, imagePayloads);
      return `<section class="work-item ${index > 0 ? "new-page" : ""}">
        <h2>${escapeHtml(buildWorkTitle(task))}</h2>
        <div class="date-line report-date"><span></span><span>Тайлангийн огноо: ${escapeHtml(
          cleanText(report.submittedAt),
        )}</span></div>
        <div class="narrative"><p>${nl2br(reportDescription(task, report))}</p></div>
        ${images ? `<div class="images">${images}</div>` : ""}
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 1.5cm 1.5cm 1.5cm 2cm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, "Noto Sans", sans-serif; font-size: 12pt; line-height: 1.35; color: #111; }
    .cover { min-height: 25cm; display: flex; flex-direction: column; align-items: center; text-align: center; page-break-after: always; }
    .cover h1 { max-width: 17cm; margin: 2.4cm 0 0; font-size: 15pt; line-height: 1.45; font-weight: 700; text-transform: uppercase; }
    .cover .city { margin-top: 1.1cm; font-weight: 700; }
    .cover .year { margin-top: auto; margin-bottom: 1.2cm; font-weight: 700; }
    h2 { max-width: 17cm; margin: 0 auto 14pt; text-align: center; font-size: 14pt; line-height: 1.35; font-weight: 700; text-transform: uppercase; }
    p { margin: 0 0 10pt; text-align: justify; text-indent: 1cm; }
    .date-line { display: flex; justify-content: space-between; margin-bottom: 10pt; }
    .report-date { font-size: 12pt; }
    .work-item { break-inside: auto; }
    .work-item.new-page { page-break-before: always; }
    .images { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8pt 10pt; margin-top: 8pt; }
    figure { margin: 0; break-inside: avoid; }
    img { width: 100%; height: 4.7cm; object-fit: cover; display: block; }
    .signature { margin-top: 24pt; page-break-inside: avoid; }
    .signature p { margin: 0 0 8pt; text-indent: 0; text-align: left; }
    .signature strong { font-weight: 700; }
  </style>
</head>
<body>
  <section class="cover">
    <h1>${escapeHtml(buildCoverTitle(context))}</h1>
    <div class="city">Улаанбаатар хот</div>
    <div class="year">${coverYear(context)}</div>
  </section>
  ${reportBlocks}
  <section class="signature">
    <p><strong>Хянасан:</strong></p>
    <p>${escapeHtml(departmentName)}</p>
    <p>${escapeHtml(reviewerName)}</p>
    <p><strong>Илтгэх хуудас бичсэн:</strong></p>
    <p>${escapeHtml(authorName)}</p>
  </section>
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
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "1.5cm",
        bottom: "1.5cm",
        left: "2cm",
        right: "1.5cm",
      },
    });
  } finally {
    await browser.close();
  }
}

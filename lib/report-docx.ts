import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import sharp from "sharp";

import {
  REPORT_ORG,
  REPORT_SIGNATURES,
  loadReportEmblemBuffer,
  loadReportLogoBuffer,
} from "./report-document";

export type ReportItem = {
  title: string;
  basis?: string;
  department?: string;
  reporter?: string;
  date?: string;
  narrative: string;
  images?: { base64: string; mimetype: string }[];
};

// Танай жишиг тайлангийн дагуу — албан хэв маяг (лого, Arial).
const FONT = "Arial";
const BRAND = "1F7A3F";

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDERLESS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};

async function toImageRun(base64: string, _mimetype: string, maxWidth = 250): Promise<ImageRun | null> {
  try {
    const input = Buffer.from(base64, "base64");
    // Бүх форматыг (webp, heic, png, эвдэрсэн mimetype г.м) Word найдвартай уншиж
    // чадах JPEG болгон дахин хувиргаж, EXIF эргэлтийг засна.
    const data = await sharp(input)
      .rotate()
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
    const meta = await sharp(data).metadata();
    const width = meta.width || maxWidth;
    const height = meta.height || Math.round(maxWidth * 0.72);
    const scale = Math.min(1, maxWidth / width);
    return new ImageRun({
      type: "jpg",
      data,
      transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
    });
  } catch {
    return null;
  }
}

function imageCell(run: ImageRun | null): TableCell {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: BORDERLESS,
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: run ? [run] : [] })],
  });
}

function photoGridTable(runs: ImageRun[]): Table {
  const rows: TableRow[] = [];
  for (let index = 0; index < runs.length; index += 2) {
    rows.push(new TableRow({ children: [imageCell(runs[index]), imageCell(runs[index + 1] ?? null)] }));
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERLESS, rows });
}

function signatureRow(position: string, name: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERLESS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 68, type: WidthType.PERCENTAGE },
            borders: BORDERLESS,
            children: [new Paragraph({ children: [new TextRun({ text: position, size: 24, font: FONT })] })],
          }),
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            borders: BORDERLESS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: name, bold: true, size: 24, font: FONT })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function logoCell(run: ImageRun): TableCell {
  return new TableCell({
    borders: BORDERLESS,
    margins: { top: 20, bottom: 20, left: 80, right: 80 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run] })],
  });
}

async function headerLogos(): Promise<Table | null> {
  const [emblem, logo] = await Promise.all([loadReportEmblemBuffer(), loadReportLogoBuffer()]);
  const cells: TableCell[] = [];
  if (emblem) {
    cells.push(
      logoCell(new ImageRun({ type: "png", data: emblem, transformation: { width: 67, height: 50 } })),
    );
  }
  if (logo) {
    cells.push(
      logoCell(new ImageRun({ type: "png", data: logo, transformation: { width: 220, height: 45 } })),
    );
  }
  if (!cells.length) {
    return null;
  }
  return new Table({
    alignment: AlignmentType.CENTER,
    borders: BORDERLESS,
    rows: [new TableRow({ children: cells })],
  });
}

function centered(text: string, size: number, bold = true, spacingAfter = 40): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: spacingAfter },
    children: [new TextRun({ text, bold, size, font: FONT })],
  });
}

export async function buildReportDocx(opts: {
  title: string;
  intro?: string;
  items: ReportItem[];
}): Promise<Buffer> {
  const year = new Date().getFullYear();
  const body: (Paragraph | Table)[] = [];

  // Толгой — лого (тэмдэг + ЭКО ДҮҮРЭГ)
  const logos = await headerLogos();
  if (logos) {
    body.push(logos);
    body.push(
      new Paragraph({
        spacing: { after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 4 } },
        children: [],
      }),
    );
  }

  // Нүүр
  body.push(
    centered(REPORT_ORG.name, 26, true, 60),
    centered(opts.title.toLocaleUpperCase("mn-MN"), 30, true, 120),
    centered(REPORT_ORG.place, 24, true, 40),
    centered(`${year} он`, 24, true, 200),
  );

  // Удиртгал
  if (opts.intro) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 },
        children: [new TextRun({ text: opts.intro, size: 24, font: FONT })],
      }),
    );
  }

  // Тайлан бүр
  for (let index = 0; index < opts.items.length; index += 1) {
    const item = opts.items[index];
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 60 },
        children: [
          new TextRun({ text: `${index + 1}. ${item.title.toLocaleUpperCase("mn-MN")}`, bold: true, size: 25, font: FONT }),
        ],
      }),
    );
    if (item.basis) {
      body.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: `Үндэслэл: ${item.basis}`, italics: true, size: 24, font: FONT })],
        }),
      );
    }
    const metaParts: TextRun[] = [];
    if (item.department) {
      metaParts.push(
        new TextRun({ text: "Хэлтэс: ", bold: true, size: 24, font: FONT }),
        new TextRun({ text: `${item.department}    `, size: 24, font: FONT }),
      );
    }
    if (item.reporter) {
      metaParts.push(
        new TextRun({ text: "Гүйцэтгэсэн: ", bold: true, size: 24, font: FONT }),
        new TextRun({ text: `${item.reporter}    `, size: 24, font: FONT }),
      );
    }
    if (item.date) {
      metaParts.push(
        new TextRun({ text: "Огноо: ", bold: true, size: 24, font: FONT }),
        new TextRun({ text: item.date, size: 24, font: FONT }),
      );
    }
    if (metaParts.length) {
      body.push(new Paragraph({ spacing: { after: 60 }, children: metaParts }));
    }
    body.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 80 },
        children: [new TextRun({ text: item.narrative, size: 24, font: FONT })],
      }),
    );

    // Хавсаргасан зураг (2 баганаар)
    const images = item.images ?? [];
    if (images.length) {
      const runs = (await Promise.all(images.map((image) => toImageRun(image.base64, image.mimetype)))).filter(
        (run): run is ImageRun => run !== null,
      );
      if (runs.length) {
        body.push(photoGridTable(runs));
      }
    }
  }

  // Гарын үсэг
  body.push(new Paragraph({ spacing: { before: 480 }, children: [] }));
  for (const sign of REPORT_SIGNATURES) {
    body.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: [new TextRun({ text: `${sign.role}:`, bold: true, size: 24, font: FONT })],
      }),
      signatureRow(sign.position, sign.name),
    );
  }

  const doc = new Document({
    creator: REPORT_ORG.shortName,
    sections: [
      {
        properties: { page: { margin: { top: 850, bottom: 1134, left: 1701, right: 850 } } },
        children: body,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

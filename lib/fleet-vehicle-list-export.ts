import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { chromium } from "playwright";
import sharp from "sharp";

import {
  fetchOdooAttachmentContent,
  type FleetVehicleBoardItem,
} from "@/lib/odoo";

const FONT = "Arial";
const GREEN = "287D3C";
const LIGHT_GREEN = "EAF4EC";
const BORDER = "C9D8CD";

type ExportVehicle = FleetVehicleBoardItem & { exportImage: Buffer | null };

function firstPhotoId(vehicle: FleetVehicleBoardItem) {
  return vehicle.photoGroups.flatMap((group) => group.ids)[0] ?? null;
}

function dataUrlBuffer(value: string) {
  const match = value.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  return match ? Buffer.from(match[1], "base64") : null;
}

async function loadVehicleImage(vehicle: FleetVehicleBoardItem) {
  try {
    const attachmentId = firstPhotoId(vehicle);
    const attachment = attachmentId
      ? await fetchOdooAttachmentContent(attachmentId)
      : null;
    const source = attachment?.datas
      ? Buffer.from(attachment.datas, "base64")
      : dataUrlBuffer(vehicle.imageUrl);
    if (!source) return null;

    return await sharp(source)
      .rotate()
      .resize(360, 240, { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 78 })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function prepareFleetVehiclesForExport(
  vehicles: FleetVehicleBoardItem[],
): Promise<ExportVehicle[]> {
  const result: ExportVehicle[] = [];
  for (let index = 0; index < vehicles.length; index += 6) {
    const batch = vehicles.slice(index, index + 6);
    const images = await Promise.all(batch.map(loadVehicleImage));
    result.push(...batch.map((vehicle, batchIndex) => ({
      ...vehicle,
      exportImage: images[batchIndex],
    })));
  }
  return result;
}

function display(value?: string | null) {
  return value?.trim() || "Бүртгэлгүй";
}

function vehicleRows(vehicles: ExportVehicle[]) {
  return vehicles.map((vehicle, index) => [
    index + 1,
    vehicle.plate,
    vehicle.name,
    vehicle.modelName,
    vehicle.vehicleTypeName || vehicle.categoryName,
    vehicle.departmentName,
    vehicle.stateLabel,
    vehicle.responsibleDriverName,
    vehicle.insurance.endDate,
    vehicle.inspection.endDate,
  ]);
}

export async function buildFleetVehicleXlsx(vehicles: ExportVehicle[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Хот тохижилт үйлчилгээний төв";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Машины жагсаалт", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });
  sheet.columns = [
    { width: 6 }, { width: 18 }, { width: 16 }, { width: 24 },
    { width: 25 }, { width: 32 }, { width: 18 }, { width: 22 },
    { width: 18 }, { width: 18 }, { width: 18 },
  ];
  sheet.mergeCells("A1:K1");
  const title = sheet.getCell("A1");
  title.value = "МАШИН ТЕХНИКИЙН ЖАГСААЛТ";
  title.font = { name: FONT, size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREEN}` } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.mergeCells("A2:K2");
  sheet.getCell("A2").value = `Нийт ${vehicles.length} машин · ${new Date().toLocaleDateString("mn-MN")}`;
  sheet.getCell("A2").alignment = { horizontal: "right" };
  sheet.getCell("A2").font = { name: FONT, size: 10, italic: true };

  const headers = ["№", "Зураг", "Улсын дугаар", "Машины нэр", "Марка / модель", "Төрөл", "Хэлтэс", "Төлөв", "Жолооч", "Даатгал дуусах", "Үзлэг дуусах"];
  const headerRow = sheet.getRow(3);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: FONT, bold: true, color: { argb: `FF${GREEN}` } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${LIGHT_GREEN}` } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: `FF${BORDER}` } } };
  });
  headerRow.height = 26;

  const rows = vehicleRows(vehicles);
  vehicles.forEach((vehicle, index) => {
    const rowNumber = index + 4;
    const row = sheet.getRow(rowNumber);
    row.height = 76;
    const values = rows[index];
    row.getCell(1).value = values[0];
    for (let dataIndex = 1; dataIndex <= 9; dataIndex += 1) {
      row.getCell(dataIndex + 2).value = display(String(values[dataIndex] ?? ""));
    }
    row.eachCell((cell) => {
      cell.font = { name: FONT, size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: `FF${BORDER}` } } };
    });
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    if (vehicle.exportImage) {
      const imageId = workbook.addImage({
        base64: vehicle.exportImage.toString("base64"),
        extension: "jpeg",
      });
      sheet.addImage(imageId, {
        tl: { col: 1.08, row: rowNumber - 0.92 },
        ext: { width: 112, height: 70 },
      });
    } else {
      row.getCell(2).value = "Зураггүй";
      row.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
    }
  });
  sheet.autoFilter = { from: "A3", to: `K${Math.max(3, vehicles.length + 3)}` };
  const bytes = await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function docCell(children: (Paragraph | Table)[], width: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: noBorder,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

export async function buildFleetVehicleDocx(vehicles: ExportVehicle[]) {
  const rows: TableRow[] = [];
  for (const [index, vehicle] of vehicles.entries()) {
    const image = vehicle.exportImage
      ? new ImageRun({ type: "jpg", data: vehicle.exportImage, transformation: { width: 150, height: 100 } })
      : null;
    const details = [
      `Улсын дугаар: ${vehicle.plate}`,
      `Машины нэр: ${display(vehicle.name)}`,
      `Марка / модель: ${display(vehicle.modelName)}`,
      `Төрөл: ${display(vehicle.vehicleTypeName || vehicle.categoryName)}`,
      `Хэлтэс: ${display(vehicle.departmentName)}`,
      `Төлөв: ${display(vehicle.stateLabel)}`,
      `Жолооч: ${display(vehicle.responsibleDriverName)}`,
    ];
    rows.push(new TableRow({
      children: [
        docCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(index + 1), bold: true, font: FONT })] })], 500),
        docCell([new Paragraph({ alignment: AlignmentType.CENTER, children: image ? [image] : [new TextRun({ text: "Зураггүй", font: FONT })] })], 2500),
        docCell(details.map((text, detailIndex) => new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text, font: FONT, size: 20, bold: detailIndex === 0 })],
        })), 6200),
      ],
    }));
  }
  const doc = new Document({
    creator: "Хот тохижилт үйлчилгээний төв",
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "МАШИН ТЕХНИКИЙН ЖАГСААЛТ", bold: true, size: 30, color: GREEN, font: FONT })],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 180 },
          children: [new TextRun({ text: `Нийт ${vehicles.length} машин · ${new Date().toLocaleDateString("mn-MN")}`, italics: true, size: 18, font: FONT })],
        }),
        new Table({ width: { size: 9200, type: WidthType.DXA }, rows }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function buildFleetVehiclePdf(vehicles: ExportVehicle[]) {
  const cards = vehicles.map((vehicle, index) => {
    const image = vehicle.exportImage
      ? `<img src="data:image/jpeg;base64,${vehicle.exportImage.toString("base64")}" alt="" />`
      : `<div class="no-image">Зураггүй</div>`;
    return `<article><div class="number">${index + 1}</div>${image}<div class="details">
      <h2>${escapeHtml(vehicle.plate)}</h2>
      <p><b>Машины нэр:</b> ${escapeHtml(display(vehicle.name))}</p>
      <p><b>Марка / модель:</b> ${escapeHtml(display(vehicle.modelName))}</p>
      <p><b>Төрөл:</b> ${escapeHtml(display(vehicle.vehicleTypeName || vehicle.categoryName))}</p>
      <p><b>Хэлтэс:</b> ${escapeHtml(display(vehicle.departmentName))}</p>
      <p><b>Төлөв:</b> ${escapeHtml(display(vehicle.stateLabel))}</p>
      <p><b>Жолооч:</b> ${escapeHtml(display(vehicle.responsibleDriverName))}</p>
    </div></article>`;
  }).join("");
  const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#15251a}header{border-bottom:3px solid #287d3c;margin-bottom:10mm;padding-bottom:4mm;display:flex;justify-content:space-between;align-items:end}h1{font-size:20px;margin:0;color:#287d3c}header p{margin:0;font-size:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6mm}article{position:relative;display:grid;grid-template-columns:46mm 1fr;gap:5mm;border:1px solid #c9d8cd;border-radius:3mm;padding:4mm;min-height:48mm;break-inside:avoid;background:#fff}.number{position:absolute;right:3mm;top:2mm;color:#728276;font-size:9px}img,.no-image{width:46mm;height:36mm;object-fit:cover;border-radius:2mm;background:#eef4ef}.no-image{display:flex;align-items:center;justify-content:center;color:#728276;font-size:10px}.details h2{font-size:15px;margin:0 0 2mm;color:#1d6532}.details p{font-size:9.5px;line-height:1.35;margin:0 0 1mm}</style></head><body>
    <header><h1>МАШИН ТЕХНИКИЙН ЖАГСААЛТ</h1><p>Нийт ${vehicles.length} машин · ${new Date().toLocaleDateString("mn-MN")}</p></header><main class="grid">${cards}</main></body></html>`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" } });
  } finally {
    await browser.close();
  }
}

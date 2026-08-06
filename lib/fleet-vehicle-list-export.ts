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

function yesNo(value: boolean) {
  return value ? "Тийм" : "Үгүй";
}

function vehicleDetailEntries(vehicle: ExportVehicle) {
  const crew = vehicle.crewAssignments.map((assignment) => [
    assignment.teamName,
    assignment.driverNames.length ? `жолооч: ${assignment.driverNames.join(", ")}` : "",
    assignment.loaderNames.length ? `ачигч: ${assignment.loaderNames.join(", ")}` : "",
    assignment.memberNames.length ? `бусад: ${assignment.memberNames.join(", ")}` : "",
  ].filter(Boolean).join(" · ")).join("; ");
  const driverHistory = vehicle.driverHistory.map((item) =>
    `${item.driverName} (${item.dateStart || "?"} - ${item.dateEnd || "одоо"})`,
  ).join("; ");
  const repairHistory = vehicle.repairHistory.map((item) =>
    [item.requestDate, item.damageType, item.description, item.repairNote, item.amountLabel, item.stateLabel]
      .filter(Boolean).join(" · "),
  ).join("; ");
  const fuelReports = vehicle.fuelReportRows.map((item) =>
    `${item.reportDate}: ${item.fuelLabel}${item.stateLabel ? ` (${item.stateLabel})` : ""}`,
  ).join("; ");
  const weightReports = vehicle.weightReportRows.map((item) =>
    `${item.reportDate}: ${item.weightLabel}${item.stateLabel ? ` (${item.stateLabel})` : ""}`,
  ).join("; ");
  const procurement = vehicle.procurementLinks.map((item) =>
    [item.name, item.repairName, item.amountLabel, item.stateLabel].filter(Boolean).join(" · "),
  ).join("; ");
  const photoCount = vehicle.photoGroups.reduce((sum, group) => sum + group.ids.length, 0);
  const documentCount = vehicle.documentGroups.reduce((sum, group) => sum + group.ids.length, 0);

  return [
    ["Улсын дугаар", vehicle.plate], ["Машины нэр", vehicle.name],
    ["Марка / модель", vehicle.modelName], ["Ангилал", vehicle.categoryName],
    ["Машины төрөл", vehicle.vehicleTypeName], ["Хэлтэс", vehicle.departmentName],
    ["Төлөв", vehicle.stateLabel],
    ["Үйл ажиллагааны төлөв", vehicle.isOperational ? "Ашиглаж байгаа" : "Идэвхгүй"],
    ["Засвартай эсэх", yesNo(vehicle.isRepair)], ["Архивласан эсэх", yesNo(vehicle.isArchived)],
    ["Засварын төлөв", vehicle.latestRepairState], ["Арлын дугаар", vehicle.vin],
    ["Туулсан зам", vehicle.odometerLabel], ["Түлшний төрөл", vehicle.fuelTypeLabel],
    ["GPS суурилуулсан эсэх", yesNo(vehicle.gpsInstalled)],
    ["Түлш хэмжигчтэй эсэх", yesNo(vehicle.fuelMonitoringInstalled)],
    ["Даац", vehicle.capacity], ["Импортлосон огноо", vehicle.importedDate],
    ["Үйлдвэрлэсэн огноо", vehicle.manufacturedDate], ["Өнгө", vehicle.color],
    ["Суудлын тоо", vehicle.seatCountLabel],
    ["Хариуцсан жолооч", vehicle.responsibleDriverName || vehicle.fleetDriverName],
    ["Ачигч 1", vehicle.loader1Name], ["Ачигч 2", vehicle.loader2Name],
    ["Хуваарилсан баг, хүмүүс", crew], ["Жолоочийн түүх", driverHistory],
    ["Даатгалын компани", vehicle.insurance.company],
    ["Даатгалын гэрээний дугаар", vehicle.insurance.policyNumber],
    ["Даатгал эхлэх огноо", vehicle.insurance.startDate],
    ["Даатгал дуусах огноо", vehicle.insurance.endDate],
    ["Даатгалын үлдсэн хоног", String(vehicle.insurance.daysRemaining)],
    ["Даатгалын тэмдэглэл", vehicle.insurance.note],
    ["Үзлэг хийсэн огноо", vehicle.inspection.startDate],
    ["Үзлэг дуусах огноо", vehicle.inspection.endDate],
    ["Үзлэгийн үлдсэн хоног", String(vehicle.inspection.daysRemaining)],
    ["Үзлэгийн тэмдэглэл", vehicle.inspection.note], ["Засварын түүх", repairHistory],
    ["Энэ сарын тээвэрлэсэн жин", `${vehicle.weightMonthTons.toLocaleString("mn-MN")} тн`],
    ["Нийт тээвэрлэсэн жин", `${vehicle.weightTotalTons.toLocaleString("mn-MN")} тн`],
    ["Жингийн тайлангууд", weightReports], ["Түлшний тайлангууд", fuelReports],
    ["Худалдан авалтын холбоосууд", procurement], ["Зургийн тоо", String(photoCount)],
    ["Баримт бичгийн тоо", String(documentCount)],
  ] satisfies [string, string | undefined][];
}

export async function buildFleetVehicleXlsx(vehicles: ExportVehicle[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Хот тохижилт үйлчилгээний төв";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Машины жагсаалт", {
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });
  const detailHeaders = vehicles.length
    ? vehicleDetailEntries(vehicles[0]).map(([label]) => label)
    : [];
  const headers = ["№", "Зураг", ...detailHeaders];
  sheet.columns = headers.map((_, index) => ({
    width: index === 0 ? 6 : index === 1 ? 18 : 22,
  }));
  const lastColumn = sheet.getColumn(Math.max(2, headers.length)).letter;
  sheet.mergeCells(`A1:${lastColumn}1`);
  const title = sheet.getCell("A1");
  title.value = "МАШИН ТЕХНИКИЙН ЖАГСААЛТ";
  title.font = { name: FONT, size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREEN}` } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.getCell("A2").value = `Нийт ${vehicles.length} машин · ${new Date().toLocaleDateString("mn-MN")}`;
  sheet.getCell("A2").alignment = { horizontal: "right" };
  sheet.getCell("A2").font = { name: FONT, size: 10, italic: true };

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

  vehicles.forEach((vehicle, index) => {
    const rowNumber = index + 4;
    const row = sheet.getRow(rowNumber);
    row.height = 76;
    row.getCell(1).value = index + 1;
    vehicleDetailEntries(vehicle).forEach(([, value], detailIndex) => {
      row.getCell(detailIndex + 3).value = display(value);
    });
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
  sheet.autoFilter = {
    from: "A3",
    to: `${lastColumn}${Math.max(3, vehicles.length + 3)}`,
  };
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
    const details = vehicleDetailEntries(vehicle).map(
      ([label, value]) => `${label}: ${display(value)}`,
    );
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
    const details = vehicleDetailEntries(vehicle)
      .map(([label, value]) => `<p><b>${escapeHtml(label)}:</b> ${escapeHtml(display(value))}</p>`)
      .join("");
    return `<article><div class="number">${index + 1}</div>${image}<div class="details">
      <h2>${escapeHtml(vehicle.plate)}</h2>
      ${details}
    </div></article>`;
  }).join("");
  const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#15251a}header{border-bottom:3px solid #287d3c;margin-bottom:8mm;padding-bottom:4mm;display:flex;justify-content:space-between;align-items:end}h1{font-size:20px;margin:0;color:#287d3c}header p{margin:0;font-size:10px}.grid{display:grid;grid-template-columns:1fr;gap:6mm}article{position:relative;display:grid;grid-template-columns:46mm 1fr;gap:5mm;border:1px solid #c9d8cd;border-radius:3mm;padding:4mm;break-inside:avoid;background:#fff}.number{position:absolute;right:3mm;top:2mm;color:#728276;font-size:9px}img,.no-image{width:46mm;height:36mm;object-fit:cover;border-radius:2mm;background:#eef4ef}.no-image{display:flex;align-items:center;justify-content:center;color:#728276;font-size:10px}.details{column-count:3;column-gap:5mm}.details h2{column-span:all;font-size:15px;margin:0 0 2mm;color:#1d6532}.details p{break-inside:avoid;font-size:8px;line-height:1.3;margin:0 0 1mm}</style></head><body>
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

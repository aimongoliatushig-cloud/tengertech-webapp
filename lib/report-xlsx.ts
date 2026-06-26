import "server-only";

import ExcelJS from "exceljs";

import {
  REPORT_ORG,
  REPORT_SIGNATURES,
  loadReportEmblemBuffer,
  loadReportLogoBuffer,
  reportTodayStamp,
} from "./report-document";

export type XlsxSection = {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
  // Багана бүрийн өргөн (тэмдэгтээр). Өгөөгүй бол автоматаар тооцно.
  columnWidths?: number[];
};

// Танай жишиг тайлангийн дагуу — цэвэр албан хэв маяг (лого, өнгөгүй).
const FONT = "Arial";
const BORDER_COLOR = "000000";

function thinBorder(): ExcelJS.Borders {
  const side: ExcelJS.Border = { style: "thin", color: { argb: BORDER_COLOR } };
  return { top: side, bottom: side, left: side, right: side } as ExcelJS.Borders;
}

export async function buildReportWorkbook(opts: {
  title: string;
  meta: { label: string; value: string }[];
  sections: XlsxSection[];
  sheetName?: string;
}): Promise<Buffer> {
  const { title, meta, sections } = opts;
  const maxCols = Math.max(4, ...sections.map((section) => section.headers.length));
  const year = new Date().getFullYear();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = REPORT_ORG.shortName;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(opts.sheetName ?? "Тайлан", {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  for (let col = 1; col <= maxCols; col += 1) {
    sheet.getColumn(col).width = col === 1 ? 22 : 18;
  }

  let row = 1;
  const mergeAcross = (r: number) => sheet.mergeCells(r, 1, r, maxCols);

  // Толгойн лого (дугуй тэмдэг + ЭКО ДҮҮРЭГ)
  const [emblem, logo] = await Promise.all([loadReportEmblemBuffer(), loadReportLogoBuffer()]);
  if (emblem || logo) {
    sheet.getRow(1).height = 40;
    sheet.getRow(2).height = 6;
    if (emblem) {
      const emblemId = workbook.addImage({ base64: emblem.toString("base64"), extension: "png" });
      sheet.addImage(emblemId, { tl: { col: 0.15, row: 0.1 }, ext: { width: 62, height: 46 } });
    }
    if (logo) {
      const logoId = workbook.addImage({ base64: logo.toString("base64"), extension: "png" });
      sheet.addImage(logoId, { tl: { col: 1.05, row: 0.2 }, ext: { width: 220, height: 45 } });
    }
    row = 3;
  }

  // Байгууллагын нэр (төвлөрсөн, хар)
  mergeAcross(row);
  sheet.getRow(row).getCell(1).value = REPORT_ORG.name;
  sheet.getRow(row).getCell(1).font = { name: FONT, size: 12, bold: true, color: { argb: "000000" } };
  sheet.getRow(row).getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 20;
  row += 1;

  // Гарчиг (ТОМ үсэг, төвлөрсөн, хар)
  mergeAcross(row);
  sheet.getRow(row).getCell(1).value = title.toLocaleUpperCase("mn-MN");
  sheet.getRow(row).getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: "000000" } };
  sheet.getRow(row).getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(row).height = 24;
  row += 1;

  // Газар, он
  mergeAcross(row);
  sheet.getRow(row).getCell(1).value = `${REPORT_ORG.place}, ${year} он`;
  sheet.getRow(row).getCell(1).font = { name: FONT, size: 11, color: { argb: "000000" } };
  sheet.getRow(row).getCell(1).alignment = { horizontal: "center" };
  row += 2;

  // Мета мэдээлэл
  for (const item of meta) {
    sheet.getRow(row).getCell(1).value = `${item.label}:`;
    sheet.getRow(row).getCell(1).font = { name: FONT, size: 11, bold: true };
    sheet.mergeCells(row, 2, row, maxCols);
    sheet.getRow(row).getCell(2).value = item.value;
    sheet.getRow(row).getCell(2).font = { name: FONT, size: 11 };
    row += 1;
  }
  row += 1;

  // Хэсгүүд
  for (const section of sections) {
    // Хэсгийн гарчиг (ТОМ үсэг, төвлөрсөн)
    mergeAcross(row);
    sheet.getRow(row).getCell(1).value = section.caption.toLocaleUpperCase("mn-MN");
    sheet.getRow(row).getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: "000000" } };
    sheet.getRow(row).getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(row).height = 20;
    row += 1;

    // Толгой мөр (хар хүрээ, тод хар текст, дүүргэлтгүй)
    const headerRow = sheet.getRow(row);
    section.headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: "000000" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder();
    });
    headerRow.height = 26;
    row += 1;

    // Дата мөрүүд
    if (section.rows.length) {
      section.rows.forEach((dataRow) => {
        const r = sheet.getRow(row);
        section.headers.forEach((_, colIndex) => {
          const cell = r.getCell(colIndex + 1);
          cell.value = dataRow[colIndex] ?? "";
          cell.font = { name: FONT, size: 10, color: { argb: "000000" } };
          cell.alignment = { vertical: "top", wrapText: true };
          cell.border = thinBorder();
        });
        row += 1;
      });
    } else {
      mergeAcross(row);
      sheet.getRow(row).getCell(1).value = "Мэдээлэл алга.";
      sheet.getRow(row).getCell(1).font = { name: FONT, size: 10, italic: true, color: { argb: "555555" } };
      sheet.getRow(row).getCell(1).border = thinBorder();
      row += 1;
    }

    if (section.columnWidths) {
      section.columnWidths.forEach((width, index) => {
        const current = sheet.getColumn(index + 1).width ?? 0;
        sheet.getColumn(index + 1).width = Math.max(current, width);
      });
    }
    row += 1;
  }

  // Гарын үсгийн блок
  row += 1;
  for (const sign of REPORT_SIGNATURES) {
    mergeAcross(row);
    sheet.getRow(row).getCell(1).value = `${sign.role}:`;
    sheet.getRow(row).getCell(1).font = { name: FONT, size: 11, bold: true };
    row += 1;
    sheet.mergeCells(row, 1, row, maxCols - 1);
    sheet.getRow(row).getCell(1).value = sign.position;
    sheet.getRow(row).getCell(1).font = { name: FONT, size: 11 };
    sheet.getRow(row).getCell(maxCols).value = sign.name;
    sheet.getRow(row).getCell(maxCols).font = { name: FONT, size: 11, bold: true };
    sheet.getRow(row).getCell(maxCols).alignment = { horizontal: "right" };
    row += 2;
  }

  mergeAcross(row);
  sheet.getRow(row).getCell(1).value = `Тайлан үүсгэсэн огноо: ${reportTodayStamp()}`;
  sheet.getRow(row).getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: "555555" } };
  sheet.getRow(row).getCell(1).alignment = { horizontal: "right" };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

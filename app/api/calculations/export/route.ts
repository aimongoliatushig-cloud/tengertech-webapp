import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import ExcelJS from "exceljs";
import { chromium } from "playwright";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getSession } from "@/lib/auth";
import { getCalculation } from "@/lib/calculations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = Record<string, unknown>;
type ReportSection = { title: string; headers: string[]; rows: unknown[][]; moneyColumns: number[] };
const ORGANIZATION = "ТОХИЖИЛТ ҮЙЛЧИЛГЭЭНИЙ ТӨВ ОНӨААТҮГ";
const DIRECTOR = "П.МӨНХ-ЭРДЭНЭ";
const money = (value: unknown) => `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value) || 0)} ₮`;
const text = (value: unknown) => Array.isArray(value) ? String(value[1] || "") : String(value ?? "");
const escape = (value: unknown) => text(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

async function allowed() {
  const session = await getSession(); if (!session) return null;
  const department = await loadSessionDepartmentName(session);
  return ["system_admin", "director", "general_manager"].includes(session.role) || department === "Тохижилтын хэлтэс" || department === "Тохижилт үйлчилгээ" || session.groupFlags?.improvementManager ? session : null;
}

function mongolianDate(value: unknown) {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]} оны ${match[2]} дугаар сарын ${match[3]}-ны өдөр` : text(value);
}
function reportTitle(c: Row) { return `${text(c.work_name).toLocaleUpperCase("mn-MN")}\nМАТЕРИАЛ, АЖЛЫН ХӨЛС БОЛОН БУСАД ЗАРДЛЫН ТООЦОО`; }

function sections(c: Row): ReportSection[] {
  const materials = (c.materials as Row[] || []).map(r => [r.material_name, r.unit, r.quantity, r.unit_price, r.total]);
  if (c.work_package_name) materials.unshift([`Ажлын багц: ${text(c.work_package_code)} — ${text(c.work_package_name)}`, text(c.work_package_base_unit), `${text(c.quantity)} ${text(c.unit)}`, "", ""]);
  return [
    { title: "МАТЕРИАЛЫН ЗАРДАЛ", headers: ["Материал", "Нэгж", "Тоо хэмжээ", "Нэгж үнэ", "Нийт дүн"], rows: materials, moneyColumns: [3, 4] },
    { title: "АЖЛЫН ХӨЛС", headers: ["Ажил", "Хүний тоо", "Хугацаа", "Нэгж", "Үнэлгээ", "Нийт дүн"], rows: (c.labor as Row[] || []).map(r => [r.work_type, r.employee_count, r.duration, r.unit, r.unit_price, r.total]), moneyColumns: [4, 5] },
    { title: "ТЕХНИКИЙН ЗАРДАЛ", headers: ["Техник", "Цаг", "Нэг цагийн үнэ", "Нийт дүн"], rows: (c.equipment as Row[] || []).map(r => [r.equipment_name, r.hours, r.hourly_rate, r.total]), moneyColumns: [2, 3] },
    { title: "ТЭЭВРИЙН ЗАРДАЛ", headers: ["Төрөл", "Тоо", "Нэгж үнэ", "Нийт дүн"], rows: (c.transport as Row[] || []).map(r => [r.transport_type, r.quantity, r.unit_price, r.total]), moneyColumns: [2, 3] },
    { title: "БУСАД ЗАРДАЛ", headers: ["Нэр", "Тайлбар", "Дүн"], rows: (c.other as Row[] || []).map(r => [r.name, r.description, r.amount]), moneyColumns: [2] },
  ];
}

function htmlSection(section: ReportSection) {
  const rows = section.rows.length ? section.rows : [["Бүртгэлгүй", ...Array(section.headers.length - 1).fill("")]];
  return `<h2>${escape(section.title)}</h2><table><thead><tr>${section.headers.map(h => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((cell, index) => `<td class="${section.moneyColumns.includes(index) ? "number" : ""}">${escape(section.moneyColumns.includes(index) && cell !== "" ? money(cell) : cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function html(c: Row) {
  return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#000}.approval{width:58%;margin-left:auto;text-align:center;line-height:1.35}.approval b{font-size:13px}.date{text-align:center;margin:26px 0}.title{text-align:center;font-size:14px;font-weight:bold;white-space:pre-line;line-height:1.35;margin:30px 0 18px}.meta{width:100%;border-collapse:collapse;margin-bottom:16px}.meta td{border:none;padding:3px 6px}.meta td:nth-child(odd){font-weight:bold;width:18%}h2{font-size:12px;margin:17px 0 5px}table{width:100%;border-collapse:collapse;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th,td{border:1px solid #000;padding:5px;text-align:left}th{background:#e7e6e6;text-align:center}.number{text-align:right}.grand{margin-top:18px;border:2px solid #000;padding:10px;text-align:right;font-size:14px;font-weight:bold}.signatures{margin-top:30px;line-height:2.2}</style></head><body><div class="approval"><b>БАТЛАВ</b><br>${escape(ORGANIZATION)}-ЫН<br><b>ЗАХИРАЛ&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${escape(DIRECTOR)}</b></div><div class="date">${escape(mongolianDate(c.date))}</div><div class="title">${escape(reportTitle(c))}</div><table class="meta"><tr><td>Тооцооллын №:</td><td>${escape(c.calculation_number)}</td><td>Байршил:</td><td>${escape(c.location)}</td></tr><tr><td>Тоо хэмжээ:</td><td>${escape(c.quantity)} ${escape(c.unit)}</td><td>Төлөв:</td><td>${escape(c.status)}</td></tr></table>${sections(c).map(htmlSection).join("")}<div class="grand">НИЙТ ТООЦООЛСОН ӨРТӨГ: ${escape(money(c.grand_total))}</div><div class="signatures">ТООЦОО ГАРГАСАН: ____________________<br>ХЯНАСАН: ____________________</div></body></html>`;
}

const thinBorder = { style: "thin" as const, color: { argb: "FF000000" } };
async function workbook(c: Row) {
  const wb = new ExcelJS.Workbook(); wb.creator = ORGANIZATION; wb.created = new Date(); wb.subject = reportTitle(c);
  const ws = wb.addWorksheet("Зардлын тооцоо", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.pageSetup.margins = { left: 0.35, right: 0.35, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 }; ws.properties.defaultRowHeight = 20; ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 32 }, { width: 17 }, { width: 17 }, { width: 18 }, { width: 18 }, { width: 18 }];
  [["D1:F1", "БАТЛАВ"], ["D2:F2", `${ORGANIZATION}-ЫН`], ["D3:F3", "ЗАХИРАЛ"], ["D4:F4", DIRECTOR]].forEach(([range, value], index) => { ws.mergeCells(range); const cell = ws.getCell(range.split(":")[0]); cell.value = value; cell.alignment = { horizontal: "center", vertical: "middle" }; cell.font = { name: "Arial", size: 12, bold: index === 0 || index >= 2 }; });
  ws.mergeCells("A6:F6"); ws.getCell("A6").value = mongolianDate(c.date); ws.getCell("A6").alignment = { horizontal: "center" };
  ws.mergeCells("A8:F10"); ws.getCell("A8").value = reportTitle(c); ws.getCell("A8").alignment = { horizontal: "center", vertical: "middle", wrapText: true }; ws.getCell("A8").font = { name: "Arial", size: 14, bold: true }; ws.getRow(8).height = 25; ws.getRow(9).height = 25; ws.getRow(10).height = 25;
  [["Тооцооллын №", c.calculation_number, "Байршил", c.location], ["Тоо хэмжээ", `${c.quantity} ${c.unit}`, "Төлөв", c.status]].forEach(values => { const row = ws.addRow(values); row.getCell(1).font = { bold: true }; row.getCell(3).font = { bold: true }; });
  sections(c).forEach(section => {
    ws.addRow([]); const titleRow = ws.addRow([section.title]); ws.mergeCells(titleRow.number, 1, titleRow.number, 6); titleRow.font = { name: "Arial", bold: true, size: 12 };
    const header = ws.addRow(section.headers); header.font = { name: "Arial", bold: true, size: 12 }; header.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; header.height = 28;
    header.eachCell((cell, column) => { if (column <= section.headers.length) { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } }; cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder }; } });
    const rows = section.rows.length ? section.rows : [["Бүртгэлгүй", ...Array(section.headers.length - 1).fill("")]];
    rows.forEach(values => { const row = ws.addRow(values); values.forEach((_, index) => { const cell = row.getCell(index + 1); cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder }; cell.alignment = { vertical: "middle", wrapText: true, horizontal: section.moneyColumns.includes(index) ? "right" : "left" }; if (section.moneyColumns.includes(index) && typeof values[index] === "number") cell.numFmt = '#,##0 "₮"'; }); });
  });
  ws.addRow([]); const grand = ws.addRow(["НИЙТ ТООЦООЛСОН ӨРТӨГ", "", "", "", "", Number(c.grand_total) || 0]); ws.mergeCells(grand.number, 1, grand.number, 5); grand.font = { name: "Arial", bold: true, size: 14 }; grand.getCell(6).numFmt = '#,##0 "₮"'; grand.alignment = { horizontal: "right" }; grand.eachCell(cell => cell.border = { top: { style: "medium", color: { argb: "FF000000" } }, bottom: { style: "medium", color: { argb: "FF000000" } }, left: thinBorder, right: thinBorder });
  ws.addRow([]); ws.addRow(["ТООЦОО ГАРГАСАН: ____________________"]); ws.addRow(["ХЯНАСАН: ____________________"]);
  ws.eachRow(row => row.eachCell(cell => { cell.font = { name: "Arial", size: cell.font?.size || 12, bold: cell.font?.bold || false }; }));
  ws.headerFooter.oddFooter = "&L" + text(c.calculation_number) + "&RХуудас &P / &N"; ws.pageSetup.printArea = `A1:F${ws.rowCount}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const docBorders = { top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4 }, insideVertical: { style: BorderStyle.SINGLE, size: 4 } };
const docCell = (value: unknown, bold = false, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) => new TableCell({ children: [new Paragraph({ alignment: align, children: [new TextRun({ text: text(value), bold, font: "Arial", size: 24 })] })] });
async function wordDocument(c: Row) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "БАТЛАВ", bold: true, font: "Arial", size: 26 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${ORGANIZATION}-ЫН`, font: "Arial", size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `ЗАХИРАЛ     ${DIRECTOR}`, bold: true, font: "Arial", size: 24 })] }),
    new Paragraph({ spacing: { before: 420, after: 420 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: mongolianDate(c.date), font: "Arial", size: 24 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: reportTitle(c), bold: true, font: "Arial", size: 28 })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } }, rows: [new TableRow({ children: [docCell("Тооцооллын №:", true), docCell(c.calculation_number), docCell("Байршил:", true), docCell(c.location)] }), new TableRow({ children: [docCell("Тоо хэмжээ:", true), docCell(`${c.quantity} ${c.unit}`), docCell("Төлөв:", true), docCell(c.status)] })] }),
  ];
  sections(c).forEach(section => {
    children.push(new Paragraph({ spacing: { before: 260, after: 100 }, children: [new TextRun({ text: section.title, bold: true, font: "Arial", size: 24 })] }));
    const values = section.rows.length ? section.rows : [["Бүртгэлгүй", ...Array(section.headers.length - 1).fill("")]];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: docBorders, rows: [new TableRow({ tableHeader: true, children: section.headers.map(header => docCell(header, true, AlignmentType.CENTER)) }), ...values.map(row => new TableRow({ cantSplit: true, children: row.map((cell, index) => docCell(section.moneyColumns.includes(index) && cell !== "" ? money(cell) : cell, false, section.moneyColumns.includes(index) ? AlignmentType.RIGHT : AlignmentType.LEFT)) }))] }));
  });
  children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 320 }, children: [new TextRun({ text: `НИЙТ ТООЦООЛСОН ӨРТӨГ: ${money(c.grand_total)}`, bold: true, font: "Arial", size: 28 })] }), new Paragraph({ spacing: { before: 420 }, children: [new TextRun({ text: "ТООЦОО ГАРГАСАН: ____________________", font: "Arial", size: 24 })] }), new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "ХЯНАСАН: ____________________", font: "Arial", size: 24 })] }));
  const document = new Document({ creator: ORGANIZATION, title: reportTitle(c), styles: { default: { document: { run: { font: "Arial", size: 24 }, paragraph: { spacing: { line: 276 } } } } }, sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Хуудас ", font: "Arial", size: 20 }), new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 20 })] })] }) }, children }] });
  return Buffer.from(await Packer.toBuffer(document));
}

export async function GET(request: Request) {
  const session = await allowed(); if (!session) return Response.json({ error: "Эрхгүй." }, { status: 403 });
  const params = new URL(request.url).searchParams; const id = Number(params.get("id")); const calculation = await getCalculation(session, id); if (!calculation) return Response.json({ error: "Тооцоолол олдсонгүй." }, { status: 404 });
  const record = calculation as Row; const filename = `calculation-${text(record.calculation_number).replace(/[^a-zA-Z0-9-]/g, "-")}`;
  if (params.get("format") === "pdf") { const browser = await chromium.launch({ headless: true }); try { const page = await browser.newPage(); await page.setContent(html(record), { waitUntil: "load" }); const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } }); return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` } }); } finally { await browser.close(); } }
  if (["docx", "word"].includes(params.get("format") || "")) { const buffer = await wordDocument(record); return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${filename}.docx"` } }); }
  const buffer = await workbook(record); return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` } });
}

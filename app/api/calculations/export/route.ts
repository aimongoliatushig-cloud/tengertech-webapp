import ExcelJS from "exceljs";
import { chromium } from "playwright";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getSession } from "@/lib/auth";
import { getCalculation } from "@/lib/calculations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = Record<string, unknown>;
const money = (value: unknown) => `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value) || 0)} ₮`;
const text = (value: unknown) => Array.isArray(value) ? String(value[1] || "") : String(value ?? "");
const escape = (value: unknown) => text(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

async function allowed() {
  const session = await getSession(); if (!session) return null;
  const department = await loadSessionDepartmentName(session);
  return ["system_admin", "director", "general_manager"].includes(session.role) || department === "Тохижилтын хэлтэс" || department === "Тохижилт үйлчилгээ" || session.groupFlags?.improvementManager ? session : null;
}

function section(title: string, headers: string[], rows: unknown[][]) {
  return `<h2>${escape(title)}</h2><table><thead><tr>${headers.map(h => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}">Бүртгэлгүй</td></tr>`}</tbody></table>`;
}

function html(c: Row) {
  const materials = (c.materials as Row[] || []).map(r => [r.material_name, r.unit, r.quantity, money(r.unit_price), money(r.total)]);
  const labor = (c.labor as Row[] || []).map(r => [r.work_type, r.employee_count, r.duration, r.unit, money(r.unit_price), money(r.total)]);
  const equipment = (c.equipment as Row[] || []).map(r => [r.equipment_name, r.hours, money(r.hourly_rate), money(r.total)]);
  const transport = (c.transport as Row[] || []).map(r => [r.transport_type, r.quantity, money(r.unit_price), money(r.total)]);
  const other = (c.other as Row[] || []).map(r => [r.name, r.description, money(r.amount)]);
  return `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#111}h1{text-align:center;font-size:18px;margin:4px}h2{font-size:14px;margin:20px 0 7px}.org{text-align:center;font-weight:bold}.meta{width:100%;border:1px solid #777;padding:12px;margin-top:15px}.meta div{display:inline-block;width:49%;padding:4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px;text-align:left}th{background:#e8f3ea}.grand{margin-top:20px;padding:14px;border:2px solid #227b38;text-align:right;font-size:18px;font-weight:bold}.signatures{display:flex;justify-content:space-between;margin-top:35px}</style></head><body><div class="org">ХАН-УУЛ ДҮҮРГИЙН ТОХИЖИЛТ ҮЙЛЧИЛГЭЭНИЙ ТӨВ ОНӨААТҮГ</div><h1>АЖЛЫН ТООЦООЛОЛ</h1><div class="meta"><div><b>Тооцооллын №:</b> ${escape(c.calculation_number)}</div><div><b>Огноо:</b> ${escape(c.date)}</div><div><b>Ажлын нэр:</b> ${escape(c.work_name)}</div><div><b>Байршил:</b> ${escape(c.location)}</div><div><b>Тоо хэмжээ:</b> ${escape(c.quantity)} ${escape(c.unit)}</div></div>${section("Материалын зардал", ["Материал", "Нэгж", "Тоо хэмжээ", "Нэгж үнэ", "Нийт"], materials)}${section("Ажлын хөлс", ["Ажил", "Хүний тоо", "Хугацаа", "Нэгж", "Үнэлгээ", "Нийт"], labor)}${section("Техникийн зардал", ["Техник", "Цаг", "Нэг цагийн үнэ", "Нийт"], equipment)}${section("Тээврийн зардал", ["Төрөл", "Тоо", "Нэгж үнэ", "Нийт"], transport)}${section("Бусад зардал", ["Нэр", "Тайлбар", "Дүн"], other)}<div class="grand">НИЙТ ТООЦООЛСОН ӨРТӨГ: ${escape(money(c.grand_total))}</div><div class="signatures"><span>Тооцоо хийсэн: __________</span><span>Хянасан: __________</span><span>Баталсан: __________</span></div></body></html>`;
}

async function workbook(c: Row) {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Ажлын тооцоолол"); ws.properties.defaultRowHeight = 20;
  ws.mergeCells("A1:F1"); ws.getCell("A1").value = "ХАН-УУЛ ДҮҮРГИЙН ТОХИЖИЛТ ҮЙЛЧИЛГЭЭНИЙ ТӨВ ОНӨААТҮГ"; ws.getCell("A1").font = { bold: true, size: 14 }; ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells("A2:F2"); ws.getCell("A2").value = "АЖЛЫН ТООЦООЛОЛ"; ws.getCell("A2").font = { bold: true, size: 16 }; ws.getCell("A2").alignment = { horizontal: "center" };
  [["Тооцооллын №", c.calculation_number], ["Огноо", c.date], ["Ажлын нэр", c.work_name], ["Байршил", c.location], ["Тоо хэмжээ", `${c.quantity} ${c.unit}`]].forEach(row => ws.addRow(row));
  const add = (title: string, headers: string[], rows: unknown[][]) => { ws.addRow([]); const t = ws.addRow([title]); t.font = { bold: true, size: 13 }; const h = ws.addRow(headers); h.font = { bold: true }; h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "DDEFE1" } }; rows.forEach(row => ws.addRow(row)); };
  add("Материал", ["Материал", "Нэгж", "Тоо хэмжээ", "Нэгж үнэ", "Нийт"], (c.materials as Row[] || []).map(r => [r.material_name, r.unit, r.quantity, r.unit_price, r.total]));
  add("Ажлын хөлс", ["Ажил", "Хүний тоо", "Хугацаа", "Нэгж", "Үнэлгээ", "Нийт"], (c.labor as Row[] || []).map(r => [r.work_type, r.employee_count, r.duration, r.unit, r.unit_price, r.total]));
  add("Техник", ["Техник", "Цаг", "Нэг цагийн үнэ", "Нийт"], (c.equipment as Row[] || []).map(r => [r.equipment_name, r.hours, r.hourly_rate, r.total]));
  add("Тээвэр", ["Төрөл", "Тоо", "Нэгж үнэ", "Нийт"], (c.transport as Row[] || []).map(r => [r.transport_type, r.quantity, r.unit_price, r.total]));
  add("Бусад", ["Нэр", "Тайлбар", "Дүн"], (c.other as Row[] || []).map(r => [r.name, r.description, r.amount]));
  ws.addRow([]); const grand = ws.addRow(["НИЙТ ТООЦООЛСОН ӨРТӨГ", c.grand_total]); grand.font = { bold: true, size: 14 }; ws.columns = [{ width: 30 }, { width: 24 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(request: Request) {
  const session = await allowed(); if (!session) return Response.json({ error: "Эрхгүй." }, { status: 403 });
  const params = new URL(request.url).searchParams; const id = Number(params.get("id")); const calculation = await getCalculation(session, id); if (!calculation) return Response.json({ error: "Тооцоолол олдсонгүй." }, { status: 404 });
  const record = calculation as Row;
  const filename = `calculation-${text(record.calculation_number).replace(/[^a-zA-Z0-9-]/g, "-")}`;
  if (params.get("format") === "pdf") { const browser = await chromium.launch({ headless: true }); try { const page = await browser.newPage(); await page.setContent(html(record), { waitUntil: "load" }); const pdf = await page.pdf({ format: "A4", printBackground: true }); return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` } }); } finally { await browser.close(); } }
  const buffer = await workbook(record); return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` } });
}

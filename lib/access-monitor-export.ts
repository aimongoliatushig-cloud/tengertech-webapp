import "server-only";

import { AlignmentType, Document, PageOrientation, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { chromium } from "playwright";

import type { ErpAccessEntry } from "@/lib/access-monitor";
import { buildReportWorkbook } from "@/lib/report-xlsx";

const FONT = "Arial";

function dateText(value: string) {
  if (!value) return "Нэвтрээгүй";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(date);
}

function loginEvents(entry: ErpAccessEntry) {
  return entry.loginHistory.length
    ? entry.loginHistory.map((event) => ({ date: dateText(event.loggedInAt), device: event.device }))
    : entry.lastLoginAt
      ? [{ date: dateText(entry.lastLoginAt), device: "Odoo-д хадгалагдсан сүүлийн нэвтрэлт" }]
      : [];
}

function uniqueDays(entry: ErpAccessEntry) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" });
  const values = entry.loginHistory.length
    ? entry.loginHistory.map((event) => event.loggedInAt)
    : entry.lastLoginAt ? [entry.lastLoginAt] : [];
  return new Set(values.map((value) => formatter.format(new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`)))).size;
}

function rows(entries: ErpAccessEntry[]) {
  return entries.flatMap((entry, index) => {
    const events = loginEvents(entry);
    const base = [index + 1, entry.name, entry.department || "Хэлтэсгүй", entry.jobTitle || "Албан тушаалгүй", entry.login || "—", dateText(entry.lastLoginAt), uniqueDays(entry), events.length];
    return events.length
      ? events.map((event, eventIndex) => [...base, eventIndex + 1, event.date, event.device])
      : [[...base, "—", "Нэвтрээгүй", "—"]];
  });
}

const headers = ["№", "Ажилтан", "Хэлтэс", "Албан тушаал", "Нэвтрэх нэр", "Сүүлд нэвтэрсэн", "Нийт өдөр", "Нийт удаа", "Бүртгэл №", "Нэвтэрсэн огноо, цаг", "Төхөөрөмж"];

export async function buildAccessMonitorXlsx(entries: ErpAccessEntry[]) {
  return buildReportWorkbook({
    title: "ERP хэрэглэгчдийн нэвтрэлтийн дэлгэрэнгүй тайлан",
    meta: [{ label: "Нийт ажилтан", value: String(entries.length) }],
    sections: [{ caption: "Нэвтрэлтийн бүртгэл", headers, rows: rows(entries), columnWidths: [7, 24, 26, 24, 22, 20, 12, 12, 12, 22, 35] }],
    sheetName: "Нэвтрэлтийн тайлан",
  });
}

function cell(text: unknown, bold = false) {
  return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ""), bold, font: FONT, size: 18 })] })] });
}

export async function buildAccessMonitorDocx(entries: ErpAccessEntry[]) {
  const tableRows = [new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, true)) })];
  rows(entries).forEach((row) => tableRows.push(new TableRow({ children: row.map((value) => cell(value)) })));
  const doc = new Document({ creator: "ERP", sections: [{
    properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 500, bottom: 500, left: 500, right: 500 } } },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [new TextRun({ text: "ERP ХЭРЭГЛЭГЧДИЙН НЭВТРЭЛТИЙН ДЭЛГЭРЭНГҮЙ ТАЙЛАН", bold: true, font: FONT, size: 26 })] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 120 }, children: [new TextRun({ text: `Нийт ${entries.length} ажилтан · ${new Date().toLocaleDateString("mn-MN")}`, font: FONT, size: 20 })] }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
    ],
  }] });
  return Packer.toBuffer(doc);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

export async function buildAccessMonitorPdf(entries: ErpAccessEntry[]) {
  const bodyRows = rows(entries).map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
  const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#17231a;font-size:8pt}h1{text-align:center;color:#176b3a;font-size:15pt;margin:0 0 3mm}p{text-align:right;margin:0 0 4mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aebcaf;padding:2mm;vertical-align:top}th{background:#edf5ee;font-weight:700}tr{break-inside:avoid}</style></head><body><h1>ERP ХЭРЭГЛЭГЧДИЙН НЭВТРЭЛТИЙН ДЭЛГЭРЭНГҮЙ ТАЙЛАН</h1><p>Нийт ${entries.length} ажилтан · ${new Date().toLocaleDateString("mn-MN")}</p><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
  } finally { await browser.close(); }
}

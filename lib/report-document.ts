import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

// ХАН-УУЛ ДҮҮРГИЙН ТОХИЖИЛТ ҮЙЛЧИЛГЭЭНИЙ ТӨВ — албан тайлангийн толгойн мэдээлэл.
// Эх сурвалж: https://khanuulecotut.mn/
export const REPORT_ORG = {
  name: "ХАН-УУЛ ДҮҮРГИЙН ТОХИЖИЛТ ҮЙЛЧИЛГЭЭНИЙ ТӨВ ОНӨААТҮГ",
  shortName: "Тохижилт үйлчилгээний төв",
  address: "Хан-Уул дүүрэг, 19 дүгээр хороо, Сүмбэр тауэр оффис 403 тоот",
  phone: "95071965",
  email: "Khanuul.tokhijilt@gmail.com",
  website: "khanuulecotut.mn",
  // MNS 5140: баримт бичиг үйлдсэн газар
  place: "Улаанбаатар хот",
} as const;

// MNS 5140: тамга/тэмдгийн талбар
export const REPORT_SEAL_LABEL = "Тамга /тэмдэг/";

// Албан ёсны тайлангийн гарын үсгийн блок (танай жишиг тайлангийн дагуу).
export const REPORT_SIGNATURES = [
  { role: "Хянасан", position: "Тохижилт үйлчилгээний төв ОНӨААТҮГ-ын захирал", name: "П.Мөнх-Эрдэнэ" },
  { role: "Илтгэх хуудас бичсэн", position: "Тайлан, төлөвлөгөө хариуцсан мэргэжилтэн", name: "Б.Болормаа" },
] as const;

let cachedLogo: Buffer | null | undefined;

export async function loadReportLogoBuffer(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) {
    return cachedLogo;
  }
  // Албан лого (татаж авсан) → байхгүй бол үндсэн лого руу шилжинэ.
  for (const file of ["report-logo.png", "logo.png"]) {
    try {
      cachedLogo = await readFile(path.join(process.cwd(), "public", file));
      return cachedLogo;
    } catch {
      // дараагийн файл руу
    }
  }
  cachedLogo = null;
  return cachedLogo;
}

export async function loadReportLogoDataUrl(): Promise<string> {
  const buffer = await loadReportLogoBuffer();
  return buffer ? `data:image/png;base64,${buffer.toString("base64")}` : "";
}

let cachedEmblem: Buffer | null | undefined;

// Дугуй "Тохижилт үйлчилгээний төв ОНӨААТҮГ" тэмдэг
export async function loadReportEmblemBuffer(): Promise<Buffer | null> {
  if (cachedEmblem !== undefined) {
    return cachedEmblem;
  }
  try {
    cachedEmblem = await readFile(path.join(process.cwd(), "public", "report-emblem.png"));
  } catch {
    cachedEmblem = null;
  }
  return cachedEmblem;
}

export async function loadReportEmblemDataUrl(): Promise<string> {
  const buffer = await loadReportEmblemBuffer();
  return buffer ? `data:image/png;base64,${buffer.toString("base64")}` : "";
}

export function reportTodayStamp() {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Хувь хүний нэр/login дээр түшиглэсэн тусгай эрхүүдийг НЭГ дороос удирдана.
// Урьд нь эдгээр login/нэр нь roles.ts, general-dashboard-access.ts зэрэгт тус
// тусдаа, өөр өөр normalize-тэйгээр хатуу бичигдсэн байсан тул зөрчилддөг байв.
//
// Урт хугацааны зорилт: эдгээрийг Odoo security group руу шилжүүлэх. Хэрэв
// шилжүүлбэл энэ файлын set-үүдийг хоослоход л болно.

export function normalizeLoginDigits(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

export function compactPersonName(value?: string | null) {
  return String(value ?? "")
    .toLocaleLowerCase("mn-MN")
    .replace(/[.,/\\]+/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

// Тайлан, төлөвлөгөө хариуцсан мэргэжилтэн (зөвхөн тайлангийн хэсэгт хандана)
const REPORT_PLANNING_LOGINS = new Set(["90858504"]);
const REPORT_PLANNING_NAMES = new Set(["бболормаа"]);

// Төлбөр, хураамжийн мэргэжилтэн (жингийн тайлан харна)
const FEE_WEIGHT_SPECIALIST_LOGINS = new Set(["88105116"]);
const FEE_WEIGHT_SPECIALIST_NAMES = new Set(["бганчимэг"]);

// Ерөнхий хяналтын самбар тусгайлан нээх login-ууд
const GENERAL_DASHBOARD_LOGINS = new Set(["99996632", "80007504"]);

function matchesLoginOrName(
  login: string | null | undefined,
  name: string | null | undefined,
  logins: Set<string>,
  names: Set<string>,
) {
  return logins.has(normalizeLoginDigits(login)) || names.has(compactPersonName(name));
}

export function isReportPlanningPerson(login?: string | null, name?: string | null) {
  return matchesLoginOrName(login, name, REPORT_PLANNING_LOGINS, REPORT_PLANNING_NAMES);
}

export function isFeeWeightSpecialistPerson(login?: string | null, name?: string | null) {
  return matchesLoginOrName(login, name, FEE_WEIGHT_SPECIALIST_LOGINS, FEE_WEIGHT_SPECIALIST_NAMES);
}

export function isGeneralDashboardPerson(login?: string | null) {
  return GENERAL_DASHBOARD_LOGINS.has(normalizeLoginDigits(login));
}

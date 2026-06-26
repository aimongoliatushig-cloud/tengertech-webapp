// Тайлангуудын нэгдсэн хугацаа сонгох логик (Сараар / Жилээр / Өдрөөр / Хугацаагаар).
// Шатахуун-жин болон ажлын тайлан хоёр ижил UX ашиглана.

export type ReportMode = "month" | "year" | "day" | "range";

export const REPORT_MODE_TABS: { key: ReportMode; label: string }[] = [
  { key: "month", label: "Сараар" },
  { key: "year", label: "Жилээр" },
  { key: "day", label: "Өдрөөр" },
  { key: "range", label: "Хугацаагаар" },
];

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const YEAR_KEY_PATTERN = /^\d{4}$/;

export function reportTodayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function shiftReportMonthKey(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftReportDayKey(dateKey: string, delta: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return shifted.toISOString().slice(0, 10);
}

export function reportMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year} оны ${month}-р сар`;
}

export function buildReportMonthOptions(currentMonthKey: string, selectedMonthKey: string, count = 24) {
  const keys = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    keys.add(shiftReportMonthKey(currentMonthKey, -index));
  }
  keys.add(selectedMonthKey);
  return Array.from(keys)
    .sort((left, right) => (left < right ? 1 : -1))
    .map((value) => ({ value, label: reportMonthLabel(value) }));
}

export type ResolvedReportPeriod = {
  mode: ReportMode;
  month: string;
  year: string;
  date: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
};

export function resolveReportPeriod(params: {
  mode?: string;
  month?: string;
  year?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
}): ResolvedReportPeriod {
  const today = reportTodayDateKey();
  const mode: ReportMode = ["month", "year", "day", "range"].includes(params.mode ?? "")
    ? (params.mode as ReportMode)
    : "month";

  const month = MONTH_KEY_PATTERN.test(params.month ?? "") ? (params.month as string) : today.slice(0, 7);
  const year = YEAR_KEY_PATTERN.test(params.year ?? "") ? (params.year as string) : today.slice(0, 4);
  const date = DATE_KEY_PATTERN.test(params.date ?? "") ? (params.date as string) : today;

  let startDate = "";
  let endDate = "";
  let periodLabel = "";

  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    startDate = `${month}-01`;
    endDate = `${month}-${String(lastDayOfMonth(y, m - 1)).padStart(2, "0")}`;
    periodLabel = reportMonthLabel(month);
  } else if (mode === "year") {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    periodLabel = `${year} он`;
  } else if (mode === "day") {
    startDate = date;
    endDate = date;
    periodLabel = date;
  } else {
    const requestedStart = DATE_KEY_PATTERN.test(params.startDate ?? "") ? (params.startDate as string) : `${today.slice(0, 7)}-01`;
    const requestedEnd = DATE_KEY_PATTERN.test(params.endDate ?? "") ? (params.endDate as string) : today;
    startDate = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
    endDate = requestedStart <= requestedEnd ? requestedEnd : requestedStart;
    periodLabel = startDate === endDate ? startDate : `${startDate} - ${endDate}`;
  }

  return { mode, month, year, date, startDate, endDate, periodLabel };
}

export function appendReportPeriodSearch(search: URLSearchParams, period: ResolvedReportPeriod) {
  search.set("mode", period.mode);
  if (period.mode === "month") {
    search.set("month", period.month);
  } else if (period.mode === "year") {
    search.set("year", period.year);
  } else if (period.mode === "day") {
    search.set("date", period.date);
  } else {
    search.set("startDate", period.startDate);
    search.set("endDate", period.endDate);
  }
}

export function buildReportPeriodHref(
  basePath: string,
  period: ResolvedReportPeriod,
  overrides: Partial<ResolvedReportPeriod>,
  extraParams: Record<string, string> = {},
) {
  const next = { ...period, ...overrides };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) {
      search.set(key, value);
    }
  }
  search.set("mode", next.mode);
  if (next.mode === "month") {
    search.set("month", next.month);
  } else if (next.mode === "year") {
    search.set("year", next.year);
  } else if (next.mode === "day") {
    search.set("date", next.date);
  } else {
    search.set("startDate", next.startDate);
    search.set("endDate", next.endDate);
  }
  return `${basePath}?${search.toString()}`;
}

import "server-only";

import { loadDepartmentHeadUserIds } from "@/lib/notification-recipients";
import { executeOdooKw } from "@/lib/odoo";
import { notifyPushEvent } from "@/lib/push-notifications";

type WeightReportRecord = {
  weight?: number | false;
  unit?: "kg" | "ton" | false;
};

type FuelReportRecord = {
  fuel_liters?: number | false;
};

type UserRecord = {
  id: number;
};

type DepartmentRecord = {
  id: number;
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const NOTIFIED_DATE_KEY = "municipal_repair_workflow.garbage_daily_summary_notified_date";

function currentDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function uniqueUserIds(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is number => Number.isFinite(value ?? NaN) && Number(value) > 0)),
  );
}

function formatCompactNumber(value: number, fractionDigits = 1) {
  const rounded = Number(value.toFixed(fractionDigits));
  return new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : fractionDigits,
  }).format(rounded);
}

function formatWeight(kg: number) {
  if (kg >= 1000) {
    return `${formatCompactNumber(kg / 1000, 1)} тн`;
  }
  return `${formatCompactNumber(kg, 0)} кг`;
}

function formatFuel(liters: number) {
  return `${formatCompactNumber(liters, 1)} л`;
}

async function loadDailyTotals(reportDate: string) {
  const [weightRows, fuelRows] = await Promise.all([
    executeOdooKw<WeightReportRecord[]>(
      "municipal.garbage.weight.report",
      "search_read",
      [[["report_date", "=", reportDate], ["state", "=", "success"]]],
      {
        fields: ["weight", "unit"],
        limit: 10000,
        context: { active_test: false },
      },
    ).catch((error) => {
      console.warn("Garbage weight notification total lookup failed:", error);
      return [];
    }),
    executeOdooKw<FuelReportRecord[]>(
      "municipal.garbage.fuel.report",
      "search_read",
      [[["report_date", "=", reportDate], ["state", "=", "success"]]],
      {
        fields: ["fuel_liters"],
        limit: 10000,
        context: { active_test: false },
      },
    ).catch((error) => {
      console.warn("Garbage fuel notification total lookup failed:", error);
      return [];
    }),
  ]);

  const weightKg = weightRows.reduce((sum, row) => {
    const weight = Number(row.weight ?? 0);
    return sum + (row.unit === "ton" ? weight * 1000 : weight);
  }, 0);
  const fuelLiters = fuelRows.reduce((sum, row) => sum + Number(row.fuel_liters ?? 0), 0);

  return {
    weightKg,
    fuelLiters,
    weightReportCount: weightRows.length,
    fuelReportCount: fuelRows.length,
  };
}

async function loadGeneralManagerUserIds() {
  const users = await executeOdooKw<UserRecord[]>(
    "res.users",
    "search_read",
    [[["ops_user_type", "=", "general_manager"], ["share", "=", false]]],
    {
      fields: ["id"],
      limit: 100,
      context: { active_test: false },
    },
  ).catch((error) => {
    console.warn("Garbage summary general manager recipients failed:", error);
    return [];
  });

  return uniqueUserIds(users.map((user) => user.id));
}

async function loadAutoBaseDepartmentId() {
  for (const name of [
    "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    "Авто бааз",
    "Хог тээвэрлэлтийн хэлтэс",
  ]) {
    const departments = await executeOdooKw<DepartmentRecord[]>(
      "hr.department",
      "search_read",
      [[["name", "=", name]]],
      {
        fields: ["id"],
        limit: 1,
        context: { active_test: false },
      },
    ).catch(() => []);
    if (departments[0]?.id) {
      return departments[0].id;
    }
  }

  const departments = await executeOdooKw<DepartmentRecord[]>(
    "hr.department",
    "search_read",
    [[["name", "ilike", "авто"]]],
    {
      fields: ["id"],
      limit: 1,
      context: { active_test: false },
    },
  ).catch(() => []);

  return departments[0]?.id ?? null;
}

async function loadGarbageSummaryRecipientUserIds() {
  const autoBaseDepartmentId = await loadAutoBaseDepartmentId();
  const [generalManagerIds, autoBaseHeadIds] = await Promise.all([
    loadGeneralManagerUserIds(),
    autoBaseDepartmentId ? loadDepartmentHeadUserIds(autoBaseDepartmentId) : Promise.resolve([]),
  ]);

  return uniqueUserIds([...generalManagerIds, ...autoBaseHeadIds]);
}

async function wasAlreadyNotified(reportDate: string) {
  const value = await executeOdooKw<string>(
    "ir.config_parameter",
    "get_param",
    [NOTIFIED_DATE_KEY, ""],
  ).catch(() => "");

  return String(value || "") === reportDate;
}

async function markNotified(reportDate: string) {
  await executeOdooKw<boolean>(
    "ir.config_parameter",
    "set_param",
    [NOTIFIED_DATE_KEY, reportDate],
  ).catch((error) => {
    console.warn("Garbage summary notification marker failed:", error);
    return false;
  });
}

export async function notifyGarbageDailySyncSummary(reportDates: string[]) {
  const today = currentDateKey();
  if (!reportDates.includes(today) || (await wasAlreadyNotified(today))) {
    return { sent: 0, skipped: "not_due" as const };
  }

  const totals = await loadDailyTotals(today);
  if (totals.weightKg <= 0) {
    return { sent: 0, skipped: "no_weight_total" as const };
  }

  const userIds = await loadGarbageSummaryRecipientUserIds();
  if (!userIds.length) {
    return { sent: 0, skipped: "no_recipients" as const };
  }

  const result = await notifyPushEvent({
    eventType: "work_changed",
    title: "Өдрийн жин, шатахуун татагдлаа",
    body: `Өнөөдрийн нийт жин ${formatWeight(totals.weightKg)}, шатахуун ${formatFuel(totals.fuelLiters)}.`,
    targetUrl: "/fleet-repair/garbage-daily",
    userIds,
  });

  if (!("skipped" in result)) {
    await markNotified(today);
  }
  return {
    ...result,
    userIds,
    totals,
  };
}

import "server-only";

import { filterByDepartment } from "@/lib/dashboard-scope";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";

type Relation = [number, string] | false;

type DailyWeightTotalRecord = {
  id: number;
  task_id: Relation;
  shift_date: string;
  vehicle_id: Relation;
  route_id: Relation;
  net_weight_total: number;
};

type GarbageTaskRecord = {
  id: number;
  name: string;
  mfo_shift_date: string | false;
  mfo_vehicle_id: Relation;
  mfo_route_id: Relation;
  mfo_driver_employee_id?: Relation;
  ops_department_id?: Relation;
  mfo_operation_type: string | false;
};

type FleetVehicleRecord = {
  id: number;
  name: string;
  license_plate?: string | false;
  municipal_department_id?: Relation;
};

type DayWeightAggregate = {
  vehicleName: string;
  plate: string;
  primaryLabel: string;
  departmentName: string;
  driverNames: Set<string>;
  kg: number;
  taskIds: Set<number>;
  proofImages: GarbageWeightProofImage[];
};

type ProofImageRecord = {
  id: number;
  name?: string | false;
  task_id: Relation;
  proof_type?: string | false;
  capture_datetime?: string | false;
  uploader_user_id?: Relation;
};

export type GarbageWeightProofImage = {
  id: number;
  name: string;
  url: string;
  proofType: string;
  capturedAt: string;
  uploaderName: string;
};

export type GarbageWeightLedgerRow = {
  vehicleKey: string;
  vehicleName: string;
  plate: string;
  primaryLabel: string;
  departmentName: string;
  driverNames: string[];
  proofImages: GarbageWeightProofImage[];
  kg: number;
  kgLabel: string;
  taskCount: number;
};

export type GarbageWeightLedgerDay = {
  dateKey: string;
  dateLabel: string;
  totalKg: number;
  totalLabel: string;
  rows: GarbageWeightLedgerRow[];
};

export type GarbageWeightPeriodSummary = {
  kg: number;
  kgLabel: string;
  rangeLabel: string;
};

export type GarbageWeightLedgerSnapshot = {
  generatedAtLabel: string;
  rangeLabel: string;
  totalKg: number;
  totalLabel: string;
  vehicleCount: number;
  dateCount: number;
  recordCount: number;
  lastMonth: GarbageWeightPeriodSummary;
  thisMonth: GarbageWeightPeriodSummary;
  previousWeek: GarbageWeightPeriodSummary;
  today: GarbageWeightPeriodSummary;
  yesterday: GarbageWeightPeriodSummary;
  dayItems: GarbageWeightLedgerDay[];
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const DEFAULT_DAY_WINDOW = 90;
const DEFAULT_MAX_DAYS = 30;

function relationId(relation: Relation) {
  return Array.isArray(relation) ? relation[0] : null;
}

function relationName(relation: Relation, fallback = "Тодорхойгүй") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function normalizedDepartmentName(relation: Relation) {
  const rawName = relationName(relation, "");
  return normalizeOrganizationUnitName(rawName) || rawName.trim();
}

function currentDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatKg(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} кг`;
}

function formatCompactDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}-р сарын ${day}`;
}

function formatRangeLabel(startDateKey: string, endDateKey: string) {
  if (startDateKey === endDateKey) {
    return formatCompactDateLabel(startDateKey);
  }

  return `${formatCompactDateLabel(startDateKey)} - ${formatCompactDateLabel(endDateKey)}`;
}

function startOfMonthDateKey(dateKey: string) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

function shiftMonthDateKey(dateKey: string, months: number) {
  const date = dateFromKey(dateKey);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function startOfWeekDateKey(dateKey: string) {
  const date = dateFromKey(dateKey);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function buildPeriodSummary(
  startDateKey: string,
  endDateKey: string,
  dateTotals: Map<string, number>,
): GarbageWeightPeriodSummary {
  let kg = 0;

  for (const [dateKey, totalKg] of dateTotals.entries()) {
    if (dateKey >= startDateKey && dateKey <= endDateKey) {
      kg += totalKg;
    }
  }

  return {
    kg,
    kgLabel: formatKg(kg),
    rangeLabel: formatRangeLabel(startDateKey, endDateKey),
  };
}

export async function loadGarbageWeightLedger(
  connectionOverrides: Partial<OdooConnection> = {},
  options: {
    dayWindow?: number;
    maxDays?: number;
    scopedDepartmentName?: string | null;
  } = {},
): Promise<GarbageWeightLedgerSnapshot> {
  const dayWindow = Math.max(options.dayWindow ?? DEFAULT_DAY_WINDOW, 1);
  const maxDays = Math.max(options.maxDays ?? DEFAULT_MAX_DAYS, 1);
  const endDate = currentDateKey();
  const windowStartDate = shiftDateKey(endDate, -(dayWindow - 1));
  const lastMonthStartDate = shiftMonthDateKey(endDate, -1);
  const thisMonthStartDate = startOfMonthDateKey(endDate);
  const currentWeekStartDate = startOfWeekDateKey(endDate);
  const previousWeekStartDate = shiftDateKey(currentWeekStartDate, -7);
  const previousWeekEndDate = shiftDateKey(currentWeekStartDate, -1);
  const todayDate = endDate;
  const yesterdayDate = shiftDateKey(endDate, -1);
  const startDate =
    [
      windowStartDate,
      lastMonthStartDate,
      thisMonthStartDate,
      previousWeekStartDate,
      yesterdayDate,
    ].sort()[0] ??
    windowStartDate;
  const emptyDateTotals = new Map<string, number>();

  const emptySnapshot: GarbageWeightLedgerSnapshot = {
    generatedAtLabel: formatDateTime(new Date()),
    rangeLabel: `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`,
    totalKg: 0,
    totalLabel: formatKg(0),
    vehicleCount: 0,
    dateCount: 0,
    recordCount: 0,
    lastMonth: buildPeriodSummary(lastMonthStartDate, endDate, emptyDateTotals),
    thisMonth: buildPeriodSummary(thisMonthStartDate, endDate, emptyDateTotals),
    previousWeek: buildPeriodSummary(
      previousWeekStartDate,
      previousWeekEndDate,
      emptyDateTotals,
    ),
    today: buildPeriodSummary(todayDate, todayDate, emptyDateTotals),
    yesterday: buildPeriodSummary(yesterdayDate, yesterdayDate, emptyDateTotals),
    dayItems: [],
  };

  const weightTotals = await executeOdooKw<DailyWeightTotalRecord[]>(
    "mfo.daily.weight.total",
    "search_read",
    [
      [
        ["shift_date", ">=", startDate],
        ["shift_date", "<=", endDate],
      ],
    ],
    {
      fields: ["task_id", "shift_date", "vehicle_id", "route_id", "net_weight_total"],
      order: "shift_date desc, id desc",
      limit: 5000,
    },
    connectionOverrides,
  );

  if (!weightTotals.length) {
    return emptySnapshot;
  }

  const taskIds = Array.from(
    new Set(
      weightTotals
        .map((weight) => relationId(weight.task_id))
        .filter((taskId): taskId is number => Boolean(taskId)),
    ),
  );

  if (!taskIds.length) {
    return emptySnapshot;
  }

  const tasks = await executeOdooKw<GarbageTaskRecord[]>(
    "project.task",
    "search_read",
    [
      [
        ["id", "in", taskIds],
        ["mfo_operation_type", "=", "garbage"],
      ],
    ],
    {
      fields: [
        "name",
        "mfo_shift_date",
        "mfo_vehicle_id",
        "mfo_route_id",
        "mfo_driver_employee_id",
        "ops_department_id",
        "mfo_operation_type",
      ],
      order: "mfo_shift_date desc, id desc",
      limit: Math.max(taskIds.length, 500),
    },
    connectionOverrides,
  );

  if (!tasks.length) {
    return emptySnapshot;
  }

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const garbageWeights = weightTotals.filter((weight) => {
    const taskId = relationId(weight.task_id);
    return taskId ? taskById.has(taskId) : false;
  });

  if (!garbageWeights.length) {
    return emptySnapshot;
  }

  const vehicleIds = Array.from(
    new Set(
      garbageWeights
        .map((weight) => relationId(weight.vehicle_id))
        .filter((vehicleId): vehicleId is number => Boolean(vehicleId)),
    ),
  );

  const vehicles = vehicleIds.length
    ? await executeOdooKw<FleetVehicleRecord[]>(
        "fleet.vehicle",
        "search_read",
        [[["id", "in", vehicleIds]]],
        {
          fields: ["name", "license_plate", "municipal_department_id"],
          limit: vehicleIds.length,
        },
        connectionOverrides,
      )
    : [];

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const scopedDepartmentName = options.scopedDepartmentName?.trim() || null;
  const proofImages = await executeOdooKw<ProofImageRecord[]>(
    "mfo.proof.image",
    "search_read",
    [[["task_id", "in", Array.from(taskById.keys())]]],
    {
      fields: ["name", "task_id", "proof_type", "capture_datetime", "uploader_user_id"],
      order: "capture_datetime desc, id desc",
      limit: 500,
    },
    connectionOverrides,
  ).catch(() => []);
  const proofImagesByTaskId = new Map<number, GarbageWeightProofImage[]>();
  for (const image of proofImages) {
    const taskId = relationId(image.task_id);
    if (!taskId) {
      continue;
    }
    const images = proofImagesByTaskId.get(taskId) ?? [];
    images.push({
      id: image.id,
      name: image.name || `proof-${image.id}.jpg`,
      url: `/api/field/proofs/${image.id}/image`,
      proofType: String(image.proof_type || ""),
      capturedAt: String(image.capture_datetime || ""),
      uploaderName: relationName(image.uploader_user_id ?? false, ""),
    });
    proofImagesByTaskId.set(taskId, images);
  }
  const dayMap = new Map<string, Map<string, DayWeightAggregate>>();

  for (const weight of garbageWeights) {
    const taskId = relationId(weight.task_id);
    const task = taskId ? taskById.get(taskId) : undefined;
    if (!task) {
      continue;
    }

    const dateKey = weight.shift_date || task.mfo_shift_date || startDate;
    const vehicleId = relationId(weight.vehicle_id) ?? relationId(task.mfo_vehicle_id);
    const vehicleKey = vehicleId ? String(vehicleId) : relationName(weight.vehicle_id, task.name);
    const vehicle = vehicleId ? vehicleById.get(vehicleId) : undefined;
    const departmentName =
      normalizedDepartmentName(vehicle?.municipal_department_id ?? false) ||
      normalizedDepartmentName(task.ops_department_id ?? false);
    if (
      scopedDepartmentName &&
      (!departmentName || !filterByDepartment([{ departmentName }], scopedDepartmentName).length)
    ) {
      continue;
    }
    const vehicleName =
      vehicle?.name ||
      relationName(weight.vehicle_id, relationName(task.mfo_vehicle_id, "Тодорхойгүй машин"));
    const plate = vehicle?.license_plate || "";
    const primaryLabel = plate || vehicleName;
    const driverName = relationName(task.mfo_driver_employee_id ?? false, "");

    const dayEntry = dayMap.get(dateKey) ?? new Map<string, DayWeightAggregate>();
    const row: DayWeightAggregate =
      dayEntry.get(vehicleKey) ??
      {
        vehicleName,
        plate,
        primaryLabel,
        departmentName,
        driverNames: new Set<string>(),
        kg: 0,
        taskIds: new Set<number>(),
        proofImages: [],
      };

    row.kg += weight.net_weight_total ?? 0;
    if (driverName) {
      row.driverNames.add(driverName);
    }
    if (taskId) {
      row.taskIds.add(taskId);
      const images = proofImagesByTaskId.get(taskId) ?? [];
      for (const image of images) {
        if (!row.proofImages.some((item) => item.id === image.id) && row.proofImages.length < 6) {
          row.proofImages.push(image);
        }
      }
    }

    dayEntry.set(vehicleKey, row);
    dayMap.set(dateKey, dayEntry);
  }

  const dateTotals = new Map(
    Array.from(dayMap.entries()).map(([dateKey, rows]) => [
      dateKey,
      Array.from(rows.values()).reduce((sum, row) => sum + row.kg, 0),
    ]),
  );

  const dayItems = Array.from(dayMap.keys())
    .sort((left, right) => right.localeCompare(left))
    .slice(0, maxDays)
    .map((dateKey) => {
      const rows = dayMap.get(dateKey) ?? new Map<string, DayWeightAggregate>();
      const normalizedRows = Array.from(rows.entries())
        .map(([vehicleKey, row]) => ({
          vehicleKey,
          vehicleName: row.vehicleName,
          plate: row.plate,
          primaryLabel: row.primaryLabel,
          departmentName: row.departmentName,
          driverNames: Array.from(row.driverNames),
          proofImages: row.proofImages,
          kg: row.kg,
          kgLabel: formatKg(row.kg),
          taskCount: row.taskIds.size,
        }))
        .sort(
          (left, right) =>
            right.kg - left.kg || left.primaryLabel.localeCompare(right.primaryLabel, "mn"),
        );

      const totalKg = dateTotals.get(dateKey) ?? 0;

      return {
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        totalKg,
        totalLabel: formatKg(totalKg),
        rows: normalizedRows,
      } satisfies GarbageWeightLedgerDay;
    });

  const totalKg = dayItems.reduce((sum, day) => sum + day.totalKg, 0);
  const vehicleCount = new Set(
    dayItems.flatMap((day) => day.rows.map((row) => row.vehicleKey)),
  ).size;
  const oldestDateKey = dayItems[dayItems.length - 1]?.dateKey ?? startDate;
  const newestDateKey = dayItems[0]?.dateKey ?? endDate;

  return {
    generatedAtLabel: formatDateTime(new Date()),
    rangeLabel: `${formatDateLabel(oldestDateKey)} - ${formatDateLabel(newestDateKey)}`,
    totalKg,
    totalLabel: formatKg(totalKg),
    vehicleCount,
    dateCount: dayItems.length,
    recordCount: dayItems.reduce((sum, day) => sum + day.rows.length, 0),
    lastMonth: buildPeriodSummary(lastMonthStartDate, endDate, dateTotals),
    thisMonth: buildPeriodSummary(thisMonthStartDate, endDate, dateTotals),
    previousWeek: buildPeriodSummary(previousWeekStartDate, previousWeekEndDate, dateTotals),
    today: buildPeriodSummary(todayDate, todayDate, dateTotals),
    yesterday: buildPeriodSummary(yesterdayDate, yesterdayDate, dateTotals),
    dayItems,
  };
}

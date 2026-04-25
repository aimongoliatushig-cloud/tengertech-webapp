import "server-only";

import { executeOdooKw, type OdooConnection } from "@/lib/odoo";

type Relation = [number, string] | false;

type GarbageTaskRecord = {
  id: number;
  name: string;
  project_id: Relation;
  mfo_shift_date: string | false;
  mfo_vehicle_id: Relation;
  mfo_driver_employee_id: Relation;
  mfo_route_id: Relation;
  mfo_state: string | false;
  ops_progress_percent: number;
  mfo_end_shift_summary: string | false;
  mfo_total_net_weight: number;
  mfo_quality_exception_count: number;
  mfo_weight_sync_warning: boolean;
  mfo_unresolved_stop_count: number;
  mfo_missing_proof_stop_count: number;
  mfo_route_deviation_stop_count: number;
  mfo_skipped_without_reason_count: number;
  mfo_start_datetime: string | false;
  mfo_end_datetime: string | false;
};

type WeightTotalRecord = {
  id: number;
  task_id: Relation;
  shift_date: string;
  vehicle_id: Relation;
  route_id: Relation;
  net_weight_total: number;
};

type ExecutiveStatusKey =
  | "planned"
  | "working"
  | "review"
  | "verified"
  | "problem";

type SeverityKey = "red" | "amber";

export type GarbageKpiCard = {
  label: string;
  value: string;
  note: string;
  tone: "normal" | "warning" | "critical" | "weight";
};

export type GarbageAlertItem = {
  id: string;
  title: string;
  note: string;
  severity: SeverityKey;
  severityLabel: string;
  href: string;
};

export type GarbageSignalItem = {
  label: string;
  value: number;
  note: string;
};

export type GarbageTaskRow = {
  id: number;
  name: string;
  vehicleName: string;
  driverName: string;
  routeName: string;
  statusKey: ExecutiveStatusKey;
  statusLabel: string;
  progress: number;
  finalWeightKg: number | null;
  finalWeightLabel: string;
  issueFlag: boolean;
  detailHref: string;
};

export type GarbageWeightSummary = {
  totalKg: number;
  totalLabel: string;
  topVehicleName: string;
  topVehicleKg: number;
  topVehicleLabel: string;
  averageKg: number;
  averageLabel: string;
};

export type GarbageTrendPoint = {
  dateKey: string;
  dateLabel: string;
  totalKg: number;
  totalLabel: string;
  heightPercent: number;
};

export type GarbageExecutiveSnapshot = {
  selectedDate: string;
  selectedDateLabel: string;
  selectedDateInput: string;
  previousDate: string;
  previousDateLabel: string;
  generatedAtLabel: string;
  notificationCount: number;
  kpis: GarbageKpiCard[];
  alerts: GarbageAlertItem[];
  signals: GarbageSignalItem[];
  todayTasks: GarbageTaskRow[];
  yesterdayWeight: GarbageWeightSummary;
  monthlyWeight: {
    totalKg: number;
    totalLabel: string;
    addedYesterdayKg: number;
    addedYesterdayLabel: string;
    trend: GarbageTrendPoint[];
  };
  quickLinks: Array<{
    label: string;
    note: string;
    href: string;
  }>;
};

const TIME_ZONE = "Asia/Ulaanbaatar";

const STATUS_LABELS: Record<ExecutiveStatusKey, string> = {
  planned: "Төлөвлөгдсөн",
  working: "Ажиллаж байна",
  review: "Хянагдаж байна",
  verified: "Баталгаажсан",
  problem: "Асуудалтай",
};

function relationName(relation: Relation, fallback = "Тодорхойгүй") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function currentDateString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDateString(value?: string) {
  const candidate =
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : currentDateString();
  const [year, month, day] = candidate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) {
    return parseDateString(currentDateString());
  }
  return {
    input: candidate,
    date,
  };
}

function shiftDateString(dateString: string, days: number) {
  const parsed = parseDateString(dateString);
  parsed.date.setUTCDate(parsed.date.getUTCDate() + days);
  return parsed.date.toISOString().slice(0, 10);
}

function formatLongDate(dateString: string) {
  const { date } = parseDateString(dateString);
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatWeightLabel(value: number) {
  return `${formatNumber(value)} кг`;
}

function taskReturnTo(dateString: string, filter?: string) {
  const base = new URLSearchParams({ date: dateString });
  if (filter && filter !== "all") {
    base.set("filter", filter);
  }
  return `/tasks?${base.toString()}`;
}

function taskDetailHref(taskId: number, dateString: string, filter?: string) {
  const returnTo = taskReturnTo(dateString, filter);
  return `/tasks/${taskId}?returnTo=${encodeURIComponent(returnTo)}`;
}

function resolveStatusKey(task: GarbageTaskRecord): ExecutiveStatusKey {
  if ((task.mfo_quality_exception_count ?? 0) > 0 || task.mfo_weight_sync_warning) {
    return "problem";
  }

  switch (task.mfo_state) {
    case "in_progress":
      return "working";
    case "submitted":
      return "review";
    case "verified":
      return "verified";
    case "draft":
    case "dispatched":
    default:
      return "planned";
  }
}

function buildFallbackSnapshot(selectedDate?: string): GarbageExecutiveSnapshot {
  const parsed = parseDateString(selectedDate);
  const previousDate = shiftDateString(parsed.input, -1);
  const yesterdayWeight = 12840;
  const trendValues = [9200, 10400, 11650, 9850, 12310, 11020, yesterdayWeight];
  const maxTrend = Math.max(...trendValues, 1);

  return {
    selectedDate: parsed.input,
    selectedDateLabel: formatLongDate(parsed.input),
    selectedDateInput: parsed.input,
    previousDate,
    previousDateLabel: formatLongDate(previousDate),
    generatedAtLabel: formatDateTime(new Date()),
    notificationCount: 4,
    kpis: [
      { label: "Өнөөдрийн ажил", value: "12", note: "Өглөөний хуваарь", tone: "normal" },
      { label: "Ажиллаж буй", value: "7", note: "Маршрут дээр явж байна", tone: "normal" },
      { label: "Шалгаж буй", value: "3", note: "Хянагчийн мөрөнд байна", tone: "warning" },
      { label: "Баталгаажсан", value: "1", note: "Өнөөдөр хаагдсан ажил", tone: "normal" },
      { label: "Асуудалтай", value: "2", note: "Шуурхай анхаарах шаардлагатай", tone: "critical" },
      { label: "Өчигдрийн жин", value: formatWeightLabel(yesterdayWeight), note: "Шөнийн таталтаар орсон", tone: "weight" },
    ],
    alerts: [
      {
        id: "fallback-1",
        title: "2 машин ажил эхлээгүй байна",
        note: "Өглөөний маршрутын бэлтгэлийг шалгана уу.",
        severity: "red",
        severityLabel: "Яаралтай",
        href: taskReturnTo(parsed.input, "planned"),
      },
      {
        id: "fallback-2",
      title: "3 ажил хяналт хүлээж байна",
        note: "Баталгаажуулалтын мөр удааширсан байна.",
        severity: "amber",
        severityLabel: "Анхаарах",
        href: taskReturnTo(parsed.input, "review"),
      },
      {
        id: "fallback-3",
        title: "1 тээвэрлэлт дээр зөрүү илэрсэн",
        note: "Зураг эсвэл маршрутын мэдээллийг дахин шалгана уу.",
        severity: "red",
        severityLabel: "Яаралтай",
        href: taskDetailHref(202, parsed.input, "problem"),
      },
      {
        id: "fallback-4",
        title: "2 ажил дээр жингийн мэдээлэл хүлээгдэж байна",
        note: "Өчигдрийн шөнийн таталтыг нягтална уу.",
        severity: "amber",
        severityLabel: "Анхаарах",
        href: taskReturnTo(parsed.input, "verified"),
      },
    ],
    signals: [
      { label: "Эхлээгүй машин", value: 2, note: "Төлөвлөгдсөн хэвээр байна" },
    { label: "Хяналт хүлээж буй ажил", value: 3, note: "Хянагчид очсон" },
      { label: "Асуудалтай тээвэрлэлт", value: 1, note: "Шуурхай үзэх шаардлагатай" },
      { label: "Жин хүлээгдэж буй ажил", value: 2, note: "Өчигдрийн таталт дутуу" },
    ],
    todayTasks: [
      {
        id: 202,
        name: "Хог тээврийн 2-р маршрут",
        vehicleName: "УБА 3256",
        driverName: "Батсүх",
        routeName: "2-р чиглэл",
        statusKey: "problem",
        statusLabel: STATUS_LABELS.problem,
        progress: 76,
        finalWeightKg: null,
        finalWeightLabel: "Хүлээгдэж байна",
        issueFlag: true,
        detailHref: taskDetailHref(202, parsed.input, "problem"),
      },
      {
        id: 203,
        name: "Хог тээврийн 5-р маршрут",
        vehicleName: "УБВ 8812",
        driverName: "Отгонбаяр",
        routeName: "5-р чиглэл",
        statusKey: "working",
        statusLabel: STATUS_LABELS.working,
        progress: 61,
        finalWeightKg: null,
        finalWeightLabel: "Хүлээгдэж байна",
        issueFlag: false,
        detailHref: taskDetailHref(203, parsed.input),
      },
      {
        id: 204,
        name: "Хог тээврийн 7-р маршрут",
        vehicleName: "УНӨ 4410",
        driverName: "Сүхбаатар",
        routeName: "7-р чиглэл",
        statusKey: "review",
        statusLabel: STATUS_LABELS.review,
        progress: 100,
        finalWeightKg: 11820,
        finalWeightLabel: formatWeightLabel(11820),
        issueFlag: false,
        detailHref: taskDetailHref(204, parsed.input, "review"),
      },
    ],
    yesterdayWeight: {
      totalKg: yesterdayWeight,
      totalLabel: formatWeightLabel(yesterdayWeight),
      topVehicleName: "УБВ 8812",
      topVehicleKg: 3520,
      topVehicleLabel: formatWeightLabel(3520),
      averageKg: 2140,
      averageLabel: formatWeightLabel(2140),
    },
    monthlyWeight: {
      totalKg: 214350,
      totalLabel: formatWeightLabel(214350),
      addedYesterdayKg: yesterdayWeight,
      addedYesterdayLabel: formatWeightLabel(yesterdayWeight),
      trend: trendValues.map((value, index) => ({
        dateKey: `${index + 1}`,
        dateLabel: `${index + 12}`,
        totalKg: value,
        totalLabel: formatWeightLabel(value),
        heightPercent: Math.max(18, Math.round((value / maxTrend) * 100)),
      })),
    },
    quickLinks: [
      {
        label: "Асуудалтай ажил",
        note: "Зөрүүтэй маршрутуудыг харах",
        href: taskReturnTo(parsed.input, "problem"),
      },
      {
      label: "Хяналт хүлээж буй ажил",
        note: "Баталгаажуулалтын мөрийг нээх",
        href: taskReturnTo(parsed.input, "review"),
      },
      {
        label: "Өнөөдрийн ажил",
        note: "Бүх ажлын жагсаалт",
        href: taskReturnTo(parsed.input, "all"),
      },
      {
        label: "Тайлан",
        note: "Өдрийн тайлангийн урсгал",
        href: "/reports",
      },
    ],
  };
}

export async function loadGarbageExecutiveSnapshot(
  connectionOverrides: Partial<OdooConnection> = {},
  requestedDate?: string,
): Promise<GarbageExecutiveSnapshot> {
  const parsed = parseDateString(requestedDate);
  const selectedDate = parsed.input;
  const previousDate = shiftDateString(selectedDate, -1);
  const monthStart = `${selectedDate.slice(0, 7)}-01`;

  try {
    const [tasks, weightTotals] = await Promise.all([
      executeOdooKw<GarbageTaskRecord[]>(
        "project.task",
        "search_read",
        [[
          ["mfo_is_operation_project", "=", true],
          ["mfo_operation_type", "=", "garbage"],
          ["mfo_shift_date", ">=", previousDate],
          ["mfo_shift_date", "<=", selectedDate],
        ]],
        {
          fields: [
            "name",
            "project_id",
            "mfo_shift_date",
            "mfo_vehicle_id",
            "mfo_driver_employee_id",
            "mfo_route_id",
            "mfo_state",
            "ops_progress_percent",
            "mfo_end_shift_summary",
            "mfo_total_net_weight",
            "mfo_quality_exception_count",
            "mfo_weight_sync_warning",
            "mfo_unresolved_stop_count",
            "mfo_missing_proof_stop_count",
            "mfo_route_deviation_stop_count",
            "mfo_skipped_without_reason_count",
            "mfo_start_datetime",
            "mfo_end_datetime",
          ],
          order: "mfo_shift_date desc, create_date desc",
          limit: 400,
        },
        connectionOverrides,
      ),
      executeOdooKw<WeightTotalRecord[]>(
        "mfo.daily.weight.total",
        "search_read",
        [[
          ["shift_date", ">=", monthStart],
          ["shift_date", "<=", previousDate],
        ]],
        {
          fields: ["task_id", "shift_date", "vehicle_id", "route_id", "net_weight_total"],
          order: "shift_date asc, create_date asc",
          limit: 2000,
        },
        connectionOverrides,
      ),
    ]);

    const garbageTaskIds = new Set(tasks.map((task) => task.id));
    const garbageWeightTotals = weightTotals.filter((weight) => {
      const taskId = Array.isArray(weight.task_id) ? weight.task_id[0] : null;
      return taskId ? garbageTaskIds.has(taskId) : false;
    });

    const todayTasks = tasks.filter((task) => task.mfo_shift_date === selectedDate);
    const yesterdayTasks = tasks.filter((task) => task.mfo_shift_date === previousDate);
    const yesterdayWeights = garbageWeightTotals.filter((weight) => weight.shift_date === previousDate);

    const todayRows = todayTasks
      .map((task) => {
        const statusKey = resolveStatusKey(task);
        const finalWeightKg = task.mfo_total_net_weight > 0 ? task.mfo_total_net_weight : null;
        return {
          id: task.id,
          name: task.name,
          vehicleName: relationName(task.mfo_vehicle_id, "Машин оноогдоогүй"),
          driverName: relationName(task.mfo_driver_employee_id, "Жолооч оноогдоогүй"),
          routeName: relationName(task.mfo_route_id, "Маршрут оноогдоогүй"),
          statusKey,
          statusLabel: STATUS_LABELS[statusKey],
          progress: Math.round(task.ops_progress_percent ?? 0),
          finalWeightKg,
          finalWeightLabel: finalWeightKg ? formatWeightLabel(finalWeightKg) : "Хүлээгдэж байна",
          issueFlag: statusKey === "problem",
          detailHref: taskDetailHref(task.id, selectedDate),
        } satisfies GarbageTaskRow;
      })
      .sort((left, right) => {
        const priorityOrder: Record<ExecutiveStatusKey, number> = {
          problem: 0,
          review: 1,
          working: 2,
          planned: 3,
          verified: 4,
        };
        return priorityOrder[left.statusKey] - priorityOrder[right.statusKey];
      });

    const workingCount = todayTasks.filter((task) => task.mfo_state === "in_progress").length;
    const reviewCount = todayTasks.filter((task) => task.mfo_state === "submitted").length;
    const verifiedCount = todayTasks.filter((task) => task.mfo_state === "verified").length;
    const problemCount = todayTasks.filter(
      (task) => (task.mfo_quality_exception_count ?? 0) > 0 || task.mfo_weight_sync_warning,
    ).length;

    const notStartedVehicles = new Set(
      todayTasks
        .filter((task) => task.mfo_state === "draft" || task.mfo_state === "dispatched")
        .map((task) => relationName(task.mfo_vehicle_id, "Техник тодорхойгүй")),
    );

    const yesterdayWeightByTask = new Set(
      yesterdayWeights
        .map((weight) => (Array.isArray(weight.task_id) ? weight.task_id[0] : null))
        .filter((value): value is number => Boolean(value)),
    );

    const weightPendingTasks = yesterdayTasks.filter(
      (task) => task.mfo_state === "verified" && !yesterdayWeightByTask.has(task.id),
    );

    const alerts: GarbageAlertItem[] = [];

    todayTasks
      .filter((task) => task.mfo_state === "draft" || task.mfo_state === "dispatched")
      .slice(0, 2)
      .forEach((task) => {
        alerts.push({
          id: `start-${task.id}`,
          title: `${relationName(task.mfo_vehicle_id, "Техник")} ажил эхлээгүй байна`,
          note: `${relationName(task.mfo_route_id, "Маршрут")} / төлөвлөгдсөн ажил`,
          severity: "red",
          severityLabel: "Яаралтай",
          href: taskDetailHref(task.id, selectedDate, "planned"),
        });
      });

    todayTasks
      .filter((task) => task.mfo_state === "submitted")
      .slice(0, 2)
      .forEach((task) => {
        alerts.push({
          id: `review-${task.id}`,
      title: `${relationName(task.mfo_vehicle_id, "Техник")} хяналт хүлээж байна`,
          note: `${relationName(task.mfo_route_id, "Маршрут")} / тайлан ирсэн`,
          severity: "amber",
          severityLabel: "Анхаарах",
          href: taskDetailHref(task.id, selectedDate, "review"),
        });
      });

    todayTasks
      .filter((task) => (task.mfo_quality_exception_count ?? 0) > 0 || task.mfo_weight_sync_warning)
      .slice(0, 2)
      .forEach((task) => {
        const issues = [
          task.mfo_missing_proof_stop_count ? "зураг дутуу" : "",
          task.mfo_route_deviation_stop_count ? "маршрутын зөрүү" : "",
          task.mfo_weight_sync_warning ? "жингийн синк шалгах" : "",
        ].filter(Boolean);
        alerts.push({
          id: `problem-${task.id}`,
          title: `${relationName(task.mfo_vehicle_id, "Техник")} дээр анхаарах зөрүү илэрлээ`,
          note: issues.join(", ") || "Чанарын анхааруулга үүссэн байна.",
          severity: "red",
          severityLabel: "Яаралтай",
          href: taskDetailHref(task.id, selectedDate, "problem"),
        });
      });

    weightPendingTasks.slice(0, 1).forEach((task) => {
      alerts.push({
        id: `weight-${task.id}`,
        title: `${relationName(task.mfo_vehicle_id, "Техник")} жингийн мэдээлэл хүлээгдэж байна`,
        note: `${formatLongDate(previousDate)}-ны шөнийн таталтыг нягтална уу.`,
        severity: "amber",
        severityLabel: "Анхаарах",
        href: taskDetailHref(task.id, selectedDate, "verified"),
      });
    });

    const topAlerts = alerts.slice(0, 5);

    const vehicleWeightMap = new Map<string, number>();
    for (const weight of yesterdayWeights) {
      const vehicleName = relationName(weight.vehicle_id, "Тодорхойгүй машин");
      vehicleWeightMap.set(vehicleName, (vehicleWeightMap.get(vehicleName) ?? 0) + (weight.net_weight_total ?? 0));
    }

    let topVehicleName = "Мэдээлэл алга";
    let topVehicleKg = 0;
    for (const [vehicleName, totalKg] of vehicleWeightMap.entries()) {
      if (totalKg > topVehicleKg) {
        topVehicleName = vehicleName;
        topVehicleKg = totalKg;
      }
    }

    const yesterdayTotalKg = yesterdayWeights.reduce(
      (sum, weight) => sum + (weight.net_weight_total ?? 0),
      0,
    );
    const averageKg = vehicleWeightMap.size ? yesterdayTotalKg / vehicleWeightMap.size : 0;

    const trendMap = new Map<string, number>();
    for (const weight of garbageWeightTotals) {
      trendMap.set(
        weight.shift_date,
        (trendMap.get(weight.shift_date) ?? 0) + (weight.net_weight_total ?? 0),
      );
    }

    const trend: GarbageTrendPoint[] = [];
    for (
      let cursor = monthStart;
      cursor <= previousDate;
      cursor = shiftDateString(cursor, 1)
    ) {
      const totalKg = trendMap.get(cursor) ?? 0;
      trend.push({
        dateKey: cursor,
        dateLabel: cursor.slice(8, 10),
        totalKg,
        totalLabel: formatWeightLabel(totalKg),
        heightPercent: 0,
      });
    }

    const maxTrendValue = Math.max(...trend.map((point) => point.totalKg), 1);
    for (const point of trend) {
      point.heightPercent = point.totalKg
        ? Math.max(18, Math.round((point.totalKg / maxTrendValue) * 100))
        : 10;
    }

    const monthlyTotalKg = garbageWeightTotals.reduce(
      (sum, weight) => sum + (weight.net_weight_total ?? 0),
      0,
    );

    return {
      selectedDate,
      selectedDateLabel: formatLongDate(selectedDate),
      selectedDateInput: selectedDate,
      previousDate,
      previousDateLabel: formatLongDate(previousDate),
      generatedAtLabel: formatDateTime(new Date()),
      notificationCount: topAlerts.length,
      kpis: [
        {
          label: "Өнөөдрийн ажил",
          value: formatNumber(todayTasks.length),
          note: `${formatLongDate(selectedDate)}-ний хуваарь`,
          tone: "normal",
        },
        {
          label: "Ажиллаж буй",
          value: formatNumber(workingCount),
          note: "Маршрут дээр явж байна",
          tone: "normal",
        },
        {
      label: "Хянагдаж буй",
          value: formatNumber(reviewCount),
          note: "Хянагчийн мөрөнд байна",
          tone: "warning",
        },
        {
          label: "Баталгаажсан",
          value: formatNumber(verifiedCount),
          note: "Өнөөдөр хаагдсан ажил",
          tone: "normal",
        },
        {
          label: "Асуудалтай",
          value: formatNumber(problemCount),
          note: "Шуурхай анхаарах шаардлагатай",
          tone: "critical",
        },
        {
          label: "Өчигдрийн жин",
          value: formatWeightLabel(yesterdayTotalKg),
          note: "Шөнийн таталтаар шинэчлэгдсэн",
          tone: "weight",
        },
      ],
      alerts: topAlerts,
      signals: [
        {
          label: "Эхлээгүй машин",
          value: notStartedVehicles.size,
          note: "Өглөөний гаралт хийгдээгүй",
        },
        {
      label: "Хяналт хүлээж буй ажил",
          value: reviewCount,
          note: "Баталгаажуулалтын мөрөнд байна",
        },
        {
          label: "Асуудалтай тээвэрлэлт",
          value: problemCount,
          note: "Чанар эсвэл синкийн анхааруулгатай",
        },
        {
          label: "Жин хүлээгдэж буй ажил",
          value: weightPendingTasks.length,
          note: "Өчигдрийн таталт дутуу байна",
        },
      ],
      todayTasks: todayRows,
      yesterdayWeight: {
        totalKg: yesterdayTotalKg,
        totalLabel: formatWeightLabel(yesterdayTotalKg),
        topVehicleName,
        topVehicleKg,
        topVehicleLabel: topVehicleKg ? formatWeightLabel(topVehicleKg) : "Мэдээлэл алга",
        averageKg,
        averageLabel: averageKg ? formatWeightLabel(averageKg) : "Мэдээлэл алга",
      },
      monthlyWeight: {
        totalKg: monthlyTotalKg,
        totalLabel: formatWeightLabel(monthlyTotalKg),
        addedYesterdayKg: yesterdayTotalKg,
        addedYesterdayLabel: formatWeightLabel(yesterdayTotalKg),
        trend,
      },
      quickLinks: [
        {
          label: "Асуудалтай ажил",
          note: "Зөрүүтэй тээвэрлэлтүүд",
          href: taskReturnTo(selectedDate, "problem"),
        },
        {
      label: "Хяналт хүлээж буй ажил",
          note: "Баталгаажуулалтын мөр",
          href: taskReturnTo(selectedDate, "review"),
        },
        {
          label: "Өнөөдрийн ажил",
          note: "Бүх ажлын жагсаалт",
          href: taskReturnTo(selectedDate, "all"),
        },
        {
          label: "Тайлан",
          note: "Өдрийн тайлангийн урсгал",
          href: "/reports",
        },
      ],
    };
  } catch (error) {
    console.warn("Falling back to garbage executive snapshot:", error);
    return buildFallbackSnapshot(selectedDate);
  }
}

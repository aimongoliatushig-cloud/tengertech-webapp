import {
  findDepartmentGroupByName,
  matchesDepartmentGroup,
} from "@/lib/department-groups";

const APP_TIME_ZONE = "Asia/Ulaanbaatar";

function formatDateKey(date: Date, timeZone = APP_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

export function getTodayDateKey(date = new Date()) {
  return formatDateKey(date);
}

export function getDateKeyFromValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatDateKey(parsed);
}

// Захирал/менежер/засаг даргын "үүрэг даалгавар" төрлийн директив төслүүд.
// Эдгээр нь нэг хэлтэст (ихэвчлэн Тохижилт) хамааруулагдсан ч бүх хэлтсийн
// ажилтнуудад тарсан дээрээс өгсөн даалгавар байдаг тул хэлтсийн даргын
// "Ажилтны даалгавар" хянах самбарт оруулахгүй (гүйцэтгэгч ажилтан болон
// удирдлага хэвээр харна). Ажлын "захирамж"-д тулгуурласан төслүүд нь
// "даалгавар" гэсэн үггүй тул эндээс хасагдахгүй.
export function isDirectiveTaskProject(projectName?: string | null): boolean {
  const text = (projectName ?? "").toLocaleLowerCase("mn-MN");
  if (!text.includes("даалгавар")) {
    return false;
  }
  return (
    text.includes("захир") ||
    text.includes("менежер") ||
    text.includes("засаг дарг") ||
    text.includes("нзд") ||
    text.includes("хороод") ||
    text.includes("ерөнхий сайд") ||
    text.includes("онцгой комисс") ||
    text.includes("шуурхай")
  );
}

export function filterByDepartment<T extends { departmentName: string }>(
  items: T[],
  departmentName?: string | null,
) {
  if (!departmentName) {
    return items;
  }

  const group = findDepartmentGroupByName(departmentName);

  return items.filter((item) =>
    group ? matchesDepartmentGroup(group, item.departmentName) : item.departmentName === departmentName,
  );
}

export function filterTasksToDate<T extends { scheduledDate?: string | null }>(
  items: T[],
  dateKey = getTodayDateKey(),
) {
  return items.filter((item) => item.scheduledDate === dateKey);
}

export function pickPrimaryDepartmentName(input: {
  taskDirectory?: Array<{ departmentName: string }>;
  reports?: Array<{ departmentName: string }>;
  projects?: Array<{ departmentName: string }>;
  departments?: Array<{ name: string }>;
}) {
  const counts = new Map<string, number>();

  const addDepartment = (name?: string | null, weight = 1) => {
    const normalized = (name ?? "").trim();
    if (!normalized) {
      return;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + weight);
  };

  for (const task of input.taskDirectory ?? []) {
    addDepartment(task.departmentName, 3);
  }

  for (const report of input.reports ?? []) {
    addDepartment(report.departmentName, 2);
  }

  for (const project of input.projects ?? []) {
    addDepartment(project.departmentName, 1);
  }

  if (counts.size === 0) {
    return input.departments?.[0]?.name ?? null;
  }

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

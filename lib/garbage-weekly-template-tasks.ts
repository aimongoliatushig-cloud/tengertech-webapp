import type { GarbageWeeklyTemplate, GarbageWeeklyTemplateDay } from "@/lib/garbage-weekly-template-types";
import type { TaskDirectoryItem } from "@/lib/odoo";

export const GARBAGE_TRANSPORT_DEPARTMENT_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";
const GARBAGE_TRANSPORT_PROJECT_NAME = "Хог тээврийн давтамжит маршрут";

const DAY_BY_INDEX: GarbageWeeklyTemplateDay[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function stableNegativeId(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return -Math.max(1, Math.abs(hash));
}

function vehicleCode(label: string) {
  return label.split(" - ")[0]?.trim() || label;
}

export function expandGarbageWeeklyTemplatesToTasks(
  templates: GarbageWeeklyTemplate[],
  rangeStartDateKey: string,
  rangeEndDateKey: string,
) {
  const start = parseDateKey(rangeStartDateKey);
  const end = parseDateKey(rangeEndDateKey);
  if (!start || !end || start > end) {
    return [];
  }

  const tasks: TaskDirectoryItem[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const dateKey = toDateKey(cursor);
    const weekday = DAY_BY_INDEX[cursor.getUTCDay()];
    const dayTemplates = templates
      .filter((template) => template.active && template.days[weekday])
      .sort((left, right) => left.routeName.localeCompare(right.routeName, "mn"));

    dayTemplates.forEach((template, index) => {
      const name = `${template.routeName} - ${vehicleCode(template.vehicleName)}`;
      tasks.push({
        id: stableNegativeId(`${template.id}:${dateKey}:${index}`),
        name,
        departmentName: GARBAGE_TRANSPORT_DEPARTMENT_NAME,
        projectName: GARBAGE_TRANSPORT_PROJECT_NAME,
        stageLabel: "Төлөвлөгдсөн",
        stageBucket: "todo",
        createdDate: template.createdAt.slice(0, 10),
        statusKey: "planned",
        statusLabel: "Төлөвлөгдсөн",
        deadline: dateKey,
        deadlineDateTime: `${dateKey}T09:00:00+08:00`,
        scheduledDate: dateKey,
        leaderName: template.teamName,
        priorityLabel: "Энгийн",
        progress: 0,
        plannedQuantity: 1,
        completedQuantity: 0,
        remainingQuantity: 1,
        measurementUnit: "маршрут",
        operationTypeLabel: "Хог тээвэр",
        issueFlag: false,
        assigneeIds: [],
        href: "/garbage-routes/weekly-plan",
      });
    });
  }

  return tasks;
}

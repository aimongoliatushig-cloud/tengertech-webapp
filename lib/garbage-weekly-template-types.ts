export type GarbageWeeklyTemplateDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type GarbageWeeklyTemplateDays = Record<GarbageWeeklyTemplateDay, boolean>;

export type GarbageWeeklyTemplate = {
  id: string;
  routeId: string;
  routeName: string;
  vehicleId: string;
  vehicleName: string;
  teamId: string;
  teamName: string;
  days: GarbageWeeklyTemplateDays;
  active: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type GarbageWeeklyTemplateInput = {
  routeId: string;
  routeName?: string;
  vehicleId: string;
  vehicleName?: string;
  teamId: string;
  teamName?: string;
  days: GarbageWeeklyTemplateDays;
  active?: boolean;
  note?: string;
};

export const EMPTY_GARBAGE_WEEKLY_TEMPLATE_DAYS: GarbageWeeklyTemplateDays = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

export const GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS: Array<{
  key: GarbageWeeklyTemplateDay;
  label: string;
}> = [
  { key: "monday", label: "Даваа" },
  { key: "tuesday", label: "Мягмар" },
  { key: "wednesday", label: "Лхагва" },
  { key: "thursday", label: "Пүрэв" },
  { key: "friday", label: "Баасан" },
  { key: "saturday", label: "Бямба" },
  { key: "sunday", label: "Ням" },
];

export function hasAnyGarbageWeeklyTemplateDay(days: GarbageWeeklyTemplateDays) {
  return GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.some(({ key }) => days[key]);
}

export function selectedGarbageWeeklyTemplateDayLabels(days: GarbageWeeklyTemplateDays) {
  return GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.filter(({ key }) => days[key]).map(({ label }) => label);
}

export function shareGarbageWeeklyTemplateDays(
  left: GarbageWeeklyTemplateDays,
  right: GarbageWeeklyTemplateDays,
) {
  return GARBAGE_WEEKLY_TEMPLATE_WEEKDAYS.some(({ key }) => left[key] && right[key]);
}

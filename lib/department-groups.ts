export type DepartmentGroupDefinition = {
  name: string;
  units: string[];
  icon: string;
  accent: string;
};

export const DEPARTMENT_GROUPS: DepartmentGroupDefinition[] = [
  {
    name: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    units: ["Хог тээвэрлэлт", "Авто бааз"],
    icon: "🚚",
    accent: "var(--tone-amber)",
  },
  {
    name: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    units: ["Ногоон байгууламж", "Зам талбайн цэвэрлэгээ"],
    icon: "🌿",
    accent: "var(--tone-teal)",
  },
  {
    name: "Тохижилтын хэлтэс",
    units: ["Тохижилт үйлчилгээ"],
    icon: "🏙️",
    accent: "var(--tone-slate)",
  },
];

export function findDepartmentGroupByName(groupName: string) {
  return DEPARTMENT_GROUPS.find((group) => group.name === groupName) ?? null;
}

export function findDepartmentGroupByUnit(unitName: string) {
  return DEPARTMENT_GROUPS.find((group) => group.units.includes(unitName)) ?? null;
}

export function getAvailableUnits(group: DepartmentGroupDefinition) {
  return Array.from(new Set(group.units.map((unit) => unit.trim()).filter(Boolean)));
}

export function matchesDepartmentGroup(
  group: DepartmentGroupDefinition,
  departmentName?: string | null,
) {
  const normalized = (departmentName ?? "").trim();
  if (!normalized) {
    return false;
  }

  return normalized === group.name || group.units.includes(normalized);
}

export function getDepartmentGroupLabel(group: DepartmentGroupDefinition) {
  return group.units.join(" • ");
}

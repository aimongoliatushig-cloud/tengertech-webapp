export type DepartmentGroupDefinition = {
  name: string;
  units: string[];
  aliases: string[];
  icon: string;
  accent: string;
};

export const DEPARTMENT_GROUPS: DepartmentGroupDefinition[] = [
  {
    name: "Санхүүгийн алба",
    units: [],
    aliases: ["Санхүү", "Санхүүгийн алба"],
    icon: "₮",
    accent: "var(--tone-blue)",
  },
  {
    name: "Захиргааны алба",
    units: [],
    aliases: ["Захиргаа", "Захиргааны алба", "Удирдлага"],
    icon: "🏢",
    accent: "var(--tone-slate)",
  },
  {
    name: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    units: [],
    aliases: [
      "Авто бааз",
      "Авто бааз, хог тээвэрлэлтийн хэлтэс",
      "Хог тээвэрлэлт",
      "Хог тээвэрлэлтийн хэлтэс",
    ],
    icon: "🚚",
    accent: "var(--tone-amber)",
  },
  {
    name: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    units: [],
    aliases: [
      "Ногоон байгууламж",
      "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
      "Зам талбайн цэвэрлэгээ",
      "Цэвэрлэгээ үйлчилгээ",
    ],
    icon: "🌿",
    accent: "var(--tone-teal)",
  },
  {
    name: "Тохижилтын хэлтэс",
    units: [],
    aliases: ["Тохижилт", "Тохижилт үйлчилгээ", "Тохижилтын хэлтэс"],
    icon: "🏙️",
    accent: "var(--tone-slate)",
  },
];

export const CANONICAL_DEPARTMENT_NAMES = DEPARTMENT_GROUPS.map((group) => group.name);

function normalizeDepartmentText(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeOrganizationUnitName(departmentName?: string | null) {
  const normalized = normalizeDepartmentText(departmentName);
  if (!normalized) {
    return "";
  }

  for (const group of DEPARTMENT_GROUPS) {
    const names = [group.name, ...group.aliases];
    if (names.some((name) => normalizeDepartmentText(name) === normalized)) {
      return group.name;
    }
  }

  if (normalized.includes("санхүү")) {
    return "Санхүүгийн алба";
  }
  if (normalized.includes("захиргаа") || normalized.includes("удирдлага")) {
    return "Захиргааны алба";
  }
  if (
    normalized.includes("авто") ||
    normalized.includes("хог") ||
    normalized.includes("машин") ||
    normalized.includes("тээвэр")
  ) {
    return "Авто бааз, хог тээвэрлэлтийн хэлтэс";
  }
  if (
    normalized.includes("ногоон") ||
    normalized.includes("зам талбай") ||
    normalized.includes("цэвэрл") ||
    normalized.includes("гудамж")
  ) {
    return "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
  }
  if (normalized.includes("тохижилт") || normalized.includes("засвар")) {
    return "Тохижилтын хэлтэс";
  }

  return "";
}

export function findDepartmentGroupByName(groupName: string) {
  return DEPARTMENT_GROUPS.find((group) => group.name === groupName) ?? null;
}

export function findDepartmentGroupByUnit(unitName: string) {
  return (
    DEPARTMENT_GROUPS.find(
      (group) =>
        group.units.includes(unitName) ||
        group.aliases.includes(unitName) ||
        group.name === normalizeOrganizationUnitName(unitName),
    ) ?? null
  );
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

  return (
    normalized === group.name ||
    group.units.includes(normalized) ||
    group.aliases.includes(normalized) ||
    normalizeOrganizationUnitName(normalized) === group.name
  );
}

export function getDepartmentGroupLabel(group: DepartmentGroupDefinition) {
  return group.units.length ? group.units.join(" • ") : group.name;
}

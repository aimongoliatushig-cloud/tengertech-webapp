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
    units: ["Авто бааз", "Хог тээвэрлэлт"],
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
    units: ["Ногоон байгууламж", "Цэвэрлэгээ үйлчилгээ"],
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
  {
    name: "Хүний нөөц",
    units: [],
    aliases: ["HR", "Хүний нөөц", "Хүний нөөцийн алба"],
    icon: "👥",
    accent: "var(--tone-blue)",
  },
  {
    name: "Ирц / идэвх / сахилга",
    units: [],
    aliases: ["Ирц", "Идэвх", "Сахилга", "Ирц идэвх сахилга"],
    icon: "✅",
    accent: "var(--tone-amber)",
  },
  {
    name: "Дотоод хяналт",
    units: [],
    aliases: ["Дотоод хяналт", "Хяналтын алба"],
    icon: "🛡️",
    accent: "var(--tone-slate)",
  },
  {
    name: "ХАБЭА",
    units: [],
    aliases: ["ХАБЭА", "Хөдөлмөрийн аюулгүй байдал", "Safety", "HSE"],
    icon: "🦺",
    accent: "var(--tone-amber)",
  },
  {
    name: "Мэдээлэл технологи",
    units: [],
    aliases: ["IT", "Мэдээлэл технологи", "Мэдээллийн технологи"],
    icon: "💻",
    accent: "var(--tone-blue)",
  },
  {
    name: "Олон нийттэй харилцах",
    units: [],
    aliases: ["PR", "Олон нийт", "Олон нийттэй харилцах"],
    icon: "📣",
    accent: "var(--tone-teal)",
  },
  {
    name: "Иргэдийн санал, гомдол",
    units: [],
    aliases: ["Гомдол", "Иргэдийн санал", "Иргэдийн санал гомдол"],
    icon: "💬",
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

  if (normalized.includes("hr") || normalized.includes("human resource")) {
    return DEPARTMENT_GROUPS.find((group) => group.aliases.includes("HR"))?.name ?? "";
  }
  if (normalized.includes("hse") || normalized.includes("safety")) {
    return DEPARTMENT_GROUPS.find((group) => group.aliases.includes("HSE"))?.name ?? "";
  }
  if (/\b(it|ict)\b/.test(normalized) || normalized.includes("technology")) {
    return DEPARTMENT_GROUPS.find((group) => group.aliases.includes("IT"))?.name ?? "";
  }
  if (/\bpr\b/.test(normalized) || normalized.includes("public relation")) {
    return DEPARTMENT_GROUPS.find((group) => group.aliases.includes("PR"))?.name ?? "";
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

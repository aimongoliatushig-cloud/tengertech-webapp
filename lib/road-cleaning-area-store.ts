import "server-only";

import { promises as fs } from "fs";
import path from "path";

import type { RoadCleaningAreaOption } from "@/lib/workspace";

const DATA_DIR = path.join(process.cwd(), ".local-data");
const DATA_FILE = path.join(DATA_DIR, "road-cleaning-areas.json");

type LocalRoadCleaningArea = {
  id: number;
  name: string;
  khorooName: string;
  areaM2: number;
  workingDayKeys: string[];
  departmentId: number | null;
  departmentName: string;
  masterId: number | null;
  masterName: string;
  employeeId: number | null;
  employeeName: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type LocalRoadCleaningAreaInput = {
  name: string;
  khorooName?: string;
  areaM2?: number | null;
  workingDayKeys?: string[];
  departmentId?: number | null;
  departmentName?: string;
  masterId?: number | null;
  masterName?: string;
  employeeId?: number | null;
  employeeName?: string;
  note?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const DEFAULT_WORKING_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const WORKING_DAY_KEY_SET = new Set(DEFAULT_WORKING_DAY_KEYS);

function normalizeWorkingDayKeys(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const keys = source
    .map((item) => normalizeText(item))
    .filter((item) => WORKING_DAY_KEY_SET.has(item));
  return keys.length ? Array.from(new Set(keys)) : DEFAULT_WORKING_DAY_KEYS;
}

function normalizeArea(value: unknown): LocalRoadCleaningArea | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<LocalRoadCleaningArea>;
  const id = normalizeId(source.id);
  const name = normalizeText(source.name);
  if (!id || id >= 0 || !name) {
    return null;
  }

  const createdAt = normalizeText(source.createdAt) || new Date().toISOString();
  return {
    id,
    name,
    khorooName: normalizeText(source.khorooName),
    areaM2: normalizeNumber(source.areaM2),
    workingDayKeys: normalizeWorkingDayKeys(source.workingDayKeys),
    departmentId: normalizeId(source.departmentId),
    departmentName: normalizeText(source.departmentName),
    masterId: normalizeId(source.masterId),
    masterName: normalizeText(source.masterName),
    employeeId: normalizeId(source.employeeId),
    employeeName: normalizeText(source.employeeName),
    note: normalizeText(source.note),
    createdAt,
    updatedAt: normalizeText(source.updatedAt) || createdAt,
  };
}

function toOption(area: LocalRoadCleaningArea): RoadCleaningAreaOption {
  return {
    id: area.id,
    name: area.name,
    khorooName: area.khorooName,
    streetName: area.khorooName,
    startPoint: "",
    endPoint: "",
    areaM2: area.areaM2,
    workingDayKeys: area.workingDayKeys,
    departmentId: area.departmentId,
    departmentName: area.departmentName,
    masterId: area.masterId,
    masterName: area.masterName,
    employeeId: area.employeeId,
    employeeName: area.employeeName,
    frequency: "daily",
    frequencyLabel: "Өдөр бүр",
    note: area.note || "Вэб апп дээр нэмсэн цэвэрлэх талбай",
  };
}

async function writeAreas(areas: LocalRoadCleaningArea[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(areas, null, 2), "utf8");
}

export async function loadLocalRoadCleaningAreas() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(normalizeArea).filter((area): area is LocalRoadCleaningArea => Boolean(area))
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

export async function loadLocalRoadCleaningAreaOptions() {
  const areas = await loadLocalRoadCleaningAreas();
  return areas
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "mn"))
    .map(toOption);
}

export async function findLocalRoadCleaningAreaOption(id: number) {
  const areas = await loadLocalRoadCleaningAreas();
  const area = areas.find((item) => item.id === id);
  return area ? toOption(area) : null;
}

export async function createLocalRoadCleaningArea(input: LocalRoadCleaningAreaInput) {
  const name = normalizeText(input.name);
  if (!name) {
    throw new Error("Цэвэрлэх талбайн нэр оруулна уу.");
  }

  const areas = await loadLocalRoadCleaningAreas();
  const duplicate = areas.find((area) => area.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    const now = new Date().toISOString();
    const updated: LocalRoadCleaningArea = {
      ...duplicate,
      khorooName: normalizeText(input.khorooName) || duplicate.khorooName,
      areaM2: normalizeNumber(input.areaM2) || duplicate.areaM2,
      workingDayKeys: normalizeWorkingDayKeys(input.workingDayKeys ?? duplicate.workingDayKeys),
      departmentId: input.departmentId ?? duplicate.departmentId,
      departmentName: normalizeText(input.departmentName) || duplicate.departmentName,
      masterId: input.masterId ?? duplicate.masterId,
      masterName: normalizeText(input.masterName) || duplicate.masterName,
      employeeId: input.employeeId ?? duplicate.employeeId,
      employeeName: normalizeText(input.employeeName) || duplicate.employeeName,
      note: normalizeText(input.note) || duplicate.note,
      updatedAt: now,
    };
    await writeAreas(areas.map((area) => (area.id === duplicate.id ? updated : area)));
    return toOption(updated);
  }

  const minId = areas.reduce((current, area) => Math.min(current, area.id), 0);
  const now = new Date().toISOString();
  const area: LocalRoadCleaningArea = {
    id: minId - 1,
    name,
    khorooName: normalizeText(input.khorooName),
    areaM2: normalizeNumber(input.areaM2),
    workingDayKeys: normalizeWorkingDayKeys(input.workingDayKeys),
    departmentId: input.departmentId ?? null,
    departmentName: normalizeText(input.departmentName),
    masterId: input.masterId ?? null,
    masterName: normalizeText(input.masterName),
    employeeId: input.employeeId ?? null,
    employeeName: normalizeText(input.employeeName),
    note: normalizeText(input.note),
    createdAt: now,
    updatedAt: now,
  };

  await writeAreas([...areas, area]);
  return toOption(area);
}

export async function updateLocalRoadCleaningAreaMasterAssignments(input: {
  masterId: number;
  masterName: string;
  employeeIds: number[];
  allEmployeeIds?: number[];
}) {
  const masterId = normalizeId(input.masterId);
  if (!masterId) {
    throw new Error("Мастер сонгоно уу.");
  }
  const employeeIds = new Set(input.employeeIds.map(normalizeId).filter(Boolean));
  if (!employeeIds.size) {
    throw new Error("Мастерт хариуцуулах ажилтан сонгоно уу.");
  }

  const areas = await loadLocalRoadCleaningAreas();
  const now = new Date().toISOString();
  const allEmployeeIds = new Set((input.allEmployeeIds ?? []).map(normalizeId).filter(Boolean));
  let updatedCount = 0;
  const nextAreas = areas.map((area) => {
    if (
      allEmployeeIds.size &&
      area.masterId === masterId &&
      area.employeeId &&
      allEmployeeIds.has(area.employeeId) &&
      !employeeIds.has(area.employeeId)
    ) {
      updatedCount += 1;
      return {
        ...area,
        masterId: null,
        masterName: "",
        updatedAt: now,
      };
    }
    if (!area.employeeId || !employeeIds.has(area.employeeId)) {
      return area;
    }
    updatedCount += 1;
    return {
      ...area,
      masterId,
      masterName: normalizeText(input.masterName),
      updatedAt: now,
    };
  });
  await writeAreas(nextAreas);
  return { updatedCount };
}

import "server-only";

import { promises as fs } from "fs";
import path from "path";

import type { RoadCleaningAreaOption } from "@/lib/workspace";

const DATA_DIR = path.join(process.cwd(), ".local-data");
const DATA_FILE = path.join(DATA_DIR, "road-cleaning-areas.json");

type LocalRoadCleaningArea = {
  id: number;
  name: string;
  departmentId: number | null;
  departmentName: string;
  masterId: number | null;
  masterName: string;
  employeeId: number | null;
  employeeName: string;
  createdAt: string;
  updatedAt: string;
};

type LocalRoadCleaningAreaInput = {
  name: string;
  departmentId?: number | null;
  departmentName?: string;
  masterId?: number | null;
  masterName?: string;
  employeeId?: number | null;
  employeeName?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : null;
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
    departmentId: normalizeId(source.departmentId),
    departmentName: normalizeText(source.departmentName),
    masterId: normalizeId(source.masterId),
    masterName: normalizeText(source.masterName),
    employeeId: normalizeId(source.employeeId),
    employeeName: normalizeText(source.employeeName),
    createdAt,
    updatedAt: normalizeText(source.updatedAt) || createdAt,
  };
}

function toOption(area: LocalRoadCleaningArea): RoadCleaningAreaOption {
  return {
    id: area.id,
    name: area.name,
    streetName: "",
    startPoint: "",
    endPoint: "",
    areaM2: 0,
    departmentId: area.departmentId,
    departmentName: area.departmentName,
    masterId: area.masterId,
    masterName: area.masterName,
    employeeId: area.employeeId,
    employeeName: area.employeeName,
    frequency: "daily",
    frequencyLabel: "Өдөр бүр",
    note: "Вэб апп дээр нэмсэн цэвэрлэх талбай",
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
    return toOption(duplicate);
  }

  const minId = areas.reduce((current, area) => Math.min(current, area.id), 0);
  const now = new Date().toISOString();
  const area: LocalRoadCleaningArea = {
    id: minId - 1,
    name,
    departmentId: input.departmentId ?? null,
    departmentName: normalizeText(input.departmentName),
    masterId: input.masterId ?? null,
    masterName: normalizeText(input.masterName),
    employeeId: input.employeeId ?? null,
    employeeName: normalizeText(input.employeeName),
    createdAt: now,
    updatedAt: now,
  };

  await writeAreas([...areas, area]);
  return toOption(area);
}

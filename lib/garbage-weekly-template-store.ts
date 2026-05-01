import "server-only";

import { promises as fs } from "fs";
import path from "path";

import type {
  GarbageWeeklyTemplate,
  GarbageWeeklyTemplateDays,
  GarbageWeeklyTemplateInput,
} from "@/lib/garbage-weekly-template-types";
import {
  EMPTY_GARBAGE_WEEKLY_TEMPLATE_DAYS,
  hasAnyGarbageWeeklyTemplateDay,
  shareGarbageWeeklyTemplateDays,
} from "@/lib/garbage-weekly-template-types";

const DATA_DIR = path.join(process.cwd(), ".local-data");
const DATA_FILE = path.join(DATA_DIR, "garbage-weekly-templates.json");

function makeId() {
  return `weekly-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeDays(value: unknown): GarbageWeeklyTemplateDays {
  const source = value && typeof value === "object" ? value as Partial<GarbageWeeklyTemplateDays> : {};
  return {
    ...EMPTY_GARBAGE_WEEKLY_TEMPLATE_DAYS,
    monday: Boolean(source.monday),
    tuesday: Boolean(source.tuesday),
    wednesday: Boolean(source.wednesday),
    thursday: Boolean(source.thursday),
    friday: Boolean(source.friday),
    saturday: Boolean(source.saturday),
    sunday: Boolean(source.sunday),
  };
}

function normalizeTemplate(value: unknown): GarbageWeeklyTemplate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<GarbageWeeklyTemplate>;
  const id = normalizeText(source.id);
  const routeId = normalizeText(source.routeId);
  const vehicleId = normalizeText(source.vehicleId);
  const teamId = normalizeText(source.teamId);
  const days = normalizeDays(source.days);

  if (!id || !routeId || !vehicleId || !teamId || !hasAnyGarbageWeeklyTemplateDay(days)) {
    return null;
  }

  const createdAt = normalizeText(source.createdAt, new Date().toISOString());
  const updatedAt = normalizeText(source.updatedAt, createdAt);

  return {
    id,
    routeId,
    routeName: normalizeText(source.routeName, `#${routeId}`),
    vehicleId,
    vehicleName: normalizeText(source.vehicleName, `#${vehicleId}`),
    teamId,
    teamName: normalizeText(source.teamName, `#${teamId}`),
    days,
    active: source.active !== false,
    note: normalizeText(source.note),
    createdAt,
    updatedAt,
  };
}

function normalizeInput(input: GarbageWeeklyTemplateInput, existing?: GarbageWeeklyTemplate) {
  const routeId = normalizeText(input.routeId);
  const vehicleId = normalizeText(input.vehicleId);
  const teamId = normalizeText(input.teamId);
  const days = normalizeDays(input.days);

  if (!routeId) {
    throw new Error("Маршрут сонгоно уу");
  }
  if (!vehicleId) {
    throw new Error("Машин сонгоно уу");
  }
  if (!teamId) {
    throw new Error("Баг сонгоно уу");
  }
  if (!hasAnyGarbageWeeklyTemplateDay(days)) {
    throw new Error("Давтагдах өдрөөс дор хаяж нэгийг сонгоно уу");
  }

  return {
    routeId,
    routeName: normalizeText(input.routeName, existing?.routeName || `#${routeId}`),
    vehicleId,
    vehicleName: normalizeText(input.vehicleName, existing?.vehicleName || `#${vehicleId}`),
    teamId,
    teamName: normalizeText(input.teamName, existing?.teamName || `#${teamId}`),
    days,
    active: input.active ?? existing?.active ?? true,
    note: normalizeText(input.note),
  };
}

async function writeTemplates(templates: GarbageWeeklyTemplate[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(templates, null, 2), "utf8");
}

function assertNoConflict(
  templates: GarbageWeeklyTemplate[],
  candidate: Pick<GarbageWeeklyTemplate, "vehicleId" | "teamId" | "days">,
  ignoreId?: string,
) {
  const comparable = templates.filter((template) => template.id !== ignoreId);
  const vehicleConflict = comparable.some(
    (template) => template.vehicleId === candidate.vehicleId && shareGarbageWeeklyTemplateDays(template.days, candidate.days),
  );
  if (vehicleConflict) {
    throw new Error("Энэ машин сонгосон өдөр аль хэдийн өөр загварт оноогдсон байна.");
  }

  const teamConflict = comparable.some(
    (template) => template.teamId === candidate.teamId && shareGarbageWeeklyTemplateDays(template.days, candidate.days),
  );
  if (teamConflict) {
    throw new Error("Энэ баг сонгосон өдөр аль хэдийн өөр загварт оноогдсон байна.");
  }
}

export async function loadGarbageWeeklyTemplates() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(normalizeTemplate).filter((template): template is GarbageWeeklyTemplate => Boolean(template))
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function createGarbageWeeklyTemplate(input: GarbageWeeklyTemplateInput) {
  const templates = await loadGarbageWeeklyTemplates();
  const normalized = normalizeInput(input);
  assertNoConflict(templates, normalized);

  const now = new Date().toISOString();
  const template: GarbageWeeklyTemplate = {
    id: makeId(),
    ...normalized,
    createdAt: now,
    updatedAt: now,
  };

  const nextTemplates = [...templates, template];
  await writeTemplates(nextTemplates);
  return { template, templates: nextTemplates };
}

export async function updateGarbageWeeklyTemplate(id: string, input: GarbageWeeklyTemplateInput) {
  const templates = await loadGarbageWeeklyTemplates();
  const existing = templates.find((template) => template.id === id);
  if (!existing) {
    throw new Error("Загвар олдсонгүй.");
  }

  const normalized = normalizeInput(input, existing);
  assertNoConflict(templates, normalized, id);

  const updated: GarbageWeeklyTemplate = {
    ...existing,
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  const nextTemplates = templates.map((template) => template.id === id ? updated : template);
  await writeTemplates(nextTemplates);
  return { template: updated, templates: nextTemplates };
}

export async function deleteGarbageWeeklyTemplate(id: string) {
  const templates = await loadGarbageWeeklyTemplates();
  const nextTemplates = templates.filter((template) => template.id !== id);
  if (nextTemplates.length === templates.length) {
    throw new Error("Загвар олдсонгүй.");
  }
  await writeTemplates(nextTemplates);
  return { templates: nextTemplates };
}

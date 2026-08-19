import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DATA_DIR =
  process.env.APP_DATA_DIR?.trim() ||
  (process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data")
    : path.join(process.cwd(), ".local-data"));
const DATA_FILE = path.join(DATA_DIR, "ecoroad-inspections.json");
const ECOROAD_BASE_URL = "https://ecoroad.site";

export type EcoRoadInspection = {
  id: string;
  locationId: string;
  organizationName: string;
  submittedAt: string;
  submittedBy: string;
  totalScore: number;
  adjustedScore: number;
  note: string;
  gps: {
    status: string;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
  };
  responsibilities: string[];
  criterionScores: Record<string, number>;
  photoCount: number;
  photos: Array<{
    name: string;
    type: string;
    sizeBytes: number;
    storagePath: string;
    evidenceKind: string;
  }>;
  violationCount: number;
  sourceUrl: string;
  importedAt: string;
};

type EcoRoadApiItem = Record<string, unknown> & {
  id?: unknown;
  locationId?: unknown;
  locationOrganizationName?: unknown;
  submittedAt?: unknown;
  submittedBy?: unknown;
  totalScore?: unknown;
  adjustedScore?: unknown;
  note?: unknown;
  gps?: Record<string, unknown> | null;
  serviceResponsibilities?: Array<Record<string, unknown>>;
  criterionScores?: Record<string, unknown>;
  evidencePhotos?: Array<Record<string, unknown>>;
  violations?: unknown[];
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeItem(item: EcoRoadApiItem, locationId: string): EcoRoadInspection | null {
  const id = text(item.id);
  if (!id) return null;
  const gps = item.gps && typeof item.gps === "object" ? item.gps : {};
  const photos = Array.isArray(item.evidencePhotos) ? item.evidencePhotos : [];
  const criterionScores = Object.fromEntries(
    Object.entries(item.criterionScores ?? {})
      .map(([key, value]) => [key, Number(value)] as const)
      .filter(([, value]) => Number.isFinite(value)),
  );

  return {
    id,
    locationId: text(item.locationId) || locationId,
    organizationName: text(item.locationOrganizationName),
    submittedAt: text(item.submittedAt),
    submittedBy: text(item.submittedBy),
    totalScore: numberOrNull(item.totalScore) ?? 0,
    adjustedScore: numberOrNull(item.adjustedScore) ?? numberOrNull(item.totalScore) ?? 0,
    note: text(item.note),
    gps: {
      status: text(gps.status),
      latitude: numberOrNull(gps.latitude),
      longitude: numberOrNull(gps.longitude),
      accuracyMeters: numberOrNull(gps.accuracyMeters),
    },
    responsibilities: (item.serviceResponsibilities ?? []).map((entry) => text(entry.label)).filter(Boolean),
    criterionScores,
    photoCount: photos.length,
    photos: photos.map((photo) => ({
      name: text(photo.name),
      type: text(photo.type),
      sizeBytes: numberOrNull(photo.sizeBytes) ?? 0,
      storagePath: text(photo.storagePath),
      evidenceKind: text(photo.evidenceKind),
    })),
    violationCount: Array.isArray(item.violations) ? item.violations.length : 0,
    sourceUrl: `${ECOROAD_BASE_URL}/manager/inspections/${encodeURIComponent(locationId)}?submissionId=${encodeURIComponent(id)}`,
    importedAt: new Date().toISOString(),
  };
}

export async function loadEcoRoadInspections() {
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as EcoRoadInspection[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function saveEcoRoadInspections(items: EcoRoadInspection[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(items, null, 2), "utf8");
}

export async function importEcoRoadInspections() {
  const email = process.env.ECOROAD_EMAIL?.trim() || "";
  const password = process.env.ECOROAD_PASSWORD?.trim() || "";
  const locationIds = (process.env.ECOROAD_LOCATION_IDS || "location-107")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!email || !password) throw new Error("Eco Road нэвтрэх тохиргоо серверт бүртгэгдээгүй байна.");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${ECOROAD_BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByLabel("Имэйл эсвэл утасны дугаар").fill(email);
    await page.getByLabel("Нууц үг").fill(password);
    await Promise.all([
      page.waitForURL(/\/manager(?:\/|$)/, { timeout: 45_000 }),
      page.getByRole("button", { name: "Нэвтрэх", exact: true }).click(),
    ]);

    const fetched: EcoRoadInspection[] = [];
    for (const locationId of locationIds) {
      const response = await page.request.get(
        `${ECOROAD_BASE_URL}/api/inspections/${encodeURIComponent(locationId)}/history?page=1&pageSize=100`,
      );
      if (!response.ok()) throw new Error(`Eco Road ${locationId} API ${response.status()} алдаа буцаалаа.`);
      const payload = (await response.json()) as { items?: EcoRoadApiItem[] };
      for (const item of payload.items ?? []) {
        const normalized = normalizeItem(item, locationId);
        if (normalized) fetched.push(normalized);
      }
    }

    const existing = await loadEcoRoadInspections();
    const byId = new Map(existing.map((item) => [item.id, item]));
    let created = 0;
    let updated = 0;
    for (const item of fetched) {
      if (byId.has(item.id)) updated += 1;
      else created += 1;
      byId.set(item.id, item);
    }
    const merged = [...byId.values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    await saveEcoRoadInspections(merged);
    return { total: merged.length, received: fetched.length, created, updated };
  } finally {
    await browser.close();
  }
}

import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { CreateWastePointInput } from "./api";
import type { WastePoint } from "./types";

const DATA_DIR = process.env.WASTE_POINTS_DATA_DIR?.trim() || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "waste-points.json");

export async function readLocalWastePoints(): Promise<WastePoint[]> {
  try {
    const value = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    return Array.isArray(value) ? (value as WastePoint[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function createLocalWastePoint(input: CreateWastePointInput): Promise<WastePoint> {
  const points = await readLocalWastePoints();
  if (points.some((point) => point.code.toLocaleLowerCase("mn-MN") === input.code.toLocaleLowerCase("mn-MN"))) {
    throw new Error("Ижил кодтой хогийн цэг бүртгэлтэй байна.");
  }
  const now = new Date().toISOString();
  const point: WastePoint = {
    ...input,
    id: `erp-${randomUUID()}`,
    currentFillLevel: 0,
    currentStatus: "active",
    qrCode: "",
    assignedCompany: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    createdAt: now,
    updatedAt: now,
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify([...points, point], null, 2), "utf8");
  return point;
}

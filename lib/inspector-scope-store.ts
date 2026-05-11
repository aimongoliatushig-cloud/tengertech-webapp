import "server-only";

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".local-data");
const DATA_FILE = path.join(DATA_DIR, "garbage-inspector-scopes.json");

export type LocalInspectorScope = {
  inspectorEmployeeId: number;
  subdistrictIds: number[];
  pointIds: number[];
  vehicleIds: number[];
  updatedAt: string;
};

function normalizeId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map(normalizeId)
            .filter((item): item is number => Boolean(item)),
        ),
      )
    : [];
}

function normalizeScope(value: unknown): LocalInspectorScope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<LocalInspectorScope>;
  const inspectorEmployeeId = normalizeId(source.inspectorEmployeeId);
  if (!inspectorEmployeeId) {
    return null;
  }

  return {
    inspectorEmployeeId,
    subdistrictIds: normalizeIds(source.subdistrictIds),
    pointIds: normalizeIds(source.pointIds),
    vehicleIds: normalizeIds(source.vehicleIds),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
  };
}

async function writeScopes(scopes: LocalInspectorScope[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(scopes, null, 2), "utf8");
}

export async function loadLocalInspectorScopes() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(normalizeScope).filter((scope): scope is LocalInspectorScope => Boolean(scope))
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

export async function findLocalInspectorScope(inspectorEmployeeId: number | null | undefined) {
  if (!inspectorEmployeeId) {
    return null;
  }
  const scopes = await loadLocalInspectorScopes();
  return scopes.find((scope) => scope.inspectorEmployeeId === inspectorEmployeeId) ?? null;
}

export async function saveLocalInspectorScope(input: {
  inspectorEmployeeId: number;
  subdistrictIds: number[];
  pointIds: number[];
  vehicleIds: number[];
}) {
  const scope: LocalInspectorScope = {
    inspectorEmployeeId: input.inspectorEmployeeId,
    subdistrictIds: normalizeIds(input.subdistrictIds),
    pointIds: normalizeIds(input.pointIds),
    vehicleIds: normalizeIds(input.vehicleIds),
    updatedAt: new Date().toISOString(),
  };
  const scopes = await loadLocalInspectorScopes();
  const withoutCurrent = scopes.filter(
    (item) => item.inspectorEmployeeId !== input.inspectorEmployeeId,
  );
  await writeScopes([...withoutCurrent, scope]);
  return scope;
}

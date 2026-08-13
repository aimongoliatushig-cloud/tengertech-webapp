import "server-only";

import type { WastePoint, WastePointStatus, WastePointType } from "./types";

// Smart Clean UB хогийн цэгийн API.
// GET {API_URL}/api/waste-points?companyId={companyId}&limit=5000
// Хариу: { "wastePoints": [ ... ] }
const API_URL = process.env.WASTE_POINTS_API_URL?.trim() || "https://api.smartcleanub.mn";
const COMPANY_ID = process.env.WASTE_POINTS_COMPANY_ID?.trim() || "63825581";
const API_TOKEN = process.env.WASTE_POINTS_API_TOKEN?.trim() || "";

export class WastePointsApiError extends Error {
  readonly status: number;
  readonly friendly: string;

  constructor(status: number, friendly: string, detail?: string) {
    super(detail || friendly);
    this.name = "WastePointsApiError";
    this.status = status;
    this.friendly = friendly;
  }
}

// --- Түүхий (raw) бүтэц: талбарууд string/object хэлбэрээр ирдэг ---
type RawCompany = { id?: number | string; name?: string } | string | null;

type RawWastePoint = {
  id?: string | number;
  code?: string;
  name?: string;
  type?: string;
  latitude?: string | number;
  longitude?: string | number;
  districtName?: string;
  khorooName?: string;
  address?: string;
  containerType?: string;
  containerCount?: string | number;
  capacity?: string | number;
  currentFillLevel?: string | number;
  currentStatus?: string;
  qrCode?: string;
  assignedCompany?: RawCompany;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateWastePointInput = {
  code: string;
  name: string;
  type: WastePointType;
  latitude: number;
  longitude: number;
  districtName: string;
  khorooName: string;
  address: string;
  containerType: string;
  containerCount: number;
  capacity: number;
};

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// API: "collection_point" | "container" | "illegal_dump" (танигдаагүйг цуглуулах цэг гэж үзнэ)
function mapType(value?: string): WastePointType {
  switch ((value ?? "").toLowerCase()) {
    case "container":
      return "container";
    case "illegal_dump":
    case "illegal":
      return "illegal_dump";
    default:
      return "collection_point";
  }
}

// API: "normal" = хэвийн. Бусад төлөвийг өөрийн enum рүү буулгана.
function mapStatus(value?: string): WastePointStatus {
  switch ((value ?? "").toLowerCase()) {
    case "full":
      return "full";
    case "maintenance":
    case "repair":
      return "maintenance";
    case "inactive":
    case "disabled":
      return "inactive";
    case "normal":
    case "active":
    default:
      return "active";
  }
}

function companyName(value: RawCompany): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.name ?? "";
}

export function mapWastePoint(raw: RawWastePoint): WastePoint {
  return {
    id: String(raw.id ?? raw.code ?? ""),
    code: String(raw.code ?? ""),
    name: String(raw.name ?? raw.code ?? ""),
    type: mapType(raw.type),
    latitude: num(raw.latitude),
    longitude: num(raw.longitude),
    districtName: String(raw.districtName ?? ""),
    khorooName: String(raw.khorooName ?? ""),
    address: String(raw.address ?? ""),
    containerType: String(raw.containerType ?? ""),
    containerCount: Math.round(num(raw.containerCount)),
    capacity: num(raw.capacity),
    currentFillLevel: Math.max(0, Math.min(100, Math.round(num(raw.currentFillLevel)))),
    currentStatus: mapStatus(raw.currentStatus),
    qrCode: String(raw.qrCode ?? ""),
    assignedCompany: companyName(raw.assignedCompany ?? null),
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
  };
}

/** Бодит API-аас бүх хогийн цэгийг татна. Алдаа гарвал WastePointsApiError шиднэ. */
export async function fetchWastePointsFromApi(): Promise<WastePoint[]> {
  const url = `${API_URL.replace(/\/$/, "")}/api/waste-points?companyId=${encodeURIComponent(
    COMPANY_ID,
  )}&limit=5000`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    throw new WastePointsApiError(
      0,
      "Хогийн цэгийн системтэй холбогдож чадсангүй. Сүлжээ эсвэл серверийн тохиргоог шалгана уу.",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new WastePointsApiError(
      res.status,
      "Хогийн цэгийн API нэвтрэлт шаардаж байна. Тус системээс ERP-д зориулсан хандах эрх (token) авах шаардлагатай.",
    );
  }
  if (!res.ok) {
    throw new WastePointsApiError(
      res.status,
      `Хогийн цэгийн API алдаа буцаалаа (${res.status}). Дараа дахин оролдоно уу.`,
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new WastePointsApiError(res.status, "API-аас ирсэн хариуг уншиж чадсангүй.");
  }

  const list =
    Array.isArray(payload) ? payload : (payload as { wastePoints?: unknown })?.wastePoints;
  if (!Array.isArray(list)) {
    throw new WastePointsApiError(res.status, "API-аас ирсэн өгөгдлийн бүтэц таарахгүй байна.");
  }

  return list.map((item) => mapWastePoint(item as RawWastePoint)).filter((p) => p.id);
}

export async function createWastePointInApi(input: CreateWastePointInput): Promise<WastePoint> {
  const url = `${API_URL.replace(/\/$/, "")}/api/waste-points`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        ...input,
        companyId: COMPANY_ID,
        currentFillLevel: 0,
        currentStatus: "active",
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new WastePointsApiError(
      0,
      "Хогийн цэгийн системтэй холбогдож чадсангүй.",
      error instanceof Error ? error.message : undefined,
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new WastePointsApiError(res.status, "Хогийн цэг нэмэх API эрх тохируулагдаагүй байна.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new WastePointsApiError(res.status, `Хогийн цэг хадгалахад алдаа гарлаа (${res.status}).`, detail);
  }

  const payload = (await res.json()) as RawWastePoint | { wastePoint?: RawWastePoint };
  const raw: RawWastePoint | undefined =
    "wastePoint" in payload ? payload.wastePoint : (payload as RawWastePoint);
  if (!raw) {
    throw new WastePointsApiError(res.status, "Хадгалсан хогийн цэгийн мэдээлэл буцаж ирсэнгүй.");
  }
  return mapWastePoint(raw);
}

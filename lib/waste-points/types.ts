// Хогийн цэг (waste point) модулийн төрлийн тодорхойлолт.
// API-аас ирэх бүтэц (GET /api/waste-points). Одоогоор mock өгөгдлөөр
// ажиллаж байгаа ч энэ contract нь бодит API-тай ижил тул сервисийн эх
// сурвалжийг солиход л хангалттай.

export type WastePointType = "collection_point" | "container" | "illegal_dump";

export type WastePointStatus = "active" | "full" | "maintenance" | "inactive";

export type WastePoint = {
  /** API-аас string ирдэг */
  id: string;
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
  capacity: number; // литр
  currentFillLevel: number; // 0-100 (%)
  currentStatus: WastePointStatus;
  /** Base64 PNG эсвэл data URI (QR код) */
  qrCode: string;
  assignedCompany: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export const WASTE_TYPE_LABELS: Record<WastePointType, string> = {
  collection_point: "Цуглуулах цэг",
  container: "Сав / контейнер",
  illegal_dump: "Хууль бус хогийн цэг",
};

export const WASTE_TYPE_TONE: Record<WastePointType, string> = {
  collection_point: "blue",
  container: "green",
  illegal_dump: "red",
};

export const WASTE_STATUS_LABELS: Record<WastePointStatus, string> = {
  active: "Хэвийн",
  full: "Дүүрсэн",
  maintenance: "Засварт",
  inactive: "Идэвхгүй",
};

export const WASTE_STATUS_TONE: Record<WastePointStatus, "ok" | "warn" | "danger" | "muted"> = {
  active: "ok",
  full: "danger",
  maintenance: "warn",
  inactive: "muted",
};

// ERP-д "Ажил үүсгэх" үед сонгох ажлын төрөл.
export type WasteTaskType =
  | "collection"
  | "cleaning"
  | "repair"
  | "inspection"
  | "urgent";

export const WASTE_TASK_TYPES: { key: WasteTaskType; label: string }[] = [
  { key: "collection", label: "Хог ачилт" },
  { key: "cleaning", label: "Цэвэрлэгээ" },
  { key: "repair", label: "Засвар" },
  { key: "inspection", label: "Шалгалт" },
  { key: "urgent", label: "Гэнэтийн ажил" },
];

export function fillLevelBucket(level: number): "low" | "mid" | "high" {
  if (level >= 80) return "high";
  if (level >= 50) return "mid";
  return "low";
}

export function formatGps(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

import type { WastePoint, WastePointStatus, WastePointType } from "./types";

// Бодит API бэлэн болтол ашиглах жишиг (mock) өгөгдөл. Детерминистик тул
// сервер бүр дээр ижил үр дүн гарна. Бодит API-д шилжихэд зөвхөн service.ts
// доторх эх сурвалжийг солино.

// --- Детерминистик pseudo-random (seed = кодоос) ---
function seedFromString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- QR-төст SVG data URI (mock). Бодит API нь Base64 PNG буцаана. ---
function buildMockQrDataUri(code: string): string {
  const rnd = mulberry32(seedFromString(code));
  const N = 21;
  const cell = 6;
  const quiet = 4;
  const size = (N + quiet * 2) * cell;
  const rects: string[] = [];
  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) =>
      r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, N - 7) || inBox(N - 7, 0);
  };
  const finderCell = (r: number, c: number) => {
    const localR = r < 7 ? r : r - (N - 7);
    const localC = c < 7 ? c : c - (N - 7);
    const ring = localR === 0 || localR === 6 || localC === 0 || localC === 6;
    const core = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
    return ring || core;
  };
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const on = isFinder(r, c) ? finderCell(r, c) : rnd() > 0.5;
      if (on) {
        const x = (c + quiet) * cell;
        const y = (r + quiet) * cell;
        rects.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}"/>`);
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#ffffff"/>` +
    `<g fill="#111111">${rects.join("")}</g>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const TYPES: WastePointType[] = ["collection_point", "container", "container", "collection_point", "illegal_dump"];
const STATUSES: WastePointStatus[] = ["active", "active", "active", "full", "maintenance", "inactive"];
const CONTAINER_TYPES = ["Металл сав 1.1м³", "Хуванцар сав 240л", "Далд сав 5м³", "Ил задгай", "Евро контейнер 1100л"];
const STREETS = [
  "Чингисийн өргөн чөлөө",
  "Наадамчдын зам",
  "Ажилчны гудамж",
  "Яармагийн гудамж",
  "Нүхтийн зам",
  "Их тойруу",
  "Махатма Гандийн гудамж",
  "Зайсангийн гудамж",
];
const COMPANIES = ["Тохижилт үйлчилгээний төв ОНӨААТҮГ"];

// Хан-Уул дүүргийн ойролцоо координат
const BASE_LAT = 47.88;
const BASE_LNG = 106.86;

function pointCount(): number {
  return 42;
}

let cache: WastePoint[] | null = null;

export function getMockWastePoints(): WastePoint[] {
  if (cache) return cache;
  const points: WastePoint[] = [];
  const total = pointCount();
  for (let i = 0; i < total; i += 1) {
    const seq = i + 1;
    const code = `HUD-${String(seq).padStart(4, "0")}`;
    const rnd = mulberry32(seedFromString(code));
    const type = TYPES[Math.floor(rnd() * TYPES.length)];
    const status: WastePointStatus =
      type === "illegal_dump" ? "full" : STATUSES[Math.floor(rnd() * STATUSES.length)];
    const khoroo = 1 + Math.floor(rnd() * 25);
    const street = STREETS[Math.floor(rnd() * STREETS.length)];
    const containerType =
      type === "illegal_dump" ? "Ил задгай" : CONTAINER_TYPES[Math.floor(rnd() * CONTAINER_TYPES.length)];
    const containerCount = type === "container" ? 1 + Math.floor(rnd() * 6) : type === "collection_point" ? 2 + Math.floor(rnd() * 8) : 0;
    const capacity = containerType.includes("5м³")
      ? 5000
      : containerType.includes("1.1")
        ? 1100
        : containerType.includes("1100")
          ? 1100
          : containerType.includes("240")
            ? 240
            : 0;
    const currentFillLevel =
      status === "full" ? 85 + Math.floor(rnd() * 15) : status === "inactive" ? 0 : Math.floor(rnd() * 80);
    const dayOffset = Math.floor(rnd() * 160);
    const created = new Date(2026, 0, 1 + Math.floor(rnd() * 40));
    const updated = new Date(2026, 6, 1 + Math.floor(rnd() * 15));
    points.push({
      id: seq,
      code,
      name: `${khoroo}-р хороо · ${street} №${seq}`,
      type,
      latitude: Number((BASE_LAT + (rnd() - 0.5) * 0.06).toFixed(6)),
      longitude: Number((BASE_LNG + (rnd() - 0.5) * 0.08).toFixed(6)),
      districtName: "Хан-Уул дүүрэг",
      khorooName: `${khoroo}-р хороо`,
      address: `Хан-Уул дүүрэг, ${khoroo}-р хороо, ${street}`,
      containerType,
      containerCount,
      capacity,
      currentFillLevel,
      currentStatus: status,
      qrCode: buildMockQrDataUri(code),
      assignedCompany: COMPANIES[0],
      createdAt: created.toISOString(),
      updatedAt: new Date(updated.getTime() - dayOffset * 0).toISOString(),
    });
  }
  cache = points;
  return points;
}

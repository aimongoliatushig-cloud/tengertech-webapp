import "server-only";

type GaihamApiResponse = {
  success?: boolean;
  hash?: string;
  id?: number;
  list?: unknown[];
  report?: unknown;
  status?: {
    code?: number;
    description?: string;
  };
};

type GaihamTracker = {
  id: number;
  label: string;
  group_id?: number | null;
  group_label?: string;
};

type AggregatedFuelTotal = {
  fuelLiters: number;
  rowCount: number;
  sampleRows: string[];
  trackerId: number | null;
  vehicleLabel: string;
};

export type GaihamFuelVehicleTotal = {
  requestedDate: string;
  trackerId: number | null;
  vehicleCode: string;
  vehicleLabel: string;
  fuelLiters: number;
  fuelType: string;
  source: "gaiham_gps";
  rowCount: number;
  sampleRows: string[];
};

export type GaihamFuelTotalsResult = {
  requestedDate: string;
  title: string;
  reportId: number | null;
  trackerCount: number;
  sourceRows: number;
  totals: GaihamFuelVehicleTotal[];
  ignoredSamples: string[];
};

const DEFAULT_GAIHAM_API_BASE_URL = "https://gps.gaikham.com/api-v2";
const DEFAULT_GROUP_LABEL = "\u0425\u0430\u043d-\u0423\u0443\u043b \u0442\u043e\u0445\u0438\u0436\u0438\u043b\u0442";
const DEFAULT_SOURCE_TITLE = "\u0413\u0430\u0439\u0445\u0430\u043c GPS";

function apiBaseUrl() {
  return (process.env.GAIHAM_API_BASE_URL?.trim() || DEFAULT_GAIHAM_API_BASE_URL).replace(/\/+$/, "");
}

function endpointUrl(path: string) {
  return `${apiBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("mn-MN");
}

function normalizeVehicleCode(value: string) {
  return value
    .toLocaleUpperCase("mn-MN")
    .replace(/\s+/g, "")
    .trim();
}

function parseTrackerIds(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cellRawNumber(value: unknown) {
  if (isObject(value) && typeof value.raw === "number" && Number.isFinite(value.raw)) {
    return value.raw;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const textValue = isObject(value) && value.v !== undefined ? String(value.v) : String(value ?? "");
  const normalized = textValue
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\- ]/g, "")
    .replace(/\s+/g, "");
  if (!normalized) {
    return null;
  }

  let candidate = normalized;
  if (candidate.includes(",") && candidate.includes(".")) {
    candidate = candidate.replace(/,/g, "");
  } else if (candidate.includes(",") && !candidate.includes(".")) {
    candidate = /,\d{1,2}$/.test(candidate) ? candidate.replace(",", ".") : candidate.replace(/,/g, "");
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function cellText(value: unknown) {
  if (isObject(value) && value.v !== undefined) {
    return String(value.v ?? "").replace(/\s+/g, " ").trim();
  }
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function assertGaihamSuccess(payload: GaihamApiResponse, action: string) {
  if (payload.success === false) {
    const description = payload.status?.description || `${action} failed.`;
    const code = payload.status?.code ? ` (${payload.status.code})` : "";
    throw new Error(`${description}${code}`);
  }
}

async function postGaiham<T extends GaihamApiResponse>(path: string, body: Record<string, unknown>) {
  const response = await fetch(endpointUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Gaiham API ${path} returned HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as T;
  assertGaihamSuccess(payload, path);
  return payload;
}

async function gaihamHash() {
  const apiKey = process.env.GAIHAM_API_KEY?.trim();
  if (apiKey) {
    return apiKey;
  }

  const login = process.env.GAIHAM_REPORT_USERNAME?.trim();
  const password = process.env.GAIHAM_REPORT_PASSWORD?.trim();
  if (!login || !password) {
    throw new Error("GAIHAM_API_KEY эсвэл GAIHAM_REPORT_USERNAME/GAIHAM_REPORT_PASSWORD тохируулаагүй байна.");
  }

  const payload = await postGaiham<GaihamApiResponse>("user/auth", {
    login,
    password,
  });
  if (!payload.hash) {
    throw new Error("Gaiham user/auth hash буцаасангүй.");
  }
  return payload.hash;
}

function trackerFromPayload(item: unknown): GaihamTracker | null {
  if (!isObject(item)) {
    return null;
  }

  const id = Number(item.id);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const group = isObject(item.group) ? item.group : null;
  const source = isObject(item.source) ? item.source : null;
  return {
    id,
    label: String(item.label || item.name || source?.label || id).trim(),
    group_id: typeof item.group_id === "number" ? item.group_id : null,
    group_label: String(item.group_label || group?.label || group?.name || "").trim(),
  };
}

async function loadTrackers(hash: string) {
  const configuredTrackerIds = parseTrackerIds(process.env.GAIHAM_REPORT_TRACKER_IDS);
  if (configuredTrackerIds.length) {
    return configuredTrackerIds.map((id) => ({
      id,
      label: String(id),
      group_id: null,
      group_label: "",
    }));
  }

  const payload = await postGaiham<GaihamApiResponse>("tracker/list", { hash });
  const trackers = (payload.list ?? []).map(trackerFromPayload).filter((item): item is GaihamTracker => Boolean(item));
  const groupLabel = process.env.GAIHAM_REPORT_GROUP_LABEL?.trim() || DEFAULT_GROUP_LABEL;
  const normalizedGroupLabel = normalizeLabel(groupLabel);
  const grouped = trackers.filter((tracker) => normalizeLabel(tracker.group_label ?? "").includes(normalizedGroupLabel));

  return grouped.length ? grouped : trackers;
}

function reportPlugin() {
  const configuredPluginId = Number(process.env.GAIHAM_REPORT_PLUGIN_ID || "10");
  return {
    plugin_id: Number.isFinite(configuredPluginId) && configuredPluginId > 0 ? configuredPluginId : 10,
    show_seconds: false,
    graph_type: "time",
    detailed_by_dates: true,
    hide_empty_tabs: false,
    include_summary_sheet_only: false,
    include_summary_sheet: true,
    use_ignition_data_for_consumption: false,
    include_mileage_plot: false,
    include_speed_plot: false,
    filter: true,
    smoothing: false,
    surge_filter: false,
    surge_filter_threshold: 0.2,
    speed_filter: false,
    speed_filter_threshold: 10,
  };
}

async function generateReport(hash: string, requestedDate: string, trackerIds: number[]) {
  const title = `${process.env.GAIHAM_REPORT_SOURCE_LABEL?.trim() || DEFAULT_SOURCE_TITLE} ${requestedDate}`;
  const payload = await postGaiham<GaihamApiResponse>("report/tracker/generate", {
    hash,
    title,
    trackers: trackerIds,
    from: `${requestedDate} 00:00:00`,
    to: `${requestedDate} 23:59:59`,
    time_filter: {
      from: "00:00:00",
      to: "23:59:59",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
    },
    plugin: reportPlugin(),
  });

  if (!payload.id) {
    throw new Error("Gaiham report/tracker/generate тайлангийн id буцаасангүй.");
  }

  return {
    id: payload.id,
    title,
  };
}

async function retrieveReport(hash: string, reportId: number) {
  const payload = await postGaiham<GaihamApiResponse>("report/tracker/retrieve", {
    hash,
    report_id: reportId,
  });
  if (!payload.report) {
    throw new Error("Gaiham report/tracker/retrieve тайлан буцаасангүй.");
  }
  return payload.report;
}

async function deleteReport(hash: string, reportId: number) {
  await postGaiham<GaihamApiResponse>("report/tracker/delete", {
    hash,
    report_id: reportId,
  }).catch((error) => {
    console.warn("Gaiham generated report could not be deleted:", error);
  });
}

function valueNameMatchesFuel(value: string) {
  const normalized = normalizeLabel(value);
  return (
    /fuel|lit(er|re)|consum|refuel|volume|drain/.test(normalized) ||
    normalized.includes("\u0442\u04af\u043b\u0448") ||
    normalized.includes("\u0448\u0430\u0442\u0430\u0445\u0443\u0443\u043d") ||
    normalized.includes("\u0437\u0430\u0440\u0446\u0443\u0443\u043b") ||
    normalized.includes("\u043b\u0438\u0442\u0440")
  );
}

function valueNameMatchesPreferredConsumption(value: string) {
  const normalized = normalizeLabel(value);
  return (
    /consum|used|spent/.test(normalized) ||
    normalized.includes("\u0437\u0430\u0440\u0446\u0443\u0443\u043b") ||
    normalized.includes("\u0445\u044d\u0440\u044d\u0433\u043b\u044d\u044d")
  );
}

function rowFuelCandidates(row: Record<string, unknown>, columnsByField: Map<string, string>) {
  const candidates: Array<{ value: number; score: number; label: string }> = [];

  for (const [key, value] of Object.entries(row)) {
    const numberValue = cellRawNumber(value);
    if (numberValue === null || numberValue <= 0) {
      continue;
    }

    const label = [key, columnsByField.get(key), isObject(value) ? value.name : ""]
      .filter(Boolean)
      .join(" ");
    if (!valueNameMatchesFuel(label)) {
      continue;
    }

    let score = 1;
    if (valueNameMatchesPreferredConsumption(label)) {
      score += 8;
    }
    if (/total|sum|lit(er|re)|volume/i.test(label)) {
      score += 2;
    }
    candidates.push({
      value: numberValue,
      score,
      label,
    });
  }

  candidates.sort((left, right) => right.score - left.score || right.value - left.value);
  return candidates;
}

function extractSectionFuelLiters(section: Record<string, unknown>) {
  const columns = Array.isArray(section.columns) ? section.columns : [];
  const columnsByField = new Map<string, string>();
  for (const column of columns) {
    if (isObject(column) && typeof column.field === "string") {
      columnsByField.set(column.field, String(column.title ?? ""));
    }
  }

  const rows = Array.isArray(section.rows) ? section.rows : [];
  const mapRows = rows
    .map((row) => (isObject(row) ? row : null))
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const rowCandidates = mapRows.flatMap((row) => {
    const namedLabel = String(row.name ?? "");
    if (namedLabel && valueNameMatchesFuel(namedLabel)) {
      const value = cellRawNumber(row);
      return value !== null && value > 0
        ? [
            {
              value,
              score: valueNameMatchesPreferredConsumption(namedLabel) ? 10 : 3,
              label: namedLabel,
            },
          ]
        : [];
    }
    return rowFuelCandidates(row, columnsByField);
  });

  const data = Array.isArray(section.data) ? section.data : [];
  const dataCandidates = data.flatMap((item) => {
    if (!isObject(item)) {
      return [];
    }
    const total = isObject(item.total) ? rowFuelCandidates(item.total, columnsByField) : [];
    const itemRows = Array.isArray(item.rows)
      ? item.rows
          .map((row) => (isObject(row) ? rowFuelCandidates(row, columnsByField) : []))
          .flat()
      : [];
    return [...total, ...itemRows];
  });

  const candidates = [...rowCandidates, ...dataCandidates].sort(
    (left, right) => right.score - left.score || right.value - left.value,
  );
  return candidates[0] ?? null;
}

function trackerIdFromSheet(sheet: Record<string, unknown>) {
  const ids = Array.isArray(sheet.entity_ids) ? sheet.entity_ids : [];
  const id = Number(ids[0]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function sheetVehicleLabel(sheet: Record<string, unknown>, trackerById: Map<number, GaihamTracker>) {
  const trackerId = trackerIdFromSheet(sheet);
  const trackerLabel = trackerId ? trackerById.get(trackerId)?.label : "";
  return String(sheet.header || trackerLabel || trackerId || "").trim();
}

function extractVehicleCode(label: string) {
  const normalized = label.replace(/\s+/g, " ").trim();
  const codeMatch =
    normalized.match(/\b\d{2}[-\s]?\d{2}\s?[A-Z\u0410-\u042f\u04ae\u04e8]{2,3}\b/u) ||
    normalized.match(/\b\d{4,6}[A-Z\u0410-\u042f\u04ae\u04e8]{1,3}\b/u);
  return normalizeVehicleCode(codeMatch?.[0] || normalized);
}

function parseReportTotals(report: unknown, trackers: GaihamTracker[], requestedDate: string) {
  const trackerById = new Map(trackers.map((tracker) => [tracker.id, tracker]));
  const reportObject = isObject(report) ? report : {};
  const sheets = Array.isArray(reportObject.sheets) ? reportObject.sheets : [];
  const totalsByVehicle = new Map<string, AggregatedFuelTotal>();
  const ignoredSamples: string[] = [];
  let sourceRows = 0;

  for (const sheet of sheets) {
    if (!isObject(sheet)) {
      continue;
    }

    const trackerId = trackerIdFromSheet(sheet);
    const vehicleLabel = sheetVehicleLabel(sheet, trackerById);
    if (!trackerId && !/\d/.test(vehicleLabel)) {
      continue;
    }
    const vehicleCode = extractVehicleCode(vehicleLabel);
    const sections = Array.isArray(sheet.sections) ? sheet.sections : [];
    const candidates = sections
      .map((section) => (isObject(section) ? extractSectionFuelLiters(section) : null))
      .filter((candidate): candidate is { value: number; score: number; label: string } => Boolean(candidate));

    if (!vehicleCode || !candidates.length) {
      if (ignoredSamples.length < 12) {
        ignoredSamples.push(vehicleLabel || JSON.stringify(sheet).slice(0, 140));
      }
      continue;
    }

    candidates.sort((left, right) => right.score - left.score || right.value - left.value);
    const best = candidates[0];
    if (!best || best.value <= 0) {
      continue;
    }

    const current = totalsByVehicle.get(vehicleCode) ?? {
      fuelLiters: 0,
      rowCount: 0,
      sampleRows: [],
      trackerId,
      vehicleLabel: vehicleLabel || vehicleCode,
    };
    current.fuelLiters += best.value;
    current.rowCount += 1;
    sourceRows += 1;
    if (current.sampleRows.length < 3) {
      current.sampleRows.push(`${best.label}: ${best.value}`);
    }
    totalsByVehicle.set(vehicleCode, current);
  }

  const totals = Array.from(totalsByVehicle.entries())
    .map(([vehicleCode, total]) => ({
      requestedDate,
      trackerId: total.trackerId,
      vehicleCode,
      vehicleLabel: total.vehicleLabel,
      fuelLiters: Math.round(total.fuelLiters * 100) / 100,
      fuelType: "",
      source: "gaiham_gps" as const,
      rowCount: total.rowCount,
      sampleRows: total.sampleRows,
    }))
    .sort((left, right) => left.vehicleCode.localeCompare(right.vehicleCode));

  return {
    ignoredSamples,
    sourceRows,
    totals,
  };
}

export async function fetchGaihamDailyFuelTotals(requestedDate: string): Promise<GaihamFuelTotalsResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    throw new Error("Invalid date value. Use YYYY-MM-DD.");
  }

  const hash = await gaihamHash();
  const trackers = await loadTrackers(hash);
  if (!trackers.length) {
    throw new Error("Gaiham дээр тайланд оруулах төхөөрөмж олдсонгүй.");
  }

  const generated = await generateReport(
    hash,
    requestedDate,
    trackers.map((tracker) => tracker.id),
  );

  try {
    const report = await retrieveReport(hash, generated.id);
    const parsed = parseReportTotals(report, trackers, requestedDate);
    return {
      requestedDate,
      title: generated.title,
      reportId: generated.id,
      trackerCount: trackers.length,
      sourceRows: parsed.sourceRows,
      totals: parsed.totals,
      ignoredSamples: parsed.ignoredSamples,
    };
  } finally {
    await deleteReport(hash, generated.id);
  }
}

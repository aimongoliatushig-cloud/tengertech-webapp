import "server-only";

import { loadGarbageWeightLedger } from "@/lib/garbage-weight-ledger";
import { executeOdooKw, loadFleetVehicleBoard, type OdooConnection } from "@/lib/odoo";
import type { AppSession } from "@/lib/auth";

type OdooRelation = [number, string] | false;
type OdooValue = string | number | boolean | OdooRelation | number[] | false | null | undefined;

type FieldMap = Record<string, { string?: string; type?: string; relation?: string }>;

type RepairRecord = Record<string, OdooValue> & {
  id: number;
};

export type FleetRepairPermissionKey =
  | "request"
  | "quote"
  | "finance"
  | "contract"
  | "director"
  | "order"
  | "repair";

export type FleetRepairPermissions = Record<FleetRepairPermissionKey, boolean>;

export type FleetRepairQuote = {
  id: number | string;
  supplierName: string;
  amount: number;
  fileIds: number[];
  contractRequired: boolean;
  isSelected: boolean;
};

export type FleetRepairRequestSummary = {
  id: number;
  name: string;
  vehicle: string;
  state: string;
  stateLabel: string;
  totalAmount: number;
  contractRequired: boolean;
  createdAt: string;
  href: string;
};

export type FleetRepairRequestDetail = FleetRepairRequestSummary & {
  description: string;
  partsNote: string;
  requester: string;
  selectedSupplier: string;
  paymentState: string;
  contractState: string;
  orderState: string;
  repairNote: string;
  quotes: FleetRepairQuote[];
  attachmentIds: number[];
  raw: RepairRecord;
};

export type FleetRepairDashboard = {
  todayGarbageTons: number;
  repairingVehicles: number;
  waitingParts: number;
  waitingPayment: number;
  contractRequired: number;
  recentRequests: FleetRepairRequestSummary[];
  vehicleOptions: { id: number; label: string }[];
  repairLoadError?: string;
};

export type FleetRepairVehicleOptions = {
  vehicleOptions: { id: number; label: string }[];
  canCreateRequest: boolean;
  createDeniedMessage?: string;
};

export type FleetRepairGarbageSnapshot = {
  todayTons: number;
  byVehicle: { vehicle: string; tons: number; trips: number }[];
  week: { label: string; tons: number }[];
  monthTons: number;
};

export type FleetRepairCreateInput = {
  vehicleId?: number;
  issueSummary: string;
  description: string;
  partsNote: string;
  mode: "draft" | "submit";
  files: File[];
};

export type FleetRepairActionInput = {
  requestId: number;
  action: string;
  payload: Record<string, unknown>;
  files: File[];
};

const CONTRACT_THRESHOLD = 1_000_000;
export const FLEET_REPAIR_SAFE_ERROR = "Мэдээлэл ачаалж чадсангүй.";
export const FLEET_REPAIR_REQUEST_READ_NOTICE =
  "Засварын хүсэлтийн жагсаалт одоогоор харагдахгүй байна. Машины жагсаалт болон шинэ хүсэлтийн маягт хэвийн ажиллана.";
export const FLEET_REPAIR_CREATE_DENIED_MESSAGE =
  "Засварын хүсэлт үүсгэх Odoo эрх хүрэхгүй байна. Системийн администратор хэрэглэгчийг Засварын workflow менежер, Засварын багийн ахлагч эсвэл Механик бүлэгт нэмэх шаардлагатай.";

export class FleetRepairPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FleetRepairPermissionError";
  }
}

const MODEL_CANDIDATES = [
  process.env.FLEET_REPAIR_MODEL,
  "municipal.repair.request",
  "mfo.fleet.repair.request",
  "fleet.repair.request",
  "fleet.repair",
  "x_fleet_repair_request",
].filter(Boolean) as string[];

const LIST_FIELD_CANDIDATES = [
  "name",
  "vehicle_id",
  "fleet_vehicle_id",
  "issue_summary",
  "issue_description",
  "description",
  "damage_description",
  "parts_note",
  "part_note",
  "requester_id",
  "state",
  "stage",
  "status",
  "stage_id",
  "amount_total",
  "total_amount",
  "selected_supplier_total",
  "contract_required",
  "requires_contract",
  "payment_state",
  "contract_state",
  "order_state",
  "selected_supplier_id",
  "quote_line_ids",
  "supplier_quote_ids",
  "attachment_ids",
  "repair_note",
  "procurement_request_id",
  "create_date",
  "request_date",
  "date",
];

const QUOTE_MODEL_CANDIDATES = [
  process.env.FLEET_REPAIR_QUOTE_MODEL,
  "mfo.fleet.repair.quote",
  "fleet.repair.quote",
  "x_fleet_repair_quote",
].filter(Boolean) as string[];

const QUOTE_FIELD_CANDIDATES = [
  "supplier_id",
  "partner_id",
  "vendor_id",
  "supplier_name",
  "amount",
  "amount_total",
  "total_amount",
  "contract_required",
  "requires_contract",
  "is_selected",
  "selected",
  "attachment_ids",
  "file_ids",
];

const ACTION_METHODS: Record<string, string[]> = {
  submit: ["action_submit", "action_frontend_submit"],
  add_quotes: ["action_set_supplier_quotes", "action_add_supplier_quotes", "action_add_quotes"],
  select_supplier: ["action_select_supplier", "action_frontend_select_supplier"],
  make_payment: ["action_make_payment", "action_register_payment"],
  upload_contract_draft: ["action_upload_contract_draft", "action_set_contract_draft"],
  upload_contract_final: ["action_upload_contract_final", "action_set_contract_final"],
  director_approve: ["action_director_approve", "action_approve"],
  director_return: ["action_director_return", "action_return"],
  upload_order: ["action_upload_director_order", "action_upload_order"],
  receive_parts: ["action_receive_parts", "action_parts_received"],
  complete_repair: ["action_complete_repair", "action_done"],
};

const STATE_LABELS: Record<string, string> = {
  draft: "Ноорог",
  request: "Хүсэлт",
  requested: "Хүсэлт",
  quote: "Санал",
  quotation: "Санал",
  finance: "Санхүү",
  contract: "Гэрээ",
  director: "Захирал",
  order: "Тушаал",
  payment: "Төлбөр",
  parts: "Сэлбэг",
  repair: "Засвар",
  done: "Дууссан",
  completed: "Дууссан",
  cancel: "Цуцлагдсан",
  rejected: "Буцаасан",
};

const MODEL_CACHE = new Map<string, Promise<string>>();
const FIELD_CACHE = new Map<string, Promise<FieldMap>>();

function connectionCacheKey(connection: Partial<OdooConnection>) {
  return `${connection.url || ""}|${connection.db || ""}|${connection.login || ""}`;
}

function isPlaceholderModelName(model: string) {
  const normalized = model.trim().toUpperCase();
  return normalized.startsWith("CUSTOM_") || /^FLEET_REPAIR_.*_MODEL$/.test(normalized);
}

export function assertFleetRepairModelConfig() {
  const configuredModels = [
    process.env.FLEET_REPAIR_MODEL,
    process.env.FLEET_REPAIR_QUOTE_MODEL,
  ].filter((model): model is string => Boolean(model));

  if (configuredModels.some(isPlaceholderModelName)) {
    throw new Error(FLEET_REPAIR_SAFE_ERROR);
  }
}

function connectionFromSession(session: AppSession): Partial<OdooConnection> {
  return {
    login: session.login,
    password: session.password,
  };
}

function relationId(value: OdooValue) {
  return Array.isArray(value) && typeof value[0] === "number" ? value[0] : null;
}

function stringValue(record: RepairRecord, names: string[], fallback = "") {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && typeof value[1] === "string" && value[1].trim()) {
      return value[1];
    }
  }
  return fallback;
}

function numberValue(record: RepairRecord, names: string[], fallback = 0) {
  for (const name of names) {
    const value = record[name];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return fallback;
}

function booleanValue(record: RepairRecord, names: string[]) {
  return names.some((name) => record[name] === true);
}

function firstTextLine(value: string, fallback = "") {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? fallback;
}

function idArrayValue(record: RepairRecord, names: string[]) {
  for (const name of names) {
    const value = record[name];
    if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
      return value as number[];
    }
  }
  return [];
}

function compactFields(fields: FieldMap, candidates: string[]) {
  return candidates.filter((field) => field in fields);
}

async function fieldsForModel(model: string, connection: Partial<OdooConnection>) {
  const cacheKey = `${connectionCacheKey(connection)}|${model}`;
  const cached = FIELD_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = executeOdooKw<FieldMap>(
    model,
    "fields_get",
    [],
    { attributes: ["string", "type", "relation"] },
    connection,
  );
  FIELD_CACHE.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    FIELD_CACHE.delete(cacheKey);
    throw error;
  }
}

async function resolveModel(candidates: string[], connection: Partial<OdooConnection>) {
  const placeholder = candidates.find(isPlaceholderModelName);
  if (placeholder) {
    throw new Error(FLEET_REPAIR_SAFE_ERROR);
  }

  const cacheKey = `${connectionCacheKey(connection)}|${candidates.join(",")}`;
  const cached = MODEL_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    for (const model of candidates) {
      try {
        await fieldsForModel(model, connection);
        return model;
      } catch {
        // Try the next custom model name. The exact Odoo module can vary by deployment.
      }
    }
    throw new Error("Fleet repair custom model олдсонгүй.");
  })();

  MODEL_CACHE.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    MODEL_CACHE.delete(cacheKey);
    throw error;
  }
}

async function getRepairModel(connection: Partial<OdooConnection>) {
  return resolveModel(MODEL_CANDIDATES, connection);
}

async function getQuoteModel(connection: Partial<OdooConnection>) {
  return resolveModel(QUOTE_MODEL_CANDIDATES, connection);
}

async function checkModelAccess(
  model: string,
  operation: "read" | "create" | "write" | "unlink",
  connection: Partial<OdooConnection>,
) {
  return executeOdooKw<boolean>(
    model,
    "check_access_rights",
    [operation],
    { raise_exception: false },
    connection,
  ).catch(() => false);
}

function stateLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return STATE_LABELS[normalized] ?? (value || "Тодорхойгүй");
}

function normalizeSummary(record: RepairRecord): FleetRepairRequestSummary {
  const state = stringValue(record, ["state", "stage", "status", "stage_id"], "draft");
  const totalAmount = numberValue(record, [
    "amount_total",
    "total_amount",
    "selected_supplier_total",
  ]);
  const quoteContractRequired = booleanValue(record, ["contract_required", "requires_contract"]);

  return {
    id: record.id,
    name: stringValue(record, ["name", "issue_summary"], `Засвар #${record.id}`),
    vehicle: stringValue(record, ["vehicle_id", "fleet_vehicle_id"], "Машин сонгоогүй"),
    state,
    stateLabel: stateLabel(state),
    totalAmount,
    contractRequired: quoteContractRequired || totalAmount >= CONTRACT_THRESHOLD,
    createdAt: stringValue(record, ["request_date", "date", "create_date"]),
    href: `/fleet-repair/requests/${record.id}`,
  };
}

function normalizeQuote(record: RepairRecord, selectedSupplierId: number | null): FleetRepairQuote {
  const amount = numberValue(record, ["amount", "amount_total", "total_amount"]);
  const supplierId =
    relationId(record.supplier_id) ?? relationId(record.partner_id) ?? relationId(record.vendor_id);

  return {
    id: record.id,
    supplierName:
      stringValue(record, ["supplier_id", "partner_id", "vendor_id", "supplier_name"]) ||
      `Нийлүүлэгч #${record.id}`,
    amount,
    fileIds: idArrayValue(record, ["attachment_ids", "file_ids"]),
    contractRequired:
      booleanValue(record, ["contract_required", "requires_contract"]) ||
      amount >= CONTRACT_THRESHOLD,
    isSelected:
      booleanValue(record, ["is_selected", "selected"]) ||
      Boolean(selectedSupplierId && supplierId === selectedSupplierId),
  };
}

async function loadQuotesForRequest(
  request: RepairRecord,
  connection: Partial<OdooConnection>,
): Promise<FleetRepairQuote[]> {
  const quoteIds = idArrayValue(request, ["quote_line_ids", "supplier_quote_ids"]);
  if (!quoteIds.length) {
    return [];
  }

  try {
    const quoteModel = await getQuoteModel(connection);
    const fields = await fieldsForModel(quoteModel, connection);
    const quoteFields = compactFields(fields, QUOTE_FIELD_CANDIDATES);
    const records = await executeOdooKw<RepairRecord[]>(
      quoteModel,
      "read",
      [quoteIds],
      { fields: quoteFields },
      connection,
    );
    const selectedSupplierId = relationId(request.selected_supplier_id);
    return records.map((record) => normalizeQuote(record, selectedSupplierId));
  } catch {
    return [];
  }
}

async function loadRequestRecords(
  connection: Partial<OdooConnection>,
  domain: unknown[] = [],
  limit = 80,
) {
  const model = await getRepairModel(connection);
  const fields = await fieldsForModel(model, connection);
  const selectedFields = compactFields(fields, LIST_FIELD_CANDIDATES);

  const records = await executeOdooKw<RepairRecord[]>(
    model,
    "search_read",
    [domain],
    {
      fields: selectedFields,
      limit,
      order: selectedFields.includes("create_date") ? "create_date desc" : "id desc",
    },
    connection,
  );

  return { model, fields, records };
}

export function getFleetRepairPermissions(session: AppSession): FleetRepairPermissions {
  const normalizedRole = String(session.role || "").toLowerCase();
  const groupFlags = session.groupFlags;
  const isAdmin = normalizedRole === "system_admin";
  const isDirector = normalizedRole === "director";
  const isManager = ["general_manager", "project_manager"].includes(normalizedRole);
  const isMechanic = ["senior_master", "team_leader", "worker"].includes(normalizedRole);
  const isPurchase = ["storekeeper", "warehouse", "nyrav", "purchase"].some((role) =>
    normalizedRole.includes(role),
  );
  const isFinance = ["accountant", "finance", "ня-бо", "нябо"].some((role) =>
    normalizedRole.includes(role),
  );
  const isLegal = ["legal", "law", "хууль"].some((role) => normalizedRole.includes(role));
  const isOffice = ["archive", "office", "бичиг"].some((role) => normalizedRole.includes(role));
  const isRepairManager = Boolean(groupFlags?.fleetRepairManager);
  const isRepairMechanic = Boolean(groupFlags?.fleetRepairMechanic);
  const isRepairTeamLeader = Boolean(groupFlags?.fleetRepairTeamLeader);
  const isRepairAdministration = Boolean(groupFlags?.fleetRepairAdministration);
  const isRepairFinance = Boolean(groupFlags?.fleetRepairFinance);
  const isRepairPurchaser = Boolean(groupFlags?.fleetRepairPurchaser);
  const isRepairGeneralManager = Boolean(groupFlags?.fleetRepairGeneralManager);
  const isRepairCeo = Boolean(groupFlags?.fleetRepairCeo);

  return {
    request:
      isAdmin ||
      isManager ||
      isMechanic ||
      isRepairManager ||
      isRepairMechanic ||
      isRepairTeamLeader,
    quote: isAdmin || isPurchase || isRepairManager || isRepairPurchaser,
    finance:
      isAdmin ||
      isFinance ||
      normalizedRole === "general_manager" ||
      isRepairManager ||
      isRepairFinance,
    contract: isAdmin || isLegal || isRepairManager || isRepairAdministration,
    director: isAdmin || isDirector || isRepairManager || isRepairCeo || isRepairGeneralManager,
    order: isAdmin || isOffice || isRepairManager || isRepairAdministration,
    repair: isAdmin || isMechanic || isRepairManager || isRepairMechanic || isRepairTeamLeader,
  };
}

export async function loadFleetRepairRequests(session: AppSession) {
  const connection = connectionFromSession(session);
  const repairResult = await loadRequestRecords(connection).catch((error) => ({
    error,
    records: [] as RepairRecord[],
  }));

  return {
    permissions: getFleetRepairPermissions(session),
    requests: repairResult.records.map(normalizeSummary),
    repairLoadError: "error" in repairResult ? FLEET_REPAIR_REQUEST_READ_NOTICE : "",
  };
}

export async function loadFleetRepairRequest(session: AppSession, requestId: number) {
  const connection = connectionFromSession(session);
  const { records } = await loadRequestRecords(connection, [["id", "=", requestId]], 1);
  const record = records[0];
  if (!record) {
    return null;
  }

  const quotes = await loadQuotesForRequest(record, connection);
  const totalAmount =
    numberValue(record, ["amount_total", "total_amount", "selected_supplier_total"]) ||
    quotes.find((quote) => quote.isSelected)?.amount ||
    Math.max(0, ...quotes.map((quote) => quote.amount));
  const summary = normalizeSummary({
    ...record,
    amount_total: totalAmount,
    contract_required:
      booleanValue(record, ["contract_required", "requires_contract"]) ||
      quotes.some((quote) => quote.contractRequired),
  });

  return {
    ...summary,
    description: stringValue(record, ["description", "damage_description", "issue_summary"]),
    partsNote: stringValue(record, ["parts_note", "part_note"]),
    requester: stringValue(record, ["requester_id"]),
    selectedSupplier: stringValue(record, ["selected_supplier_id"]),
    paymentState: stateLabel(stringValue(record, ["payment_state"])),
    contractState: stateLabel(stringValue(record, ["contract_state"])),
    orderState: stateLabel(stringValue(record, ["order_state"])),
    repairNote: stringValue(record, ["repair_note"]),
    quotes,
    attachmentIds: idArrayValue(record, ["attachment_ids"]),
    raw: record,
  } satisfies FleetRepairRequestDetail;
}

async function fileToAttachmentPayload(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    name: file.name || "attachment",
    mimetype: file.type || "application/octet-stream",
    datas: buffer.toString("base64"),
  };
}

async function createAttachments(
  model: string,
  recordId: number,
  files: File[],
  connection: Partial<OdooConnection>,
) {
  const ids: number[] = [];
  for (const file of files) {
    if (!file.size) {
      continue;
    }
    const payload = await fileToAttachmentPayload(file);
    const id = await executeOdooKw<number>(
      "ir.attachment",
      "create",
      [
        {
          ...payload,
          res_model: model,
          res_id: recordId,
        },
      ],
      {},
      connection,
    );
    ids.push(id);
  }
  return ids;
}

async function callFirstAvailableMethod(
  model: string,
  recordId: number,
  methods: string[],
  payload: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  let lastError: unknown = null;
  for (const method of methods) {
    try {
      return await executeOdooKw<unknown>(model, method, [[recordId], payload], {}, connection);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Odoo action method ажилласангүй.");
}

export async function createFleetRepairRequest(session: AppSession, input: FleetRepairCreateInput) {
  const connection = connectionFromSession(session);
  const model = await getRepairModel(connection);
  const canCreate = await checkModelAccess(model, "create", connection);
  if (!canCreate) {
    throw new FleetRepairPermissionError(FLEET_REPAIR_CREATE_DENIED_MESSAGE);
  }
  const fields = await fieldsForModel(model, connection);
  const values: Record<string, unknown> = {};

  if (input.vehicleId && "vehicle_id" in fields) {
    values.vehicle_id = input.vehicleId;
  } else if (input.vehicleId && "fleet_vehicle_id" in fields) {
    values.fleet_vehicle_id = input.vehicleId;
  }
  if ("issue_summary" in fields) {
    values.issue_summary = input.issueSummary || firstTextLine(input.description, "Засварын хүсэлт");
  }
  if ("description" in fields) {
    values.description = input.description;
  } else if ("damage_description" in fields) {
    values.damage_description = input.description;
  }
  if ("parts_note" in fields) {
    values.parts_note = input.partsNote;
  } else if ("part_note" in fields) {
    values.part_note = input.partsNote;
  }

  const createdId = await executeOdooKw<number>(model, "create", [values], {}, connection);
  const attachmentIds = await createAttachments(model, createdId, input.files, connection);

  if (input.mode === "submit") {
    await callFirstAvailableMethod(
      model,
      createdId,
      ACTION_METHODS.submit,
      { attachment_ids: attachmentIds },
      connection,
    );
  }

  return { id: createdId, attachmentIds };
}

export async function loadFleetRepairVehicleOptions(
  session: AppSession,
): Promise<FleetRepairVehicleOptions> {
  const connection = connectionFromSession(session);
  const [vehicleBoard, createAccess] = await Promise.all([
    loadFleetVehicleBoard(connection),
    getRepairModel(connection)
      .then((model) => checkModelAccess(model, "create", connection))
      .catch(() => false),
  ]);

  return {
    vehicleOptions: vehicleBoard.allVehicles.map((vehicle) => ({
      id: vehicle.id,
      label: `${vehicle.plate} - ${vehicle.name}`,
    })),
    canCreateRequest: createAccess,
    createDeniedMessage: createAccess ? undefined : FLEET_REPAIR_CREATE_DENIED_MESSAGE,
  };
}

export async function runFleetRepairAction(session: AppSession, input: FleetRepairActionInput) {
  const connection = connectionFromSession(session);
  const model = await getRepairModel(connection);
  const attachmentIds = await createAttachments(model, input.requestId, input.files, connection);
  const methods = ACTION_METHODS[input.action];
  if (!methods) {
    throw new Error("Танигдаагүй үйлдэл.");
  }

  return callFirstAvailableMethod(
    model,
    input.requestId,
    methods,
    {
      ...input.payload,
      attachment_ids: attachmentIds,
    },
    connection,
  );
}

export async function loadFleetRepairDashboard(session: AppSession): Promise<FleetRepairDashboard> {
  const connection = connectionFromSession(session);
  const [repairResult, garbage, vehicleBoard] = await Promise.all([
    loadRequestRecords(connection, [], 12).catch((error) => ({
      error,
      records: [] as RepairRecord[],
    })),
    loadGarbageWeightLedger(connection).catch(() => null),
    loadFleetVehicleBoard(connection).catch(() => null),
  ]);
  const repairLoadError =
    "error" in repairResult
      ? FLEET_REPAIR_REQUEST_READ_NOTICE
      : "";
  const recentRequests = repairResult.records.map(normalizeSummary);

  return {
    todayGarbageTons: (garbage?.today.kg ?? 0) / 1000,
    repairingVehicles: recentRequests.filter((request) =>
      ["repair", "parts", "payment", "contract", "finance", "quote"].includes(
        request.state.toLowerCase(),
      ),
    ).length,
    waitingParts: recentRequests.filter((request) => request.state.toLowerCase().includes("part"))
      .length,
    waitingPayment: recentRequests.filter((request) =>
      request.state.toLowerCase().includes("payment"),
    ).length,
    contractRequired: recentRequests.filter((request) => request.contractRequired).length,
    recentRequests,
    vehicleOptions:
      vehicleBoard?.allVehicles.map((vehicle) => ({
        id: vehicle.id,
        label: `${vehicle.plate} - ${vehicle.name}`,
      })) ?? [],
    repairLoadError,
  };
}

export async function loadFleetRepairGarbage(session: AppSession): Promise<FleetRepairGarbageSnapshot> {
  const ledger = await loadGarbageWeightLedger(connectionFromSession(session));
  const byVehicleMap = new Map<string, { vehicle: string; tons: number; trips: number }>();

  for (const day of ledger.dayItems.slice(0, 14)) {
    for (const row of day.rows) {
      const item = byVehicleMap.get(row.vehicleName) ?? {
        vehicle: row.vehicleName,
        tons: 0,
        trips: 0,
      };
      item.tons += row.kg / 1000;
      item.trips += 1;
      byVehicleMap.set(row.vehicleName, item);
    }
  }

  return {
    todayTons: ledger.today.kg / 1000,
    byVehicle: [...byVehicleMap.values()].sort((a, b) => b.tons - a.tons).slice(0, 12),
    week: ledger.dayItems.slice(0, 7).reverse().map((day) => ({
      label: day.dateLabel,
      tons: day.totalKg / 1000,
    })),
    monthTons: ledger.thisMonth.kg / 1000,
  };
}

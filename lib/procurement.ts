import "server-only";

import { createOdooConnection, type OdooConnection } from "@/lib/odoo";
import type { RoleGroupFlags } from "@/lib/roles";

export type ProcurementUser = {
  id: number;
  name: string;
  login: string;
  company: string;
  flags: {
    requester: boolean;
    storekeeper: boolean;
    finance: boolean;
    office_clerk: boolean;
    contract_officer: boolean;
    director: boolean;
    general_manager: boolean;
    admin: boolean;
  };
};

export type ProcurementParty = {
  id: number;
  name: string;
};

export type ProcurementSupplier = ProcurementParty & {
  vat?: string | null;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  active?: boolean;
};

export type ProcurementCodeLabel = {
  code: string;
  label: string;
};

export type ProcurementAction = {
  code: string;
  label: string;
};

export type ProcurementAttachment = {
  id: number;
  name: string;
  mimetype: string;
};

export type ProcurementLine = {
  id: number;
  sequence: number;
  product_id?: number | null;
  package_id?: number | null;
  product_name?: string | null;
  specification?: string | null;
  quantity: number;
  uom?: ProcurementParty | null;
  approx_unit_price: number;
  approx_subtotal: number;
  final_unit_price: number;
  final_subtotal: number;
  remark?: string | null;
  images: ProcurementAttachment[];
};

export type ProcurementQuotation = {
  id: number;
  sequence: number;
  package_id?: number | null;
  supplier: ProcurementParty;
  quotation_ref?: string | null;
  quotation_date?: string | null;
  amount_total: number;
  currency: ProcurementParty;
  payment_terms_text?: string | null;
  delivery_terms_text?: string | null;
  expected_delivery_date?: string | null;
  is_selected: boolean;
  notes?: string | null;
  attachments: ProcurementAttachment[];
};

export type ProcurementPackage = {
  id: number;
  sequence: number;
  name: string;
  note?: string | null;
  lines: ProcurementLine[];
  quotations: ProcurementQuotation[];
  quote_count: number;
  total_quantity: number;
  amount_total: number;
  lowest_quotation?: ProcurementQuotation | null;
  is_complete: boolean;
  is_over_threshold?: boolean;
  ceo_selected_quotation_id?: number | null;
  ceo_selected_quotation?: ProcurementQuotation | null;
  ceo_decision_note?: string | null;
  ceo_order_number?: string | null;
  ceo_order_date?: string | null;
  ceo_order_note?: string | null;
  ceo_order_attachments?: ProcurementAttachment[];
  ceo_decision_recorded_by?: ProcurementParty | null;
  ceo_decision_date?: string | null;
  ceo_order_ready?: boolean;
};

export type ProcurementDocument = {
  id: number;
  document_type: ProcurementCodeLabel;
  note?: string | null;
  is_required: boolean;
  attachments: ProcurementAttachment[];
};

export type ProcurementAudit = {
  id: number;
  action_code: string;
  action_label: string;
  old_state?: ProcurementCodeLabel | null;
  new_state?: ProcurementCodeLabel | null;
  user: ProcurementParty;
  changed_at: string;
  note?: string | null;
};

export type ProcurementRequestSummary = {
  id: number;
  name: string;
  title: string;
  project?: ProcurementParty | null;
  task?: ProcurementParty | null;
  vehicle?: ProcurementParty | null;
  department?: ProcurementParty | null;
  requester?: ProcurementParty | null;
  storekeeper?: ProcurementParty | null;
  procurement_type: ProcurementCodeLabel;
  urgency: ProcurementCodeLabel;
  description?: string | null;
  required_date?: string | null;
  state: ProcurementCodeLabel;
  flow_type?: ProcurementCodeLabel | null;
  selected_supplier?: (ProcurementParty & { total: number }) | null;
  selected_quotation_id?: number | null;
  selected_supplier_total: number;
  amount_approx_total: number;
  payment_status: ProcurementCodeLabel;
  receipt_status: ProcurementCodeLabel;
  is_over_threshold: boolean;
  paid_amount?: number;
  payment_reference?: string | null;
  payment_note?: string | null;
  payment_date?: string | null;
  legal_state?: ProcurementCodeLabel;
  date_quotation_submitted?: string | null;
  date_director_decision?: string | null;
  date_order_issued?: string | null;
  date_contract_signed?: string | null;
  date_paid?: string | null;
  date_received?: string | null;
  current_responsible?: ProcurementParty | null;
  current_stage_age_days: number;
  delay_days: number;
  is_delayed: boolean;
  paid: boolean;
  received: boolean;
  purchase_order_id?: number | null;
  vendor_bill_id?: number | null;
  stock_receipt_required: boolean;
  service_confirmation_only: boolean;
  package_count?: number;
  packages_complete?: boolean;
  high_value_packages?: ProcurementPackage[];
  available_actions: ProcurementAction[];
};

export type ProcurementRequestDetail = ProcurementRequestSummary & {
  lines: ProcurementLine[];
  quotations: ProcurementQuotation[];
  packages: ProcurementPackage[];
  unassigned_lines: ProcurementLine[];
  documents: ProcurementDocument[];
  audit: ProcurementAudit[];
  attachments: ProcurementAttachment[];
};

export type ProcurementMeta = {
  projects: ProcurementParty[];
  tasks: Array<ProcurementParty & { project_id: number }>;
  vehicles: ProcurementParty[];
  departments: ProcurementParty[];
  storekeepers: ProcurementParty[];
  suppliers: ProcurementSupplier[];
  uoms: ProcurementParty[];
};

export type ProcurementDashboard = {
  metrics: {
    total: number;
    low_flow: number;
    high_flow: number;
    payment_pending: number;
    receipt_pending: number;
    delayed: number;
    average_resolution_days: number;
    generated_on: string;
  };
  storekeeper_load: Array<ProcurementParty & { count: number }>;
  department_counts: Array<ProcurementParty & { count: number }>;
  project_progress: Array<ProcurementParty & { count: number }>;
  supplier_counts: Array<ProcurementParty & { count: number }>;
  items: ProcurementRequestSummary[];
};

type ApiEnvelope<T> = {
  ok: boolean;
  user?: ProcurementUser;
  item?: T;
  items?: T[];
  metrics?: ProcurementDashboard["metrics"];
  storekeeper_load?: ProcurementDashboard["storekeeper_load"];
  department_counts?: ProcurementDashboard["department_counts"];
  project_progress?: ProcurementDashboard["project_progress"];
  supplier_counts?: ProcurementDashboard["supplier_counts"];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  projects?: ProcurementMeta["projects"];
  tasks?: ProcurementMeta["tasks"];
  vehicles?: ProcurementMeta["vehicles"];
  departments?: ProcurementMeta["departments"];
  storekeepers?: ProcurementMeta["storekeepers"];
  suppliers?: ProcurementMeta["suppliers"];
  uoms?: ProcurementMeta["uoms"];
  attachment?: ProcurementAttachment;
  supplier?: ProcurementSupplier;
  error?: {
    code: string;
    message: string;
  };
};

type ConnectionOverrides = Partial<OdooConnection>;

const PROCUREMENT_API_SETUP_ERROR =
  "Худалдан авалтын API олдсонгүй.";

export function isProcurementSetupError(error: unknown) {
  const message = String(error);
  return (
    message.includes(PROCUREMENT_API_SETUP_ERROR) ||
    message.includes("Session.authenticate() takes 3 positional arguments but 4 were given") ||
    message.includes("mpw/api/login")
  );
}

export function createFallbackProcurementUser(session: {
  uid: number;
  name: string;
  login: string;
  role: string;
  groupFlags?: Partial<RoleGroupFlags> | null;
}): ProcurementUser {
  const isAdmin = session.role === "system_admin";
  const isDirector = session.role === "director";
  const isGeneralManager = session.role === "general_manager";
  const isDepartmentHead = session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);

  return {
    id: session.uid,
    name: session.name,
    login: session.login,
    company: "Тохижилт үйлчилгээний төв",
    flags: {
      requester: isDepartmentHead || isGeneralManager,
      storekeeper: false,
      finance: false,
      office_clerk: false,
      contract_officer: false,
      director: isDirector,
      general_manager: isGeneralManager,
      admin: isAdmin,
    },
  };
}

export function createEmptyProcurementDashboard(): ProcurementDashboard {
  return {
    metrics: {
      total: 0,
      low_flow: 0,
      high_flow: 0,
      payment_pending: 0,
      receipt_pending: 0,
      delayed: 0,
      average_resolution_days: 0,
      generated_on: new Date().toISOString(),
    },
    storekeeper_load: [],
    department_counts: [],
    project_progress: [],
    supplier_counts: [],
    items: [],
  };
}

export function createFallbackProcurementMeta(taskId?: string, projectId?: string): ProcurementMeta {
  return {
    projects: projectId ? [{ id: Number(projectId), name: `Төсөл #${projectId}` }] : [],
    tasks: taskId ? [{ id: Number(taskId), name: `Ажилбар #${taskId}`, project_id: Number(projectId || 0) }] : [],
    vehicles: [],
    departments: [],
    storekeepers: [{ id: 0, name: "Идэвхжсэний дараа сонгоно" }],
    suppliers: [],
    uoms: [],
  };
}

function getCookieHeaderValue(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error("Нэвтрэлтийн мэдээлэл олдсонгүй.");
  }

  return setCookieHeader.split(",").map((part) => part.split(";")[0].trim()).join("; ");
}

async function readApiEnvelope<T>(response: Response, path: string) {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!rawText.trim()) {
    throw new Error(`Худалдан авалтын API хоосон хариу буцаалаа: ${path}`);
  }

  try {
    return JSON.parse(rawText) as ApiEnvelope<T>;
  } catch {
    if (response.status === 404 || contentType.includes("text/html") || rawText.trim().startsWith("<")) {
      throw new Error(`${PROCUREMENT_API_SETUP_ERROR} (${path})`);
    }

    throw new Error(`Худалдан авалтын API JSON бус хариу буцаалаа: ${path}`);
  }
}

async function loginToProcurementApi(connectionOverrides: ConnectionOverrides = {}) {
  const connection = createOdooConnection(connectionOverrides);
  const loginPath = "/mpw/api/login";
  const response = await fetch(`${connection.url}/mpw/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      db: connection.db,
      login: connection.login,
      password: connection.password,
    }),
  });

  const payload = await readApiEnvelope<never>(response, loginPath);
  if (response.ok && payload.ok) {
    return {
      connection,
      cookie: getCookieHeaderValue(response.headers.get("set-cookie")),
      user: payload.user!,
    };
  }

  const errorMessage = payload.error?.message || "";
  if (!errorMessage.includes("Session.authenticate() takes")) {
    throw new Error(payload.error?.message || "Procurement API нэвтрэлт амжилтгүй боллоо.");
  }

  const fallbackResponse = await fetch(`${connection.url}/web/session/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      jsonrpc: "2.0",
      params: {
        db: connection.db,
        login: connection.login,
        password: connection.password,
      },
    }),
  });
  const fallbackPayload = (await fallbackResponse.json()) as {
    result?: { uid?: number };
    error?: { message?: string };
  };
  if (!fallbackResponse.ok || !fallbackPayload.result?.uid) {
    throw new Error(fallbackPayload.error?.message || "Procurement API нэвтрэлт амжилтгүй боллоо.");
  }

  return {
    connection,
    cookie: getCookieHeaderValue(fallbackResponse.headers.get("set-cookie")),
    user: payload.user!,
  };
}

async function procurementFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    connectionOverrides?: ConnectionOverrides;
  } = {},
) {
  const { connection, cookie } = await loginToProcurementApi(options.connectionOverrides);
  const response = await fetch(`${connection.url}${path}`, {
    method: options.method || "GET",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await readApiEnvelope<T>(response, path);
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || "Procurement API хүсэлт амжилтгүй боллоо.");
  }

  return payload;
}

function buildQuery(filters: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function loadProcurementMe(connectionOverrides: ConnectionOverrides = {}) {
  const response = await procurementFetch<never>("/mpw/api/me", { connectionOverrides });
  return response.user!;
}

export async function loadProcurementMeta(connectionOverrides: ConnectionOverrides = {}) {
  const response = await procurementFetch<never>("/mpw/api/meta", { connectionOverrides });
  return {
    projects: response.projects || [],
    tasks: response.tasks || [],
    vehicles: response.vehicles || [],
    departments: response.departments || [],
    storekeepers: response.storekeepers || [],
    suppliers: response.suppliers || [],
    uoms: response.uoms || [],
  } satisfies ProcurementMeta;
}

export async function loadProcurementRequests(
  filters: Record<string, string | number | undefined | null> = {},
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestSummary>(
    `/mpw/api/requests${buildQuery(filters)}`,
    { connectionOverrides },
  );
  return {
    items: response.items || [],
    pagination: response.pagination || {
      page: 1,
      limit: 20,
      total: 0,
      pages: 1,
    },
  };
}

export async function loadProcurementRequestDetail(
  requestId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}`,
    { connectionOverrides },
  );
  return response.item!;
}

export async function loadProcurementDashboard(
  filters: Record<string, string | number | undefined | null> = {},
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestSummary>(
    `/mpw/api/dashboard${buildQuery(filters)}`,
    { connectionOverrides },
  );
  return {
    metrics: response.metrics!,
    storekeeper_load: response.storekeeper_load || [],
    department_counts: response.department_counts || [],
    project_progress: response.project_progress || [],
    supplier_counts: response.supplier_counts || [],
    items: response.items || [],
  } satisfies ProcurementDashboard;
}

export async function createProcurementRequest(
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>("/mpw/api/requests", {
    method: "POST",
    body: payload,
    connectionOverrides,
  });
  return response.item!;
}

export async function submitProcurementForQuotation(
  requestId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/submit`,
    {
      method: "POST",
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function submitProcurementQuotations(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/submit_quotations`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function saveProcurementPackage(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/save_package`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function deleteProcurementPackage(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/delete_package`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function createProcurementSupplier(
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<never>("/mpw/api/suppliers", {
    method: "POST",
    body: payload,
    connectionOverrides,
  });
  return response.supplier!;
}

export async function loadProcurementSuppliers(
  filters: Record<string, string | number | undefined | null> = {},
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<never>(
    `/mpw/api/suppliers${buildQuery(filters)}`,
    { connectionOverrides },
  );
  return response.suppliers || [];
}

export async function updateProcurementSupplier(
  supplierId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<never>(`/mpw/api/suppliers/${supplierId}`, {
    method: "PATCH",
    body: payload,
    connectionOverrides,
  });
  return response.supplier!;
}

export async function deleteProcurementSupplier(
  supplierId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<never>(`/mpw/api/suppliers/${supplierId}`, {
    method: "DELETE",
    connectionOverrides,
  });
  return response.supplier!;
}

export async function moveProcurementToFinanceReview(
  requestId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/move_to_finance_review`,
    {
      method: "POST",
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function prepareProcurementOrder(
  requestId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/prepare_order`,
    {
      method: "POST",
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function approveProcurementDirectorDecision(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/director_decision`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function attachProcurementFinalOrder(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/attach_final_order`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function recordProcurementPackageCeoOrder(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/record_package_ceo_order`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function markProcurementContractSigned(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/mark_contract_signed`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function markProcurementPaid(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/mark_paid`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function markProcurementReceived(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/mark_received`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function markProcurementDone(
  requestId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/mark_done`,
    {
      method: "POST",
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function cancelProcurementRequest(
  requestId: number,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<ProcurementRequestDetail>(
    `/mpw/api/requests/${requestId}/cancel`,
    {
      method: "POST",
      connectionOverrides,
    },
  );
  return response.item!;
}

export async function uploadProcurementAttachment(
  requestId: number,
  payload: Record<string, unknown>,
  connectionOverrides: ConnectionOverrides = {},
) {
  const response = await procurementFetch<never>(
    `/mpw/api/requests/${requestId}/upload_attachment`,
    {
      method: "POST",
      body: payload,
      connectionOverrides,
    },
  );
  return response.attachment!;
}

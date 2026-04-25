import "server-only";

import { createOdooConnection, type OdooConnection } from "@/lib/odoo";

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
  product_name?: string | null;
  specification?: string | null;
  quantity: number;
  uom?: ProcurementParty | null;
  approx_unit_price: number;
  approx_subtotal: number;
  final_unit_price: number;
  final_subtotal: number;
  remark?: string | null;
};

export type ProcurementQuotation = {
  id: number;
  sequence: number;
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
  payment_reference?: string | null;
  payment_date?: string | null;
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
  available_actions: ProcurementAction[];
};

export type ProcurementRequestDetail = ProcurementRequestSummary & {
  lines: ProcurementLine[];
  quotations: ProcurementQuotation[];
  documents: ProcurementDocument[];
  audit: ProcurementAudit[];
  attachments: ProcurementAttachment[];
};

export type ProcurementMeta = {
  projects: ProcurementParty[];
  tasks: Array<ProcurementParty & { project_id: number }>;
  departments: ProcurementParty[];
  storekeepers: ProcurementParty[];
  suppliers: ProcurementParty[];
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
  departments?: ProcurementMeta["departments"];
  storekeepers?: ProcurementMeta["storekeepers"];
  suppliers?: ProcurementMeta["suppliers"];
  uoms?: ProcurementMeta["uoms"];
  attachment?: ProcurementAttachment;
  error?: {
    code: string;
    message: string;
  };
};

type ConnectionOverrides = Partial<OdooConnection>;

const PROCUREMENT_API_SETUP_ERROR =
  "Худалдан авалтын API олдсонгүй. Odoo дээр municipal_procurement_workflow модуль суусан эсэх болон addons_path-д энэ repo-ийн custom_addons орсон эсэхийг шалгана уу.";

function getCookieHeaderValue(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error("Odoo session cookie олдсонгүй.");
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
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || "Procurement API нэвтрэлт амжилтгүй боллоо.");
  }

  return {
    connection,
    cookie: getCookieHeaderValue(response.headers.get("set-cookie")),
    user: payload.user!,
  };
}

async function procurementFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
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

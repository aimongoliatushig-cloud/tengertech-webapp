import "server-only";

import { executeOdooKw, type OdooConnection } from "@/lib/odoo";

type Relation = [number, string] | false;

type GarbageTaskRecord = {
  id: number;
  name: string;
  project_id: Relation;
  stage_id: Relation;
  mfo_state: string;
  mfo_shift_date: string | false;
  mfo_shift_type: string | false;
  mfo_route_id: Relation;
  mfo_district_id: Relation;
  mfo_vehicle_id: Relation;
  mfo_driver_employee_id: Relation;
  mfo_inspector_employee_id: Relation;
  mfo_dispatch_datetime: string | false;
  mfo_start_datetime: string | false;
  mfo_end_datetime: string | false;
  mfo_end_shift_summary: string | false;
  mfo_stop_count: number;
  mfo_completed_stop_count: number;
  mfo_skipped_stop_count: number;
  mfo_progress_percent: number;
  mfo_proof_count: number;
  mfo_issue_count: number;
  mfo_total_net_weight: number;
  mfo_can_start: boolean;
  mfo_can_submit: boolean;
};

type StopRecord = {
  id: number;
  task_id: Relation;
  sequence: number;
  collection_point_id: Relation;
  district_id: Relation;
  subdistrict_id: Relation;
  planned_arrival_hour: number;
  planned_service_minutes: number;
  arrival_datetime: string | false;
  departure_datetime: string | false;
  status: string;
  note: string | false;
  skip_reason: string | false;
  proof_count: number;
  issue_count: number;
};

type ProofRecord = {
  id: number;
  task_id: Relation;
  stop_line_id: Relation;
  proof_type: string;
  capture_datetime: string | false;
  uploader_user_id: Relation;
  latitude: number | false;
  longitude: number | false;
  description: string | false;
};

type IssueRecord = {
  id: number;
  task_id: Relation;
  stop_line_id: Relation;
  name: string;
  report_datetime: string | false;
  issue_type: string;
  severity: string;
  state: string;
  description: string;
};

type DailyWeightTotalRecord = {
  id: number;
  task_id: Relation;
  net_weight_total: number;
  source: string | false;
  external_reference: string | false;
  note: string | false;
};

type FieldOpsTaskSelection = {
  shiftDate?: string;
  selectedTaskId?: number | null;
  userId: number;
};

export type FieldProofImage = {
  id: number;
  proofType: string;
  proofTypeLabel: string;
  capturedAt: string;
  uploader: string;
  description: string;
  gpsLabel: string | null;
};

export type FieldIssue = {
  id: number;
  title: string;
  typeLabel: string;
  severityLabel: string;
  stateLabel: string;
  description: string;
  reportedAt: string;
};

export type FieldWeightTotal = {
  id: number;
  netWeightTotal: number;
  sourceLabel: string;
  externalReference: string;
  note: string;
};

export type FieldStop = {
  id: number;
  sequence: number;
  collectionPointName: string;
  districtName: string;
  subdistrictName: string;
  status: string;
  statusLabel: string;
  note: string;
  skipReason: string;
  plannedArrivalLabel: string;
  plannedServiceLabel: string;
  arrivalLabel: string;
  departureLabel: string;
  proofCount: number;
  issueCount: number;
  proofs: FieldProofImage[];
  issues: FieldIssue[];
  missingProofTypes: string[];
};

export type FieldAssignment = {
  id: number;
  name: string;
  projectName: string;
  stageName: string;
  state: string;
  stateLabel: string;
  shiftDate: string;
  shiftDateLabel: string;
  shiftTypeLabel: string;
  routeName: string;
  districtName: string;
  vehicleName: string;
  driverName: string;
  inspectorName: string;
  dispatchedAt: string;
  startedAt: string;
  endedAt: string;
  endShiftSummary: string;
  stopCount: number;
  completedStopCount: number;
  skippedStopCount: number;
  unresolvedStopCount: number;
  progressPercent: number;
  proofCount: number;
  issueCount: number;
  totalNetWeight: number;
  totalNetWeightLabel: string;
  canStart: boolean;
  canSubmit: boolean;
  missingProofStopCount: number;
  stops: FieldStop[];
  weightTotals: FieldWeightTotal[];
};

export type FieldAssignmentBundle = {
  requestedDate: string;
  requestedDateLabel: string;
  assignments: FieldAssignment[];
  activeAssignment: FieldAssignment | null;
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";

const STOP_STATUS_LABELS: Record<string, string> = {
  draft: "Төлөвлөгдсөн",
  arrived: "Очсон",
  done: "Дууссан",
  skipped: "Алгассан",
};

const TASK_STATE_LABELS: Record<string, string> = {
  draft: "Төлөвлөгдсөн",
  dispatched: "Хуваарилсан",
  in_progress: "Ажиллаж байна",
  submitted: "Илгээсэн",
  verified: "Баталгаажсан",
  cancelled: "Цуцалсан",
};

const SHIFT_LABELS: Record<string, string> = {
  morning: "Өглөөний ээлж",
  day: "Өдрийн ээлж",
  evening: "Оройн ээлж",
  night: "Шөнийн ээлж",
};

const PROOF_TYPE_LABELS: Record<string, string> = {
  before: "Өмнө",
  after: "Дараа",
  completion: "Дууссан",
  incident: "Асуудал",
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  route: "Маршрутын асуудал",
  vehicle: "Машины асуудал",
  crew: "Багийн асуудал",
  safety: "Аюулгүй байдлын эрсдэл",
  citizen: "Иргэний гомдол",
  other: "Бусад",
};

const ISSUE_SEVERITY_LABELS: Record<string, string> = {
  low: "Бага",
  medium: "Дунд",
  high: "Өндөр",
  critical: "Ноцтой",
};

const ISSUE_STATE_LABELS: Record<string, string> = {
  new: "Шинэ",
  in_progress: "Ажиллаж байна",
  resolved: "Шийдсэн",
  cancelled: "Цуцалсан",
};

const WEIGHT_SOURCE_LABELS: Record<string, string> = {
  manual: "Гараар оруулсан",
  external: "Гаднын тасалбар",
  wrs_normalized: "WRS шөнийн дүн",
};

function relationName(relation: Relation, fallback = "Оноогоогүй") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function relationId(relation: Relation) {
  return Array.isArray(relation) ? relation[0] : null;
}

function toIsoDateInTimeZone(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((item) => item.type === "year")?.value ?? "0000";
  const month = parts.find((item) => item.type === "month")?.value ?? "01";
  const day = parts.find((item) => item.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value?: string | false) {
  if (!value) {
    return "Товлоогүй";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatDateTimeLabel(value?: string | false) {
  if (!value) {
    return "Бүртгэгдээгүй";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatFloatHourLabel(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return "Уян хатан";
  }

  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDurationLabel(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return "Уян хатан";
  }
  return `${value} мин`;
}

function formatWeightLabel(value?: number | null) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${Math.round(safeValue * 100) / 100} тн`;
}

function formatGpsLabel(latitude: number | false, longitude: number | false) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function stopStatusLabel(status: string) {
  return STOP_STATUS_LABELS[status] ?? status;
}

function taskStateLabel(state: string) {
  return TASK_STATE_LABELS[state] ?? state;
}

function proofTypeLabel(proofType: string) {
  return PROOF_TYPE_LABELS[proofType] ?? proofType;
}

function issueTypeLabel(issueType: string) {
  return ISSUE_TYPE_LABELS[issueType] ?? issueType;
}

function issueSeverityLabel(severity: string) {
  return ISSUE_SEVERITY_LABELS[severity] ?? severity;
}

function issueStateLabel(state: string) {
  return ISSUE_STATE_LABELS[state] ?? state;
}

function weightSourceLabel(source?: string | false) {
  return WEIGHT_SOURCE_LABELS[source || ""] ?? (source || "Тодорхойгүй");
}

function shiftTypeLabel(shiftType?: string | false) {
  return SHIFT_LABELS[shiftType || ""] ?? (shiftType || "Ээлж");
}

function missingProofTypes(proofs: FieldProofImage[]) {
  const availableTypes = new Set(proofs.map((proof) => proof.proofType));
  return ["before", "after"]
    .filter((proofType) => !availableTypes.has(proofType))
    .map((proofType) => proofTypeLabel(proofType));
}

async function loadTodayGarbageTaskRecords(
  selection: FieldOpsTaskSelection,
  connectionOverrides: Partial<OdooConnection>,
) {
  return executeOdooKw<GarbageTaskRecord[]>(
    "project.task",
    "search_read",
    [
      [
        ["mfo_operation_type", "=", "garbage"],
        ["mfo_shift_date", "=", selection.shiftDate],
        ["user_ids", "in", [selection.userId]],
      ],
    ],
    {
      fields: [
        "name",
        "project_id",
        "stage_id",
        "mfo_state",
        "mfo_shift_date",
        "mfo_shift_type",
        "mfo_route_id",
        "mfo_district_id",
        "mfo_vehicle_id",
        "mfo_driver_employee_id",
        "mfo_inspector_employee_id",
        "mfo_dispatch_datetime",
        "mfo_start_datetime",
        "mfo_end_datetime",
        "mfo_end_shift_summary",
        "mfo_stop_count",
        "mfo_completed_stop_count",
        "mfo_skipped_stop_count",
        "mfo_progress_percent",
        "mfo_proof_count",
        "mfo_issue_count",
        "mfo_total_net_weight",
        "mfo_can_start",
        "mfo_can_submit",
      ],
      order: "mfo_start_datetime desc, mfo_shift_date asc, id asc",
      limit: 20,
    },
    connectionOverrides,
  );
}

export async function loadAssignedGarbageTasks(
  selection: FieldOpsTaskSelection,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<FieldAssignmentBundle> {
  const shiftDate = selection.shiftDate || toIsoDateInTimeZone(new Date());
  const taskRecords = await loadTodayGarbageTaskRecords(
    {
      ...selection,
      shiftDate,
    },
    connectionOverrides,
  );

  if (!taskRecords.length) {
    return {
      requestedDate: shiftDate,
      requestedDateLabel: formatDateLabel(shiftDate),
      assignments: [],
      activeAssignment: null,
    };
  }

  const taskIds = taskRecords.map((task) => task.id);

  const [stopRecords, proofRecords, issueRecords, weightRecords] = await Promise.all([
    executeOdooKw<StopRecord[]>(
      "mfo.stop.execution.line",
      "search_read",
      [[["task_id", "in", taskIds]]],
      {
        fields: [
          "task_id",
          "sequence",
          "collection_point_id",
          "district_id",
          "subdistrict_id",
          "planned_arrival_hour",
          "planned_service_minutes",
          "arrival_datetime",
          "departure_datetime",
          "status",
          "note",
          "skip_reason",
          "proof_count",
          "issue_count",
        ],
        order: "task_id asc, sequence asc, id asc",
        limit: 1000,
      },
      connectionOverrides,
    ),
    executeOdooKw<ProofRecord[]>(
      "mfo.proof.image",
      "search_read",
      [[["task_id", "in", taskIds]]],
      {
        fields: [
          "task_id",
          "stop_line_id",
          "proof_type",
          "capture_datetime",
          "uploader_user_id",
          "latitude",
          "longitude",
          "description",
        ],
        order: "capture_datetime desc, id desc",
        limit: 2000,
      },
      connectionOverrides,
    ),
    executeOdooKw<IssueRecord[]>(
      "mfo.issue.report",
      "search_read",
      [[["task_id", "in", taskIds]]],
      {
        fields: [
          "task_id",
          "stop_line_id",
          "name",
          "report_datetime",
          "issue_type",
          "severity",
          "state",
          "description",
        ],
        order: "report_datetime desc, id desc",
        limit: 1000,
      },
      connectionOverrides,
    ),
    executeOdooKw<DailyWeightTotalRecord[]>(
      "mfo.daily.weight.total",
      "search_read",
      [[["task_id", "in", taskIds]]],
      {
        fields: ["task_id", "net_weight_total", "source", "external_reference", "note"],
        order: "shift_date desc, id desc",
        limit: 200,
      },
      connectionOverrides,
    ),
  ]);

  const proofsByStopId = new Map<number, FieldProofImage[]>();
  for (const proof of proofRecords) {
    const stopId = relationId(proof.stop_line_id);
    if (!stopId) {
      continue;
    }
    const existing = proofsByStopId.get(stopId) ?? [];
    existing.push({
      id: proof.id,
      proofType: proof.proof_type,
      proofTypeLabel: proofTypeLabel(proof.proof_type),
      capturedAt: formatDateTimeLabel(proof.capture_datetime),
      uploader: relationName(proof.uploader_user_id),
      description: proof.description || "",
      gpsLabel: formatGpsLabel(proof.latitude, proof.longitude),
    });
    proofsByStopId.set(stopId, existing);
  }

  const issuesByStopId = new Map<number, FieldIssue[]>();
  for (const issue of issueRecords) {
    const stopId = relationId(issue.stop_line_id);
    if (!stopId) {
      continue;
    }
    const existing = issuesByStopId.get(stopId) ?? [];
    existing.push({
      id: issue.id,
      title: issue.name,
      typeLabel: issueTypeLabel(issue.issue_type),
      severityLabel: issueSeverityLabel(issue.severity),
      stateLabel: issueStateLabel(issue.state),
      description: issue.description,
      reportedAt: formatDateTimeLabel(issue.report_datetime),
    });
    issuesByStopId.set(stopId, existing);
  }

  const weightsByTaskId = new Map<number, FieldWeightTotal[]>();
  for (const weight of weightRecords) {
    const taskId = relationId(weight.task_id);
    if (!taskId) {
      continue;
    }
    const existing = weightsByTaskId.get(taskId) ?? [];
    existing.push({
      id: weight.id,
      netWeightTotal: weight.net_weight_total ?? 0,
      sourceLabel: weightSourceLabel(weight.source),
      externalReference: weight.external_reference || "",
      note: weight.note || "",
    });
    weightsByTaskId.set(taskId, existing);
  }

  const stopsByTaskId = new Map<number, FieldStop[]>();
  for (const stop of stopRecords) {
    const taskId = relationId(stop.task_id);
    if (!taskId) {
      continue;
    }
    const proofs = proofsByStopId.get(stop.id) ?? [];
    const issues = issuesByStopId.get(stop.id) ?? [];
    const fieldStop: FieldStop = {
      id: stop.id,
      sequence: stop.sequence,
      collectionPointName: relationName(stop.collection_point_id),
      districtName: relationName(stop.district_id),
      subdistrictName: relationName(stop.subdistrict_id, ""),
      status: stop.status,
      statusLabel: stopStatusLabel(stop.status),
      note: stop.note || "",
      skipReason: stop.skip_reason || "",
      plannedArrivalLabel: formatFloatHourLabel(stop.planned_arrival_hour),
      plannedServiceLabel: formatDurationLabel(stop.planned_service_minutes),
      arrivalLabel: formatDateTimeLabel(stop.arrival_datetime),
      departureLabel: formatDateTimeLabel(stop.departure_datetime),
      proofCount: stop.proof_count ?? proofs.length,
      issueCount: stop.issue_count ?? issues.length,
      proofs,
      issues,
      missingProofTypes: stop.status === "done" ? missingProofTypes(proofs) : [],
    };
    const existing = stopsByTaskId.get(taskId) ?? [];
    existing.push(fieldStop);
    stopsByTaskId.set(taskId, existing);
  }

  const assignments = taskRecords.map<FieldAssignment>((task) => {
    const stops = stopsByTaskId.get(task.id) ?? [];
    const missingProofStopCount = stops.filter(
      (stop) => stop.status === "done" && stop.missingProofTypes.length,
    ).length;
    const unresolvedStopCount = stops.filter(
      (stop) => !["done", "skipped"].includes(stop.status),
    ).length;

    return {
      id: task.id,
      name: task.name,
      projectName: relationName(task.project_id),
      stageName: relationName(task.stage_id),
      state: task.mfo_state,
      stateLabel: taskStateLabel(task.mfo_state),
      shiftDate: task.mfo_shift_date || shiftDate,
      shiftDateLabel: formatDateLabel(task.mfo_shift_date || shiftDate),
      shiftTypeLabel: shiftTypeLabel(task.mfo_shift_type),
      routeName: relationName(task.mfo_route_id),
      districtName: relationName(task.mfo_district_id),
      vehicleName: relationName(task.mfo_vehicle_id),
      driverName: relationName(task.mfo_driver_employee_id),
      inspectorName: relationName(task.mfo_inspector_employee_id),
      dispatchedAt: formatDateTimeLabel(task.mfo_dispatch_datetime),
      startedAt: formatDateTimeLabel(task.mfo_start_datetime),
      endedAt: formatDateTimeLabel(task.mfo_end_datetime),
      endShiftSummary: task.mfo_end_shift_summary || "",
      stopCount: task.mfo_stop_count ?? stops.length,
      completedStopCount: task.mfo_completed_stop_count ?? 0,
      skippedStopCount: task.mfo_skipped_stop_count ?? 0,
      unresolvedStopCount,
      progressPercent: Math.round(task.mfo_progress_percent ?? 0),
      proofCount: task.mfo_proof_count ?? 0,
      issueCount: task.mfo_issue_count ?? 0,
      totalNetWeight: task.mfo_total_net_weight ?? 0,
      totalNetWeightLabel: formatWeightLabel(task.mfo_total_net_weight ?? 0),
      canStart: Boolean(task.mfo_can_start),
      canSubmit: Boolean(task.mfo_can_submit),
      missingProofStopCount,
      stops,
      weightTotals: weightsByTaskId.get(task.id) ?? [],
    };
  });

  const activeAssignment =
    assignments.find((assignment) => assignment.id === selection.selectedTaskId) ??
    assignments.find((assignment) => assignment.state === "in_progress") ??
    assignments[0] ??
    null;

  return {
    requestedDate: shiftDate,
    requestedDateLabel: formatDateLabel(shiftDate),
    assignments,
    activeAssignment,
  };
}

export async function startFieldShift(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "project.task",
    "action_mfo_start_shift",
    [[taskId]],
    {},
    connectionOverrides,
  );
}

export async function submitFieldShift(
  taskId: number,
  summary: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  await executeOdooKw<boolean>(
    "project.task",
    "write",
    [[taskId], { mfo_end_shift_summary: summary.trim() }],
    {},
    connectionOverrides,
  );

  return executeOdooKw<boolean>(
    "project.task",
    "action_mfo_submit_for_verification",
    [[taskId]],
    {},
    connectionOverrides,
  );
}

export async function saveFieldStopNote(
  stopLineId: number,
  note: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "mfo.stop.execution.line",
    "write",
    [[stopLineId], { note: note.trim() || false }],
    {},
    connectionOverrides,
  );
}

export async function markFieldStopArrived(
  stopLineId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "mfo.stop.execution.line",
    "action_mark_arrived",
    [[stopLineId]],
    {},
    connectionOverrides,
  );
}

export async function markFieldStopDone(
  stopLineId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "mfo.stop.execution.line",
    "action_mark_done",
    [[stopLineId]],
    {},
    connectionOverrides,
  );
}

export async function markFieldStopSkipped(
  stopLineId: number,
  skipReason: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  await executeOdooKw<boolean>(
    "mfo.stop.execution.line",
    "write",
    [[stopLineId], { skip_reason: skipReason.trim() }],
    {},
    connectionOverrides,
  );

  return executeOdooKw<boolean>(
    "mfo.stop.execution.line",
    "action_mark_skipped",
    [[stopLineId]],
    {},
    connectionOverrides,
  );
}

export async function uploadFieldStopProof(
  input: {
    taskId: number;
    stopLineId: number;
    proofType: string;
    imageBase64: string;
    fileName?: string;
    description?: string;
    latitude?: number | null;
    longitude?: number | null;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const values: Record<string, unknown> = {
    name: input.fileName || `stop-${input.stopLineId}-${input.proofType}`,
    task_id: input.taskId,
    stop_line_id: input.stopLineId,
    proof_type: input.proofType,
    image_1920: input.imageBase64,
  };

  if (input.description?.trim()) {
    values.description = input.description.trim();
  }
  if (typeof input.latitude === "number" && Number.isFinite(input.latitude)) {
    values.latitude = input.latitude;
  }
  if (typeof input.longitude === "number" && Number.isFinite(input.longitude)) {
    values.longitude = input.longitude;
  }

  return executeOdooKw<number>(
    "mfo.proof.image",
    "create",
    [values],
    {},
    connectionOverrides,
  );
}

export async function createFieldStopIssue(
  input: {
    taskId: number;
    stopLineId: number;
    title: string;
    issueType: string;
    severity: string;
    description: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<number>(
    "mfo.issue.report",
    "create",
    [
      {
        name: input.title.trim(),
        task_id: input.taskId,
        stop_line_id: input.stopLineId,
        issue_type: input.issueType,
        severity: input.severity,
        description: input.description.trim(),
      },
    ],
    {},
    connectionOverrides,
  );
}

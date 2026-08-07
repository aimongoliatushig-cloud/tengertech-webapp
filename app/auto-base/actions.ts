"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessAutoBaseOverview, requireSession } from "@/lib/auth";
import { clearOdooReadCaches, executeOdooKw } from "@/lib/odoo";
import { pathWithActionMessage, uiContextPathWithMessage } from "@/lib/ui-context";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const AUTO_BASE_DEPARTMENT_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";
const AUTO_BASE_UNIT_NAME = "Авто бааз";

type OdooFieldInfo = {
  type?: string;
  required?: boolean;
  readonly?: boolean;
};

type OdooFieldMap = Record<string, OdooFieldInfo>;

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function buildAutoBaseWorkspacePath(extraParams?: Record<string, string>) {
  const params = new URLSearchParams({
    department: AUTO_BASE_DEPARTMENT_NAME,
    unit: AUTO_BASE_UNIT_NAME,
  });
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    params.set(key, value);
  }
  return `/projects?${params.toString()}`;
}

function redirectWithMessage(kind: "error" | "notice", message: string, formData?: FormData) {
  const fallback = buildAutoBaseWorkspacePath();
  redirect(
    formData
      ? uiContextPathWithMessage(formData, fallback, kind, message)
      : pathWithActionMessage(fallback, kind, message),
  );
}

function revalidateFleetViews() {
  clearOdooReadCaches();
  revalidatePath("/auto-base");
  revalidatePath("/fleet-repair");
  revalidatePath("/fleet-repair/requests");
  revalidatePath("/projects");
  revalidatePath("/");
}

function optionalOdooValue(value: string) {
  return value || false;
}

function optionalOdooDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : false;
}

function optionalOdooId(value: string) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : false;
}

async function requireAutoBaseWriteAccess() {
  const session = await requireSession();
  const departmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, departmentName)) {
    redirect("/");
  }
  return session;
}

function optionalOdooNumber(value: string, label: string) {
  if (!value) {
    return false;
  }

  const numericValue = Number(value.replace(",", "."));
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    redirectWithMessage("error", `${label} зөв тоон утгатай байх ёстой.`);
  }
  return numericValue;
}

function optionalOdooInteger(value: string, label: string) {
  const numericValue = optionalOdooNumber(value, label);
  return numericValue === false ? false : Math.trunc(numericValue);
}

function pickSupportedValues(
  candidateValues: Record<string, unknown>,
  fields: OdooFieldMap,
) {
  return Object.fromEntries(
    Object.entries(candidateValues).filter(([fieldName, value]) => {
      if (!fields[fieldName] || fields[fieldName].readonly) {
        return false;
      }
      if (value === undefined || value === null || value === "") {
        return false;
      }
      return true;
    }),
  );
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    arrayBuffer?: unknown;
    size?: unknown;
  };

  return typeof candidate.arrayBuffer === "function" && typeof candidate.size === "number" && candidate.size > 0;
}

function getFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter(isUploadedFile);
}

async function fileToBase64(file: File, label: string) {
  if (file.size > MAX_UPLOAD_BYTES) {
    redirectWithMessage("error", `${label} файл 8MB-аас ихгүй байх ёстой.`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

type CreatedVehicleAttachment = {
  id: number;
  base64: string;
};

async function createVehicleAttachments(
  vehicleId: number,
  fieldName: string,
  label: string,
  files: File[],
  fields: OdooFieldMap,
) {
  if (!fields[fieldName] || !files.length) {
    return [];
  }

  const attachments: CreatedVehicleAttachment[] = [];
  for (const file of files) {
    const base64 = await fileToBase64(file, label);
    const id = await executeOdooKw<number>(
      "ir.attachment",
      "create",
      [
        {
          name: file.name || label,
          mimetype: file.type || "application/octet-stream",
          datas: base64,
          res_model: "fleet.vehicle",
          res_id: vehicleId,
        },
      ],
      {},
    );
    attachments.push({ id, base64 });
  }

  return attachments;
}

async function appendVehicleAttachmentFields(
  vehicleId: number,
  formData: FormData,
  fields: OdooFieldMap,
) {
  const uploadFields = [
    { fieldName: "municipal_front_photo_ids", label: "Урд талаас авсан зураг" },
    { fieldName: "municipal_rear_photo_ids", label: "Ард талаас авсан зураг" },
    { fieldName: "municipal_side_photo_ids", label: "Хажуу талаас авсан зураг" },
    { fieldName: "municipal_certificate_photo_ids", label: "Гэрчилгээний зураг" },
    { fieldName: "municipal_insurance_attachment_ids", label: "Даатгалын баримт" },
    { fieldName: "municipal_insurance_contract_attachment_ids", label: "Даатгалын гэрээ" },
    { fieldName: "municipal_inspection_attachment_ids", label: "Улсын үзлэгийн баримт" },
  ];
  const values: Record<string, unknown> = {};

  for (const uploadField of uploadFields) {
    const files = getFiles(formData, uploadField.fieldName).slice(0, 1);
    const attachments = await createVehicleAttachments(
      vehicleId,
      uploadField.fieldName,
      uploadField.label,
      files,
      fields,
    );
    if (attachments.length) {
      values[uploadField.fieldName] = [[6, 0, attachments.map((attachment) => attachment.id)]];
      if (
        uploadField.fieldName === "municipal_front_photo_ids" &&
        fields.image_1920 &&
        !fields.image_1920.readonly
      ) {
        values.image_1920 = attachments[0].base64;
      }
    } else if (formData.get(`${uploadField.fieldName}_clear`) === "on" && fields[uploadField.fieldName]) {
      values[uploadField.fieldName] = [[6, 0, []]];
      if (
        uploadField.fieldName === "municipal_front_photo_ids" &&
        fields.image_1920 &&
        !fields.image_1920.readonly
      ) {
        values.image_1920 = false;
      }
    }
  }

  if (Object.keys(values).length) {
    await executeOdooKw<boolean>("fleet.vehicle", "write", [[vehicleId], values], {});
  }

  return Object.keys(values);
}

async function findDefaultVehicleModel() {
  const models = await executeOdooKw<Array<{ id: number }>>(
    "fleet.vehicle.model",
    "search_read",
    [[]],
    { fields: ["id"], order: "id asc", limit: 1 },
  ).catch(() => []);

  return models[0]?.id ?? false;
}

async function findOrCreateVehicleModelBrand(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return false;
  }

  const brands = await executeOdooKw<Array<{ id: number }>>(
    "fleet.vehicle.model.brand",
    "search_read",
    [[["name", "=", normalizedName]]],
    { fields: ["id"], limit: 1 },
  ).catch(() => []);
  if (brands[0]?.id) {
    return brands[0].id;
  }

  const fields = await executeOdooKw<OdooFieldMap>(
    "fleet.vehicle.model.brand",
    "fields_get",
    [],
    { attributes: ["string", "type", "required", "readonly"] },
  ).catch(() => ({}));
  const values = pickSupportedValues({ name: normalizedName }, fields);
  if (!Object.keys(values).length) {
    return false;
  }

  return executeOdooKw<number>("fleet.vehicle.model.brand", "create", [values], {}).catch(() => false);
}

async function findOrCreateVehicleModel(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return false;
  }

  const models = await executeOdooKw<Array<{ id: number }>>(
    "fleet.vehicle.model",
    "search_read",
    [[["name", "=", normalizedName]]],
    { fields: ["id"], limit: 1 },
  ).catch(() => []);
  if (models[0]?.id) {
    return models[0].id;
  }

  const fields = await executeOdooKw<OdooFieldMap>(
    "fleet.vehicle.model",
    "fields_get",
    [],
    { attributes: ["string", "type", "required", "readonly"] },
  );
  const brandId =
    fields.brand_id && !fields.brand_id.readonly
      ? await findOrCreateVehicleModelBrand("Бусад")
      : false;
  const values = pickSupportedValues(
    {
      name: normalizedName,
      brand_id: brandId,
    },
    fields,
  );

  if (!values.name) {
    throw new Error("Машины марк / модель нэмэх боломжтой нэрийн талбар олдсонгүй.");
  }
  if (fields.brand_id?.required && !values.brand_id) {
    throw new Error("Машины марк / модель нэмэхэд шаардлагатай brand талбар үүссэнгүй.");
  }

  return executeOdooKw<number>("fleet.vehicle.model", "create", [values], {});
}

async function findOrCreateVehicleType(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return false;
  }

  const types = await executeOdooKw<Array<{ id: number }>>(
    "municipal.vehicle.type",
    "search_read",
    [[["name", "=", normalizedName]]],
    { fields: ["id"], limit: 1, context: { active_test: false } },
  ).catch(() => []);
  if (types[0]?.id) {
    return types[0].id;
  }

  const fields = await executeOdooKw<OdooFieldMap>(
    "municipal.vehicle.type",
    "fields_get",
    [],
    { attributes: ["string", "type", "required", "readonly"] },
  );
  const values = pickSupportedValues(
    {
      name: normalizedName,
      active: true,
    },
    fields,
  );

  if (!values.name) {
    throw new Error("Машины төрөл нэмэх боломжтой нэрийн талбар олдсонгүй.");
  }

  return executeOdooKw<number>("municipal.vehicle.type", "create", [values], {});
}

async function findOrCreateVehicleCategory(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return false;
  }

  const categories = await executeOdooKw<Array<{ id: number }>>(
    "fleet.vehicle.tag",
    "search_read",
    [[['name', '=', normalizedName]]],
    { fields: ["id"], limit: 1, context: { active_test: false } },
  ).catch(() => []);
  if (categories[0]?.id) {
    return categories[0].id;
  }

  const fields = await executeOdooKw<OdooFieldMap>(
    "fleet.vehicle.tag",
    "fields_get",
    [],
    { attributes: ["string", "type", "required", "readonly"] },
  );
  const values = pickSupportedValues({ name: normalizedName }, fields);
  if (!values.name) {
    throw new Error("Машины ангилал нэмэх боломжтой нэрийн талбар олдсонгүй.");
  }
  return executeOdooKw<number>("fleet.vehicle.tag", "create", [values], {});
}

async function findFleetVehicleStateId(candidateNames: string[], fallbackName: string) {
  const normalizedNames = candidateNames
    .map((name) => name.trim())
    .filter(Boolean);
  if (!normalizedNames.length) {
    return false;
  }

  const states = await executeOdooKw<Array<{ id: number; name?: string | false }>>(
    "fleet.vehicle.state",
    "search_read",
    [[["name", "in", normalizedNames]]],
    { fields: ["id", "name"], limit: 1 },
  ).catch(() => []);

  if (states[0]?.id) {
    return states[0].id;
  }

  return executeOdooKw<number>(
    "fleet.vehicle.state",
    "create",
    [{ name: fallbackName }],
    {},
  ).catch(() => false);
}

const ACTIVE_REPAIR_STATES = [
  "new",
  "diagnosed",
  "waiting_parts",
  "waiting_approval",
  "approved",
  "in_repair",
];

type RepairRequestRecord = {
  id: number;
  state?: string | false;
};

async function getRepairRequestFields() {
  const fields = await executeOdooKw<OdooFieldMap>(
    "municipal.repair.request",
    "fields_get",
    [
      [
        "vehicle_id",
        "issue_summary",
        "issue_description",
        "damage_type",
        "description",
        "parts_note",
        "repair_note",
        "state",
      ],
    ],
    { attributes: ["string", "type", "required", "readonly"] },
  );
  if (!fields.vehicle_id) {
    throw new Error("Засварын хүсэлтийн Odoo загвар бүрэн суулгагдаагүй байна.");
  }
  return fields;
}

async function findActiveRepairRequest(vehicleId: number) {
  const records = await executeOdooKw<RepairRequestRecord[]>(
    "municipal.repair.request",
    "search_read",
    [[["vehicle_id", "=", vehicleId], ["state", "in", ACTIVE_REPAIR_STATES]]],
    {
      fields: ["id", "state"],
      limit: 1,
      order: "request_date desc, id desc",
    },
  ).catch(() => []);
  return records[0] ?? null;
}

async function startVehicleRepairRequest(vehicleId: number, description: string, damageType: string) {
  const fields = await getRepairRequestFields();
  const summary = description.slice(0, 90);
  const repairValues = pickSupportedValues(
    {
      vehicle_id: vehicleId,
      issue_summary: summary,
      issue_description: description,
      damage_type: optionalOdooValue(damageType),
      description,
      state: "new",
    },
    fields,
  );
  const existing = await findActiveRepairRequest(vehicleId);
  const repairId = existing?.id ?? await executeOdooKw<number>(
    "municipal.repair.request",
    "create",
    [repairValues],
    {},
  );

  if (existing) {
    await executeOdooKw<boolean>(
      "municipal.repair.request",
      "write",
      [[repairId], repairValues],
      {},
    );
  }
  await executeOdooKw<boolean>(
    "municipal.repair.request",
    "action_start_repair",
    [[repairId]],
    {},
  ).catch(async () => {
    const fallbackValues = pickSupportedValues({ state: "in_repair" }, fields);
    if (Object.keys(fallbackValues).length) {
      await executeOdooKw<boolean>(
        "municipal.repair.request",
        "write",
        [[repairId], fallbackValues],
        {},
      );
    }
  });
  return true;
}

async function completeVehicleRepairRequest(vehicleId: number, repairNote: string) {
  const fields = await getRepairRequestFields();
  const existing = await findActiveRepairRequest(vehicleId);
  const repairId = existing?.id ?? await executeOdooKw<number>(
    "municipal.repair.request",
    "create",
    [
      pickSupportedValues(
        {
          vehicle_id: vehicleId,
          issue_summary: "Засварын бүртгэл",
          issue_description: "Засварын мэдээлэл өмнө нь бүртгэгдээгүй.",
          repair_note: repairNote,
          state: "new",
        },
        fields,
      ),
    ],
    {},
  );
  const noteValues = pickSupportedValues({ repair_note: repairNote }, fields);
  if (Object.keys(noteValues).length) {
    await executeOdooKw<boolean>(
      "municipal.repair.request",
      "write",
      [[repairId], noteValues],
      {},
    );
  }
  await executeOdooKw<boolean>(
    "municipal.repair.request",
    "action_done",
    [[repairId]],
    {},
  ).catch(async () => {
    const fallbackValues = pickSupportedValues({ state: "done" }, fields);
    if (Object.keys(fallbackValues).length) {
      await executeOdooKw<boolean>(
        "municipal.repair.request",
        "write",
        [[repairId], fallbackValues],
        {},
      );
    }
  });
  return true;
}

function optionalStaffId(formData: FormData, key: string, label: string) {
  const selectedId = optionalOdooId(getString(formData, key));
  const typedLabel = getString(formData, `${key}_label`);
  if (typedLabel && !selectedId) {
    redirectWithMessage("error", `${label}-г HR жагсаалтаас сонгоно уу.`);
  }
  return selectedId;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Машины мэдээлэл хадгалах үед алдаа гарлаа.";
}

function isRedirectException(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT"),
  );
}

function rethrowIfRedirectError(error: unknown) {
  if (isRedirectException(error)) {
    throw error;
  }
}

export async function updateFleetVehicleAction(formData: FormData) {
  await requireAutoBaseWriteAccess();

  const vehicleId = Number(getString(formData, "vehicle_id"));
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    redirectWithMessage("error", "Машины бүртгэл олдсонгүй.", formData);
  }

  try {
    const editableFields = await executeOdooKw<OdooFieldMap>(
      "fleet.vehicle",
      "fields_get",
      [
        [
          "name",
          "x_vehicle_custom_name",
          "license_plate",
          "model_id",
          "state_id",
          "category_id",
          "municipal_vehicle_type_id",
          "mfo_active_for_ops",
          "latest_repair_state",
          "x_municipal_operational_status",
          "x_to_decommission",
          "x_gps_installed",
          "x_fuel_monitoring_installed",
          "municipal_department_id",
          "vin_sn",
          "odometer",
          "fuel_type",
          "municipal_responsible_driver_id",
          "municipal_loader_1_id",
          "municipal_loader_2_id",
          "municipal_capacity",
          "municipal_import_date",
          "municipal_color",
          "municipal_manufactured_date",
          "municipal_seat_count",
          "driver_employee_id",
          "mfo_driver_employee_id",
          "loader_employee_id",
          "helper_employee_id",
          "municipal_insurance_company",
          "municipal_insurance_policy_number",
          "municipal_insurance_date_start",
          "municipal_insurance_date_end",
          "municipal_insurance_note",
          "municipal_insurance_attachment_ids",
          "municipal_insurance_contract_attachment_ids",
          "municipal_inspection_date",
          "municipal_next_inspection_date",
          "municipal_inspection_note",
          "municipal_inspection_attachment_ids",
          "municipal_front_photo_ids",
          "municipal_rear_photo_ids",
          "municipal_side_photo_ids",
          "municipal_certificate_photo_ids",
          "image_1920",
        ],
      ],
      {
        attributes: ["string", "type", "required", "readonly"],
      },
    );
    const values: Record<string, string | number | boolean | false> = {};
    const repairToggle = getString(formData, "vehicle_repair_toggle");
    const isRepairToggle = repairToggle === "start" || repairToggle === "done";
    const submittedOperationalStatus = getString(formData, "x_municipal_operational_status");
    const currentOperationalStatus = getString(formData, "current_operational_status");
    const repairDamageDescription = getString(formData, "repair_damage_description");
    const repairDamageType = getString(formData, "repair_damage_type");
    const repairCompletionNote = getString(formData, "repair_completion_note");
    const shouldStartRepairRequest =
      repairToggle === "start" ||
      (!isRepairToggle &&
        submittedOperationalStatus === "in_repair" &&
        currentOperationalStatus !== "in_repair");
    const shouldCompleteRepairRequest = repairToggle === "done";

    if (shouldStartRepairRequest && !repairDamageDescription) {
      redirectWithMessage("error", "Засвартай төлөвт оруулахдаа эвдрэл, засварын тайлбар оруулна уу.", formData);
    }
    if (shouldCompleteRepairRequest && !repairCompletionNote) {
      redirectWithMessage("error", "Засвар дуусгахдаа хийсэн засварын тайлбар оруулна уу.", formData);
    }

    if (isRepairToggle) {
      const sendToRepair = repairToggle === "start";
      if ("x_municipal_operational_status" in editableFields) {
        values.x_municipal_operational_status = sendToRepair ? "in_repair" : "available";
      }
      if ("latest_repair_state" in editableFields) {
        values.latest_repair_state = sendToRepair ? "Засвартай" : "Засвар дууссан";
      }
      if ("mfo_active_for_ops" in editableFields) {
        values.mfo_active_for_ops = !sendToRepair;
      }
      if ("state_id" in editableFields) {
        const stateId = sendToRepair
          ? await findFleetVehicleStateId(
              ["Засвартай", "Засварт байгаа", "In Repair", "Under Repair"],
              "Засвартай",
            )
          : await findFleetVehicleStateId(
              ["Ажиллаж байгаа", "Ашиглах боломжтой", "Available", "Running"],
              "Ажиллаж байгаа",
            );
        if (stateId) {
          values.state_id = stateId;
        }
      }
    }

    if ("name" in editableFields && formData.has("name")) {
      values.name = optionalOdooValue(getString(formData, "name"));
    }
    if (
      "x_vehicle_custom_name" in editableFields &&
      formData.has("x_vehicle_custom_name")
    ) {
      values.x_vehicle_custom_name = optionalOdooValue(
        getString(formData, "x_vehicle_custom_name"),
      );
    }
    if ("license_plate" in editableFields && formData.has("license_plate")) {
      values.license_plate = optionalOdooValue(getString(formData, "license_plate"));
    }
    if (
      "model_id" in editableFields &&
      (formData.has("model_id") || formData.has("model_name") || formData.has("new_model_name"))
    ) {
      values.model_id =
        await findOrCreateVehicleModel(getString(formData, "model_name") || getString(formData, "new_model_name")) ||
        optionalOdooId(getString(formData, "model_id"));
    }
    if (
      "category_id" in editableFields &&
      (formData.has("category_id") || formData.has("category_name"))
    ) {
      values.category_id =
        await findOrCreateVehicleCategory(getString(formData, "category_name")) ||
        optionalOdooId(getString(formData, "category_id"));
    }
    if (
      "municipal_vehicle_type_id" in editableFields &&
      (formData.has("municipal_vehicle_type_id") ||
        formData.has("vehicle_type_name") ||
        formData.has("new_vehicle_type_name"))
    ) {
      values.municipal_vehicle_type_id =
        await findOrCreateVehicleType(getString(formData, "vehicle_type_name") || getString(formData, "new_vehicle_type_name")) ||
        optionalOdooId(getString(formData, "municipal_vehicle_type_id"));
    }
    if (
      "mfo_active_for_ops" in editableFields &&
      (formData.has("mfo_active_for_ops_present") || formData.has("mfo_active_for_ops"))
    ) {
      values.mfo_active_for_ops = formData.getAll("mfo_active_for_ops").includes("on");
    }
    if ("latest_repair_state" in editableFields && formData.has("latest_repair_state")) {
      values.latest_repair_state = optionalOdooValue(getString(formData, "latest_repair_state"));
    }
    if (
      "x_municipal_operational_status" in editableFields &&
      formData.has("x_municipal_operational_status")
    ) {
      const requestedStatus = getString(formData, "x_municipal_operational_status");
      values.x_municipal_operational_status = optionalOdooValue(
        requestedStatus === "to_decommission" ? "inactive" : requestedStatus,
      );
      if ("x_to_decommission" in editableFields) {
        values.x_to_decommission = requestedStatus === "to_decommission";
      }
    }
    if ("municipal_department_id" in editableFields && formData.has("municipal_department_id")) {
      values.municipal_department_id = optionalOdooId(getString(formData, "municipal_department_id"));
    }
    if ("vin_sn" in editableFields && formData.has("vin_sn")) {
      values.vin_sn = optionalOdooValue(getString(formData, "vin_sn"));
    }
    if ("odometer" in editableFields && formData.has("odometer")) {
      values.odometer = optionalOdooNumber(getString(formData, "odometer"), "Туулсан зам");
    }
    if ("municipal_capacity" in editableFields && formData.has("municipal_capacity")) {
      values.municipal_capacity = optionalOdooValue(getString(formData, "municipal_capacity"));
    }
    if ("municipal_import_date" in editableFields && formData.has("municipal_import_date")) {
      values.municipal_import_date = optionalOdooDate(getString(formData, "municipal_import_date"));
    }
    if ("municipal_color" in editableFields && formData.has("municipal_color")) {
      values.municipal_color = optionalOdooValue(getString(formData, "municipal_color"));
    }
    if (
      "municipal_manufactured_date" in editableFields &&
      formData.has("municipal_manufactured_date")
    ) {
      values.municipal_manufactured_date = optionalOdooDate(
        getString(formData, "municipal_manufactured_date"),
      );
    }
    if ("municipal_seat_count" in editableFields && formData.has("municipal_seat_count")) {
      values.municipal_seat_count = optionalOdooInteger(
        getString(formData, "municipal_seat_count"),
        "Суудлын тоо",
      );
    }
    if ("fuel_type" in editableFields && formData.has("fuel_type")) {
      values.fuel_type = optionalOdooValue(getString(formData, "fuel_type"));
    }
    if ("x_gps_installed" in editableFields && formData.has("x_gps_installed")) {
      values.x_gps_installed = getString(formData, "x_gps_installed") === "true";
    }
    if (
      "x_fuel_monitoring_installed" in editableFields &&
      formData.has("x_fuel_monitoring_installed")
    ) {
      values.x_fuel_monitoring_installed =
        getString(formData, "x_fuel_monitoring_installed") === "true";
    }
    if (
      "municipal_responsible_driver_id" in editableFields &&
      formData.has("municipal_responsible_driver_id")
    ) {
      const responsibleDriverId = optionalStaffId(
        formData,
        "municipal_responsible_driver_id",
        "Хариуцсан жолооч",
      );
      values.municipal_responsible_driver_id = responsibleDriverId;
      if ("driver_employee_id" in editableFields) {
        values.driver_employee_id = responsibleDriverId;
      }
      if ("mfo_driver_employee_id" in editableFields) {
        values.mfo_driver_employee_id = responsibleDriverId;
      }
    }
    if ("municipal_loader_1_id" in editableFields && formData.has("municipal_loader_1_id")) {
      const loader1Id = optionalStaffId(
        formData,
        "municipal_loader_1_id",
        "Ачигч 1",
      );
      values.municipal_loader_1_id = loader1Id;
      if ("loader_employee_id" in editableFields) {
        values.loader_employee_id = loader1Id;
      }
      if ("helper_employee_id" in editableFields) {
        values.helper_employee_id = loader1Id;
      }
    }
    if ("municipal_loader_2_id" in editableFields && formData.has("municipal_loader_2_id")) {
      values.municipal_loader_2_id = optionalStaffId(
        formData,
        "municipal_loader_2_id",
        "Ачигч 2",
      );
    }
    if ("municipal_insurance_company" in editableFields && formData.has("municipal_insurance_company")) {
      values.municipal_insurance_company = optionalOdooValue(
        getString(formData, "municipal_insurance_company"),
      );
    }
    if (
      "municipal_insurance_policy_number" in editableFields &&
      formData.has("municipal_insurance_policy_number")
    ) {
      values.municipal_insurance_policy_number = optionalOdooValue(
        getString(formData, "municipal_insurance_policy_number"),
      );
    }
    if (
      "municipal_insurance_date_start" in editableFields &&
      formData.has("municipal_insurance_date_start")
    ) {
      values.municipal_insurance_date_start = optionalOdooDate(
        getString(formData, "municipal_insurance_date_start"),
      );
    }
    if (
      "municipal_insurance_date_end" in editableFields &&
      formData.has("municipal_insurance_date_end")
    ) {
      values.municipal_insurance_date_end = optionalOdooDate(
        getString(formData, "municipal_insurance_date_end"),
      );
    }
    if ("municipal_insurance_note" in editableFields && formData.has("municipal_insurance_note")) {
      values.municipal_insurance_note = optionalOdooValue(
        getString(formData, "municipal_insurance_note"),
      );
    }
    if ("municipal_inspection_date" in editableFields && formData.has("municipal_inspection_date")) {
      values.municipal_inspection_date = optionalOdooDate(
        getString(formData, "municipal_inspection_date"),
      );
    }
    if (
      "municipal_next_inspection_date" in editableFields &&
      formData.has("municipal_next_inspection_date")
    ) {
      values.municipal_next_inspection_date = optionalOdooDate(
        getString(formData, "municipal_next_inspection_date"),
      );
    }
    if ("municipal_inspection_note" in editableFields && formData.has("municipal_inspection_note")) {
      values.municipal_inspection_note = optionalOdooValue(
        getString(formData, "municipal_inspection_note"),
      );
    }

    let repairRequestChanged = false;
    if (shouldStartRepairRequest) {
      repairRequestChanged = await startVehicleRepairRequest(
        vehicleId,
        repairDamageDescription,
        repairDamageType,
      );
    } else if (shouldCompleteRepairRequest) {
      repairRequestChanged = await completeVehicleRepairRequest(vehicleId, repairCompletionNote);
    }

    const uploadedFieldNames = await appendVehicleAttachmentFields(vehicleId, formData, editableFields);

    if (!Object.keys(values).length && !uploadedFieldNames.length && !repairRequestChanged) {
      const submittedCrewFields = [
        "municipal_responsible_driver_id",
        "municipal_loader_1_id",
        "municipal_loader_2_id",
      ].some((field) => formData.has(field));
      if (submittedCrewFields) {
        redirectWithMessage(
          "error",
          "Авто баазын жолооч, ачигчийн талбарууд суулгагдаагүй байна.",
          formData,
        );
      }
      redirectWithMessage("error", "Засах боломжтой талбар олдсонгүй.", formData);
    }

    if (Object.keys(values).length) {
      await executeOdooKw<boolean>(
        "fleet.vehicle",
        "write",
        [[vehicleId], values],
        {},
      );
    }

    revalidateFleetViews();
    const updatedFields = Object.keys(values);
    const crewFields = new Set([
      "municipal_responsible_driver_id",
      "municipal_loader_1_id",
      "municipal_loader_2_id",
      "driver_employee_id",
      "mfo_driver_employee_id",
      "loader_employee_id",
      "helper_employee_id",
    ]);
    const noticeMessage = isRepairToggle
      ? repairToggle === "start"
        ? "Машин засвартай төлөвт шилжлээ."
        : "Машин ажиллах төлөвт шилжлээ."
      : updatedFields.length > 0 && updatedFields.every((field) => crewFields.has(field))
        ? "Жолооч, ачигчийн мэдээлэл шинэчлэгдлээ."
        : "Машины мэдээлэл шинэчлэгдлээ.";
    const repairNoticeMessage = isRepairToggle
      ? repairToggle === "start"
        ? "Машин засвартай төлөвт шилжиж, эвдрэлийн тайлбар хадгалагдлаа."
        : "Засвар дуусч, тайлбар түүхэнд хадгалагдлаа."
      : repairRequestChanged
        ? "Засварын тайлбар хадгалагдлаа."
        : "";
    redirectWithMessage(
      "notice",
      repairNoticeMessage || noticeMessage,
      formData,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error), formData);
  }
}

export async function createFleetVehicleAction(formData: FormData) {
  await requireAutoBaseWriteAccess();

  const plate = getString(formData, "license_plate");
  const customName = getString(formData, "x_vehicle_custom_name");
  const name = customName || plate;
  if (!plate) {
    redirectWithMessage("error", "Машины улсын дугаар оруулна уу.", formData);
  }

  try {
    const fields = await executeOdooKw<OdooFieldMap>(
      "fleet.vehicle",
      "fields_get",
      [],
      { attributes: ["string", "type", "required", "readonly"] },
    );
    const modelId =
      await findOrCreateVehicleModel(getString(formData, "model_name") || getString(formData, "new_model_name")) ||
      optionalOdooId(getString(formData, "model_id")) ||
      (fields.model_id?.required ? await findDefaultVehicleModel() : false);
    const vehicleTypeId =
      await findOrCreateVehicleType(getString(formData, "vehicle_type_name") || getString(formData, "new_vehicle_type_name")) ||
      optionalOdooId(getString(formData, "municipal_vehicle_type_id"));
    const categoryId =
      await findOrCreateVehicleCategory(getString(formData, "category_name")) ||
      optionalOdooId(getString(formData, "category_id"));
    const values = pickSupportedValues(
      {
        name,
        x_vehicle_custom_name: optionalOdooValue(customName),
        license_plate: plate,
        active: true,
        model_id: modelId,
        category_id: categoryId,
        municipal_vehicle_type_id: vehicleTypeId,
        municipal_department_id: optionalOdooId(getString(formData, "municipal_department_id")),
        municipal_capacity: optionalOdooValue(getString(formData, "municipal_capacity")),
        municipal_import_date: optionalOdooDate(getString(formData, "municipal_import_date")),
        municipal_color: optionalOdooValue(getString(formData, "municipal_color")),
        municipal_manufactured_date: optionalOdooDate(getString(formData, "municipal_manufactured_date")),
        municipal_seat_count: optionalOdooInteger(getString(formData, "municipal_seat_count"), "Суудлын тоо"),
        x_municipal_operational_status:
          optionalOdooValue(
            getString(formData, "x_municipal_operational_status") === "to_decommission"
              ? "inactive"
              : getString(formData, "x_municipal_operational_status"),
          ) || "available",
        x_to_decommission:
          getString(formData, "x_municipal_operational_status") === "to_decommission",
        fuel_type: optionalOdooValue(getString(formData, "fuel_type")),
        x_gps_installed: getString(formData, "x_gps_installed") === "true",
        x_fuel_monitoring_installed:
          getString(formData, "x_fuel_monitoring_installed") === "true",
        mfo_active_for_ops: true,
      },
      fields,
    );

    const vehicleId = await executeOdooKw<number>("fleet.vehicle", "create", [values], {});
    await appendVehicleAttachmentFields(vehicleId, formData, fields);

    revalidateFleetViews();
    redirectWithMessage("notice", "Машин техник нэмэгдлээ.", formData);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error), formData);
  }
}

export async function archiveFleetVehicleAction(formData: FormData) {
  await requireAutoBaseWriteAccess();

  const vehicleId = Number(getString(formData, "vehicle_id"));
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    redirectWithMessage("error", "Машин сонгоно уу.", formData);
  }

  try {
    const fields = await executeOdooKw<OdooFieldMap>(
      "fleet.vehicle",
      "fields_get",
      [["active"]],
      { attributes: ["string", "readonly"] },
    );
    if (!fields.active || fields.active.readonly) {
      redirectWithMessage("error", "Машин хасах талбар суулгагдаагүй байна.", formData);
    }

    await executeOdooKw<boolean>("fleet.vehicle", "write", [[vehicleId], { active: false }], {});
    revalidateFleetViews();
    redirectWithMessage("notice", "Машин техник жагсаалтаас хасагдлаа.", formData);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error), formData);
  }
}

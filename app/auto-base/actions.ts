"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessAutoBaseOverview, requireSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type OdooFieldInfo = {
  type?: string;
  required?: boolean;
  readonly?: boolean;
};

type OdooFieldMap = Record<string, OdooFieldInfo>;

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithMessage(kind: "error" | "notice", message: string) {
  const params = new URLSearchParams({
    [kind]: message,
  });
  redirect(`/auto-base?${params.toString()}`);
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
    redirect("/auto-base?error=Машины бүртгэл олдсонгүй.");
  }

  try {
    const editableFields = await executeOdooKw<OdooFieldMap>(
      "fleet.vehicle",
      "fields_get",
      [
        [
          "name",
          "license_plate",
          "model_id",
          "category_id",
          "municipal_vehicle_type_id",
          "mfo_active_for_ops",
          "latest_repair_state",
          "x_municipal_operational_status",
          "municipal_department_id",
          "vin_sn",
          "odometer",
          "fuel_type",
          "municipal_responsible_driver_id",
          "municipal_loader_1_id",
          "municipal_loader_2_id",
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

    if ("name" in editableFields && formData.has("name")) {
      values.name = optionalOdooValue(getString(formData, "name"));
    }
    if ("license_plate" in editableFields && formData.has("license_plate")) {
      values.license_plate = optionalOdooValue(getString(formData, "license_plate"));
    }
    if ("model_id" in editableFields && formData.has("model_id")) {
      values.model_id = optionalOdooId(getString(formData, "model_id"));
    }
    if ("category_id" in editableFields && formData.has("category_id")) {
      values.category_id = optionalOdooId(getString(formData, "category_id"));
    }
    if ("municipal_vehicle_type_id" in editableFields && formData.has("municipal_vehicle_type_id")) {
      values.municipal_vehicle_type_id = optionalOdooId(
        getString(formData, "municipal_vehicle_type_id"),
      );
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
      values.x_municipal_operational_status = optionalOdooValue(
        getString(formData, "x_municipal_operational_status"),
      );
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
    if ("fuel_type" in editableFields && formData.has("fuel_type")) {
      values.fuel_type = optionalOdooValue(getString(formData, "fuel_type"));
    }
    if (
      "municipal_responsible_driver_id" in editableFields &&
      formData.has("municipal_responsible_driver_id")
    ) {
      values.municipal_responsible_driver_id = optionalStaffId(
        formData,
        "municipal_responsible_driver_id",
        "Хариуцсан жолооч",
      );
    }
    if ("municipal_loader_1_id" in editableFields && formData.has("municipal_loader_1_id")) {
      values.municipal_loader_1_id = optionalStaffId(
        formData,
        "municipal_loader_1_id",
        "Ачигч 1",
      );
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

    const uploadedFieldNames = await appendVehicleAttachmentFields(vehicleId, formData, editableFields);

    if (!Object.keys(values).length && !uploadedFieldNames.length) {
      const submittedCrewFields = [
        "municipal_responsible_driver_id",
        "municipal_loader_1_id",
        "municipal_loader_2_id",
      ].some((field) => formData.has(field));
      if (submittedCrewFields) {
        redirectWithMessage(
          "error",
          "Авто баазын жолооч, ачигчийн талбарууд суулгагдаагүй байна.",
        );
      }
      redirectWithMessage("error", "Засах боломжтой талбар олдсонгүй.");
    }

    if (Object.keys(values).length) {
      await executeOdooKw<boolean>(
        "fleet.vehicle",
        "write",
        [[vehicleId], values],
        {},
      );
    }

    revalidatePath("/auto-base");
    revalidatePath("/projects");
    revalidatePath("/");
    const updatedFields = Object.keys(values);
    const crewFields = new Set([
      "municipal_responsible_driver_id",
      "municipal_loader_1_id",
      "municipal_loader_2_id",
    ]);
    redirectWithMessage(
      "notice",
      updatedFields.length > 0 && updatedFields.every((field) => crewFields.has(field))
        ? "Жолооч, ачигчийн мэдээлэл шинэчлэгдлээ."
        : "Машины мэдээлэл шинэчлэгдлээ.",
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error));
  }
}

export async function createFleetVehicleAction(formData: FormData) {
  await requireAutoBaseWriteAccess();

  const plate = getString(formData, "license_plate");
  const name = getString(formData, "name") || plate;
  if (!plate) {
    redirectWithMessage("error", "Машины улсын дугаар оруулна уу.");
  }

  try {
    const fields = await executeOdooKw<OdooFieldMap>(
      "fleet.vehicle",
      "fields_get",
      [],
      { attributes: ["string", "type", "required", "readonly"] },
    );
    const modelId =
      optionalOdooId(getString(formData, "model_id")) ||
      (fields.model_id?.required ? await findDefaultVehicleModel() : false);
    const values = pickSupportedValues(
      {
        name,
        license_plate: plate,
        active: true,
        model_id: modelId,
        category_id: optionalOdooId(getString(formData, "category_id")),
        municipal_vehicle_type_id: optionalOdooId(getString(formData, "municipal_vehicle_type_id")),
        municipal_department_id: optionalOdooId(getString(formData, "municipal_department_id")),
        x_municipal_operational_status:
          optionalOdooValue(getString(formData, "x_municipal_operational_status")) || "available",
        fuel_type: optionalOdooValue(getString(formData, "fuel_type")),
        mfo_active_for_ops: true,
      },
      fields,
    );

    const vehicleId = await executeOdooKw<number>("fleet.vehicle", "create", [values], {});
    await appendVehicleAttachmentFields(vehicleId, formData, fields);

    revalidatePath("/auto-base");
    revalidatePath("/projects");
    revalidatePath("/");
    redirectWithMessage("notice", "Машин техник нэмэгдлээ.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error));
  }
}

export async function archiveFleetVehicleAction(formData: FormData) {
  await requireAutoBaseWriteAccess();

  const vehicleId = Number(getString(formData, "vehicle_id"));
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    redirectWithMessage("error", "Машин сонгоно уу.");
  }

  try {
    const fields = await executeOdooKw<OdooFieldMap>(
      "fleet.vehicle",
      "fields_get",
      [["active"]],
      { attributes: ["string", "readonly"] },
    );
    if (!fields.active || fields.active.readonly) {
      redirectWithMessage("error", "Машин хасах талбар суулгагдаагүй байна.");
    }

    await executeOdooKw<boolean>("fleet.vehicle", "write", [[vehicleId], { active: false }], {});
    revalidatePath("/auto-base");
    revalidatePath("/projects");
    revalidatePath("/");
    redirectWithMessage("notice", "Машин техник жагсаалтаас хасагдлаа.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error));
  }
}

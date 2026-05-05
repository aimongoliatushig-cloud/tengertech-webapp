"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

const AUTO_BASE_ALLOWED_ROLES = new Set(["system_admin", "director", "general_manager"]);

const VEHICLE_ATTACHMENT_FIELD_BY_KIND = {
  photo_front: {
    field: "municipal_photo_front_attachment_ids",
    label: "Урд талаас авсан зураг",
    inputName: "photo_front_files",
  },
  photo_left: {
    field: "municipal_photo_left_attachment_ids",
    label: "Зүүн талаас авсан зураг",
    inputName: "photo_left_files",
  },
  photo_right: {
    field: "municipal_photo_right_attachment_ids",
    label: "Баруун талаас авсан зураг",
    inputName: "photo_right_files",
  },
  certificate: {
    field: "municipal_certificate_attachment_ids",
    label: "Гэрчилгээний баримт",
    inputName: "certificate_files",
  },
  other_document: {
    field: "municipal_other_document_attachment_ids",
    label: "Бусад бичиг баримт",
    inputName: "other_document_files",
  },
} as const;

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

function getUploadFiles(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is File => value instanceof File && value.size > 0);
}

async function createVehicleAttachment(vehicleId: number, file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return executeOdooKw<number>(
    "ir.attachment",
    "create",
    [
      {
        name: file.name || "vehicle-attachment",
        datas: buffer.toString("base64"),
        mimetype: file.type || "application/octet-stream",
        res_model: "fleet.vehicle",
        res_id: vehicleId,
      },
    ],
    {},
  );
}

export async function updateFleetVehicleAction(formData: FormData) {
  const session = await requireSession();
  if (!AUTO_BASE_ALLOWED_ROLES.has(String(session.role))) {
    redirect("/");
  }

  const vehicleId = Number(getString(formData, "vehicle_id"));
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    redirect("/auto-base?error=Машины бүртгэл олдсонгүй.");
  }

  try {
    const editableFields = await executeOdooKw<Record<string, unknown>>(
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
          "municipal_inspection_date",
          "municipal_next_inspection_date",
          "municipal_inspection_note",
        ],
      ],
      {
        attributes: ["string"],
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

    if (!Object.keys(values).length) {
      const submittedCrewFields = [
        "municipal_responsible_driver_id",
        "municipal_loader_1_id",
        "municipal_loader_2_id",
      ].some((field) => formData.has(field));
      if (submittedCrewFields) {
        redirectWithMessage(
          "error",
          "Odoo дээр авто баазын жолооч, ачигчийн талбарууд суулгагдаагүй байна. municipal_repair_workflow module-ийг update хийнэ үү.",
        );
      }
      redirectWithMessage("error", "Засах боломжтой талбар олдсонгүй.");
    }

    await executeOdooKw<boolean>(
      "fleet.vehicle",
      "write",
      [[vehicleId], values],
      {},
    );

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

export async function uploadFleetVehicleAttachmentAction(formData: FormData) {
  const session = await requireSession();
  if (!AUTO_BASE_ALLOWED_ROLES.has(String(session.role))) {
    redirect("/");
  }

  const vehicleId = Number(getString(formData, "vehicle_id"));
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    redirect("/auto-base?error=Машины бүртгэл олдсонгүй.");
  }

  const uploadGroups = Object.values(VEHICLE_ATTACHMENT_FIELD_BY_KIND)
    .map((config) => ({
      config,
      files: getUploadFiles(formData, config.inputName),
    }))
    .filter((group) => group.files.length > 0);

  const legacyKind = getString(formData, "attachment_kind") as keyof typeof VEHICLE_ATTACHMENT_FIELD_BY_KIND;
  const legacyConfig = VEHICLE_ATTACHMENT_FIELD_BY_KIND[legacyKind];
  const legacyFiles = legacyConfig ? getUploadFiles(formData, "files") : [];
  if (legacyConfig && legacyFiles.length) {
    uploadGroups.push({ config: legacyConfig, files: legacyFiles });
  }

  if (!uploadGroups.length) {
    redirectWithMessage("error", "Зураг эсвэл бичиг баримтын файл сонгоно уу.");
  }

  try {
    const requiredFields = [...new Set(uploadGroups.map((group) => group.config.field))];
    const fields = await executeOdooKw<Record<string, unknown>>(
      "fleet.vehicle",
      "fields_get",
      [requiredFields],
      { attributes: ["string"] },
    );
    if (requiredFields.some((field) => !(field in fields))) {
      redirectWithMessage(
        "error",
        "Odoo дээр машины зураг, бичиг баримтын талбарууд суулгагдаагүй байна. municipal_repair_workflow module-ийг update хийнэ үү.",
      );
    }

    const values: Record<string, Array<[4, number]>> = {};
    for (const group of uploadGroups) {
      const attachmentIds = [];
      for (const file of group.files) {
        attachmentIds.push(await createVehicleAttachment(vehicleId, file));
      }
      values[group.config.field] = attachmentIds.map((id) => [4, id]);
    }

    await executeOdooKw<boolean>(
      "fleet.vehicle",
      "write",
      [[vehicleId], values],
      {},
    );

    revalidatePath("/auto-base");
    revalidatePath("/projects");
    revalidatePath("/");
    redirectWithMessage("notice", "Зураг, бичиг баримт хадгалагдлаа.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage("error", getErrorMessage(error));
  }
}

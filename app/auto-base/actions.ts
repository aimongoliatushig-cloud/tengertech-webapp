"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

const AUTO_BASE_ALLOWED_ROLES = new Set(["system_admin", "director", "general_manager"]);

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithMessage(vehicleId: number, kind: "error" | "notice", message: string) {
  const params = new URLSearchParams({
    vehicle: String(vehicleId),
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
          "mfo_active_for_ops",
          "latest_repair_state",
          "x_municipal_operational_status",
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
    if (
      "municipal_responsible_driver_id" in editableFields &&
      formData.has("municipal_responsible_driver_id")
    ) {
      values.municipal_responsible_driver_id = optionalOdooId(
        getString(formData, "municipal_responsible_driver_id"),
      );
    }
    if ("municipal_loader_1_id" in editableFields && formData.has("municipal_loader_1_id")) {
      values.municipal_loader_1_id = optionalOdooId(getString(formData, "municipal_loader_1_id"));
    }
    if ("municipal_loader_2_id" in editableFields && formData.has("municipal_loader_2_id")) {
      values.municipal_loader_2_id = optionalOdooId(getString(formData, "municipal_loader_2_id"));
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
          vehicleId,
          "error",
          "Odoo дээр авто баазын жолооч, ачигчийн талбарууд суулгагдаагүй байна. municipal_repair_workflow module-ийг update хийнэ үү.",
        );
      }
      redirectWithMessage(vehicleId, "error", "Засах боломжтой талбар олдсонгүй.");
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
      vehicleId,
      "notice",
      updatedFields.length > 0 && updatedFields.every((field) => crewFields.has(field))
        ? "Жолооч, ачигчийн мэдээлэл шинэчлэгдлээ."
        : "Машины мэдээлэл шинэчлэгдлээ.",
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(vehicleId, "error", getErrorMessage(error));
  }
}

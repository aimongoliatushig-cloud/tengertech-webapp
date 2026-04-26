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

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  try {
    const editableFields = await executeOdooKw<Record<string, unknown>>(
      "fleet.vehicle",
      "fields_get",
      [["name", "license_plate", "mfo_active_for_ops", "latest_repair_state"]],
      {
        attributes: ["string"],
      },
      connectionOverrides,
    );
    const values: Record<string, string | boolean | false> = {};

    if ("name" in editableFields) {
      values.name = optionalOdooValue(getString(formData, "name"));
    }
    if ("license_plate" in editableFields) {
      values.license_plate = optionalOdooValue(getString(formData, "license_plate"));
    }
    if ("mfo_active_for_ops" in editableFields) {
      values.mfo_active_for_ops = formData.get("mfo_active_for_ops") === "on";
    }
    if ("latest_repair_state" in editableFields) {
      values.latest_repair_state = optionalOdooValue(getString(formData, "latest_repair_state"));
    }

    if (!Object.keys(values).length) {
      redirectWithMessage(vehicleId, "error", "Засах боломжтой талбар олдсонгүй.");
    }

    await executeOdooKw<boolean>(
      "fleet.vehicle",
      "write",
      [[vehicleId], values],
      {},
      connectionOverrides,
    );

    revalidatePath("/auto-base");
    revalidatePath("/");
    redirectWithMessage(vehicleId, "notice", "Машины мэдээлэл шинэчлэгдлээ.");
  } catch (error) {
    rethrowIfRedirectError(error);
    redirectWithMessage(vehicleId, "error", getErrorMessage(error));
  }
}

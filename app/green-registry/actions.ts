"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { createGreenAsset, createGreenLocation } from "@/lib/green-registry";

function text(form: FormData, key: string) { return String(form.get(key) || "").trim(); }
function number(form: FormData, key: string) { const value = Number(form.get(key)); return Number.isFinite(value) ? value : 0; }
function positiveId(form: FormData, key: string) { const value = Number(form.get(key)); return Number.isFinite(value) && value > 0 ? value : false; }

function finish(message: string, error = false): never {
  revalidatePath("/green-registry");
  redirect(`/green-registry?${error ? "error" : "notice"}=${encodeURIComponent(message)}`);
}

export async function createGreenLocationAction(formData: FormData) {
  const session = await requireSession();
  const name = text(formData, "name");
  if (!name) finish("Байршлын нэр оруулна уу.", true);
  try {
    await createGreenLocation(session, {
      name, code: text(formData, "code") || false, location_type: text(formData, "locationType") || "other",
      district: text(formData, "district") || "Хан-Уул", khoroo: text(formData, "khoroo") || false,
      address: text(formData, "address") || false, area_size: number(formData, "areaSize"), area_unit: "м²",
      gps_latitude: number(formData, "latitude"), gps_longitude: number(formData, "longitude"),
      responsible_employee_id: positiveId(formData, "responsibleEmployeeId"), active: true,
    });
    finish("Ногоон байгууламжийн байршил нэмэгдлээ.");
  } catch (error) { finish(error instanceof Error ? error.message : "Байршил хадгалахад алдаа гарлаа.", true); }
}

export async function createGreenAssetAction(formData: FormData) {
  const session = await requireSession();
  const locationId = positiveId(formData, "locationId");
  const name = text(formData, "name");
  const quantity = number(formData, "quantity");
  if (!locationId || !name || quantity <= 0) finish("Байршил, нэр, тоо хэмжээг бүрэн оруулна уу.", true);
  try {
    await createGreenAsset(session, {
      location_id: locationId, name, asset_type: text(formData, "assetType") || "tree", species: text(formData, "species") || false,
      quantity, unit: text(formData, "unit") || "ш", planted_date: text(formData, "plantedDate") || false,
      condition: text(formData, "condition") || "healthy", responsible_employee_id: positiveId(formData, "responsibleEmployeeId"), active: true,
    });
    finish("Ургамлын тооллогын бүртгэл нэмэгдлээ.");
  } catch (error) { finish(error instanceof Error ? error.message : "Ургамлын бүртгэл хадгалахад алдаа гарлаа.", true); }
}

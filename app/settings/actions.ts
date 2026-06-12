"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { clearOdooReadCaches, executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { pathWithActionMessage, uiContextPathWithMessage } from "@/lib/ui-context";

const SETTINGS_PATH = "/settings";
const DEFAULT_DISTRICT_NAME = "Хан-Уул дүүрэг";

function cleanInput(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveId(value: FormDataEntryValue | null) {
  const id = Number(cleanInput(value));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function redirectToSettings(
  kind: "notice" | "error",
  message: string,
  anchor = "subdistricts",
  formData?: FormData,
): never {
  redirect(
    formData
      ? uiContextPathWithMessage(formData, SETTINGS_PATH, kind, message, anchor)
      : pathWithActionMessage(SETTINGS_PATH, kind, message, anchor),
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getRecoverableOdooFieldName(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.match(/Invalid field '([^']+)'/)?.[1] ??
    message.match(/Unknown field '([^']+)'/)?.[1] ??
    message.match(/Wrong value for [\w.]+\.([A-Za-z_][\w]*):/)?.[1] ??
    message.match(/Wrong value for ([A-Za-z_][\w]*):/)?.[1] ??
    message.match(/selection field '([^']+)'/)?.[1] ??
    null
  );
}

async function createRecordWithFieldFallback(
  model: string,
  values: Record<string, unknown>,
  requiredFields: string[],
  connection: Partial<OdooConnection>,
) {
  const remainingValues = { ...values };
  const requiredFieldSet = new Set(requiredFields);

  for (;;) {
    try {
      return await executeOdooKw<number>(
        model,
        "create",
        [remainingValues],
        {},
        connection,
      );
    } catch (error) {
      const invalidField = getRecoverableOdooFieldName(error);
      if (
        !invalidField ||
        requiredFieldSet.has(invalidField) ||
        !(invalidField in remainingValues)
      ) {
        throw error;
      }

      delete remainingValues[invalidField];
    }
  }
}

async function writeRecordWithFieldFallback(
  model: string,
  id: number,
  values: Record<string, unknown>,
  requiredFields: string[],
  connection: Partial<OdooConnection>,
) {
  const remainingValues = { ...values };
  const requiredFieldSet = new Set(requiredFields);

  for (;;) {
    try {
      return await executeOdooKw<boolean>(
        model,
        "write",
        [[id], remainingValues],
        {},
        connection,
      );
    } catch (error) {
      const invalidField = getRecoverableOdooFieldName(error);
      if (
        !invalidField ||
        requiredFieldSet.has(invalidField) ||
        !(invalidField in remainingValues)
      ) {
        throw error;
      }

      delete remainingValues[invalidField];
    }
  }
}

async function requireSystemAdminConnection() {
  const session = await requireSession();

  if (session.role !== "system_admin") {
    redirect("/");
  }

  return {
    login: session.login,
    password: session.password,
  } satisfies Partial<OdooConnection>;
}

async function loadKhanUulDistrictId(connection: Partial<OdooConnection>) {
  const districts = await executeOdooKw<Array<{ id: number }>>(
    "mfo.district",
    "search_read",
    [[["name", "=", DEFAULT_DISTRICT_NAME]]],
    { fields: ["id"], limit: 1 },
    connection,
  ).catch(() => []);

  if (!districts[0]?.id) {
    redirectToSettings("error", "Хан-Уул дүүрэг олдсонгүй.");
  }

  return districts[0].id;
}

function parseOptionalInteger(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(cleanInput(value));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseBooleanSelect(value: FormDataEntryValue | null) {
  return cleanInput(value) === "1";
}

function vehicleTypeValuesFromForm(formData: FormData) {
  const name = cleanInput(formData.get("vehicle_type_name"));
  const code = cleanInput(formData.get("vehicle_type_code"));
  const description = cleanInput(formData.get("vehicle_type_description"));

  if (!name) {
    redirectToSettings("error", "Машин техникийн төрлийн нэр оруулна уу.", "vehicle-types", formData);
  }

  return {
    name,
    code: code || false,
    sequence: parseOptionalInteger(formData.get("vehicle_type_sequence"), 10),
    is_garbage_truck: parseBooleanSelect(formData.get("vehicle_type_is_garbage")),
    description: description || false,
  };
}

function revalidateVehicleTypeSettings() {
  clearOdooReadCaches();
  revalidatePath(SETTINGS_PATH);
  revalidatePath("/auto-base");
  revalidatePath("/fleet-repair");
}

export async function createVehicleTypeAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();

  try {
    await createRecordWithFieldFallback(
      "municipal.vehicle.type",
      {
        ...vehicleTypeValuesFromForm(formData),
        active: true,
      },
      ["name"],
      connection,
    );
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Машин техникийн төрөл нэмэх үед алдаа гарлаа."),
      "vehicle-types",
      formData,
    );
  }

  revalidateVehicleTypeSettings();
  redirectToSettings("notice", "Машин техникийн төрөл нэмэгдлээ.", "vehicle-types", formData);
}

export async function updateVehicleTypeAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const vehicleTypeId = parsePositiveId(formData.get("vehicle_type_id"));

  if (!vehicleTypeId) {
    redirectToSettings("error", "Машин техникийн төрөл сонгоно уу.", "vehicle-types", formData);
  }

  try {
    await writeRecordWithFieldFallback(
      "municipal.vehicle.type",
      vehicleTypeId,
      {
        ...vehicleTypeValuesFromForm(formData),
        active: parseBooleanSelect(formData.get("vehicle_type_active")),
      },
      ["name"],
      connection,
    );
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Машин техникийн төрөл засах үед алдаа гарлаа."),
      "vehicle-types",
      formData,
    );
  }

  revalidateVehicleTypeSettings();
  redirectToSettings("notice", "Машин техникийн төрөл шинэчлэгдлээ.", "vehicle-types", formData);
}

export async function toggleVehicleTypeActiveAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const vehicleTypeId = parsePositiveId(formData.get("vehicle_type_id"));
  const active = parseBooleanSelect(formData.get("vehicle_type_active"));

  if (!vehicleTypeId) {
    redirectToSettings("error", "Машин техникийн төрөл сонгоно уу.", "vehicle-types", formData);
  }

  try {
    await writeRecordWithFieldFallback(
      "municipal.vehicle.type",
      vehicleTypeId,
      { active },
      [],
      connection,
    );
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Машин техникийн төрлийн төлөв солих үед алдаа гарлаа."),
      "vehicle-types",
      formData,
    );
  }

  revalidateVehicleTypeSettings();
  redirectToSettings(
    "notice",
    active ? "Машин техникийн төрөл идэвхжлээ." : "Машин техникийн төрөл идэвхгүй боллоо.",
    "vehicle-types",
    formData,
  );
}

async function unlinkRecords(
  model: string,
  ids: number[],
  connection: Partial<OdooConnection>,
) {
  if (!ids.length) {
    return true;
  }

  return executeOdooKw<boolean>(model, "unlink", [ids], {}, connection);
}

async function loadRecordIds(
  model: string,
  domain: unknown[],
  connection: Partial<OdooConnection>,
) {
  const records = await executeOdooKw<Array<{ id: number }>>(
    model,
    "search_read",
    [domain],
    { fields: ["id"], limit: 10000 },
    connection,
  ).catch(() => []);

  return records.map((record) => record.id);
}

async function deleteCollectionPoints(pointIds: number[], connection: Partial<OdooConnection>) {
  if (!pointIds.length) {
    return;
  }

  const routeLineIds = await loadRecordIds(
    "mfo.route.line",
    [["collection_point_id", "in", pointIds]],
    connection,
  );
  await unlinkRecords("mfo.route.line", routeLineIds, connection);

  const stopLineIds = await loadRecordIds(
    "mfo.stop.execution.line",
    [["collection_point_id", "in", pointIds]],
    connection,
  );
  await unlinkRecords("mfo.stop.execution.line", stopLineIds, connection);

  await unlinkRecords("mfo.collection.point", pointIds, connection);
}

export async function createGeneralSubdistrictAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const subdistrictName = cleanInput(formData.get("subdistrict_name"));

  if (!subdistrictName) {
    redirectToSettings("error", "Хорооны нэр оруулна уу.", "subdistricts", formData);
  }

  try {
    const districtId = await loadKhanUulDistrictId(connection);

    await createRecordWithFieldFallback(
      "mfo.subdistrict",
      {
        name: subdistrictName,
        district_id: districtId,
        active: true,
      },
      ["name"],
      connection,
    );
  } catch (error) {
    redirectToSettings("error", getErrorMessage(error, "Хороо нэмэх үед алдаа гарлаа."), "subdistricts", formData);
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хороо нэмэгдлээ.", "subdistricts", formData);
}

export async function updateGeneralSubdistrictAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const subdistrictId = parsePositiveId(formData.get("subdistrict_id"));
  const subdistrictName = cleanInput(formData.get("subdistrict_name"));

  if (!subdistrictId) {
    redirectToSettings("error", "Хороо сонгоно уу.", "subdistricts", formData);
  }
  if (!subdistrictName) {
    redirectToSettings("error", "Хорооны нэр оруулна уу.", "subdistricts", formData);
  }

  try {
    const districtId = await loadKhanUulDistrictId(connection);
    await executeOdooKw<boolean>(
      "mfo.subdistrict",
      "write",
      [[subdistrictId], { name: subdistrictName, district_id: districtId }],
      {},
      connection,
    );
  } catch (error) {
    redirectToSettings("error", getErrorMessage(error, "Хороо засах үед алдаа гарлаа."), "subdistricts", formData);
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хороо шинэчлэгдлээ.", "subdistricts", formData);
}

export async function archiveGeneralSubdistrictAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const subdistrictId = parsePositiveId(formData.get("subdistrict_id"));

  if (!subdistrictId) {
    redirectToSettings("error", "Хороо сонгоно уу.", "subdistricts", formData);
  }

  try {
    const linkedPointIds = await loadRecordIds(
      "mfo.collection.point",
      [["subdistrict_id", "=", subdistrictId]],
      connection,
    );
    await deleteCollectionPoints(linkedPointIds, connection);

    await unlinkRecords(
      "mfo.subdistrict",
      [subdistrictId],
      connection,
    );
  } catch (error) {
    redirectToSettings("error", getErrorMessage(error, "Хороо устгах үед алдаа гарлаа."), "subdistricts", formData);
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хороо устгагдлаа.", "subdistricts", formData);
}

export async function archiveAllGeneralCollectionPointsAction() {
  const connection = await requireSystemAdminConnection();

  try {
    const pointIds = await loadRecordIds(
      "mfo.collection.point",
      [],
      connection,
    );
    await deleteCollectionPoints(pointIds, connection);
  } catch (error) {
    redirectToSettings("error", getErrorMessage(error, "Бүх хогийн цэг устгах үед алдаа гарлаа."));
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Бүх хогийн цэг устгагдлаа.");
}

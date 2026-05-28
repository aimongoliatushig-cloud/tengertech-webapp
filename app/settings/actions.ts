"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";

const SETTINGS_PATH = "/settings";
const DEFAULT_DISTRICT_NAME = "Хан-Уул дүүрэг";

function cleanInput(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveId(value: FormDataEntryValue | null) {
  const id = Number(cleanInput(value));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function redirectToSettings(kind: "notice" | "error", message: string): never {
  redirect(`${SETTINGS_PATH}?${kind}=${encodeURIComponent(message)}#subdistricts`);
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
    redirectToSettings("error", "Хорооны нэр оруулна уу.");
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
    redirectToSettings("error", getErrorMessage(error, "Хороо нэмэх үед алдаа гарлаа."));
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хороо нэмэгдлээ.");
}

export async function updateGeneralSubdistrictAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const subdistrictId = parsePositiveId(formData.get("subdistrict_id"));
  const subdistrictName = cleanInput(formData.get("subdistrict_name"));

  if (!subdistrictId) {
    redirectToSettings("error", "Хороо сонгоно уу.");
  }
  if (!subdistrictName) {
    redirectToSettings("error", "Хорооны нэр оруулна уу.");
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
    redirectToSettings("error", getErrorMessage(error, "Хороо засах үед алдаа гарлаа."));
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хороо шинэчлэгдлээ.");
}

export async function archiveGeneralSubdistrictAction(formData: FormData) {
  const connection = await requireSystemAdminConnection();
  const subdistrictId = parsePositiveId(formData.get("subdistrict_id"));

  if (!subdistrictId) {
    redirectToSettings("error", "Хороо сонгоно уу.");
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
    redirectToSettings("error", getErrorMessage(error, "Хороо устгах үед алдаа гарлаа."));
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хороо устгагдлаа.");
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

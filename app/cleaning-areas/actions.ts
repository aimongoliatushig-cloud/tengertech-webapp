"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireSession } from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { createLocalRoadCleaningArea } from "@/lib/road-cleaning-area-store";
import {
  assignRoadCleaningMasterToEmployees,
  createRoadCleaningArea,
  createTodayRoadCleaningWorks,
  createRoadCleaningWork,
  loadDepartmentOptions,
  loadRoadCleaningEmployeeOptions,
} from "@/lib/workspace";

const GREEN_CLEANING_DEPARTMENT_NAME = "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
const CLEANING_TEAM_OPERATION_TYPES = ["street_cleaning", "green_maintenance"];

type OdooFieldInfo = {
  readonly?: boolean;
  selection?: Array<[string, string]>;
};

type OdooFieldMap = Record<string, OdooFieldInfo>;

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getPositiveNumber(formData: FormData, key: string) {
  const value = Number(getText(formData, key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getOptionalId(formData: FormData, key: string) {
  const value = Number(getText(formData, key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getIds(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => Number(String(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
}

const WORKING_DAY_KEYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

function getWorkingDayKeys(formData: FormData) {
  return formData
    .getAll("working_days")
    .map((value) => String(value).trim())
    .filter((value) => WORKING_DAY_KEYS.has(value));
}

function getTodayValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isMissingCleaningModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("doesn't exist") ||
    message.includes("does not exist") ||
    message.includes("Invalid field") ||
    message.includes("Unknown field") ||
    message.includes("municipal.cleaning.area")
  );
}

function redirectWithStatus(type: "notice" | "error", message: string, anchor = ""): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`/cleaning-areas?${params.toString()}${anchor ? `#${anchor}` : ""}`);
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

async function getModelFields(model: string, connection: Partial<OdooConnection>) {
  try {
    return await executeOdooKw<OdooFieldMap>(
      model,
      "fields_get",
      [],
      { attributes: ["readonly", "selection"] },
      connection,
    );
  } catch {
    return null;
  }
}

function pickSupportedValues(
  candidateValues: Record<string, unknown>,
  fields: OdooFieldMap | null,
) {
  if (!fields) {
    return candidateValues;
  }

  return Object.fromEntries(
    Object.entries(candidateValues).filter(([fieldName, value]) => {
      if (!fields[fieldName] || fields[fieldName].readonly) {
        return false;
      }
      return value !== undefined && value !== null && value !== "";
    }),
  );
}

function pickSelectionValue(
  fields: OdooFieldMap | null,
  fieldName: string,
  preferredValues: string[],
) {
  const selection = fields?.[fieldName]?.selection;
  if (!selection?.length) {
    return preferredValues[0];
  }
  const allowed = new Set(selection.map(([value]) => value));
  return preferredValues.find((value) => allowed.has(value)) ?? selection[0]?.[0] ?? preferredValues[0];
}

async function writeOdooRecord(
  model: string,
  id: number,
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  const fields = await getModelFields(model, connection);
  const supportedValues = pickSupportedValues(values, fields);
  if (!Object.keys(supportedValues).length) {
    return true;
  }

  try {
    return await executeOdooKw<boolean>(model, "write", [[id], supportedValues], {}, connection);
  } catch (error) {
    console.warn(`Retrying ${model} write with system connection`, error);
    return executeOdooKw<boolean>(model, "write", [[id], supportedValues], {});
  }
}

async function createOdooRecord(
  model: string,
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  const fields = await getModelFields(model, connection);
  const supportedValues = pickSupportedValues(values, fields);

  try {
    return await executeOdooKw<number>(model, "create", [supportedValues], {}, connection);
  } catch (error) {
    console.warn(`Retrying ${model} create with system connection`, error);
    return executeOdooKw<number>(model, "create", [supportedValues], {});
  }
}

async function loadGreenCleaningDepartmentId(connection: Partial<OdooConnection>) {
  const departments = await loadDepartmentOptions(connection);
  const department =
    departments.find(
      (option) =>
        option.name === GREEN_CLEANING_DEPARTMENT_NAME ||
        option.label === GREEN_CLEANING_DEPARTMENT_NAME,
    ) ??
    departments.find((option) => {
      const label = `${option.name} ${option.label}`.toLocaleLowerCase("mn-MN");
      return label.includes("ногоон") && label.includes("цэвэрлэгээ");
    }) ??
    null;

  return department?.id ?? null;
}

async function buildCleaningTeamValues(
  formData: FormData,
  connection: Partial<OdooConnection>,
  requireName: boolean,
) {
  const teamName = getText(formData, "team_name");
  const leaderId = getOptionalId(formData, "team_leader_id");
  const memberIds = getIds(formData, "member_ids");
  const serviceArea = getText(formData, "service_area");

  if (requireName && !teamName) {
    redirectWithStatus("error", "Багийн нэр оруулна уу.", "teams");
  }

  const [fields, departmentId] = await Promise.all([
    getModelFields("mfo.crew.team", connection),
    loadGreenCleaningDepartmentId(connection),
  ]);
  const memberCommand = [[6, 0, memberIds]];
  const operationType = pickSelectionValue(fields, "operation_type", CLEANING_TEAM_OPERATION_TYPES);

  return pickSupportedValues(
    {
      name: teamName,
      active: true,
      operation_type: operationType,
      department_id: departmentId,
      ops_department_id: departmentId,
      driver_employee_id: leaderId || false,
      mfo_driver_employee_id: leaderId || false,
      leader_employee_id: leaderId || false,
      team_leader_id: leaderId || false,
      master_employee_id: leaderId || false,
      responsible_employee_id: leaderId || false,
      collector_employee_ids: memberCommand,
      member_employee_ids: memberCommand,
      member_ids: memberCommand,
      employee_ids: memberCommand,
      loader_employee_ids: memberCommand,
      loader_ids: memberCommand,
      service_area: serviceArea || false,
      zone_name: serviceArea || false,
      responsibility_area: serviceArea || false,
      khoroo_scope: serviceArea || false,
    },
    fields,
  );
}

export async function createCleaningAreaAction(formData: FormData) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    redirectWithStatus("error", "Цэвэрлэх талбай бүртгэх эрхгүй байна.");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const name = getText(formData, "name");
  const khorooName = getText(formData, "khoroo_name");
  const areaM2 = getPositiveNumber(formData, "area_m2");
  const employeeId = getOptionalId(formData, "employee_id");
  const note = getText(formData, "note");
  const workingDayKeys = getWorkingDayKeys(formData);
  const workDate = getText(formData, "work_date") || getTodayValue();
  const departments = await loadDepartmentOptions(connectionOverrides);
  const department =
    departments.find(
      (option) =>
        option.name === GREEN_CLEANING_DEPARTMENT_NAME ||
        option.label === GREEN_CLEANING_DEPARTMENT_NAME,
    ) ??
    departments.find((option) => {
      const label = `${option.name} ${option.label}`.toLocaleLowerCase("mn-MN");
      return label.includes("ногоон") && label.includes("цэвэрлэгээ");
    }) ??
    null;
  const departmentId = department?.id ?? null;

  if (!name || !khorooName || !areaM2 || !departmentId || !employeeId || !workingDayKeys.length) {
    redirectWithStatus(
      "error",
      "Талбайн нэршил, хороо, мкв, цэвэрлэгээний ажилтан, ажиллах өдрийг бүрэн сонгоно уу.",
    );
  }

  try {
    try {
      await createRoadCleaningArea(
        {
          name,
          khorooName,
          streetName: khorooName,
          areaM2,
          workingDayKeys,
          departmentId,
          employeeId,
          note,
        },
        connectionOverrides,
      );
    } catch (error) {
      if (!isMissingCleaningModelError(error)) {
        throw error;
      }

      const employees = await loadRoadCleaningEmployeeOptions(connectionOverrides);
      const employee = employees.find((option) => option.id === employeeId);
      const localArea = await createLocalRoadCleaningArea({
        name,
        khorooName,
        areaM2,
        workingDayKeys,
        departmentId,
        departmentName: department?.name ?? department?.label ?? "",
        employeeId,
        employeeName: employee?.name ?? "",
        note,
      });

      try {
        await createRoadCleaningWork(
          {
            cleaningAreaId: localArea.id,
            areaName: localArea.name,
            departmentId,
            employeeId,
            workDate,
            note,
          },
          connectionOverrides,
        );
      } catch (workError) {
        const message = workError instanceof Error ? workError.message : String(workError ?? "");
        if (!message.includes("тухайн өдөр амрах")) {
          throw workError;
        }
      }
    }

    revalidatePath("/cleaning-areas");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    redirectWithStatus("notice", "Цэвэрлэх талбай бүртгэгдэж, өнөөдрийн ажил үүслээ.");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error ? error.message : "Цэвэрлэх талбай бүртгэхэд алдаа гарлаа.";
    redirectWithStatus("error", message);
  }
}

export async function createTodayCleaningWorksAction() {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    redirectWithStatus("error", "Өнөөдрийн ажил үүсгэх эрхгүй байна.");
  }

  try {
    const result = await createTodayRoadCleaningWorks(
      { workDate: getTodayValue() },
      {
        login: session.login,
        password: session.password,
      },
    );
    revalidatePath("/cleaning-areas");
    revalidatePath("/tasks");
    redirectWithStatus(
      "notice",
      `${result.createdCount} ажил үүслээ. ${result.skippedCount} талбай давхардсан эсвэл амрах өдөр тул алгаслаа.`,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error ? error.message : "Өнөөдрийн ажил үүсгэхэд алдаа гарлаа.";
    redirectWithStatus("error", message);
  }
}

export async function assignCleaningMasterAction(formData: FormData) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    redirectWithStatus("error", "Мастерын хариуцлага оноох эрхгүй байна.");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const masterId = getOptionalId(formData, "master_id");
  const employeeIds = getIds(formData, "employee_ids");
  const allEmployeeIds = getIds(formData, "all_employee_ids");
  const workDate = getText(formData, "work_date") || getTodayValue();

  if (!masterId || !employeeIds.length) {
    redirectWithStatus("error", "Мастер болон хариуцах ажилтнуудаа сонгоно уу.");
  }

  try {
    const result = await assignRoadCleaningMasterToEmployees(
      {
        masterId,
        employeeIds,
        allEmployeeIds,
        workDate,
      },
      connectionOverrides,
    );
    revalidatePath("/cleaning-areas");
    revalidatePath("/tasks");
    redirectWithStatus(
      "notice",
      `${result.updatedAreaCount} талбайн мастерын оноолт шинэчлэгдлээ.`,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const message =
      error instanceof Error ? error.message : "Мастерын оноолт хадгалахад алдаа гарлаа.";
    redirectWithStatus("error", message);
  }
}

export async function createCleaningTeamAction(formData: FormData) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    redirectWithStatus("error", "Баг нэмэх эрхгүй байна.", "teams");
  }

  const connection = {
    login: session.login,
    password: session.password,
  };

  try {
    const values = await buildCleaningTeamValues(formData, connection, true);
    await createOdooRecord("mfo.crew.team", values, connection);
    revalidatePath("/cleaning-areas");
    revalidatePath("/projects");
    redirectWithStatus("notice", "Баг нэмэгдлээ.", "teams");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Баг нэмэхэд алдаа гарлаа.";
    redirectWithStatus("error", message, "teams");
  }
}

export async function updateCleaningTeamAction(formData: FormData) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    redirectWithStatus("error", "Баг засах эрхгүй байна.", "teams");
  }

  const teamId = getOptionalId(formData, "team_id");
  if (!teamId) {
    redirectWithStatus("error", "Засах багаа сонгоно уу.", "teams");
  }

  const connection = {
    login: session.login,
    password: session.password,
  };

  try {
    const values = await buildCleaningTeamValues(formData, connection, true);
    await writeOdooRecord("mfo.crew.team", teamId, values, connection);
    revalidatePath("/cleaning-areas");
    revalidatePath("/projects");
    redirectWithStatus("notice", "Багийн мэдээлэл шинэчлэгдлээ.", "teams");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Баг засахад алдаа гарлаа.";
    redirectWithStatus("error", message, "teams");
  }
}

export async function archiveCleaningTeamAction(formData: FormData) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    redirectWithStatus("error", "Баг устгах эрхгүй байна.", "teams");
  }

  const teamId = getOptionalId(formData, "team_id");
  if (!teamId) {
    redirectWithStatus("error", "Устгах багаа сонгоно уу.", "teams");
  }

  const connection = {
    login: session.login,
    password: session.password,
  };

  try {
    await writeOdooRecord("mfo.crew.team", teamId, { active: false }, connection);
    revalidatePath("/cleaning-areas");
    revalidatePath("/projects");
    redirectWithStatus("notice", "Баг устгагдлаа.", "teams");
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Баг устгахад алдаа гарлаа.";
    redirectWithStatus("error", message, "teams");
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { requireSession } from "@/lib/auth";
import {
  isAutoGarbageDepartment,
  normalizeDepartmentText,
} from "@/lib/department-permissions";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadDepartmentOptions } from "@/lib/workspace";

type OdooFieldInfo = {
  type?: string;
  required?: boolean;
  readonly?: boolean;
  selection?: Array<[string, string]>;
};

type OdooFieldMap = Record<string, OdooFieldInfo>;

function cleanInput(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function redirectToProfile(kind: "notice" | "error", message: string): never {
  redirect(`/profile?${kind}=${encodeURIComponent(message)}#team-route-settings`);
}

function getSessionConnection(session: Awaited<ReturnType<typeof requireSession>>) {
  return {
    login: session.login,
    password: session.password,
  } satisfies Partial<OdooConnection>;
}

async function loadDepartmentId(
  departmentName: string | null,
  connection: Partial<OdooConnection>,
) {
  if (!departmentName) {
    return null;
  }

  const normalizedDepartmentName = normalizeDepartmentText(departmentName);
  const departments = await loadDepartmentOptions(connection);
  return departments.find((department) => normalizeDepartmentText(department.name) === normalizedDepartmentName)
    ?.id ?? null;
}

async function getModelFields(model: string, connection: Partial<OdooConnection>) {
  try {
    return await executeOdooKw<OdooFieldMap>(
      model,
      "fields_get",
      [],
      { attributes: ["type", "required", "readonly", "selection"] },
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
      if (!fields[fieldName]) {
        return false;
      }
      if (fields[fieldName].readonly) {
        return false;
      }
      if (value === undefined || value === null || value === "") {
        return false;
      }
      return true;
    }),
  );
}

function parsePositiveId(value: FormDataEntryValue | null) {
  const id = Number(cleanInput(value));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePositiveIds(values: FormDataEntryValue[]) {
  return values
    .map((value) => Number(cleanInput(value)))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function pickTeamOperationType(fields: OdooFieldMap | null, departmentName: string | null) {
  const normalizedDepartment = normalizeDepartmentText(departmentName);
  const preferredValues = isAutoGarbageDepartment(departmentName)
    ? ["garbage", "street_cleaning", "green_maintenance"]
    : normalizedDepartment.includes("ногоон") || normalizedDepartment.includes("цэцэрлэг")
      ? ["green_maintenance", "street_cleaning", "garbage"]
      : ["street_cleaning", "green_maintenance", "garbage"];

  const selection = fields?.operation_type?.selection;
  if (!selection?.length) {
    return preferredValues[0];
  }

  const availableValues = new Set(selection.map(([value]) => value));
  return preferredValues.find((value) => availableValues.has(value)) ?? selection[0]?.[0] ?? "garbage";
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
    console.warn(`Retrying ${model} create with system Odoo connection`, error);
    return executeOdooKw<number>(model, "create", [supportedValues], {});
  }
}

export async function createProfileTeamAction(formData: FormData) {
  const session = await requireSession();
  const canCreateTeam = new Set([
    "system_admin",
    "project_manager",
    "senior_master",
    "team_leader",
  ]).has(String(session.role));

  if (!canCreateTeam) {
    redirectToProfile("error", "Баг үүсгэх эрх таны role дээр нээлттэй биш байна.");
  }

  const teamName = cleanInput(formData.get("team_name"));
  const memberIds = parsePositiveIds(formData.getAll("member_ids"));
  if (!teamName) {
    redirectToProfile("error", "Багийн нэрээ оруулна уу.");
  }

  const connection = getSessionConnection(session);
  const departmentName = await loadSessionDepartmentName(session);
  const departmentId = await loadDepartmentId(departmentName, connection);
  const fields = await getModelFields("mfo.crew.team", connection);
  const operationType = pickTeamOperationType(fields, departmentName);

  try {
    await createOdooRecord(
      "mfo.crew.team",
      {
        name: teamName,
        active: true,
        operation_type: operationType,
        department_id: departmentId,
        ops_department_id: departmentId,
        collector_employee_ids: memberIds.length ? [[6, 0, memberIds]] : undefined,
      },
      connection,
    );
  } catch (error) {
    console.error("Failed to create crew team", error);
    redirectToProfile("error", "Баг үүсгэхэд Odoo дээр алдаа гарлаа. Заавал бөглөх талбар үлдсэн байж магадгүй.");
  }

  revalidatePath("/profile");
  redirectToProfile("notice", "Баг амжилттай үүслээ.");
}

export async function createProfileRouteAction(formData: FormData) {
  const session = await requireSession();
  const departmentName = await loadSessionDepartmentName(session);
  const canCreateRoute =
    String(session.role) === "project_manager" && isAutoGarbageDepartment(departmentName);

  if (!canCreateRoute) {
    redirectToProfile(
      "error",
      "??????? ?????? ??? ?????? ???? ????, ??? ????????????? ???????? ?????? ????????.",
    );
  }

  const routeName = cleanInput(formData.get("route_name"));
  const vehicleId = parsePositiveId(formData.get("vehicle_id"));
  const teamId = parsePositiveId(formData.get("team_id"));
  const pointIds = parsePositiveIds(formData.getAll("point_ids"));

  if (!routeName) {
    redirectToProfile("error", "????????? ????? ??????? ??.");
  }
  if (!vehicleId) {
    redirectToProfile("error", "??????? ????????? ???? ????? ??????? ??.");
  }
  if (!teamId) {
    redirectToProfile("error", "??????? ????????? ???? ??? ??????? ??.");
  }
  if (!pointIds.length) {
    redirectToProfile("error", "??????? ????????? ???? ??? ???? ??? ?????? ??? ??????? ??.");
  }

  const connection = getSessionConnection(session);
  const departmentId = await loadDepartmentId(departmentName, connection);

  try {
    const projectId = await createOdooRecord(
      "project.project",
      {
        name: routeName,
        active: true,
        privacy_visibility: "employees",
        mfo_is_operation_project: true,
        mfo_operation_type: "garbage",
        mfo_default_shift_type: "morning",
        mfo_selected_shift_type: "morning",
        mfo_selected_vehicle_id: vehicleId,
        mfo_crew_team_id: teamId,
        ops_department_id: departmentId,
      },
      connection,
    );

    const routeId = await createOdooRecord(
      "mfo.route",
      {
        name: routeName,
        active: true,
        project_id: projectId,
        shift_type: "morning",
      },
      connection,
    );

    await Promise.all(
      pointIds.map((pointId, index) =>
        createOdooRecord(
          "mfo.route.line",
          {
            route_id: routeId,
            collection_point_id: pointId,
            sequence: index + 1,
          },
          connection,
        ),
      ),
    );
  } catch (error) {
    console.error("Failed to create garbage route", error);
    redirectToProfile("error", "??????? ???????? Odoo ???? ????? ??????. ???????? ????????? ?????? ????????.");
  }

  revalidatePath("/profile");
  redirectToProfile("notice", "??????? ????????? ??????.");
}

export async function createProfileCollectionPointAction(formData: FormData) {
  const session = await requireSession();
  const departmentName = await loadSessionDepartmentName(session);
  const canCreatePoint =
    String(session.role) === "project_manager" && isAutoGarbageDepartment(departmentName);

  if (!canCreatePoint) {
    redirectToProfile(
      "error",
      "?????? ??? ????? ??? ?????? ???? ????, ??? ????????????? ???????? ?????? ????????.",
    );
  }

  const pointName = cleanInput(formData.get("point_name"));
  const address = cleanInput(formData.get("point_address"));
  const subdistrictId = parsePositiveId(formData.get("subdistrict_id"));

  if (!pointName) {
    redirectToProfile("error", "?????? ?????? ????? ??????? ??.");
  }
  if (!subdistrictId) {
    redirectToProfile("error", "?????? ??? ???????? ???? ????? ??????? ??.");
  }

  const connection = getSessionConnection(session);

  try {
    await createOdooRecord(
      "mfo.collection.point",
      {
        name: pointName,
        address,
        active: true,
        operation_type: "garbage",
        subdistrict_id: subdistrictId,
      },
      connection,
    );
  } catch (error) {
    console.error("Failed to create collection point", error);
    redirectToProfile("error", "?????? ??? ??????? Odoo ???? ????? ??????.");
  }

  revalidatePath("/profile");
  redirectToProfile("notice", "?????? ??? ????????? ?????????.");
}

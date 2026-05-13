"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireSession } from "@/lib/auth";
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

function redirectWithStatus(type: "notice" | "error", message: string): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`/cleaning-areas?${params.toString()}`);
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

const HR_ALLOWED_ROLES = new Set(["system_admin", "director", "general_manager"]);
const MAX_EMPLOYEE_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_EMPLOYEE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getEmployeeId(formData: FormData) {
  return Number(getString(formData, "employee_id"));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Ажилтны бүртгэл хадгалах үед алдаа гарлаа.";
}

function redirectWithMessage(
  employeeId: number,
  kind: "error" | "notice",
  message: string,
) {
  const params = new URLSearchParams({
    employee: String(employeeId),
    [kind]: message,
  });
  redirect(`/hr?${params.toString()}`);
}

function optionalOdooValue(value: string) {
  return value || false;
}

function getOptionalImageFile(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

export async function updateHrEmployeeRegistrationAction(formData: FormData) {
  const session = await requireSession();
  if (!HR_ALLOWED_ROLES.has(String(session.role))) {
    redirect("/");
  }

  const employeeId = getEmployeeId(formData);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    redirect("/hr?error=Ажилтны бүртгэл олдсонгүй.");
  }

  const values: Record<string, string | false> = {
    work_phone: optionalOdooValue(getString(formData, "work_phone")),
    mobile_phone: optionalOdooValue(getString(formData, "mobile_phone")),
    work_email: optionalOdooValue(getString(formData, "work_email")),
  };
  const employeePhoto = getOptionalImageFile(formData, "employee_photo");

  if (employeePhoto) {
    if (!ALLOWED_EMPLOYEE_PHOTO_TYPES.has(employeePhoto.type)) {
      redirectWithMessage(
        employeeId,
        "error",
        "Зөвхөн JPG, PNG эсвэл WebP зураг оруулна уу.",
      );
    }

    if (employeePhoto.size > MAX_EMPLOYEE_PHOTO_SIZE) {
      redirectWithMessage(employeeId, "error", "Ажилтны зураг 5MB-аас бага байх ёстой.");
    }

    const imageBuffer = Buffer.from(await employeePhoto.arrayBuffer());
    values.image_1920 = imageBuffer.toString("base64");
  }

  try {
    await executeOdooKw<boolean>(
      "hr.employee",
      "write",
      [[employeeId], values],
      {},
      {
        login: session.login,
        password: session.password,
      },
    );

    revalidatePath("/hr");
    redirectWithMessage(
      employeeId,
      "notice",
      employeePhoto
        ? "Ажилтны зураг болон бүртгэл шинэчлэгдлээ."
        : "Ажилтны бүртгэл шинэчлэгдлээ.",
    );
  } catch (error) {
    redirectWithMessage(employeeId, "error", getErrorMessage(error));
  }
}

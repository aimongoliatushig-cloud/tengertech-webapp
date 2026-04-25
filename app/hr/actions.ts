"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

const HR_ALLOWED_ROLES = new Set(["system_admin", "director", "general_manager"]);

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

export async function updateHrEmployeeRegistrationAction(formData: FormData) {
  const session = await requireSession();
  if (!HR_ALLOWED_ROLES.has(String(session.role))) {
    redirect("/");
  }

  const employeeId = getEmployeeId(formData);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    redirect("/hr?error=Ажилтны бүртгэл олдсонгүй.");
  }

  const values = {
    work_phone: optionalOdooValue(getString(formData, "work_phone")),
    mobile_phone: optionalOdooValue(getString(formData, "mobile_phone")),
    work_email: optionalOdooValue(getString(formData, "work_email")),
  };

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
    redirectWithMessage(employeeId, "notice", "Ажилтны бүртгэл шинэчлэгдлээ.");
  } catch (error) {
    redirectWithMessage(employeeId, "error", getErrorMessage(error));
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSession, hasCapability } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import { canManageEvaluation, resolveEvalDepartmentName } from "./access";
import {
  DEFAULT_EVALUATOR_NAME,
  DEFAULT_EVALUATOR_ORG,
  isValidEvalMonth,
  sanitizeEvalRows,
} from "@/lib/road-cleaning-evaluation";
import { saveEvalMonth } from "@/lib/road-cleaning-evaluation-store";

function evalRedirectPath(
  month: string,
  department: string,
  status: "notice" | "error",
  message: string,
) {
  const params = new URLSearchParams();
  if (isValidEvalMonth(month)) {
    params.set("month", month);
  }
  if (department) {
    params.set("department", department);
  }
  params.set(status, message);
  return `/reports/evaluation?${params.toString()}`;
}

export async function saveEvaluationAction(formData: FormData) {
  const session = await requireSession();
  const month = String(formData.get("month") ?? "").trim();
  const requestedDepartment = String(formData.get("department") ?? "").trim();
  const evaluatorOrg = String(formData.get("evaluator_org") ?? "").trim().slice(0, 200) || DEFAULT_EVALUATOR_ORG;
  const evaluatorName = String(formData.get("evaluator_name") ?? "").trim().slice(0, 120) || DEFAULT_EVALUATOR_NAME;

  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const canViewAll = canViewAllWorkspaceReports(session);
  const departmentName = resolveEvalDepartmentName({
    scopedDepartmentName,
    canViewAll,
    requestedDepartment,
  });

  if (!canManageEvaluation(session) || !hasCapability(session, "write_workspace_reports")) {
    redirect(evalRedirectPath(month, departmentName, "error", "Танд үнэлгээ оруулах эрх байхгүй байна."));
  }

  if (!canViewAll && scopedDepartmentName && departmentName !== scopedDepartmentName) {
    redirect(evalRedirectPath(month, scopedDepartmentName, "error", "Зөвхөн өөрийн хэлтсийн үнэлгээ оруулна."));
  }

  if (!isValidEvalMonth(month)) {
    redirect(evalRedirectPath(month, departmentName, "error", "Сар буруу байна."));
  }

  let parsedRows: unknown = [];
  try {
    parsedRows = JSON.parse(String(formData.get("rows_json") ?? "[]"));
  } catch {
    redirect(evalRedirectPath(month, departmentName, "error", "Мэдээлэл уншихад алдаа гарлаа."));
  }
  const rows = sanitizeEvalRows(parsedRows);

  const updatedAt = new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const result = await saveEvalMonth(departmentName, {
    month,
    rows,
    evaluatorOrg,
    evaluatorName,
    updatedBy: session.name,
    updatedAt,
  });

  if (!result.ok) {
    redirect(evalRedirectPath(month, departmentName, "error", result.error ?? "Хадгалахад алдаа гарлаа."));
  }

  revalidatePath("/reports/evaluation");
  redirect(evalRedirectPath(month, departmentName, "notice", "Гүйцэтгэлийн үнэлгээ хадгалагдлаа."));
}

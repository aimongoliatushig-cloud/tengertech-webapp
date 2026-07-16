import { isMasterRole } from "@/lib/auth";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import type { RoleGroupFlags, UserRole } from "@/lib/roles";

// Гүйцэтгэлийн үнэлгээг анхлан зам талбайн цэвэрлэгээний хэлтэст зориулж
// нэвтрүүлж байгаа тул бүх тайлан харах эрхтэй хэрэглэгчид энэ хэлтсийг
// өгөгдмөлөөр сонгоно.
export const DEFAULT_EVAL_DEPARTMENT = "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";

type EvalAccessContext = {
  role: UserRole;
  employeeJobTitle?: string;
  groupFlags?: RoleGroupFlags;
};

// Ахлах мастер, мастер, хэлтсийн дарга, менежер болон бүх тайлан харах эрхтэй
// хэрэглэгч үнэлгээ оруулж, тайлан гаргах эрхтэй.
export function canManageEvaluation(context: EvalAccessContext): boolean {
  const jobTitle = (context.employeeJobTitle || "").toLocaleLowerCase("mn-MN");

  return Boolean(
    isMasterRole(context.role) ||
      context.role === "project_manager" ||
      context.groupFlags?.municipalDepartmentHead ||
      jobTitle.includes("мастер") ||
      canViewAllWorkspaceReports(context),
  );
}

export function resolveEvalDepartmentName({
  scopedDepartmentName,
  canViewAll,
  requestedDepartment,
}: {
  scopedDepartmentName: string | null;
  canViewAll: boolean;
  requestedDepartment?: string;
}): string {
  if (scopedDepartmentName) {
    return scopedDepartmentName;
  }
  if (canViewAll && requestedDepartment) {
    return requestedDepartment;
  }
  return DEFAULT_EVAL_DEPARTMENT;
}

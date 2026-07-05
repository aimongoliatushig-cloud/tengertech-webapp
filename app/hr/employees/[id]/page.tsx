import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { getEmployee, getEmployees, loadEmployeeErpEvaluation, requireHrAccess } from "@/lib/hr";
import { formatEmployeeDisplayName } from "@/lib/hr-name";

import { EmployeeDetailTabs } from "../../hr-client";
import { EmployeeErpScorecard } from "../../employee-erp-scorecard";
import { HrSectionNav } from "../../hr-section-nav";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HrEmployeeDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    notFound();
  }
  const employees = await getEmployees(session);
  const employee = await getEmployee(session, employeeId, employees);
  if (!employee) {
    notFound();
  }
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";
  const erpEvaluation = await loadEmployeeErpEvaluation(employee.userId).catch(() => ({
    hasLogin: false,
    login: "",
    roleKey: "",
    lastLoginDate: "",
    isInternal: false,
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
  }));

  return (
    <>
      <WorkspaceHeader
        title={formatEmployeeDisplayName(employee.name)}
        subtitle={`${employee.departmentName || "Алба нэгж бүртгээгүй"} · ${employee.jobTitle || "Албан тушаал бүртгээгүй"}`}
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationNote="Ажилтны дэлгэрэнгүй"
      />
      <HrSectionNav mode={mode} />

      <EmployeeErpScorecard employee={employee} evaluation={erpEvaluation} />

      <EmployeeDetailTabs
        employee={employee}
        canEdit={access.isHr}
        mode={mode}
      />
    </>
  );
}

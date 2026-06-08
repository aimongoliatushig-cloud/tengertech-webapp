import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { getDepartments, getEmployee, getEmployees, getJobs, requireHrAccess } from "@/lib/hr";

import { EmployeeDetailTabs } from "../../hr-client";
import { HrSectionNav } from "../../hr-section-nav";
import styles from "../../hr.module.css";

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
  const [employees, departments, jobs] = await Promise.all([
    getEmployees(session),
    getDepartments(session),
    getJobs(session),
  ]);
  const managers = employees
    .filter((record) => record.active)
    .map((record) => ({ id: record.id, name: record.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn"));
  const employee = await getEmployee(session, employeeId, employees);
  if (!employee) {
    notFound();
  }
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";

  return (
    <>
      <WorkspaceHeader
        title={employee.name}
        subtitle={`${employee.departmentName || "Алба нэгж бүртгээгүй"} · ${employee.jobTitle || "Албан тушаал бүртгээгүй"}`}
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationNote="Ажилтны дэлгэрэнгүй"
      />
      <HrSectionNav mode={mode} />

      <EmployeeDetailTabs
        employee={employee}
        canEdit={access.isHr || access.isDepartmentHead}
        mode={mode}
        departments={departments}
        jobs={jobs}
        managers={managers}
        familyMemberCandidates={employees}
      />
    </>
  );
}

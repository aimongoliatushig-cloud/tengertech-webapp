import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { getDepartments, getEmployee, getJobs, getManagers, requireHrAccess } from "@/lib/hr";

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
  const [employee, departments, jobs, managers] = await Promise.all([
    getEmployee(session, employeeId),
    getDepartments(session),
    getJobs(session),
    getManagers(session),
  ]);
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
      />
    </>
  );
}

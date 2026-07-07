import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession, getSessionRoleLabel } from "@/lib/auth";
import { getHrDepartmentDisplayName } from "@/lib/hr-department-order";
import { getDepartmentJobCounts, getDepartments, getEmployees, requireHrAccess } from "@/lib/hr";

import { DepartmentDashboardClient } from "../../department-dashboard-client";
import { HrSectionNav } from "../../hr-section-nav";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HrDepartmentDashboardPage({ params }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const { id } = await params;
  const departmentId = Number(id);
  if (!Number.isFinite(departmentId)) {
    notFound();
  }

  const [departments, employees, departmentJobCounts] = await Promise.all([
    getDepartments(session),
    getEmployees(session).catch(() => []),
    getDepartmentJobCounts(session).catch(() => []),
  ]);

  const department = departments.find((item) => item.id === departmentId);
  if (!department) {
    notFound();
  }

  const departmentName = getHrDepartmentDisplayName(department.name);
  const departmentEmployees = employees.filter((employee) => employee.departmentId === departmentId);
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";

  return (
    <>
      <WorkspaceHeader
        title={departmentName}
        subtitle="Хэлтсийн хянах самбар — ажилтан, орон тоо, бүтэц"
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={0}
        notificationNote={`${departmentEmployees.length} ажилтан`}
      />
      <HrSectionNav mode={mode} />

      <DepartmentDashboardClient
        departmentId={departmentId}
        departmentName={departmentName}
        matchName={department.name}
        employees={departmentEmployees}
        jobCounts={departmentJobCounts}
      />
    </>
  );
}

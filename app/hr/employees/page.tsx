import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { EmployeeTable } from "../hr-client";

export const dynamic = "force-dynamic";

export default async function HrEmployeesPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const employees = await getEmployees(session).catch((error) => {
    console.warn("HR employees page could not load employees:", error);
    return [];
  });

  return (
    <>
      <WorkspaceHeader
        title="Ажилтнууд"
        subtitle="Odoo hr.employee бүртгэлээс ажилтны жагсаалт, хайлт, төлөвийн шүүлт"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={employees.length}
        notificationNote={`${employees.length} ажилтны бүртгэл`}
      />
      <HrSectionNav />
      <EmployeeTable employees={employees} />
    </>
  );
}

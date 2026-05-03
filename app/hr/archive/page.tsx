import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, requireHrAccess } from "@/lib/hr";

import { EmployeeTable } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export const dynamic = "force-dynamic";

export default async function HrArchivePage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const employees = await getEmployees(session).catch(() => []);
  const archivedEmployees = employees.filter(
    (employee) => !employee.active || ["archived", "resigned", "terminated"].includes(employee.statusKey),
  );

  return (
    <>
      <WorkspaceHeader
        title="Архив"
        subtitle="Ажлаас гарсан болон архивлагдсан ажилтны түүх, гэрээ, тушаал, хавсралтыг тусад нь харна"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={archivedEmployees.length}
        notificationNote="Архивын бүртгэл"
      />
      <HrSectionNav />
      <EmployeeTable employees={archivedEmployees} />
    </>
  );
}

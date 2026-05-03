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
  const mode = access.isHr ? "hr" : "department";

  return (
    <>
      <WorkspaceHeader
        title={access.isHr ? "Бүх ажилтнууд" : "Миний хэлтсийн ажилтнууд"}
        subtitle={access.isHr ? "Odoo hr.employee бүртгэлээс бүх ажилтны жагсаалт, хайлт, төлөвийн шүүлт" : "Өөрийн хэлтсийн ажилтнуудыг хайж чөлөө / өвчтэй хүсэлт үүсгэнэ"}
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={employees.length}
        notificationNote={`${employees.length} ажилтны бүртгэл`}
      />
      <HrSectionNav mode={mode} />
      <EmployeeTable employees={employees} mode={mode} />
    </>
  );
}

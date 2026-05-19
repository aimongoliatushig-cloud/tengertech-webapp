import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
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
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";

  return (
    <>
      <WorkspaceHeader
        title={mode === "hr" ? "Бүх ажилтнууд" : "Манай хэлтсийн ажилтнууд"}
        subtitle={mode === "hr" ? "Бүх ажилтны жагсаалт, хайлт, төлөвийн шүүлт" : "Өөрийн хэлтсийн ажилтнуудыг хайж чөлөө / өвчтэй хүсэлт үүсгэнэ"}
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={employees.length}
        notificationNote={`${employees.length} ажилтны бүртгэл`}
      />
      <HrSectionNav mode={mode} />
      <EmployeeTable employees={employees} mode={mode} canCreateEmployee={access.isHr} />
    </>
  );
}

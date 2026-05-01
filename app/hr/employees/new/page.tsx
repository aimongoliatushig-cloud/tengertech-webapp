import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getDepartments, getJobs, getManagers, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../../hr-section-nav";
import { EmployeeCreateForm } from "../../hr-client";

export const dynamic = "force-dynamic";

export default async function NewHrEmployeePage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const [departments, jobs, managers] = await Promise.all([
    getDepartments(session),
    getJobs(session),
    getManagers(session),
  ]);

  return (
    <>
      <WorkspaceHeader
        title="Шинэ ажилтан бүртгэх"
        subtitle="Ажилтны үндсэн мэдээлэл, алба нэгж, албан тушаал, холбоо барих мэдээллийг Odoo дээр үүсгэнэ"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Шинэ HR бүртгэл"
      />
      <HrSectionNav />
      <EmployeeCreateForm departments={departments} jobs={jobs} managers={managers} />
    </>
  );
}

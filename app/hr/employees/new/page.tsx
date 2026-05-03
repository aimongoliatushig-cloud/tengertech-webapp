import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getDepartments, getJobs, getManagers, requireHrSpecialistAccess } from "@/lib/hr";

import { HrSectionNav } from "../../hr-section-nav";
import { EmployeeCreateForm } from "../../hr-client";

export const dynamic = "force-dynamic";

export default async function NewHrEmployeePage() {
  const session = await requireSession();
  const access = await requireHrSpecialistAccess(session).catch(() => null);
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
      <HrSectionNav mode={access.isHr ? "hr" : "department"} />
      <EmployeeCreateForm departments={departments} jobs={jobs} managers={managers} />
    </>
  );
}

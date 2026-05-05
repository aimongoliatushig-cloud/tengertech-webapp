import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, requireHrAccess } from "@/lib/hr";

import { RegistryPage } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrTripsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const params = await searchParams;
  const rawEmployeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;
  const selectedEmployeeId = Number(rawEmployeeId);
  const selectedEmployee = Number.isFinite(selectedEmployeeId)
    ? await getEmployee(session, selectedEmployeeId).catch(() => null)
    : null;

  return (
    <>
      <WorkspaceHeader
        title="Томилолт"
        subtitle="Ажилтан, газар, хугацаа, зорилго, баталсан хүн болон тушаалын хавсралтыг бүртгэнэ"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Томилолтын бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Томилолтын жагсаалт"
        description="Томилолтын газар, эхлэх/дуусах огноо, зорилго, баталсан хүн, тушаал эсвэл хавсралтын мэдээлэл бүртгэнэ."
        fields={["Ажилтан", "Хэлтэс", "Томилолтын газар", "Эхлэх огноо", "Дуусах огноо", "Зорилго", "Баталсан хүн", "Төлөв"]}
        selectedEmployee={selectedEmployee}
      />
    </>
  );
}

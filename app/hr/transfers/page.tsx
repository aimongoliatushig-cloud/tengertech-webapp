import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { RegistryPage } from "../hr-client";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrTransfersPage({ searchParams }: PageProps) {
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
        title="Шилжилт хөдөлгөөн"
        subtitle="Хэлтэс, албан тушаал, удирдлага, дэвшүүлэх, бууруулах, түдгэлзүүлэх бүртгэл"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Шилжилт хөдөлгөөний бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Шилжилт хөдөлгөөний жагсаалт"
        description="Өмнөх болон шинэ алба нэгж, албан тушаал, удирдлага, хүчинтэй огноо, тушаалын файлыг бүртгэнэ."
        fields={[
          "Ажилтан",
          "Өмнөх алба нэгж",
          "Шинэ алба нэгж",
          "Өмнөх албан тушаал",
          "Шинэ албан тушаал",
          "Өмнөх удирдлага",
          "Шинэ удирдлага",
          "Хүчинтэй огноо",
          "Шалтгаан",
        ]}
        selectedEmployee={selectedEmployee}
      />
    </>
  );
}

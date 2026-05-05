import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { RegistryPage } from "../hr-client";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrClearancePage({ searchParams }: PageProps) {
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
        title="Тойрох хуудас"
        subtitle="Ажилтан ажлаас гарах үед байгууллагын баталгаажуулах checklist-ийг хянах хэсэг"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Тойрох хуудасны бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Тойрох хуудасны жагсаалт"
        description="Үүссэн, явагдаж байгаа, дууссан, цуцлагдсан төлөвтэй тойрох хуудсыг бүртгэнэ."
        fields={["Ажилтан", "Төлөв", "Тэмдэглэл"]}
        checklist={["Нярав", "Нягтлан", "IT / тоног төхөөрөмж", "Шууд удирдлага", "Хүний нөөц", "Захиргаа"]}
        selectedEmployee={selectedEmployee}
      />
    </>
  );
}

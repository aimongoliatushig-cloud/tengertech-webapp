import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { RegistryPage } from "../hr-client";

export default async function HrClearancePage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
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
      />
    </>
  );
}

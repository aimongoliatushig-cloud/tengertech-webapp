import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { RegistryPage } from "../hr-client";

export default async function HrDisciplinePage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  return (
    <>
      <WorkspaceHeader
        title="Сахилгын бүртгэл"
        subtitle="Ажил үүрэг, чанар, тайлан, хариуцлага, аюулгүй ажиллагаа болон бусад HR сахилгын бүртгэл"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Сахилгын бүртгэл"
      />
      <HrSectionNav />
      <RegistryPage
        title="Сахилгын бүртгэлийн жагсаалт"
        description="Зөрчлийн төрөл, огноо, ажилтны тайлбар, арга хэмжээ, баталсан хүн болон холбогдох тушаалын мэдээллийг бүртгэнэ."
        fields={["Ажилтан", "Хэлтэс", "Албан тушаал", "Зөрчлийн төрөл", "Зөрчлийн огноо", "Тайлбар", "Ажилтны тайлбар", "Авсан арга хэмжээ", "Төлөв"]}
      />
    </>
  );
}

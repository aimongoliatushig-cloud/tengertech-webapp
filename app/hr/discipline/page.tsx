import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

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
        title="Сахилга"
        subtitle="Сануулга, 20% суутгал, ажлаас чөлөөлөх санал болон бусад арга хэмжээ"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Сахилгын бүртгэл"
      />
      <RegistryPage
        title="Сахилгын бүртгэлийн жагсаалт"
        description="Зөрчлийн төрөл, огноо, тайлбар, арга хэмжээ, хариуцсан HR ажилтны мэдээллийг бүртгэнэ."
        fields={["Ажилтан", "Зөрчлийн төрөл", "Огноо", "Тайлбар", "Арга хэмжээ", "Хариуцсан HR ажилтан"]}
      />
    </>
  );
}

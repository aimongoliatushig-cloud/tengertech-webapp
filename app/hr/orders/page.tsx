import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { RegistryPage } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export default async function HrOrdersPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }

  return (
    <>
      <WorkspaceHeader
        title="Тушаал"
        subtitle="Ажилд авах, чөлөөлөх, албан тушаал өөрчлөх, чөлөө, сахилгын тушаал болон гэрээг хадгална"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Тушаал, гэрээ, хавсралт"
      />
      <HrSectionNav />
      <RegistryPage
        title="Тушаал, гэрээний жагсаалт"
        description="Баримтын төрөл, дугаар, огноо, хавсралт файл, тайлбар, оруулсан хүний мэдээллийг бүртгэнэ."
        fields={["Ажилтан", "Баримтын төрөл", "Дугаар", "Огноо", "Тайлбар"]}
        checklist={["Ажилд авах тушаал", "Ажлаас чөлөөлөх тушаал", "Хөдөлмөрийн гэрээ", "Нэмэлт гэрээ", "Сахилгын тушаал", "Тойрох хуудас"]}
      />
    </>
  );
}

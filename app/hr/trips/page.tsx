import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { RegistryPage } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export default async function HrTripsPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }

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
      />
    </>
  );
}

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { RegistryPage } from "../hr-client";

export default async function HrTransfersPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  return (
    <>
      <WorkspaceHeader
        title="Шилжилт хөдөлгөөн"
        subtitle="Хэлтэс, албан тушаал, удирдлага, дэвшүүлэх, бууруулах, түдгэлзүүлэх бүртгэл"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Шилжилт хөдөлгөөний бүртгэл"
      />
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
      />
    </>
  );
}

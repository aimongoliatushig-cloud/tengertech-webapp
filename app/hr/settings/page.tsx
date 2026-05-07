import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

import { RegistryPage } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export default async function HrSettingsPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }

  return (
    <>
      <WorkspaceHeader
        title="Тохиргоо"
        subtitle="Хүний нөөцийн бүртгэлийн төрөл, өвчтэй магадлагааны шаардлага, баримтын бүрдэл, төлөвийн тохиргоог удирдана"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Хүний нөөцийн тохиргоо"
      />
      <HrSectionNav />
      <RegistryPage
        title="Хүний нөөцийн тохиргооны жагсаалт"
        description="Чөлөөний төрөл, өвчтэй магадлагаа шаардлагатай эсэх, баримтын төрөл, тойрох хуудасны шалгах хэсгүүдийг тохируулна."
        fields={["Тохиргооны нэр", "Төрөл", "Идэвхтэй эсэх", "Тайлбар"]}
        checklist={["Чөлөөний төрөл", "Өвчтэй магадлагаа", "Баримтын төрөл", "Тойрох хуудасны хэсэг", "Архивлах нөхцөл"]}
      />
    </>
  );
}

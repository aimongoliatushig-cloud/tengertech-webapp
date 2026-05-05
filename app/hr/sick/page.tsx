import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, getTimeoffRequests, requireHrAccess } from "@/lib/hr";

import { TimeoffRequestsClient } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export const dynamic = "force-dynamic";

export default async function HrSickPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const [employees, requests] = await Promise.all([
    getEmployees(session).catch(() => []),
    getTimeoffRequests(session),
  ]);
  const mode = access.isHr ? "hr" : "department";

  return (
    <>
      <WorkspaceHeader
        title="Чөлөө / өвчтэй хүсэлт"
        subtitle="Хэлтсийн дарга ажилтанд чөлөө эсвэл өвчтэй хүсэлт үүсгэж HR-д илгээнэ"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={requests.filter((item) => item.requestType === "sick").length}
        notificationNote="Өвчтэй хүсэлт"
      />
      <HrSectionNav mode={mode} />
      <TimeoffRequestsClient employees={employees} requests={requests} mode={mode} />
    </>
  );
}

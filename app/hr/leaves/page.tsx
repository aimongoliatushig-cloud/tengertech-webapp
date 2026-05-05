import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, getTimeoffRequests, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { TimeoffRequestsClient } from "../hr-client";

export const dynamic = "force-dynamic";

export default async function HrLeavesPage() {
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
        title={access.isHr ? "Ирсэн хүсэлтүүд" : "Миний илгээсэн хүсэлтүүд"}
        subtitle={access.isHr ? "Хэлтсийн даргаас ирсэн чөлөө / өвчтэй хүсэлтийг хянаж батална эсвэл татгалзана" : "Өөрийн хэлтсийн ажилтанд илгээсэн чөлөө / өвчтэй хүсэлтүүд"}
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={requests.length}
        notificationNote="Чөлөө / өвчтэй хүсэлт"
      />
      <HrSectionNav mode={mode} />
      <TimeoffRequestsClient employees={employees} requests={requests} mode={mode} />
    </>
  );
}

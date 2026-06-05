import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { getEmployees, getTimeoffRequests, requireHrAccess } from "@/lib/hr";

import { TimeoffRequestsClient } from "../hr-client";
import { HR_NOTIFICATION_HREF } from "../constants";
import { HrSectionNav } from "../hr-section-nav";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HrSickPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const params = (await searchParams) || {};
  const requestType = Array.isArray(params.type) ? params.type[0] : params.type;
  const annualLeaveMode = requestType === "annual_leave";
  const [employees, requests] = await Promise.all([
    getEmployees(session).catch(() => []),
    getTimeoffRequests(session),
  ]);
  const mode = access.isHr ? "hr" : "department";

  return (
    <>
      <WorkspaceHeader
        title={annualLeaveMode ? "Ээлжийн амралт" : "Чөлөө / өвчтэй хүсэлт"}
        subtitle={
          annualLeaveMode
            ? "Ажилтан сонгож эхлэх, дуусах хугацаа болон баримт файлыг бүртгэнэ"
            : "Хэлтсийн дарга ажилтанд чөлөө эсвэл өвчтэй хүсэлт үүсгэж HR-д илгээнэ"
        }
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={requests.filter((item) => item.requestType === (annualLeaveMode ? "annual_leave" : "sick")).length}
        notificationNote={annualLeaveMode ? "Ээлжийн амралт" : "Өвчтэй хүсэлт"}
        notificationHref={HR_NOTIFICATION_HREF}
      />
      <HrSectionNav mode={mode} />
      <TimeoffRequestsClient employees={employees} requests={requests} mode={mode} />
    </>
  );
}

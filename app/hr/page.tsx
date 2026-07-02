import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { getDisciplineRecords, getEmployees, getTimeoffDashboard, getTimeoffRequests, requireHrAccess } from "@/lib/hr";

import { HrDashboardClient } from "./hr-dashboard-client";
import { HR_NOTIFICATION_HREF } from "./constants";
import { HrSectionNav } from "./hr-section-nav";
import styles from "./hr.module.css";

export const dynamic = "force-dynamic";

export default async function HrDashboardPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const [employees, timeoffDashboard, timeoffRequests, disciplineRecords] = await Promise.all([
    getEmployees(session).catch((error) => {
      console.warn("HR dashboard employee groups could not be loaded:", error);
      return [];
    }),
    getTimeoffDashboard(session).catch((error) => {
      console.warn("HR time off dashboard could not be loaded:", error);
      return null;
    }),
    getTimeoffRequests(session).catch((error) => {
      console.warn("HR time off requests could not be loaded:", error);
      return [];
    }),
    getDisciplineRecords(session).catch((error) => {
      console.warn("HR discipline records could not be loaded:", error);
      return [];
    }),
  ]);
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";
  const requestCards = timeoffDashboard?.cards;

  return (
    <>
      <WorkspaceHeader
        title={mode === "hr" ? "Хүний нөөцийн хянах самбар" : "Миний хэлтсийн хүний нөөц"}
        subtitle={mode === "hr" ? "Бүх хэлтсийн ажилтан, чөлөө / өвчтэй хүсэлт болон төлөвийг хянана" : "Өөрийн хэлтсийн ажилтны идэвхтэй, чөлөөтэй, өвчтэй төлөв болон илгээсэн хүсэлтүүд"}
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={requestCards?.pendingRequests ?? 0}
        notificationNote="Хүлээгдэж буй хүсэлт"
        notificationHref={HR_NOTIFICATION_HREF}
      />
      <HrSectionNav mode={mode} />

      <HrDashboardClient
        accessMode={mode}
        employees={employees}
        requests={timeoffRequests}
        dashboard={timeoffDashboard}
        disciplineRecords={disciplineRecords}
      />
    </>
  );
}

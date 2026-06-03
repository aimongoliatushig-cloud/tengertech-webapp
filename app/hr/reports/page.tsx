import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { Activity, Archive, BriefcaseBusiness, ClipboardCheck, HeartPulse, ShieldAlert, UserCheck, Users } from "lucide-react";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { getDepartments, getGeneratedHrReports, getHrStats, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import styles from "../hr.module.css";
import { HrReportsClient } from "./hr-reports-client";

type PageProps = {
  searchParams?: Promise<{
    reportType?: string | string[];
    departmentId?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function HrReportsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const params = (await searchParams) ?? {};
  const [stats, reports, departments] = await Promise.all([
    getHrStats(session),
    getGeneratedHrReports(session),
    getDepartments(session).catch(() => []),
  ]);
  const metricCards = [
    { label: "Нийт ажилтан", value: stats.totalEmployees, note: "Бүх бүртгэл", icon: Users },
    { label: "Идэвхтэй", value: stats.activeEmployees, note: "Идэвхтэй ажилтан", icon: UserCheck },
    { label: "Чөлөөтэй", value: stats.leaveToday, note: "Өнөөдрийн төлөв", icon: ClipboardCheck },
    { label: "Өвчтэй", value: stats.sickToday, note: "Өнөөдрийн төлөв", icon: HeartPulse },
    { label: "Томилолттой", value: stats.businessTripToday, note: "Өнөөдрийн төлөв", icon: BriefcaseBusiness },
    { label: "Сахилгын идэвхтэй", value: stats.activeDiscipline, note: "Идэвхтэй бүртгэл", icon: ShieldAlert },
    { label: "Ажлаас чөлөөлсөн", value: stats.archivedEmployees, note: "Чөлөөлөгдсөн бүртгэл", icon: Archive },
    { label: "Тойрох хуудас", value: stats.pendingClearance, note: "Хүлээгдэж буй", icon: Activity },
  ];

  return (
    <>
      <WorkspaceHeader
        title="HR тайлан"
        subtitle="Ажилтан, хэлтэс, чөлөө, өвчтэй, томилолт, сахилга, шилжилт, тушаал, тойрох хуудас, ажлаас чөлөөлсөн ажилтны PDF тайлан"
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationNote="HR тайлан"
      />
      <HrSectionNav />
      <section className={styles.reportMetricGrid}>
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={styles.reportMetricCard}>
              <span className={styles.reportMetricIcon}>
                <Icon aria-hidden />
              </span>
              <div>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </div>
            </article>
          );
        })}
      </section>
      <HrReportsClient
        reports={reports}
        departments={departments}
        initialFilters={{
          reportType: firstParam(params.reportType),
          departmentId: firstParam(params.departmentId),
          dateFrom: firstParam(params.dateFrom),
          dateTo: firstParam(params.dateTo),
        }}
      />
    </>
  );
}

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
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

  return (
    <>
      <WorkspaceHeader
        title="HR тайлан"
        subtitle="Ажилтан, хэлтэс, чөлөө, өвчтэй, томилолт, сахилга, шилжилт, тушаал, тойрох хуудас, архивын PDF тайлан"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="HR тайлан"
      />
      <HrSectionNav />
      <section className={styles.statGrid}>
        {[
          ["Нийт ажилтан", stats.totalEmployees],
          ["Идэвхтэй", stats.activeEmployees],
          ["Чөлөөтэй", stats.leaveToday],
          ["Өвчтэй", stats.sickToday],
          ["Томилолттой", stats.businessTripToday],
          ["Сахилгын идэвхтэй", stats.activeDiscipline],
          ["Архивлагдсан", stats.archivedEmployees],
          ["Тойрох хуудас", stats.pendingClearance],
        ].map(([label, value]) => (
          <article key={label} className={styles.statCard}>
            <div>
              <small>{label}</small>
              <strong>{value}</strong>
              <p>Odoo болон HR бүртгэлээс тооцсон үзүүлэлт</p>
            </div>
          </article>
        ))}
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

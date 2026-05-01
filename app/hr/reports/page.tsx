import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getHrStats, requireHrAccess } from "@/lib/hr";

import styles from "../hr.module.css";

export default async function HrReportsPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const stats = await getHrStats(session);

  return (
    <>
      <WorkspaceHeader
        title="HR тайлан"
        subtitle="Ажилтны төлөв, чөлөө, архив, тойрох хуудасны нэгтгэл"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="HR тайлан"
      />
      <section className={styles.statGrid}>
        {[
          ["Нийт ажилтан", stats.totalEmployees],
          ["Идэвхтэй", stats.activeEmployees],
          ["Өнөөдөр чөлөөтэй", stats.leaveToday],
          ["Өвчтэй", stats.sickToday],
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
    </>
  );
}

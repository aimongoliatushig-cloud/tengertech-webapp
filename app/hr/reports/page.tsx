import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getHrStats, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
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
        title="Хүний нөөцийн тайлан"
        subtitle="Ажилтан, хэлтэс, чөлөө, өвчтэй, томилолт, сахилга, шилжилт, тушаал, тойрох хуудас, архивын тайлан"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Хүний нөөцийн тайлан"
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
              <p>Odoo болон хүний нөөцийн бүртгэлээс тооцсон үзүүлэлт</p>
            </div>
          </article>
        ))}
      </section>
      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>Тайлан татах</span>
          <h2>Гарах хүний нөөцийн тайлангууд</h2>
        </div>
        <div className={styles.actionGrid}>
          {[
            "Ажилтны жагсаалт",
            "Хэлтэс тус бүрийн ажилтны тайлан",
            "Шинээр орсон ажилтны тайлан",
            "Ажлаас гарсан ажилтны тайлан",
            "Чөлөөний тайлан",
            "Өвчтэй ажилтны тайлан",
            "Томилолтын тайлан",
            "Сахилгын тайлан",
            "Шилжилт хөдөлгөөний тайлан",
            "Тушаал, гэрээний тайлан",
            "Тойрох хуудасны тайлан",
            "Архивын тайлан",
          ].map((label) => (
            <button key={label} type="button" className={styles.primaryButton}>
              {label}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

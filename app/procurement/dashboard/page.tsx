import Link from "next/link";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { requireSession } from "@/lib/auth";
import {
  createEmptyProcurementDashboard,
  createFallbackProcurementUser,
  isProcurementSetupError,
  loadProcurementDashboard,
  loadProcurementMe,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

function formatGeneratedOn(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export const dynamic = "force-dynamic";

export default async function ProcurementDashboardPage() {
  const session = await requireSession();
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [procurementUser, dashboard, setupWarning] = await Promise.all([
    loadProcurementMe(connectionOverrides).catch((error) => {
      if (!isProcurementSetupError(error)) {
        throw error;
      }
      return createFallbackProcurementUser(session);
    }),
    loadProcurementDashboard({}, connectionOverrides).catch((error) => {
      if (!isProcurementSetupError(error)) {
        throw error;
      }
      return createEmptyProcurementDashboard();
    }),
    loadProcurementMe(connectionOverrides)
      .then(() => "")
      .catch((error) =>
        isProcurementSetupError(error)
          ? "Худалдан авалтын backend API хараахан идэвхжээгүй байна. Үндсэн самбар уншигдаж байгаа бөгөөд API идэвхжсэний дараа бодит хүсэлтүүд энд харагдана."
          : "",
      ),
  ]);

  const highlightedItems = dashboard.items.slice(0, 3);

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Үйл ажиллагаа хариуцсан менежерийн хяналтын самбар"
      description="Төслүүдийн худалдан авалтын явц, няравын ачаалал, нийлүүлэгчийн сонголт, шийдвэрлэх хугацааг төвлөрүүлэн харуулна."
      activeTab="dashboard"
    >
      {setupWarning ? (
        <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>
          {setupWarning}
        </section>
      ) : null}

      <section className={styles.overviewPanel}>
        <div className={styles.overviewCopy}>
          <p className={styles.overviewEyebrow}>Удирдлагын тойм</p>
          <h2>Шийдвэр гаргах түвшний зураглалыг нэг дэлгэцэд төвлөрүүлэв</h2>
          <p>Ачаалал, төсөл, нийлүүлэгч, анхаарал шаардсан хүсэлтийг нэг хэлбэрийн section-оор харуулж, өдөр тутмын хяналтыг хялбаршуулна.</p>
        </div>
        <div className={styles.pillGrid}>
          <article className={styles.pillCard}>
            <span>Сүүлд шинэчилсэн</span>
            <strong>{formatGeneratedOn(dashboard.metrics.generated_on)}</strong>
            <small>Самбарын тайлан үүссэн огноо</small>
          </article>
          <article className={styles.pillCard}>
            <span>Төлбөр хүлээж буй</span>
            <strong>{dashboard.metrics.payment_pending} хүсэлт</strong>
            <small>Санхүүгийн дараагийн алхамтай урсгал</small>
          </article>
          <article className={styles.pillCard}>
            <span>Хүлээн авалт хүлээж буй</span>
            <strong>{dashboard.metrics.receipt_pending} хүсэлт</strong>
            <small>Бараа, үйлчилгээ баталгаажаагүй байна</small>
          </article>
          <article className={styles.pillCard}>
            <span>Дундаж хугацаа</span>
            <strong>{dashboard.metrics.average_resolution_days} өдөр</strong>
            <small>Хүсэлт хаагдах дундаж хугацаа</small>
          </article>
        </div>
      </section>

      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span>Нийт хүсэлт</span>
          <strong>{dashboard.metrics.total}</strong>
          <small>Системийн бүх урсгал</small>
        </article>
        <article className={styles.metricCard}>
          <span>1 саяас доош</span>
          <strong>{dashboard.metrics.low_flow}</strong>
          <small>Шуурхай урсгал</small>
        </article>
        <article className={styles.metricCard}>
          <span>1 саяас дээш</span>
          <strong>{dashboard.metrics.high_flow}</strong>
          <small>Тушаал, гэрээтэй шат</small>
        </article>
        <article className={styles.metricCard}>
          <span>Хоцорсон</span>
          <strong>{dashboard.metrics.delayed}</strong>
          <small>Анхаарал шаардсан урсгал</small>
        </article>
      </section>

      <section className={styles.dashboardGrid}>
        <article className={styles.dashboardCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Нярав тус бүрийн ачаалал</h3>
              <p>Идэвхтэй урсгалын тоо</p>
            </div>
          </div>
          {dashboard.storekeeper_load.length ? (
            <div className={styles.tableList}>
              {dashboard.storekeeper_load.map((item) => (
                <div key={item.id} className={styles.tableRow}>
                  <div className={styles.tableRowHeader}>
                    <strong>{item.name}</strong>
                    <span className={styles.badge}>{item.count} хүсэлт</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>Одоогоор ачааллын мэдээлэл алга байна.</div>
          )}
        </article>

        <article className={styles.dashboardCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Төсөл тус бүрийн явц</h3>
              <p>Төсөл дээр хэдэн хүсэлт нээлттэй байгааг харуулна.</p>
            </div>
          </div>
          {dashboard.project_progress.length ? (
            <div className={styles.tableList}>
              {dashboard.project_progress.map((item) => (
                <div key={item.id} className={styles.tableRow}>
                  <div className={styles.tableRowHeader}>
                    <strong>{item.name}</strong>
                    <span className={styles.badgeOutline}>{item.count} хүсэлт</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>Төслийн явцын мэдээлэл олдсонгүй.</div>
          )}
        </article>

        <article className={styles.dashboardCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Нийлүүлэгчийн сонголт</h3>
              <p>Хамгийн олон сонгогдсон нийлүүлэгчид</p>
            </div>
          </div>
          {dashboard.supplier_counts.length ? (
            <div className={styles.tableList}>
              {dashboard.supplier_counts.map((item) => (
                <div key={item.id} className={styles.tableRow}>
                  <div className={styles.tableRowHeader}>
                    <strong>{item.name}</strong>
                    <span className={styles.badgeOutline}>{item.count} удаа</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>Сонгогдсон нийлүүлэгчийн статистик алга байна.</div>
          )}
        </article>
      </section>

      <section className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Анхаарал шаардсан хүсэлтүүд</h2>
            <p>Хяналтын самбарт хамгийн түрүүнд шалгах урсгалуудыг энд товчлон харууллаа.</p>
          </div>
          <Link href="/procurement/assigned" className={styles.secondaryButton}>
            Хариуцсан урсгал руу очих
          </Link>
        </div>
        {highlightedItems.length ? (
          <div className={styles.requestGrid}>
            {highlightedItems.map((item) => (
              <Link key={item.id} href={`/procurement/${item.id}`} className={styles.requestCard}>
                <div className={styles.requestCardTop}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>{item.title}</p>
                  </div>
                  <span className={item.is_delayed ? styles.badgeDanger : styles.badge}>{item.state.label}</span>
                </div>
                <div className={styles.badgeRow}>
                  {item.flow_type ? <span className={styles.badgeOutline}>{item.flow_type.label}</span> : null}
                  <span className={styles.badgeOutline}>{item.payment_status.label}</span>
                  <span className={styles.badgeOutline}>{item.receipt_status.label}</span>
                </div>
                <div className={styles.metaList}>
                  <span><strong>Төсөл:</strong> {item.project?.name || "Сонгоогүй"}</span>
                  <span><strong>Хариуцагч:</strong> {item.current_responsible?.name || "Тодорхойгүй"}</span>
                  <span><strong>Нярав:</strong> {item.storekeeper?.name || "Сонгоогүй"}</span>
                  <span><strong>Шатны насжилт:</strong> {item.current_stage_age_days} өдөр</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>Одоогоор тусгайлан анхаарах хүсэлт илрээгүй байна.</div>
        )}
      </section>
    </ProcurementShell>
  );
}

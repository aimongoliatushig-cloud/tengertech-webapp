import Link from "next/link";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { requireSession } from "@/lib/auth";
import { loadProcurementMe, loadProcurementRequests } from "@/lib/procurement";

import styles from "../procurement.module.css";

export const dynamic = "force-dynamic";

export default async function AssignedProcurementPage() {
  const session = await requireSession();
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [procurementUser, requestBundle] = await Promise.all([
    loadProcurementMe(connectionOverrides),
    loadProcurementRequests({ scope: "assigned", limit: 20 }, connectionOverrides),
  ]);

  const delayedCount = requestBundle.items.filter((item) => item.is_delayed).length;
  const stageCount = requestBundle.items.filter((item) => item.current_stage_age_days >= 3).length;
  const unresolvedCount = requestBundle.items.filter((item) => !item.paid || !item.received).length;

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Хариуцсан хүсэлтүүд"
      description="Нярав, санхүү, бичиг хэрэг, гэрээний ажилтан, удирдлагад оноогдсон ажлуудыг нэг хэмнэлтэйгээр харуулна."
      activeTab="assigned"
    >
      <section className={styles.overviewPanel}>
        <div className={styles.overviewCopy}>
          <p className={styles.overviewEyebrow}>Гүйцэтгэлийн урсгал</p>
          <h2>Таны хариуцаж буй ажлууд нэг дарааллаар харагдана</h2>
          <p>Шат бүрт хэчнээн өдөр болсон, аль хүсэлт хоцорсон, аль нь дараагийн шийдвэр хүлээж байгааг энэ харагдац төвлөрүүлнэ.</p>
        </div>
        <div className={styles.pillGrid}>
          <article className={styles.pillCard}>
            <span>Нийт даалгавар</span>
            <strong>{requestBundle.items.length} хүсэлт</strong>
            <small>Танд шууд харагдах хариуцсан урсгал</small>
          </article>
          <article className={styles.pillCard}>
            <span>Хугацаа анхаарах</span>
            <strong>{delayedCount} хоцролттой</strong>
            <small>Хугацаа хэтэрсэн эсвэл саатсан хүсэлт</small>
          </article>
          <article className={styles.pillCard}>
            <span>Шатанд удааширсан</span>
            <strong>{stageCount} хүсэлт</strong>
            <small>3 ба түүнээс дээш өдөр нэг шатанд байна</small>
          </article>
          <article className={styles.pillCard}>
            <span>Дуусаагүй ажил</span>
            <strong>{unresolvedCount} үргэлжилж байна</strong>
            <small>Төлбөр эсвэл хүлээн авалт хүлээж буй урсгал</small>
          </article>
        </div>
      </section>

      <section className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Миний хариуцсан урсгал</h2>
            <p>Эндээс жагсаалт, төлөв, одоогийн хариуцагч болон шатны насжилтыг нэг мөрөөр хянаарай.</p>
          </div>
          <Link href="/procurement/dashboard" className={styles.secondaryButton}>
            Самбар харах
          </Link>
        </div>
        {requestBundle.items.length ? (
          <div className={styles.requestGrid}>
            {requestBundle.items.map((item) => (
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
                  <span className={styles.badgeOutline}>{item.current_stage_age_days} өдөр</span>
                  <span className={styles.badgeOutline}>{item.payment_status.label}</span>
                </div>
                <div className={styles.metaList}>
                  <span><strong>Төсөл:</strong> {item.project?.name || "Сонгоогүй"}</span>
                  <span><strong>Хариуцагч:</strong> {item.current_responsible?.name || "Тодорхойгүй"}</span>
                  <span><strong>Нярав:</strong> {item.storekeeper?.name || "Сонгоогүй"}</span>
                  <span><strong>Хүлээн авалт:</strong> {item.receipt_status.label}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>Одоогоор танд оноогдсон худалдан авалтын хүсэлт алга байна.</div>
        )}
      </section>
    </ProcurementShell>
  );
}

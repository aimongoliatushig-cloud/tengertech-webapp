import Link from "next/link";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { requireSession } from "@/lib/auth";
import {
  loadProcurementDashboard,
  loadProcurementMe,
  loadProcurementRequests,
} from "@/lib/procurement";

import styles from "./procurement.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("mn-MN").format(value || 0);
}

export const dynamic = "force-dynamic";

export default async function ProcurementPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) || {};
  const search = getValue(params.search);
  const state = getValue(params.state);
  const flow = getValue(params.flow);
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUser, requestBundle, dashboard] = await Promise.all([
    loadProcurementMe(connectionOverrides),
    loadProcurementRequests(
      {
        scope: "mine",
        search,
        state,
        flow_type: flow,
        limit: 20,
      },
      connectionOverrides,
    ),
    loadProcurementDashboard({}, connectionOverrides),
  ]);

  const filteredTotal = requestBundle.items.length;
  const delayedCount = requestBundle.items.filter((item) => item.is_delayed).length;
  const pendingCount = requestBundle.items.filter((item) => !item.paid || !item.received).length;
  const filterSummary = state || flow || search ? "Шүүлтүүр идэвхтэй" : "Бүх хүсэлт харагдаж байна";

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Миний худалдан авалт"
      description="Төсөл, даалгавартай холбоотой худалдан авалтын хүсэлтүүдээ нэг дэлгэцээс хянаж, шат бүрийн явцыг шууд харна."
      activeTab="list"
    >
      <section className={styles.overviewPanel}>
        <div className={styles.overviewCopy}>
          <p className={styles.overviewEyebrow}>Өнөөдрийн төлөв</p>
          <h2>Хүсэлтүүдээ нэг урсгалаар хянаарай</h2>
          <p>Шүүлтүүр, төлөв, төсөв, гүйцэтгэлийн мэдээллийг нэг хэмнэлтэй харуулж, хамгийн түрүүнд анхаарах хүсэлтүүдийг шууд ялгаж өгнө.</p>
        </div>
        <div className={styles.pillGrid}>
          <article className={styles.pillCard}>
            <span>Энэ хуудсанд</span>
            <strong>{filteredTotal} хүсэлт</strong>
            <small>Таны сонгосон шүүлтүүрээр гарсан дүн</small>
          </article>
          <article className={styles.pillCard}>
            <span>Анхаарах хүсэлт</span>
            <strong>{delayedCount} хоцролттой</strong>
            <small>Хугацаа хэтэрсэн эсвэл гацсан урсгал</small>
          </article>
          <article className={styles.pillCard}>
            <span>Үргэлжилж буй ажил</span>
            <strong>{pendingCount} нээлттэй</strong>
            <small>{filterSummary}</small>
          </article>
        </div>
      </section>

      <section className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span>Нийт хүсэлт</span>
          <strong>{dashboard.metrics.total}</strong>
          <small>Систем дэх бүх урсгал</small>
        </article>
        <article className={styles.metricCard}>
          <span>1 саяас доош</span>
          <strong>{dashboard.metrics.low_flow}</strong>
          <small>Шуурхай санхүүгийн урсгал</small>
        </article>
        <article className={styles.metricCard}>
          <span>1 саяас дээш</span>
          <strong>{dashboard.metrics.high_flow}</strong>
          <small>Тушаал, гэрээтэй урсгал</small>
        </article>
        <article className={styles.metricCard}>
          <span>Хоцорсон</span>
          <strong>{dashboard.metrics.delayed}</strong>
          <small>Хугацаа хэтэрсэн хүсэлт</small>
        </article>
      </section>

      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      <section className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Шүүлтүүр</h2>
            <p>Хүсэлтийн дугаар, төсөл, нийлүүлэгч, төлөв, урсгалын төрлөөр хайна.</p>
          </div>
          {procurementUser.flags.requester || procurementUser.flags.admin ? (
            <Link href="/procurement/new" className={styles.primaryButton}>
              Шинэ хүсэлт
            </Link>
          ) : null}
        </div>
        <form className={styles.filterRow}>
          <label className={styles.fieldLabel}>
            Хайх үг
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder="Дугаар, төсөл, нийлүүлэгч"
            />
          </label>
          <label className={styles.fieldLabel}>
            Төлөв
            <select name="state" defaultValue={state}>
              <option value="">Бүгд</option>
              <option value="draft">Ноорог</option>
              <option value="quotation_waiting">Үнийн санал хүлээж байна</option>
              <option value="quotations_ready">3 үнийн санал оруулсан</option>
              <option value="paid">Төлбөр хийсэн</option>
              <option value="received">Хүлээн авсан</option>
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Урсгал
            <select name="flow" defaultValue={flow}>
              <option value="">Бүгд</option>
              <option value="low">1 саяас доош</option>
              <option value="high">1 саяас дээш</option>
            </select>
          </label>
          <div className={styles.buttonRow}>
            <button type="submit" className={styles.primaryButton}>
              Шүүх
            </button>
            <Link href="/procurement" className={styles.secondaryButton}>
              Цэвэрлэх
            </Link>
          </div>
        </form>
      </section>

      <section className={styles.cardSection}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Хүсэлтийн жагсаалт</h2>
            <p>
              {requestBundle.pagination.total} хүсэлтээс энэ хуудсанд {requestBundle.items.length} хүсэлт харагдаж байна.
            </p>
          </div>
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
                  <span className={styles.badgeOutline}>{item.payment_status.label}</span>
                  <span className={styles.badgeOutline}>{item.receipt_status.label}</span>
                </div>
                <div className={styles.metaList}>
                  <span><strong>Төсөл:</strong> {item.project?.name || "Сонгоогүй"}</span>
                  <span><strong>Нярав:</strong> {item.storekeeper?.name || "Сонгоогүй"}</span>
                  <span><strong>Огноо:</strong> {item.required_date || "Товлоогүй"}</span>
                  <span><strong>Дүн:</strong> {formatMoney(item.selected_supplier_total || item.amount_approx_total)} төг</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>Одоогоор таны хүсэлтийн жагсаалт хоосон байна.</div>
        )}
      </section>
    </ProcurementShell>
  );
}

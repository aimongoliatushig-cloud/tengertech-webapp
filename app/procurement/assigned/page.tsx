import Link from "next/link";
import { redirect } from "next/navigation";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { canAccessProcurementModule, requireSession } from "@/lib/auth";
import {
  createFallbackProcurementUser,
  isProcurementSetupError,
  loadProcurementMe,
  loadProcurementRequests,
  type ProcurementRequestSummary,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

export const dynamic = "force-dynamic";

function createEmptyRequestBundle() {
  return {
    items: [],
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      pages: 1,
    },
  };
}

function getProcurementLoadWarning(error: unknown) {
  return isProcurementSetupError(error)
    ? "Худалдан авалтын backend API хараахан идэвхжээгүй байна. Хариуцсан хүсэлт түр хоосон харагдана."
    : "Худалдан авалтын backend мэдээлэл дуудагдсангүй. Хариуцсан хүсэлт түр хоосон горимоор нээгдэнэ.";
}

function statusClass(item: ProcurementRequestSummary) {
  if (item.is_delayed) return styles.badgeDanger;
  if (item.state.code === "draft" || item.state.code === "submitted" || item.state.code === "quote" || item.state.code === "quote_collection") return styles.badgeWarning;
  if (item.state.code.includes("admin") || item.state.code.includes("ceo")) return styles.badgeBlue;
  if (item.state.code.includes("payment") || item.state.code.includes("received")) return styles.badgeBlue;
  return styles.badge;
}

function getAssignedStatusLabel(item: ProcurementRequestSummary) {
  if (item.state.code === "draft" || item.state.code === "submitted" || item.state.code === "quote" || item.state.code === "quote_collection") {
    return "Санал цуглуулж байна";
  }
  if (item.state.code.includes("admin") || item.state.code.includes("ceo") || item.state.code === "finance_review") {
    return "Шийдвэр хүлээгдэж байна";
  }
  if (item.state.code.includes("contract") || item.state.code.includes("order")) {
    return "Гэрээ боловсруулж байна";
  }
  if (item.state.code.includes("payment")) {
    return "Төлбөр хүлээгдэж байна";
  }
  if (item.state.code === "receiving" || item.state.code === "received" || item.payment_status.code === "payment_recorded") {
    return "Хүлээн авалт хүлээгдэж байна";
  }
  if (item.state.code === "done") return "Дууссан";
  if (item.state.code === "returned") return "Буцаасан";
  if (item.state.code === "cancelled") return "Цуцалсан";
  return item.state.label;
}

function belongsToLane(item: ProcurementRequestSummary, lane: "packages" | "decision" | "payment" | "receiving"): boolean {
  const text = `${item.state.code} ${item.payment_status.code} ${item.receipt_status.code}`.toLowerCase();
  const inPackageStage = item.state.code === "draft" || item.state.code === "submitted" || item.state.code === "quote" || item.state.code === "quote_collection";
  if (lane === "packages") return inPackageStage;
  if (lane === "decision") return !inPackageStage && (text.includes("admin") || text.includes("ceo") || text.includes("contract"));
  if (lane === "payment") {
    const inPaymentStage = item.state.code === "finance_review" || item.state.code === "payment_pending" || text.includes("payment");
    return !inPackageStage && !belongsToLane(item, "decision") && !item.paid && inPaymentStage;
  }
  return item.payment_status.code === "payment_recorded" && item.receipt_status.code !== "received";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("mn-MN").format(value || 0)}₮`;
}

function packageStatus(item: ProcurementRequestSummary) {
  if (!item.package_count) return "Багц үүсгээгүй";
  return item.packages_complete ? `${item.package_count} багц дууссан` : `${item.package_count} багц дутуу`;
}

export default async function AssignedProcurementPage() {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [procurementUserResult, requestBundleResult] = await Promise.all([
    loadProcurementMe(connectionOverrides)
      .then((user) => ({ user, warning: "" }))
      .catch((loadError) => ({
        user: createFallbackProcurementUser(session),
        warning: getProcurementLoadWarning(loadError),
      })),
    loadProcurementRequests({ scope: "assigned", limit: 40 }, connectionOverrides)
      .then((bundle) => ({ bundle, warning: "" }))
      .catch((loadError) => ({
        bundle: createEmptyRequestBundle(),
        warning: getProcurementLoadWarning(loadError),
      })),
  ]);

  const procurementUser = procurementUserResult.user;
  const requestBundle = requestBundleResult.bundle;
  const setupWarning = procurementUserResult.warning || requestBundleResult.warning;
  const items = requestBundle.items;
  const officeClerkMode = procurementUser.flags.office_clerk && !procurementUser.flags.admin;
  const financePackageMode = procurementUser.flags.finance && !procurementUser.flags.admin;
  const officeClerkPackages = items.flatMap((item) =>
    (item.high_value_packages || [])
      .filter((pack) => pack.is_over_threshold && pack.payment_status?.code !== "payment_recorded")
      .map((pack) => ({ item, pack })),
  );
  const financePackages = items.flatMap((item) =>
    (item.high_value_packages || [])
      .filter((pack) => pack.route_state?.code === "payment_pending" && pack.payment_status?.code !== "payment_recorded")
      .map((pack) => ({ item, pack }))
      .concat(
        (item.packages || item.low_value_packages || [])
          .filter(
            (pack) =>
              !pack.is_over_threshold &&
              (pack.route_state?.code === "finance_review" ||
                (pack.is_complete && item.state.code !== "draft" && item.state.code !== "submitted")) &&
              pack.payment_status?.code !== "payment_recorded",
          )
          .map((pack) => ({ item, pack })),
      ),
  );
  const packageCount = items.filter((item) => belongsToLane(item, "packages")).length;
  const delayedCount = items.filter((item) => item.is_delayed).length;
  const readyPackageCount = items.filter((item) => item.packages_complete).length;
  const unresolvedCount = items.filter((item) => !item.paid || !item.received).length;
  const lanes = [
    { key: "packages" as const, title: "Багц, 3 үнийн санал", badge: "Нярав", items: items.filter((item) => belongsToLane(item, "packages")) },
    { key: "decision" as const, title: "Шийдвэр / гэрээ", badge: "Захиргаа", items: items.filter((item) => belongsToLane(item, "decision")) },
    { key: "payment" as const, title: "Төлбөр", badge: "Санхүү", items: items.filter((item) => belongsToLane(item, "payment")) },
    { key: "receiving" as const, title: "Хүлээн авалт", badge: "Нярав", items: items.filter((item) => belongsToLane(item, "receiving")) },
  ];

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Х.Авалтууд"
      description="Танд хамаарах болон няравын шатанд хүлээгдэж байгаа худалдан авалтууд."
      activeTab="assigned"
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}

      <section className={styles.kpiGrid} aria-label="Хариуцсан ажлын үзүүлэлт">
        <article className={styles.kpiCard}>
          <span className={`${styles.metricIcon} ${styles.metricSuccess}`}>{items.length}</span>
          <div>
            <span>Нийт ажил</span>
            <strong>{items.length}</strong>
            <small>Танд хамаарах худалдан авалт</small>
          </div>
        </article>
        <article className={styles.kpiCard}>
          <span className={`${styles.metricIcon} ${styles.metricWarning}`}>{packageCount}</span>
          <div>
            <span>Багц хийх</span>
            <strong>{packageCount}</strong>
            <small>Бараа ангилах, 3 санал оруулах шат</small>
          </div>
        </article>
        <article className={styles.kpiCard}>
          <span className={`${styles.metricIcon} ${styles.metricSuccess}`}>{readyPackageCount}</span>
          <div>
            <span>Багц бэлэн</span>
            <strong>{readyPackageCount}</strong>
            <small>Дараагийн шат руу илгээхэд ойр</small>
          </div>
        </article>
        <article className={styles.kpiCard}>
          <span className={`${styles.metricIcon} ${styles.metricDanger}`}>{delayedCount}</span>
          <div>
            <span>Анхаарах</span>
            <strong>{delayedCount}</strong>
            <small>Хугацаа хэтэрсэн эсвэл саатсан</small>
          </div>
        </article>
        <article className={styles.kpiCard}>
          <span className={`${styles.metricIcon} ${styles.metricBlue}`}>{unresolvedCount}</span>
          <div>
            <span>Дуусаагүй</span>
            <strong>{unresolvedCount}</strong>
            <small>Төлбөр эсвэл хүлээн авалт хүлээгдэж байна</small>
          </div>
        </article>
      </section>

      <section className={styles.assignedLayout}>
        <div className={styles.mainStack}>
          <article className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Ажлын самбар</h2>
                <p>Багц үүсгэхээс хүлээн авалт хүртэлх ажлыг нэг дор харуулна.</p>
              </div>
              <Link href="/procurement/dashboard" className={styles.secondaryButton}>Самбар харах</Link>
            </div>

            {officeClerkMode ? (
              <div className={styles.requestGrid}>
                {officeClerkPackages.length ? (
                  officeClerkPackages.map(({ item, pack }) => (
                    <Link key={`${item.id}-${pack.id}`} href={`/procurement/${item.id}#actions`} className={styles.requestCard}>
                      <div className={styles.requestCardTop}>
                        <div>
                          <strong>{pack.name}</strong>
                          <p>{item.name} · {item.title}</p>
                        </div>
                        <span className={pack.ceo_order_ready ? styles.badge : styles.badgeWarning}>
                          {pack.ceo_order_ready ? "Илгээгдсэн" : "Хүлээгдэж буй"}
                        </span>
                      </div>
                      <div className={styles.metaList}>
                        <span><strong>Дүн:</strong> {formatMoney(pack.amount_total)}</span>
                        <span><strong>Бараа:</strong> {pack.lines.length}</span>
                        <span><strong>Ирсэн:</strong> {item.date_quotation_submitted || "-"}</span>
                        <span><strong>Захиалагч:</strong> {item.requester?.name || "-"}</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <strong>1 саяас дээш тушаал хүлээж буй багц алга</strong>
                  </div>
                )}
              </div>
            ) : financePackageMode ? (
              <div className={styles.requestGrid}>
                {financePackages.length ? (
                  financePackages.map(({ item, pack }) => (
                    <Link key={`${item.id}-${pack.id}`} href={`/procurement/${item.id}#actions`} className={styles.requestCard}>
                      <div className={styles.requestCardTop}>
                        <div>
                          <strong>{pack.name}</strong>
                          <p>{item.name} · {item.title}</p>
                        </div>
                        <span className={pack.is_over_threshold ? styles.badgeWarning : styles.badge}>
                          {pack.is_over_threshold ? "Гэрээний дараах төлбөр" : "Шууд төлбөр"}
                        </span>
                      </div>
                      <div className={styles.metaList}>
                        <span><strong>Дүн:</strong> {formatMoney(pack.amount_total)}</span>
                        <span><strong>Төлөв:</strong> {pack.route_state?.label || "-"}</span>
                        <span><strong>Бараа:</strong> {pack.lines.length}</span>
                        <span><strong>Захиалагч:</strong> {item.requester?.name || "-"}</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <strong>Төлөхөд бэлэн багц алга</strong>
                  </div>
                )}
              </div>
            ) : (
            <div className={styles.workBoard}>
              {lanes.map((lane) => (
                <section key={lane.key} className={styles.workLane}>
                  <div className={styles.tableRowHeader}>
                    <h3>{lane.title}</h3>
                    <span className={styles.badgeOutline}>{lane.items.length}</span>
                  </div>
                  {lane.items.length ? (
                    lane.items.map((item) => (
                      <Link key={`${lane.key}-${item.id}`} href={`/procurement/${item.id}`} className={styles.requestCard}>
                        <div className={styles.requestCardTop}>
                          <div>
                            <strong>{item.name}</strong>
                            <p>{item.title}</p>
                          </div>
                          <span className={statusClass(item)}>{getAssignedStatusLabel(item)}</span>
                        </div>
                        <div className={styles.metaList}>
                          <span><strong>Хэлтэс:</strong> {item.department?.name || "-"}</span>
                          <span><strong>Төрөл:</strong> {item.vehicle?.name ? "Авто сэлбэг / засвар" : "Төслийн худалдан авалт"}</span>
                          <span><strong>Багц:</strong> {packageStatus(item)}</span>
                          <span><strong>Дүн:</strong> {formatMoney(item.selected_supplier_total || item.amount_approx_total)}</span>
                          <span><strong>Хариуцагч:</strong> {item.current_responsible?.name || "-"}</span>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className={styles.emptyState}>
                      <strong>{lane.badge} шатанд ажил алга</strong>
                    </div>
                  )}
                </section>
              ))}
            </div>
            )}
          </article>
        </div>

        <aside className={styles.sideStack}>
          <section className={styles.sidePanel}>
            <h3>Няравын үндсэн дараалал</h3>
            <div className={styles.statusGuide}>
              <div className={styles.statusGuideItem}><span><span className={styles.statusDot} /> Хүсэлт сонгох</span><span className={styles.badge}>1</span></div>
              <div className={styles.statusGuideItem}><span><span className={styles.statusDot} /> Багц үүсгэх</span><span className={styles.badge}>2</span></div>
              <div className={styles.statusGuideItem}><span><span className={`${styles.statusDot} ${styles.dotWarning}`} /> 3 санал + invoice</span><span className={styles.badgeWarning}>3</span></div>
              <div className={styles.statusGuideItem}><span><span className={`${styles.statusDot} ${styles.dotBlue}`} /> Дүгнэлт илгээх</span><span className={styles.badgeBlue}>4</span></div>
              <div className={styles.statusGuideItem}><span><span className={styles.statusDot} /> Хүлээн авах</span><span className={styles.badge}>5</span></div>
            </div>
          </section>
        </aside>
      </section>
    </ProcurementShell>
  );
}

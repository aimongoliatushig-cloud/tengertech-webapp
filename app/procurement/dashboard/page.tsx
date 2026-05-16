import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
  Truck,
  UsersRound,
} from "lucide-react";

import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessProcurementModule, requireSession } from "@/lib/auth";
import {
  createEmptyProcurementDashboard,
  createFallbackProcurementUser,
  isProcurementSetupError,
  loadProcurementDashboard,
  loadProcurementMeta,
  loadProcurementMe,
  type ProcurementPackage,
  type ProcurementRequestSummary,
  type ProcurementUser,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RelationFilter = "all" | "project" | "vehicle";

const STATE_LABELS: Record<string, string> = {
  draft: "Ноорог",
  submitted: "Санал цуглуулж байна",
  quote: "Санал цуглуулж байна",
  quote_collection: "Санал цуглуулж байна",
  quotation_waiting: "Санал цуглуулж байна",
  quotations_ready: "Шийдвэр хүлээгдэж байна",
  finance_review: "Шийдвэр хүлээгдэж байна",
  director_approval: "Шийдвэр хүлээгдэж байна",
  order_waiting: "Гэрээ боловсруулж байна",
  contract_waiting: "Гэрээ боловсруулж байна",
  contract_review: "Гэрээ боловсруулж байна",
  payment: "Төлбөр хүлээгдэж байна",
  payment_waiting: "Төлбөр хүлээгдэж байна",
  paid: "Хүлээн авалт хүлээгдэж байна",
  received: "Хүлээн авалт хүлээгдэж байна",
  done: "Дууссан",
  returned: "Буцаасан",
  rejected: "Татгалзсан",
  cancelled: "Татгалзсан",
};

const STATUS_SUMMARY = [
  { label: "Ноорог", color: "#a8b4ad" },
  { label: "Илгээсэн", color: "#60a5fa" },
  { label: "Санал цуглуулж байна", color: "#fbbf24" },
  { label: "Шийдвэр хүлээгдэж байна", color: "#3c7f68" },
  { label: "Гэрээ боловсруулж байна", color: "#4a9a5d" },
  { label: "Төлбөр хүлээгдэж байна", color: "#fb923c" },
  { label: "Хүлээн авалт хүлээгдэж байна", color: "#14b8a6" },
  { label: "Дууссан", color: "#16a34a" },
  { label: "Буцаасан", color: "#fb7185" },
  { label: "Татгалзсан", color: "#be123c" },
];

const SUMMARY_STATUSES = [
  { label: "Санал цуглуулж байна", color: "#60a5fa" },
  { label: "Шийдвэр хүлээгдэж байна", color: "#3c7f68" },
  { label: "Төлбөр хүлээгдэж байна", color: "#fb923c" },
  { label: "Хүлээн авалт хүлээгдэж байна", color: "#14b8a6" },
  { label: "Дууссан", color: "#48c78e" },
];

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function normalizeRelation(value: string): RelationFilter {
  return value === "project" || value === "vehicle" ? value : "all";
}

function formatMoney(value: number) {
  return `₮ ${new Intl.NumberFormat("mn-MN").format(value || 0)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

function getProcurementLoadWarning(error: unknown) {
  return isProcurementSetupError(error)
    ? "Худалдан авалтын backend API хараахан идэвхжээгүй байна. Самбар түр хоосон горимоор нээгдэнэ."
    : "Худалдан авалтын мэдээлэл дуудагдсангүй. Odoo холболт болон module update-ийг шалгана уу.";
}

function isDepartmentHeadSession(session: Awaited<ReturnType<typeof requireSession>>) {
  return session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
}

function isExecutiveProcurementUser(procurementUser: ProcurementUser) {
  return procurementUser.flags.admin || procurementUser.flags.director || procurementUser.flags.general_manager;
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("mn-MN");
}

function getStatusLabel(item: ProcurementRequestSummary) {
  return STATE_LABELS[item.state.code] || "Илгээсэн";
}

function getRelationType(item: ProcurementRequestSummary) {
  return item.vehicle || item.procurement_type.code === "repair_part" ? "vehicle" : "project";
}

function getRelationLabel(item: ProcurementRequestSummary) {
  return getRelationType(item) === "vehicle" ? "Машин" : "Төсөл";
}

function getRelatedObject(item: ProcurementRequestSummary) {
  return item.vehicle?.name || item.task?.name || item.project?.name || "-";
}

function getNextStep(item: ProcurementRequestSummary) {
  const code = item.state.code;
  if (code === "draft") return "Илгээх";
  if (code.includes("quote") || code.includes("quotation")) return "Нярав: 3 санал оруулах";
  if (code.includes("director") || code.includes("finance_review")) return "Захиргаа: шийдвэр";
  if (code.includes("contract") || code.includes("order")) return "Гэрээ, баримт бичиг";
  if (code.includes("payment") || code === "payment") return "Санхүү: төлбөр хийх";
  if (code.includes("received") || code === "paid") return "Агуулах: хүлээн авах";
  if (code === "done") return "Дууссан";
  return item.current_responsible?.name || "Дараагийн шат хүлээгдэж байна";
}

function statusClass(item: ProcurementRequestSummary) {
  const label = getStatusLabel(item);
  if (item.is_delayed || label === "Буцаасан" || label === "Татгалзсан") return styles.badgeDanger;
  if (label === "Санал цуглуулж байна") return styles.badgeWarning;
  if (label === "Шийдвэр хүлээгдэж байна" || label === "Гэрээ боловсруулж байна") return styles.badgePurple;
  if (label === "Төлбөр хүлээгдэж байна" || label === "Хүлээн авалт хүлээгдэж байна") return styles.badgeBlue;
  return styles.badge;
}

function filterByRelation(items: ProcurementRequestSummary[], relation: RelationFilter) {
  if (relation === "all") return items;
  return items.filter((item) => getRelationType(item) === relation);
}

function filterByDepartment(items: ProcurementRequestSummary[], departmentName?: string | null) {
  if (!departmentName) return items;
  const scoped = normalizeName(departmentName);
  return items.filter((item) => normalizeName(item.department?.name) === scoped);
}

function countStatus(items: ProcurementRequestSummary[], status: string) {
  return items.filter((item) => getStatusLabel(item) === status).length;
}

function getFinanceReadyPackages(items: ProcurementRequestSummary[]) {
  return items.flatMap((item) => {
    const packages = item.packages || [...(item.low_value_packages || []), ...(item.high_value_packages || [])];
    const lowPackages = packages.filter(
      (pack) =>
        !pack.is_over_threshold &&
        pack.payment_status?.code !== "payment_recorded" &&
        (pack.route_state?.code === "finance_review" ||
          (pack.is_complete && !pack.is_over_threshold && item.state.code !== "draft" && item.state.code !== "submitted")),
    );
    const highPackages = packages.filter(
      (pack) => pack.is_over_threshold && pack.route_state?.code === "payment_pending" && pack.payment_status?.code !== "payment_recorded",
    );
    return [...lowPackages, ...highPackages].map((pack) => ({ item, pack }));
  });
}

function getPackagePaymentMode(pack: ProcurementPackage) {
  return pack.is_over_threshold ? "Захирлын сонгосон нэхэмжлэх" : "3 нэхэмжлэхээс сонгоно";
}

function getTotalAmount(item: ProcurementRequestSummary) {
  return item.amount_approx_total || item.selected_supplier_total || 0;
}

function buildDonutStyle(items: ProcurementRequestSummary[]) {
  const total = Math.max(items.length, 1);
  let cursor = 0;
  const parts = SUMMARY_STATUSES.map((status) => {
    const degrees = (countStatus(items, status.label) / total) * 360;
    const start = cursor;
    cursor += degrees;
    return `${status.color} ${start}deg ${cursor}deg`;
  }).filter((part) => !part.endsWith(" 0deg"));

  if (cursor < 360) {
    parts.push(`#e8f2eb ${cursor}deg 360deg`);
  }

  return { background: `conic-gradient(${parts.join(", ")})` };
}

function SummaryCard({
  title,
  href,
  items,
}: {
  title: string;
  href: string;
  items: ProcurementRequestSummary[];
}) {
  return (
    <article className={styles.summaryCard}>
      <div className={styles.sectionHeader}>
        <h2>{title}</h2>
        <Link href={href} className={styles.arrowLink} aria-label={`${title} харах`}>
          →
        </Link>
      </div>
      <div className={styles.donutSummary}>
        <div className={styles.donutChart} style={buildDonutStyle(items)}>
          <div className={styles.donutHole}>
            <strong>{items.length}</strong>
            <span>нийт</span>
          </div>
        </div>
        <div className={styles.legendList}>
          {SUMMARY_STATUSES.map((status) => (
            <div key={status.label} className={styles.legendItem}>
              <span>
                <i style={{ background: status.color }} />
                {status.label}
              </span>
              <strong>{countStatus(items, status.label)}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export const dynamic = "force-dynamic";

export default async function ProcurementDashboardPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const relation = normalizeRelation(getValue(params.relation));
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUser, meta, departmentScopeName, setupWarning] = await Promise.all([
    loadProcurementMe(connectionOverrides).catch(() => createFallbackProcurementUser(session)),
    loadProcurementMeta(connectionOverrides).catch(() => ({ departments: [] })),
    loadSessionDepartmentName(session),
    loadProcurementMe(connectionOverrides)
      .then(() => "")
      .catch((error) => getProcurementLoadWarning(error)),
  ]);
  const isDepartmentHeadView =
    isDepartmentHeadSession(session) && !isExecutiveProcurementUser(procurementUser);
  const isExecutiveView = isExecutiveProcurementUser(procurementUser);
  const isProcurementWorkerView =
    !isExecutiveView &&
    !isDepartmentHeadView &&
    (procurementUser.flags.storekeeper ||
      procurementUser.flags.finance ||
      procurementUser.flags.office_clerk ||
      procurementUser.flags.contract_officer);
  const scopedDepartment = departmentScopeName
    ? meta.departments.find((department) => normalizeName(department.name) === normalizeName(departmentScopeName))
    : null;
  const dashboard = await loadProcurementDashboard(
    {
      scope: isProcurementWorkerView ? "assigned" : "",
      department_id: isDepartmentHeadView ? scopedDepartment?.id || "" : "",
      relation: relation === "all" ? "" : relation,
    },
    connectionOverrides,
  ).catch(() => createEmptyProcurementDashboard());
  const scopedItems = isDepartmentHeadView
    ? filterByDepartment(dashboard.items, departmentScopeName)
    : dashboard.items;
  const items = filterByRelation(scopedItems, relation);
  const financePackageMode = procurementUser.flags.finance && !procurementUser.flags.admin;
  const financeReadyPackages = getFinanceReadyPackages(items);
  const projectItems = scopedItems.filter((item) => getRelationType(item) === "project");
  const vehicleItems = scopedItems.filter((item) => getRelationType(item) === "vehicle");
  const totalAmount = items.reduce((sum, item) => sum + getTotalAmount(item), 0);
  const relationTabs = [
    { href: "/procurement/dashboard", label: "Бүгд", active: relation === "all" },
    { href: "/procurement/dashboard?relation=project", label: "Төслийн худалдан авалт", active: relation === "project" },
    {
      href: "/procurement/dashboard?relation=vehicle",
      label: "Машин / засварын худалдан авалт",
      active: relation === "vehicle",
    },
  ];
  const kpiCards = [
    {
      label: "Нийт хүсэлт",
      value: items.length,
      helper: isDepartmentHeadView ? "Манай хэлтэс" : "Бүх хэлтэс",
      icon: FileText,
      className: styles.metricSuccess,
    },
    {
      label: "Санал цуглуулж байна",
      value: countStatus(items, "Санал цуглуулж байна"),
      helper: "Нярав дээр",
      icon: UsersRound,
      className: styles.metricWarning,
    },
    {
      label: "Шийдвэр хүлээгдэж байна",
      value: countStatus(items, "Шийдвэр хүлээгдэж байна"),
      helper: "Захиргаа / удирдлага",
      icon: UsersRound,
      className: styles.metricPurple,
    },
    {
      label: "Төлбөр хүлээгдэж байна",
      value: financePackageMode ? financeReadyPackages.length : countStatus(items, "Төлбөр хүлээгдэж байна"),
      helper: financePackageMode
        ? formatMoney(financeReadyPackages.reduce((sum, entry) => sum + entry.pack.amount_total, 0))
        : formatMoney(totalAmount),
      icon: Banknote,
      className: styles.metricWarning,
    },
    {
      label: "Хүлээн авалт хүлээгдэж байна",
      value: countStatus(items, "Хүлээн авалт хүлээгдэж байна"),
      helper: "Агуулах / үйлчилгээ",
      icon: Truck,
      className: styles.metricBlue,
    },
    {
      label: "Дууссан",
      value: countStatus(items, "Дууссан"),
      helper: "Хаагдсан хүсэлт",
      icon: CheckCircle2,
      className: styles.metricSuccess,
    },
  ];

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Худалдан авалт"
      description={
        isExecutiveView
          ? "Бүх хэлтсийн худалдан авалтын хүсэлтүүд"
          : "Өөрийн хэлтсийн худалдан авалтын хүсэлтүүд"
      }
      activeTab="dashboard"
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}

      <div className={styles.tabs} aria-label="Худалдан авалтын төрөл">
        {relationTabs.map((tab) => (
          <Link key={tab.label} href={tab.href} className={`${styles.tab} ${tab.active ? styles.tabActive : ""}`}>
            {tab.label}
          </Link>
        ))}
      </div>

      <section className={styles.kpiGrid} aria-label="Худалдан авалтын KPI">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={styles.kpiCard}>
              <span className={`${styles.metricIcon} ${card.className}`}>
                <Icon aria-hidden />
              </span>
              <div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.helper}</small>
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.dashboardLayout}>
        <div className={styles.mainStack}>
          {financePackageMode ? (
            <article className={styles.cardSection}>
              <div className={styles.tableCardHeader}>
                <h2>Төлөх багцууд</h2>
                <span className={styles.badgeWarning}>{financeReadyPackages.length} багц</span>
              </div>
              <div className={styles.requestGrid}>
                {financeReadyPackages.length ? (
                  financeReadyPackages.map(({ item, pack }) => (
                    <Link key={`${item.id}-${pack.id}`} href={`/procurement/${item.id}#actions`} className={styles.requestCard}>
                      <div className={styles.requestCardTop}>
                        <div>
                          <strong>{pack.name}</strong>
                          <p>{item.name} · {item.title}</p>
                        </div>
                        <span className={pack.is_over_threshold ? styles.badgeWarning : styles.badge}>
                          {pack.is_over_threshold ? "1 саяас дээш" : "1 саяас доош"}
                        </span>
                      </div>
                      <div className={styles.metaList}>
                        <span><strong>Дүн:</strong> {formatMoney(pack.amount_total)}</span>
                        <span><strong>Сонголт:</strong> {getPackagePaymentMode(pack)}</span>
                        <span><strong>Төлөв:</strong> {pack.route_state?.label || "-"}</span>
                        <span><strong>Хүсэлт гаргагч:</strong> {item.requester?.name || "-"}</span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <strong>Төлөхөд бэлэн багц алга.</strong>
                  </div>
                )}
              </div>
            </article>
          ) : null}

          <article className={styles.cardSection}>
            <div className={styles.tableCardHeader}>
              <h2>Сүүлийн хүсэлтүүд</h2>
              <div className={styles.tableActions}>
                <select aria-label="Хүсэлтийн төлөв">
                  <option>Бүгд</option>
                  <option>Санал цуглуулж байна</option>
                  <option>Шийдвэр хүлээгдэж байна</option>
                  <option>Дууссан</option>
                </select>
                <button className={styles.secondaryButton} type="button">
                  <Filter aria-hidden />
                  Шүүлтүүр
                </button>
              </div>
            </div>

            <div className={styles.tableShell}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Хүсэлтийн дугаар</th>
                    <th>Гарчиг</th>
                    <th>Төрөл</th>
                    <th>Холбогдсон объект</th>
                    <th>Тооцоолсон дүн</th>
                    <th>Одоогийн төлөв</th>
                    <th>Дараагийн алхам</th>
                    <th>Огноо</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length ? (
                    items.slice(0, 6).map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>
                          <Link href={`/procurement/${item.id}`} className={styles.rowTitle}>
                            {item.name}
                          </Link>
                        </td>
                        <td>{item.title}</td>
                        <td>
                          <span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>
                            {getRelationLabel(item)}
                          </span>
                        </td>
                        <td>{getRelatedObject(item)}</td>
                        <td>{formatMoney(getTotalAmount(item))}</td>
                        <td>
                          <span className={statusClass(item)}>{getStatusLabel(item)}</span>
                        </td>
                        <td>{getNextStep(item)}</td>
                        <td>{formatDate(item.required_date)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9}>Одоогоор хүсэлт бүртгэгдээгүй байна.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.tableFooter}>
              <span>Нийт {items.length} хүсэлт</span>
              <div className={styles.pagination}>
                <span className={styles.pagerButton}>‹</span>
                <span className={`${styles.pagerButton} ${styles.pagerButtonActive}`}>1</span>
                <span className={styles.pagerButton}>2</span>
                <span className={styles.pagerButton}>3</span>
                <span className={styles.pagerButton}>›</span>
              </div>
            </div>
          </article>

          <div className={styles.summaryGrid}>
            <SummaryCard
              title="Төслийн худалдан авалтын хүсэлтүүд"
              href="/procurement?relation=project"
              items={projectItems}
            />
            <SummaryCard
              title="Машин / засварын худалдан авалтын хүсэлтүүд"
              href="/procurement?relation=vehicle"
              items={vehicleItems}
            />
          </div>
        </div>

        <aside className={styles.sideStack}>
          <section className={styles.sidePanel}>
            <h3>Төлөвийн тойм</h3>
            <div className={styles.statusGuide}>
              {STATUS_SUMMARY.map((status) => (
                <div key={status.label} className={styles.statusGuideItem}>
                  <span>
                    <i className={styles.statusDot} style={{ background: status.color }} />
                    {status.label}
                  </span>
                  <span className={styles.statusCount}>{countStatus(items, status.label)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.sidePanel}>
            <h3>Миний хэлтэс</h3>
            <div className={styles.departmentMini}>
              <span className={styles.metricIcon}>
                <ClipboardList aria-hidden />
              </span>
              <div>
                <strong>{isExecutiveView ? "Бүх хэлтэс" : departmentScopeName || "Тодорхойгүй"}</strong>
                <small>{isExecutiveView ? "Нэгдсэн харагдац" : "Хэлтсийн харагдац"}</small>
              </div>
            </div>
          </section>

          <section className={styles.sidePanel}>
            <h3>Сүүлд хийсэн үйлдлүүд</h3>
            <div className={styles.activityList}>
              {items.slice(0, 3).map((item) => (
                <Link key={item.id} href={`/procurement/${item.id}`} className={styles.activityItem}>
                  <span className={styles.metricIcon}>
                    <FileText aria-hidden />
                  </span>
                  <div>
                    <strong>{item.name} хүсэлт {getStatusLabel(item) === "Дууссан" ? "дууслаа." : "шинэчлэгдлээ."}</strong>
                    <small>{item.requester?.name || session.name} · {formatDate(item.required_date)}</small>
                  </div>
                </Link>
              ))}
              {!items.length ? <p className={styles.subtleText}>Сүүлийн үйлдэл бүртгэгдээгүй байна.</p> : null}
            </div>
          </section>
        </aside>
      </section>
    </ProcurementShell>
  );
}

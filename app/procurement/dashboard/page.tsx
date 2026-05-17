import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Filter,
  Flag,
  PlayCircle,
  Search,
  SlidersHorizontal,
  TrendingUp,
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

function getThresholdLabel(item: ProcurementRequestSummary) {
  return item.is_over_threshold || getTotalAmount(item) > 1000000 ? "1 саяас дээш" : "1 саяас доош";
}

function formatStageDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function getActiveStageIndex(item: ProcurementRequestSummary) {
  const code = item.state.code;
  if (code === "done") return 7;
  if (code === "paid" || code === "received" || code === "payment_recorded") return 6;
  if (code.includes("payment")) return 5;
  if (code.includes("contract") || code.includes("order") || code.includes("legal")) return 4;
  if (
    code.includes("director") ||
    code.includes("finance_review") ||
    code.includes("admin") ||
    code.includes("ceo") ||
    code === "quotations_ready"
  ) {
    return 3;
  }
  if (item.selected_supplier || item.selected_quotation_id) return 2;
  if (code.includes("quote") || code.includes("quotation") || code === "submitted") return 1;
  return 0;
}

function getStageDate(item: ProcurementRequestSummary, stageIndex: number) {
  if (stageIndex === 0) return item.required_date;
  if (stageIndex === 1 || stageIndex === 2) return item.date_quotation_submitted;
  if (stageIndex === 3) return item.date_director_decision;
  if (stageIndex === 4) return item.date_contract_signed || item.date_order_issued;
  if (stageIndex === 5) return item.date_paid || item.payment_date;
  if (stageIndex === 6 || stageIndex === 7) return item.date_received;
  return null;
}

function getWorkflowStages(item: ProcurementRequestSummary) {
  const highValue = item.is_over_threshold || getTotalAmount(item) > 1000000;
  const labels = highValue
    ? ["Хүсэлт", "Үнийн санал", "Нийлүүлэгч", "ГЗ шийдвэр", "Гэрээний төсөл", "Төлбөр", "Хүлээн авалт", "Дууссан"]
    : ["Хүсэлт", "Үнийн санал", "Нийлүүлэгч", "Санхүү батлах", "Төлбөр", "Хүлээн авалт", "Дууссан"];
  const currentIndex = getActiveStageIndex(item);
  const normalizedCurrentIndex = highValue
    ? currentIndex
    : currentIndex >= 6
      ? currentIndex - 1
      : currentIndex >= 4
        ? currentIndex - 1
        : currentIndex;
  return labels.map((label, index) => ({
    label,
    date: formatStageDate(getStageDate(item, highValue ? index : index >= 4 ? index + 1 : index)),
    state:
      item.state.code === "done" || index < normalizedCurrentIndex
        ? "done"
        : index === normalizedCurrentIndex
          ? "current"
          : "upcoming",
  }));
}

function StageRail({
  item,
  dense = false,
  forceDone = false,
}: {
  item: ProcurementRequestSummary;
  dense?: boolean;
  forceDone?: boolean;
}) {
  const stages = getWorkflowStages(item);
  return (
    <div className={`${styles.stageRail} ${dense ? styles.stageRailDense : ""}`}>
      {stages.map((stage) => {
        const visualState = forceDone ? "done" : stage.state;
        return (
          <Link
            key={stage.label}
            href={`/procurement/${item.id}`}
            className={`${styles.stageArrow} ${
              visualState === "done"
                ? styles.stageArrowDone
                : visualState === "current"
                  ? styles.stageArrowCurrent
                  : styles.stageArrowUpcoming
            }`}
          >
            <span className={styles.stageCheck}>{visualState === "upcoming" ? "" : "✓"}</span>
            <strong>{stage.label}</strong>
            <small>{forceDone && stage.date === "-" ? formatStageDate(item.date_received) : stage.date}</small>
          </Link>
        );
      })}
    </div>
  );
}

function RequestDetailList({ item, completed = false }: { item: ProcurementRequestSummary; completed?: boolean }) {
  const quotes = item.packages?.reduce((sum, pack) => sum + (pack.quote_count || 0), 0) || 0;
  return (
    <div className={styles.dashboardDetailList}>
      <Link href={`/procurement/${item.id}`} className={styles.dashboardDetailItem}>
        <ClipboardList aria-hidden />
        <span>
          <strong>Хүсэлтийн мэдээлэл</strong>
          <small>Шаардлагатай огноо: {formatDate(item.required_date)} · Төсөв: {formatMoney(getTotalAmount(item))}</small>
        </span>
        <ChevronRight aria-hidden />
      </Link>
      <Link href={`/procurement/${item.id}#quotes`} className={styles.dashboardDetailItem}>
        <UsersRound aria-hidden />
        <span>
          <strong>3 үнийн санал</strong>
          <small>{quotes >= 3 ? `${quotes} санал бүртгэгдсэн` : "Үнийн санал бүрдүүлж байна"}</small>
        </span>
        <ChevronRight aria-hidden />
      </Link>
      <Link href={`/procurement/${item.id}#packages`} className={styles.dashboardDetailItem}>
        <Truck aria-hidden />
        <span>
          <strong>Сонгосон нийлүүлэгч</strong>
          <small>{item.selected_supplier?.name || "Нийлүүлэгч сонгох шатанд"}</small>
        </span>
        <ChevronRight aria-hidden />
      </Link>
      <Link href={`/procurement/${item.id}`} className={styles.dashboardDetailItem}>
        <Flag aria-hidden />
        <span>
          <strong>{completed ? "Дууссан огноо" : "Дараагийн алхам"}</strong>
          <small>{completed ? formatDate(item.date_received) : getNextStep(item)}</small>
        </span>
        <ChevronRight aria-hidden />
      </Link>
    </div>
  );
}

function CompletedDetailPanel({ item }: { item?: ProcurementRequestSummary }) {
  if (!item) {
    return (
      <section className={styles.completedDrawer}>
        <h2>Дууссан худалдан авалт</h2>
        <p className={styles.subtleText}>Дууссан хүсэлт сонгогдоогүй байна.</p>
      </section>
    );
  }

  return (
    <section className={styles.completedDrawer}>
      <div className={styles.completedDrawerHeader}>
        <div>
          <span className={styles.dashboardEyebrow}>Дууссан худалдан авалт</span>
          <h2>{item.name}</h2>
          <p>{item.title}</p>
        </div>
        <Link href={`/procurement/${item.id}`} className={styles.iconActionLink} aria-label={`${item.name} нээх`}>
          <ChevronRight aria-hidden />
        </Link>
      </div>
      <div className={styles.completedDrawerMeta}>
        <span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>{getRelationLabel(item)}</span>
        <span className={getThresholdLabel(item) === "1 саяас дээш" ? styles.badgeWarning : styles.badge}>
          {getThresholdLabel(item)}
        </span>
        <strong>{formatMoney(getTotalAmount(item))}</strong>
      </div>
      <StageRail item={item} dense forceDone />
      <RequestDetailList item={item} completed />
      <div className={styles.completedFactGrid}>
        <div>
          <span>Гэрээ баталгаажсан</span>
          <strong>{formatDate(item.date_contract_signed || item.date_order_issued)}</strong>
        </div>
        <div>
          <span>Төлбөр төлөгдсөн</span>
          <strong>{formatDate(item.date_paid || item.payment_date)}</strong>
        </div>
        <div>
          <span>Хүлээн авсан</span>
          <strong>{formatDate(item.date_received)}</strong>
        </div>
        <div>
          <span>Дууссан огноо</span>
          <strong>{formatDate(item.date_received)}</strong>
        </div>
      </div>
    </section>
  );
}

function MobileProcurementCard({ item, expanded = false }: { item: ProcurementRequestSummary; expanded?: boolean }) {
  const completed = item.state.code === "done";
  return (
    <article className={`${styles.mobileProcurementCard} ${completed ? styles.mobileProcurementCardDone : ""}`}>
      {completed ? <span className={styles.dashboardEyebrow}>Дууссан худалдан авалт</span> : null}
      <div className={styles.mobileRequestHead}>
        <div>
          <h3>{item.name}</h3>
          <p>{item.title}</p>
          <small>{item.current_responsible?.name || item.requester?.name || "Хариуцагч тодорхойгүй"}</small>
        </div>
        <div className={styles.mobileAmount}>
          <span className={statusClass(item)}>{getStatusLabel(item)}</span>
          <strong>{formatMoney(getTotalAmount(item))}</strong>
        </div>
      </div>
      <div className={styles.mobileBadgeRow}>
        <span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>{getRelationLabel(item)}</span>
        <span className={getThresholdLabel(item) === "1 саяас дээш" ? styles.badgeWarning : styles.badge}>
          {getThresholdLabel(item)}
        </span>
      </div>
      <StageRail item={item} dense forceDone={completed} />
      {expanded || completed ? <RequestDetailList item={item} completed={completed} /> : null}
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
  const completedItems = items.filter((item) => item.state.code === "done" || getStatusLabel(item) === "Дууссан");
  const activeItems = items.filter(
    (item) => item.state.code !== "done" && !["rejected", "cancelled"].includes(item.state.code),
  );
  const lowValueItems = items.filter((item) => getThresholdLabel(item) === "1 саяас доош");
  const highValueItems = items.filter((item) => getThresholdLabel(item) === "1 саяас дээш");
  const expandedActiveItem = activeItems[1] || activeItems[0];
  const openedCompletedItem = completedItems[0];
  const relationTabs = [
    { href: "/procurement/dashboard", label: "Бүгд", active: relation === "all" },
    { href: "/procurement/dashboard?relation=project", label: "Төсөл", active: relation === "project" },
    {
      href: "/procurement/dashboard?relation=vehicle",
      label: "Тээврийн хэрэгсэл",
      active: relation === "vehicle",
    },
  ];
  const kpiCards = [
    {
      label: "Нийт хүсэлт",
      value: items.length,
      helper: "Бүгд харагдац",
      icon: FileText,
      className: styles.metricSuccess,
    },
    {
      label: "Идэвхтэй",
      value: activeItems.length,
      helper: "Явагдаж буй",
      icon: PlayCircle,
      className: styles.metricSuccess,
    },
    {
      label: "Дууссан",
      value: completedItems.length,
      helper: "Дууссан",
      icon: CheckCircle2,
      className: styles.metricPurple,
    },
    {
      label: "1 саяас доош",
      value: lowValueItems.length,
      helper: formatMoney(lowValueItems.reduce((sum, item) => sum + getTotalAmount(item), 0)),
      icon: Banknote,
      className: styles.metricSuccess,
    },
    {
      label: "1 саяас дээш",
      value: highValueItems.length,
      helper: formatMoney(highValueItems.reduce((sum, item) => sum + getTotalAmount(item), 0)),
      icon: TrendingUp,
      className: styles.metricWarning,
    },
    {
      label: "Төсөлтэй холбоотой",
      value: projectItems.length,
      helper: formatMoney(projectItems.reduce((sum, item) => sum + getTotalAmount(item), 0)),
      icon: Building2,
      className: styles.metricSuccess,
    },
    {
      label: "Тээврийн хэрэгсэлтэй",
      value: vehicleItems.length,
      helper: formatMoney(vehicleItems.reduce((sum, item) => sum + getTotalAmount(item), 0)),
      icon: Truck,
      className: styles.metricBlue,
    },
    {
      label: "Төлбөр хүлээгдэж байна",
      value: financePackageMode ? financeReadyPackages.length : countStatus(items, "Төлбөр хүлээгдэж байна"),
      helper: financePackageMode ? "Төлөх багц" : formatMoney(totalAmount),
      icon: Banknote,
      className: styles.metricWarning,
    },
  ];

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Худалдан авалтын хяналтын самбар"
      description={
        isExecutiveView
          ? "Бүх хэлтсийн худалдан авалтын хүсэлтүүд"
          : "Өөрийн хэлтсийн худалдан авалтын хүсэлтүүд"
      }
      activeTab="dashboard"
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}

      <section className={styles.dashboardCommandBar}>
        <div className={styles.dashboardSearch}>
          <Search aria-hidden />
          <input type="search" placeholder="Хайх..." aria-label="Хайх" />
        </div>
        <button className={styles.filterIconButton} type="button" aria-label="Дэлгэрэнгүй шүүлтүүр">
          <SlidersHorizontal aria-hidden />
        </button>
      </section>

      <section className={styles.dashboardKpiGrid} aria-label="Худалдан авалтын KPI">
        {kpiCards.slice(0, 7).map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={styles.dashboardKpiCard}>
              <span className={`${styles.metricIcon} ${card.className}`}>
                <Icon aria-hidden />
              </span>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.helper}</small>
            </article>
          );
        })}
      </section>

      <div className={styles.dashboardFilterTabs} aria-label="Худалдан авалтын төрөл">
        {relationTabs.map((tab) => (
          <Link key={tab.label} href={tab.href} className={`${styles.dashboardFilterTab} ${tab.active ? styles.dashboardFilterTabActive : ""}`}>
            {tab.label}
          </Link>
        ))}
        <Link href="/procurement/dashboard" className={styles.dashboardFilterTab}>Идэвхтэй</Link>
        <Link href="/procurement/dashboard" className={styles.dashboardFilterTab}>Дууссан</Link>
        <Link href="/procurement/dashboard" className={styles.dashboardFilterTab}>≤ 1,000,000₮</Link>
        <Link href="/procurement/dashboard" className={styles.dashboardFilterTab}>{">"} 1,000,000₮</Link>
      </div>

      <section className={styles.procurementDashboardGrid}>
        <div className={styles.procurementDashboardMain}>
          {financePackageMode ? (
            <article className={styles.cardSection}>
              <div className={styles.tableCardHeader}>
                <h2>Төлөх багцууд</h2>
                <span className={styles.badgeWarning}>{financeReadyPackages.length} багц</span>
              </div>
              <div className={styles.requestGrid}>
                {financeReadyPackages.length ? (
                  financeReadyPackages.map(({ item, pack }) => (
                    <Link key={`${item.id}-${pack.id}`} href={`/procurement/${item.id}?package_id=${pack.id}#packages`} className={styles.requestCard}>
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

          <article className={styles.procurementBoard}>
            <div className={styles.dashboardSectionHeader}>
              <div>
                <h2>Идэвхтэй худалдан авалт ({activeItems.length})</h2>
                <p>Одоогийн шат нь суман явц дээр тодорч харагдана.</p>
              </div>
              <div className={styles.tableActions}>
                <button className={styles.secondaryButton} type="button">
                  <Filter aria-hidden />
                  Дэлгэрэнгүй шүүлтүүр
                </button>
              </div>
            </div>

            <div className={styles.procurementTableShell}>
              <table className={styles.procurementProgressTable}>
                <thead>
                  <tr>
                    <th>Хүсэлтийн код</th>
                    <th>Ангилал</th>
                    <th>Хэмжээний босго</th>
                    <th>Төлөв</th>
                    <th>Дүн (₮)</th>
                    <th>Холбогдох төсөл / хөрөнгө</th>
                    <th>Хариуцсан албан тушаалтан</th>
                    <th>Дараагийн алхам</th>
                  </tr>
                </thead>
                <tbody>
                  {activeItems.length ? (
                    activeItems.slice(0, 5).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link href={`/procurement/${item.id}`} className={styles.rowTitle}>
                            {item.name}
                          </Link>
                        </td>
                        <td>
                          <span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>
                            {getRelationLabel(item)}
                          </span>
                        </td>
                        <td>
                          <span className={getThresholdLabel(item) === "1 саяас дээш" ? styles.badgeWarning : styles.badge}>
                            {getThresholdLabel(item)}
                          </span>
                        </td>
                        <td><span className={statusClass(item)}>{getStatusLabel(item)}</span></td>
                        <td>{formatMoney(getTotalAmount(item))}</td>
                        <td>{getRelatedObject(item)}</td>
                        <td>{item.current_responsible?.name || item.requester?.name || "-"}</td>
                        <td>{getNextStep(item)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8}>Одоогоор идэвхтэй хүсэлт бүртгэгдээгүй байна.</td>
                    </tr>
                  )}
                </tbody>
                <tbody className={styles.stageTableBody}>
                  {activeItems.slice(0, 5).map((item) => (
                    <tr key={`${item.id}-stages`}>
                      <td colSpan={8}>
                        <StageRail item={item} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {expandedActiveItem ? (
              <div className={styles.inlineExpandedPanel}>
                <div>
                  <span className={styles.dashboardEyebrow}>Нээлттэй идэвхтэй хүсэлт</span>
                  <h3>{expandedActiveItem.name}</h3>
                  <p>{expandedActiveItem.title}</p>
                </div>
                <RequestDetailList item={expandedActiveItem} />
              </div>
            ) : null}

            <div className={styles.mobileProcurementList}>
              {activeItems.slice(0, 5).map((item) => (
                <MobileProcurementCard key={item.id} item={item} expanded={expandedActiveItem?.id === item.id} />
              ))}
              {!activeItems.length ? <div className={styles.emptyState}>Идэвхтэй худалдан авалт алга.</div> : null}
            </div>
          </article>

          <article className={styles.completedBoard}>
            <div className={styles.dashboardSectionHeader}>
              <div>
                <h2>Дууссан худалдан авалт ({completedItems.length})</h2>
                <p>Нээгдсэн дууссан хүсэлт дээр бүх шат, огноо бүрэн харагдана.</p>
              </div>
            </div>
            <div className={styles.completedTableShell}>
              <table className={styles.completedTable}>
                <thead>
                  <tr>
                    <th>Хүсэлтийн код</th>
                    <th>Ангилал</th>
                    <th>Хэмжээний босго</th>
                    <th>Төлөв</th>
                    <th>Дүн (₮)</th>
                    <th>Холбогдох төсөл / хөрөнгө</th>
                    <th>Дууссан огноо</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {completedItems.slice(0, 4).map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td><span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>{getRelationLabel(item)}</span></td>
                      <td>
                        <span className={getThresholdLabel(item) === "1 саяас дээш" ? styles.badgeWarning : styles.badge}>
                          {getThresholdLabel(item)}
                        </span>
                      </td>
                      <td><span className={styles.badge}>Дууссан</span></td>
                      <td>{formatMoney(getTotalAmount(item))}</td>
                      <td>{getRelatedObject(item)}</td>
                      <td>{formatDate(item.date_received)}</td>
                      <td>
                        <Link href={`/procurement/${item.id}`} className={styles.iconActionLink} aria-label={`${item.name} харах`}>
                          <ChevronRight aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!completedItems.length ? (
                    <tr>
                      <td colSpan={8}>Дууссан худалдан авалт бүртгэгдээгүй байна.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileProcurementList}>
              {completedItems.slice(0, 2).map((item) => (
                <MobileProcurementCard key={item.id} item={item} expanded />
              ))}
            </div>
          </article>
        </div>

        <aside className={styles.procurementDashboardAside}>
          <CompletedDetailPanel item={openedCompletedItem} />

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
        </aside>
      </section>

    </ProcurementShell>
  );
}

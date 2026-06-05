import Link from "next/link";
import { redirect } from "next/navigation";

import { ProcurementStateFilterSelect } from "@/app/procurement/_components/procurement-state-filter-select";
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
  loadProcurementRequests,
  type ProcurementMeta,
  type ProcurementRequestSummary,
  type ProcurementUser,
} from "@/lib/procurement";

import styles from "./procurement.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RelationFilter = "all" | "project" | "vehicle";

const STATE_LABELS: Record<string, string> = {
  draft: "Ноорог",
  submitted: "Хүсэлт илгээгдсэн",
  quote: "Үнийн санал бүртгэгдсэн",
  quote_collection: "Үнийн санал бүртгэгдсэн",
  quotation_waiting: "Үнийн санал бүртгэгдсэн",
  quotations_ready: "Хуулийн мэргэжилтэнд илгээсэн",
  admin_review: "Хуулийн мэргэжилтэнд илгээсэн",
  ceo_decision: "Тушаал батлуулах шатанд",
  ceo_order_uploaded: "Тушаал батлагдсан",
  finance_review: "Төлбөрийн хяналтанд",
  director_approval: "Тушаал батлуулах шатанд",
  order_waiting: "Тушаал батлуулах шатанд",
  contract_waiting: "Гэрээ, тушаалын төсөл боловсруулж байна",
  contract_review: "Гэрээ, тушаалын төсөл боловсруулж байна",
  legal_contract_draft: "Гэрээ, тушаалын төсөл боловсруулж байна",
  legal_final_contract: "Гэрээ дууссан",
  payment: "Төлбөрийн хяналтанд",
  payment_pending: "Төлбөрийн хяналтанд",
  payment_waiting: "Төлбөрийн хяналтанд",
  paid: "Төлбөр төлөгдсөн",
  payment_recorded: "Төлбөр төлөгдсөн",
  received: "Хүлээн авалт хүлээгдэж байна",
  done: "Дууссан",
  returned: "Буцаасан",
  rejected: "Татгалзсан",
  cancelled: "Татгалзсан",
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

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

function createEmptyProcurementMeta(): ProcurementMeta {
  return {
    projects: [],
    tasks: [],
    vehicles: [],
    departments: [],
    storekeepers: [],
    suppliers: [],
    uoms: [],
  };
}

function getProcurementLoadWarning(error: unknown) {
  return isProcurementSetupError(error)
    ? "Худалдан авалтын backend API хараахан идэвхжээгүй байна. Жагсаалт түр хоосон харагдана."
    : "Худалдан авалтын backend мэдээлэл дуудагдсангүй. Жагсаалт түр хоосон горимоор нээгдэнэ.";
}

function isDepartmentHeadSession(session: Awaited<ReturnType<typeof requireSession>>) {
  return session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
}

function isExecutiveProcurementUser(procurementUser: ProcurementUser) {
  return procurementUser.flags.admin || procurementUser.flags.director || procurementUser.flags.general_manager;
}

function isProcurementWorkerUser(procurementUser: ProcurementUser) {
  return Boolean(
    procurementUser.flags.storekeeper ||
      procurementUser.flags.finance ||
      procurementUser.flags.office_clerk ||
      procurementUser.flags.contract_officer,
  );
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("mn-MN");
}

function getStatusLabel(item: ProcurementRequestSummary) {
  const packages = item.packages || [...(item.low_value_packages || []), ...(item.high_value_packages || [])];
  const allReceived =
    item.receipt_status.code === "received" ||
    item.state.code === "done" ||
    Boolean(packages.length && packages.every((pack) => pack.receipt_status?.code === "received" || pack.route_state?.code === "done"));
  if (allReceived) return "Дууссан";
  const paidAwaitingReceipt =
    item.payment_status.code === "payment_recorded" ||
    item.state.code === "payment_recorded" ||
    item.state.code === "paid" ||
    packages.some((pack) => pack.payment_status?.code === "payment_recorded" || pack.route_state?.code === "payment_recorded");
  if (paidAwaitingReceipt) return "Хүлээн авалт хүлээгдэж байна";
  return STATE_LABELS[item.state.code] || item.state.label || "Илгээсэн";
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
  if (code.includes("quote") || code.includes("quotation")) return "Нярав: үнийн санал бүртгэх";
  if (code === "legal_contract_draft") return "Хуулийн мэргэжилтэн: гэрээ, тушаалын төсөл";
  if (code.includes("director") || code === "ceo_decision") return "Архив бичиг хэргийн ажилтан: тушаал батлуулах";
  if (code === "ceo_order_uploaded" || code === "legal_final_contract") return "Хуулийн мэргэжилтэн: эцсийн гэрээ";
  if (code.includes("payment") || code === "payment") return "Ерөнхий ня-бо: төлбөр хийх";
  if (code.includes("received") || code === "paid") return "Нярав: хүлээн авалт";
  if (code === "done") return "Дууссан";
  if (code === "returned") return "Засварлах";
  if (code === "rejected" || code === "cancelled") return "Хаагдсан";
  return item.current_responsible?.name || "Дараагийн шат хүлээгдэж байна";
}

function statusClass(item: ProcurementRequestSummary) {
  const label = getStatusLabel(item);
  if (item.is_delayed || label === "Буцаасан" || label === "Татгалзсан") return styles.badgeDanger;
  if (label === "Үнийн санал бүртгэгдсэн") return styles.badgeWarning;
  if (label === "Тушаал батлуулах шатанд" || label === "Гэрээ, тушаалын төсөл боловсруулж байна") return styles.badgePurple;
  if (label === "Төлбөрийн хяналтанд" || label === "Төлбөр төлөгдсөн" || label === "Хүлээн авалт хүлээгдэж байна") return styles.badgeBlue;
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

export const dynamic = "force-dynamic";

export default async function ProcurementPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const search = getValue(params.search);
  const state = getValue(params.state);
  const relation = (getValue(params.relation) || "all") as RelationFilter;
  const requestedDepartmentId = getValue(params.department_id);
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUser, meta, departmentScopeName, setupWarning] = await Promise.all([
    loadProcurementMe(connectionOverrides).catch(() => createFallbackProcurementUser(session)),
    loadProcurementMeta(connectionOverrides).catch(() => createEmptyProcurementMeta()),
    loadSessionDepartmentName(session),
    loadProcurementMe(connectionOverrides)
      .then(() => "")
      .catch((loadError) => getProcurementLoadWarning(loadError)),
  ]);

  const isDepartmentHeadView =
    isDepartmentHeadSession(session) &&
    !isExecutiveProcurementUser(procurementUser) &&
    !isProcurementWorkerUser(procurementUser);
  const isExecutiveView = isExecutiveProcurementUser(procurementUser);
  const isStorekeeperView =
    !isExecutiveView &&
    !isDepartmentHeadView &&
    (procurementUser.flags.storekeeper ||
      Boolean(session.groupFlags?.procurementStorekeeper) ||
      Boolean(session.groupFlags?.procurementPurchaseManager) ||
      Boolean(session.groupFlags?.fleetRepairPurchaser) ||
      Boolean(session.groupFlags?.opsStorekeeper));
  const isProcurementWorkerView =
    !isExecutiveView &&
    !isDepartmentHeadView &&
    (isStorekeeperView ||
      procurementUser.flags.finance ||
      procurementUser.flags.office_clerk ||
      procurementUser.flags.contract_officer);
  const requestScope = isExecutiveView ? "all" : isProcurementWorkerView ? "assigned" : "mine";
  const scopedDepartment = departmentScopeName
    ? meta.departments.find((department) => normalizeName(department.name) === normalizeName(departmentScopeName))
    : null;
  const departmentId = isDepartmentHeadView
    ? String(scopedDepartment?.id || "")
    : isProcurementWorkerView
      ? ""
      : requestedDepartmentId;

  const [requestBundle, dashboard] = await Promise.all([
    loadProcurementRequests(
      {
        scope: requestScope,
        search,
        state,
        relation: relation === "all" ? "" : relation,
        department_id: departmentId,
        limit: 20,
      },
      connectionOverrides,
    ).catch(() => createEmptyRequestBundle()),
    loadProcurementDashboard(
      {
        scope: requestScope,
        department_id: departmentId,
        relation: relation === "all" ? "" : relation,
      },
      connectionOverrides,
    ).catch(() => createEmptyProcurementDashboard()),
  ]);

  const departmentFilteredItems = isDepartmentHeadView
    ? filterByDepartment(requestBundle.items, departmentScopeName)
    : requestBundle.items;
  const items = filterByRelation(departmentFilteredItems, relation);
  const dashboardItems = filterByRelation(
    isDepartmentHeadView ? filterByDepartment(dashboard.items, departmentScopeName) : dashboard.items,
    relation,
  );
  const kpiItems = dashboardItems.length ? dashboardItems : items;
  const activeFilterCount = [search, state, relation !== "all" ? relation : "", departmentId].filter(Boolean).length;
  const relationTabs = [
    { href: "/procurement", label: "Бүгд", active: relation === "all" },
    { href: "/procurement?relation=project", label: "Төслийн худалдан авалт", active: relation === "project" },
    { href: "/procurement?relation=vehicle", label: "Машин / засварын худалдан авалт", active: relation === "vehicle" },
  ];

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title={
        isExecutiveView
          ? "Бүх хэлтсийн худалдан авалт"
          : isProcurementWorkerView
            ? "Хариуцсан худалдан авалтууд"
            : "Өөрийн хэлтсийн худалдан авалт"
      }
      description={
        isExecutiveView
          ? "Хүсэлтүүдийг хэлтэс, төрөл, төлөвөөр хянана."
          : isProcurementWorkerView
            ? "Танд хуваарилагдсан болон таны үүргийн шатанд хүлээгдэж буй худалдан авалтын хүсэлтүүд."
            : "Зөвхөн өөрийн хэлтсийн төсөл болон машин/засвартай холбоотой худалдан авалтын хүсэлтүүд."
      }
      activeTab="list"
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}
      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      <div className={styles.tabs} aria-label="Худалдан авалтын төрөл">
        {relationTabs.map((tab) => (
          <Link key={tab.label} href={tab.href} className={`${styles.tab} ${tab.active ? styles.tabActive : ""}`}>
            {tab.label}
          </Link>
        ))}
      </div>

      <section className={styles.kpiGrid} aria-label="Худалдан авалтын төлөв">
        {[
          ["Нийт хүсэлт", kpiItems.length, styles.metricSuccess],
          ["Санал цуглуулж байна", countStatus(kpiItems, "Санал цуглуулж байна"), styles.metricWarning],
          ["Шийдвэр хүлээгдэж байна", countStatus(kpiItems, "Шийдвэр хүлээгдэж байна"), styles.metricPurple],
          ["Төлбөр хүлээгдэж байна", countStatus(kpiItems, "Төлбөр хүлээгдэж байна"), styles.metricWarning],
          ["Хүлээн авалт хүлээгдэж байна", countStatus(kpiItems, "Хүлээн авалт хүлээгдэж байна"), styles.metricBlue],
          ["Дууссан", countStatus(kpiItems, "Дууссан"), styles.metricSuccess],
        ].map(([label, value, iconClass]) => (
          <article key={String(label)} className={styles.kpiCard}>
            <span className={`${styles.metricIcon} ${iconClass}`}>№</span>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{isDepartmentHeadView ? "Манай хэлтэс" : "Идэвхтэй харагдац"}</small>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.listLayout}>
        <div className={styles.mainStack}>
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Сүүлийн хүсэлтүүд</h2>
                <p>{requestBundle.pagination.total} хүсэлтээс энэ хуудас дээр {items.length} мөр харагдаж байна.</p>
              </div>
              {procurementUser.flags.requester || procurementUser.flags.admin ? (
                <Link href="/procurement/new" className={styles.primaryButton}>Шинэ хүсэлт үүсгэх</Link>
              ) : null}
            </div>

            <form className={styles.filterRow}>
              <label className={styles.fieldLabel}>
                Хайх
                <input type="search" name="search" defaultValue={search} placeholder="Дугаар, гарчиг, объект" />
              </label>
              {!isDepartmentHeadView && !isProcurementWorkerView ? (
                <label className={styles.fieldLabel}>
                  Хэлтэс
                  <select name="department_id" defaultValue={departmentId}>
                    <option value="">Бүгд</option>
                    {meta.departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className={styles.fieldLabel}>
                Статус
                <ProcurementStateFilterSelect defaultValue={state} />
              </label>
              <input type="hidden" name="relation" value={relation === "all" ? "" : relation} />
              <div className={styles.buttonRow}>
                <button type="submit" className={styles.primaryButton}>Шүүлтүүр</button>
                <Link href="/procurement" className={styles.secondaryButton}>Цэвэрлэх</Link>
              </div>
            </form>

            <div className={styles.tableShell}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Хүсэлтийн дугаар</th>
                    <th>Гарчиг</th>
                    <th>Төрөл</th>
                    <th>Холбогдсон объект</th>
                    <th>Одоогийн төлөв</th>
                    <th>Дараагийн алхам</th>
                    <th>Огноо</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length ? (
                    items.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>
                          <Link href={`/procurement/${item.id}`} className={styles.rowTitle}>
                            {item.name}
                            <small>{item.requester?.name || "Хүсэлт гаргагч тодорхойгүй"}</small>
                          </Link>
                        </td>
                        <td>{item.title}</td>
                        <td><span className={getRelationType(item) === "vehicle" ? styles.badgeBlue : styles.badge}>{getRelationLabel(item)}</span></td>
                        <td>{getRelatedObject(item)}</td>
                        <td><span className={statusClass(item)}>{getStatusLabel(item)}</span></td>
                        <td>{getNextStep(item)}</td>
                        <td>{formatDate(item.required_date)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8}>Одоогоор хүсэлт олдсонгүй. Шүүлтүүрээ өөрчлөх эсвэл шинэ хүсэлт үүсгэнэ үү.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span className={styles.badgeOutline}>Хуудас {requestBundle.pagination.page}</span>
              <span className={styles.badgeOutline}>Нийт {requestBundle.pagination.pages} хуудас</span>
              <span className={styles.badgeOutline}>{activeFilterCount} шүүлтүүр</span>
            </div>
          </section>
        </div>

        <aside className={styles.sideStack}>
          <section className={styles.sidePanel}>
            <h3>Төлөвийн тойм</h3>
            <div className={styles.statusGuide}>
              {["Ноорог", "Илгээсэн", "Санал цуглуулж байна", "Шийдвэр хүлээгдэж байна", "Гэрээ боловсруулж байна", "Төлбөр хүлээгдэж байна", "Хүлээн авалт хүлээгдэж байна", "Дууссан", "Буцаасан", "Татгалзсан"].map((label) => (
                <div key={label} className={styles.statusGuideItem}>
                  <span><span className={styles.statusDot} /> {label}</span>
                  <span className={styles.badgeOutline}>{countStatus(kpiItems, label)}</span>
                </div>
              ))}
            </div>
          </section>

          {isDepartmentHeadView ? (
            <section className={styles.sidePanel}>
              <h3>Миний хэлтэс</h3>
              <div className={styles.infoCard}>
                <span>Харагдаж буй хэлтэс</span>
                <strong>{departmentScopeName || "Тодорхойгүй"}</strong>
              </div>
            </section>
          ) : null}
        </aside>
      </section>
    </ProcurementShell>
  );
}

import { redirect } from "next/navigation";

import { ProcurementDashboardClient } from "@/app/procurement/_components/procurement-dashboard-client";
import { ProcurementShell } from "@/app/procurement/_components/procurement-shell";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessProcurementModule, requireSession } from "@/lib/auth";
import {
  createEmptyProcurementDashboard,
  createFallbackProcurementUser,
  isProcurementSetupError,
  loadProcurementDashboard,
  loadProcurementMe,
  loadProcurementMeta,
  loadProcurementRequests,
  type ProcurementMeta,
  type ProcurementRequestDetail,
  type ProcurementRequestSummary,
  type ProcurementUser,
} from "@/lib/procurement";

import styles from "../procurement.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
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

function emptyMeta(): ProcurementMeta {
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

function filterByDepartment(items: ProcurementRequestSummary[], departmentName?: string | null) {
  if (!departmentName) return items;
  const scoped = normalizeName(departmentName);
  return items.filter((item) => normalizeName(item.department?.name) === scoped);
}

function createDetailFallback(item: ProcurementRequestSummary): ProcurementRequestDetail {
  return {
    ...item,
    lines: [],
    quotations: [],
    packages: item.packages || [...(item.low_value_packages || []), ...(item.high_value_packages || [])],
    unassigned_lines: [],
    documents: [],
    audit: [],
    attachments: [],
  };
}

function uniqueById(items: ProcurementRequestSummary[]) {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function shouldShowOfficeClerkBacklog(item: ProcurementRequestDetail) {
  if (!["quote_collection", "quotations_ready", "legal_contract_draft"].includes(item.state.code)) return false;
  if (item.state.code === "legal_contract_draft") {
    return item.packages.some((pack) => pack.is_over_threshold || pack.amount_total > 1000000);
  }
  const unassignedCount =
    item.unassigned_lines?.length ??
    item.lines.filter((line) => !line.package_id).length;
  if (unassignedCount > 0) return false;
  return item.packages.some(
    (pack) =>
      pack.is_complete &&
      !pack.ceo_order_ready &&
      (pack.is_over_threshold || pack.amount_total > 1000000),
  );
}

export const dynamic = "force-dynamic";

export default async function ProcurementDashboardPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canAccessProcurementModule(session)) {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  const [procurementUserResult, meta, departmentScopeName] = await Promise.all([
    loadProcurementMe(connectionOverrides)
      .then((user) => ({ user, warning: "" }))
      .catch((loadError) => ({
        user: createFallbackProcurementUser(session),
        warning: getProcurementLoadWarning(loadError),
      })),
    loadProcurementMeta(connectionOverrides).catch(() => emptyMeta()),
    loadSessionDepartmentName(session),
  ]);
  const procurementUser = procurementUserResult.user;
  const setupWarning = procurementUserResult.warning;

  const isDepartmentHeadView =
    isDepartmentHeadSession(session) &&
    !isExecutiveProcurementUser(procurementUser) &&
    !isProcurementWorkerUser(procurementUser);
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
    },
    connectionOverrides,
  ).catch(() => createEmptyProcurementDashboard());
  const officeClerkBacklogItems =
    procurementUser.flags.office_clerk && isProcurementWorkerView
      ? await Promise.all(
          ["quote_collection", "legal_contract_draft"].map((state) =>
            loadProcurementRequests(
              {
                state,
                limit: 50,
              },
              connectionOverrides,
            )
              .then((bundle) => bundle.items)
              .catch(() => []),
          ),
        ).then((groups) => groups.flat())
      : [];
  const scopedItems = isDepartmentHeadView
    ? filterByDepartment(dashboard.items, departmentScopeName)
    : uniqueById([...dashboard.items, ...officeClerkBacklogItems]);
  const backlogIds = new Set(officeClerkBacklogItems.map((item) => item.id));
  const details = scopedItems
    .map(createDetailFallback)
    .filter((item) => !backlogIds.has(item.id) || shouldShowOfficeClerkBacklog(item));
  const dashboardNotificationCount = details.filter(
    (item) => item.is_delayed || item.available_actions.length > 0,
  ).length;

  return (
    <ProcurementShell
      session={session}
      procurementUser={procurementUser}
      title="Худалдан авалтын хяналтын самбар"
      description={
        isExecutiveView
          ? "Бүх хэлтсийн худалдан авалтын хүсэлтүүд"
          : isProcurementWorkerView
            ? "Танд оноогдсон худалдан авалтын хүсэлтүүд"
          : "Өөрийн хэлтсийн худалдан авалтын хүсэлтүүд"
      }
      activeTab="dashboard"
      departmentScopeName={departmentScopeName}
      notificationCount={dashboardNotificationCount}
    >
      {setupWarning ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{setupWarning}</section> : null}
      {notice ? <section className={`${styles.statusBanner} ${styles.noticeBanner}`}>{notice}</section> : null}
      {error ? <section className={`${styles.statusBanner} ${styles.errorBanner}`}>{error}</section> : null}

      <ProcurementDashboardClient
        items={details}
        suppliers={meta.suppliers}
        returnPath="/procurement/dashboard"
        userFlags={procurementUser.flags}
        hideActions={isDepartmentHeadView}
      />
    </ProcurementShell>
  );
}

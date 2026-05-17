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
  loadProcurementRequestDetail,
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

  const [procurementUser, meta, departmentScopeName, setupWarning] = await Promise.all([
    loadProcurementMe(connectionOverrides).catch(() => createFallbackProcurementUser(session)),
    loadProcurementMeta(connectionOverrides).catch(() => emptyMeta()),
    loadSessionDepartmentName(session),
    loadProcurementMe(connectionOverrides)
      .then(() => "")
      .catch((loadError) => getProcurementLoadWarning(loadError)),
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
    },
    connectionOverrides,
  ).catch(() => createEmptyProcurementDashboard());
  const scopedItems = isDepartmentHeadView
    ? filterByDepartment(dashboard.items, departmentScopeName)
    : dashboard.items;
  const details = await Promise.all(
    scopedItems.map((item) =>
      loadProcurementRequestDetail(item.id, connectionOverrides).catch(() => createDetailFallback(item)),
    ),
  );

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

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  MapPin,
  ShieldCheck,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  canAccessGarbageTransportSettings,
  getSessionRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import { isAutoGarbageDepartment, normalizeDepartmentText } from "@/lib/department-permissions";
import { loadInspectorScopeData } from "@/lib/inspector-scope";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadRouteManagementData } from "@/lib/route-management";
import {
  loadProcurementNotificationCount,
  loadWorkspaceNotificationCount,
} from "@/lib/workspace-notifications";

import {
  archiveGarbageTransportPointAction,
  archiveGarbageTransportSubdistrictAction,
  createGarbageTransportPointAction,
  createGarbageTransportSubdistrictAction,
  saveGarbageTransportInspectorScopeAction,
  saveGarbageTransportPreferencesAction,
  updateGarbageTransportPointAction,
} from "./actions";
import styles from "./garbage-settings.module.css";
import { InspectorScopePanel } from "./inspector-scope-panel";
import { PointManagementPanel } from "./point-management-panel";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DepartmentRecord = {
  id: number;
  name: string;
};

const SETTING_TABS = [
  { href: "#inspectors", label: "Тээвэрлэлтийн хяналтын ажилтан", icon: ShieldCheck },
  { href: "#points", label: "Хороо / хогийн цэг", icon: MapPin },
  { href: "#notifications", label: "Мэдэгдэл", icon: Bell },
];

const WORK_DASHBOARD_HREF =
  "/projects?department=%D0%90%D0%B2%D1%82%D0%BE%20%D0%B1%D0%B0%D0%B0%D0%B7%2C%20%D1%85%D0%BE%D0%B3%20%D1%82%D1%8D%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%BB%D1%82%D0%B8%D0%B9%D0%BD%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81";

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function isChecked(value: string | false | null | undefined, fallback = true) {
  if (value === undefined || value === null || value === false || value === "") {
    return fallback;
  }
  return value === "1" || value === "true";
}

function getConfigKey(name: string) {
  return `mfo.garbage_transport.${name}`;
}

const CONFIG_DEFAULTS: Record<string, string> = {
  report_template: "Фото + тайлбар + гүйцэтгэлийн тоо",
  measurement_unit: "рейс",
  notify_assign: "1",
  notify_due_soon: "1",
  notify_overdue_head: "1",
  notify_done_head: "1",
  notify_complaint: "1",
  photo_required: "1",
  location_required: "1",
  start_time_required: "0",
  end_time_required: "0",
  quantity_required: "0",
};

type GarbageConfigName = keyof typeof CONFIG_DEFAULTS;

type ConfigParameterRecord = {
  key: string;
  value: string | false;
};

async function loadConfigValues(connection: Partial<OdooConnection>) {
  const keys = (Object.keys(CONFIG_DEFAULTS) as GarbageConfigName[]).map(getConfigKey);
  const read = (overrides: Partial<OdooConnection>) =>
    executeOdooKw<ConfigParameterRecord[]>(
      "ir.config_parameter",
      "search_read",
      [[["key", "in", keys]]],
      {
        fields: ["key", "value"],
        limit: keys.length,
      },
      overrides,
    );

  let records: ConfigParameterRecord[] = [];
  try {
    records = await read(connection);
  } catch {
    try {
      records = await read({});
    } catch {
      records = [];
    }
  }

  const values = { ...CONFIG_DEFAULTS };
  for (const record of records) {
    const shortName = record.key.replace("mfo.garbage_transport.", "") as GarbageConfigName;
    if (shortName in values && record.value) {
      values[shortName] = String(record.value);
    }
  }

  return values;
}

async function loadDepartmentRecord(
  departmentName: string | null,
  connection: Partial<OdooConnection>,
) {
  const normalized = normalizeDepartmentText(departmentName);
  const departments = await executeOdooKw<DepartmentRecord[]>(
    "hr.department",
    "search_read",
    [[["active", "in", [true, false]]]],
    {
      fields: ["name"],
      order: "name asc",
      limit: 120,
    },
    connection,
  ).catch(() => []);

  return (
    departments.find((department) => normalizeDepartmentText(department.name) === normalized) ??
    departments.find((department) => isAutoGarbageDepartment(department.name)) ??
    null
  );
}

export default async function GarbageTransportSettingsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const departmentScopeName = await loadSessionDepartmentName(session);
  const canAccess = canAccessGarbageTransportSettings(session, departmentScopeName);

  if (!canAccess) {
    redirect("/");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [
    routeData,
    departmentRecord,
    settings,
    inspectorScopeData,
    workspaceNotificationCount,
    procurementNotificationCount,
  ] = await Promise.all([
    loadRouteManagementData(connectionOverrides, { bypassCache: Boolean(notice || error) }),
    loadDepartmentRecord(departmentScopeName, connectionOverrides),
    loadConfigValues(connectionOverrides),
    loadInspectorScopeData(departmentScopeName, connectionOverrides),
    loadWorkspaceNotificationCount(session, { scopedDepartmentName: departmentScopeName }).catch(() => 0),
    loadProcurementNotificationCount(session).catch(() => 0),
  ]);
  const notificationCount = workspaceNotificationCount + procurementNotificationCount;
  const {
    notify_assign: notifyAssign,
    notify_due_soon: notifyDueSoon,
    notify_overdue_head: notifyOverdueHead,
    notify_done_head: notifyDoneHead,
    notify_complaint: notifyComplaint,
  } = settings;

  const roleLabel = getSessionRoleLabel(session);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canArchiveSubdistricts = session.role === "system_admin";
  const departmentName =
    departmentScopeName || departmentRecord?.name || "Авто бааз, хог тээвэрлэлтийн хэлтэс";
  const statCards = [
    { label: "Хяналтын ажилтан", value: inspectorScopeData.inspectors.length, detail: "Хяналтын хүрээ оноох ажилтан" },
    { label: "Хогийн цэг", value: routeData.points.length, detail: "Бүртгэлтэй цэг" },
  ];

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="garbage-settings"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Хог тээвэрлэлтийн тохиргоо"
              subtitle={`${departmentName} · зөвхөн энэ хэлтсийн тохиргоо`}
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
              notificationNote={
                notificationCount > 0
                  ? `${notificationCount} уншаагүй мэдэгдэл`
                  : "Шинэ мэдэгдэл алга"
              }
            />

            <section className={styles.hero}>
              <div>
                <Link href={WORK_DASHBOARD_HREF} className={styles.backButton}>
                  <ArrowLeft aria-hidden />
                  <span>Ажлын самбар руу буцах</span>
                </Link>
                <h1>Хог тээвэрлэлтийн тохиргоо</h1>
                <p>
                  Энэ хэсэг нь зөвхөн хог тээвэрлэлтийн хэлтэст хамаарах хяналтын ажилтан,
                  хогийн цэг болон мэдэгдлийн тохиргоог удирдана. Ажил дээр машин сонгоход
                  тухайн машины жолооч, ачигчийн мэдээлэл автоматаар дагана.
                </p>
              </div>
              <div className={styles.heroStats}>
                {statCards.map((card) => (
                  <article key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    <small>{card.detail}</small>
                  </article>
                ))}
              </div>
            </section>

            {notice ? <p className={styles.noticeMessage}>{notice}</p> : null}
            {error ? <p className={styles.errorMessage}>{error}</p> : null}

            <div className={styles.settingsTabs}>
              <nav className={styles.tabBar} aria-label="Хог тээвэрлэлтийн тохиргооны хэсгүүд">
                {SETTING_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <a key={tab.href} href={tab.href}>
                      <Icon aria-hidden />
                      <span>{tab.label}</span>
                    </a>
                  );
                })}
              </nav>

              <div className={styles.tabPanels}>
            <section id="inspectors" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Хяналтын хүрээ</span>
                  <h2>Тээвэрлэлтийн хяналтын ажилтан</h2>
                </div>
                <span className={styles.countPill}>{inspectorScopeData.inspectors.length} ажилтан</span>
              </div>

              <InspectorScopePanel
                action={saveGarbageTransportInspectorScopeAction}
                inspectors={inspectorScopeData.inspectors}
                subdistricts={inspectorScopeData.subdistricts}
                points={inspectorScopeData.points}
                vehicles={inspectorScopeData.vehicles}
              />
            </section>

            <section id="points" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Хорооны тохиргоо</span>
                  <h2>Хороо / хогийн цэг</h2>
                </div>
                <span className={styles.countPill}>{routeData.points.length} цэг</span>
              </div>

              <PointManagementPanel
                createAction={createGarbageTransportPointAction}
                createSubdistrictAction={createGarbageTransportSubdistrictAction}
                archiveSubdistrictAction={archiveGarbageTransportSubdistrictAction}
                updateAction={updateGarbageTransportPointAction}
                archiveAction={archiveGarbageTransportPointAction}
                points={routeData.points}
                subdistricts={routeData.subdistricts}
                districts={routeData.districts}
                canCreateSubdistricts={true}
                canArchiveSubdistricts={canArchiveSubdistricts}
              />
            </section>

            <section id="notifications" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Мэдэгдлийн тохиргоо</span>
                  <h2>Хог тээвэрлэлтийн мэдэгдэл</h2>
                </div>
                <Bell aria-hidden className={styles.sectionIcon} />
              </div>
              <form action={saveGarbageTransportPreferencesAction} className={styles.criteriaGrid}>
                {[
                  ["notify_assign", "Ажил онооход мэдэгдэл илгээх", notifyAssign],
                  ["notify_due_soon", "Хугацаа дөхөхөд мэдэгдэл илгээх", notifyDueSoon],
                  ["notify_overdue_head", "Хугацаа хэтэрвэл хэлтсийн даргад мэдэгдэх", notifyOverdueHead],
                  ["notify_done_head", "Ажил дуусахад даргад мэдэгдэх", notifyDoneHead],
                  ["notify_complaint", "Гомдол ирэхэд мэдэгдэх", notifyComplaint],
                ].map(([name, label, value]) => (
                  <label key={name} className={styles.checkField}>
                    <input name={name} type="checkbox" defaultChecked={isChecked(value)} />
                    <input name={`${name}_present`} type="hidden" value="1" />
                    <span>{label}</span>
                  </label>
                ))}
                <button type="submit" className={styles.primaryButton}>Мэдэгдэл хадгалах</button>
              </form>
            </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

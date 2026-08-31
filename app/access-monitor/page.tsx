import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadErpAccessEntries } from "@/lib/access-monitor";
import { getSessionRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import { isInternalControlPerson } from "@/lib/special-access";

import styles from "./access-monitor.module.css";

export const dynamic = "force-dynamic";

function parseOdooDate(value: string) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = parseOdooDate(value);
  if (!date) return "Мэдээлэлгүй";
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isRecentlyActive(value: string) {
  const date = parseOdooDate(value);
  return Boolean(date && Date.now() - date.getTime() <= 15 * 60_000);
}

function isWithinLast30Days(value: string) {
  const date = parseOdooDate(value);
  return Boolean(date && Date.now() - date.getTime() <= 30 * 24 * 60 * 60 * 1000);
}

export default async function AccessMonitorPage() {
  const session = await requireSession();
  const internalControl = isInternalControlPerson(
    session.login,
    session.name,
    session.employeeJobTitle,
  );
  if (!internalControl && session.role !== "system_admin") redirect("/");

  const entries = await loadErpAccessEntries().catch(() => []);
  const activeNow = entries.filter((entry) => isRecentlyActive(entry.lastLoginAt)).length;
  const loggedInCount = entries.filter((entry) => Boolean(entry.lastLoginAt)).length;
  const last30DayCount = entries.filter((entry) => isWithinLast30Days(entry.lastLoginAt)).length;
  const roleLabel = getSessionRoleLabel(session);

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="access-monitor"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              canViewGeneralDashboard
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="ERP хандалтын хяналт"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={0}
              notificationNote="Хэрэглэгчийн нэвтрэлтийн мэдээлэл"
            />

            <section className={styles.summaryGrid}>
              <article><strong>{entries.length}</strong><span>Нийт идэвхтэй ажилтан</span></article>
              <article><strong>{loggedInCount}</strong><span>ERP-д нэвтэрч байсан</span></article>
              <article><strong>{last30DayCount}</strong><span>Сүүлийн 30 хоногт нэвтэрсэн</span></article>
              <article><strong>{activeNow}</strong><span>Сүүлийн 15 минутад нэвтэрсэн</span></article>
            </section>

            <section className={styles.panel}>
              <div className={styles.heading}>
                <div><span>Хандалтын бүртгэл</span><h1>ERP хэрэглэгчид</h1></div>
                <p>Бүх идэвхтэй ажилтны ERP эрх болон нэвтэрсэн эсэхийг харуулав. Цаг нь Улаанбаатарын цагаар байна.</p>
              </div>

              {entries.length ? (
                <div className={styles.tableWrap}>
                  <table>
                    <thead><tr><th>№</th><th>Ажилтан</th><th>Хэлтэс / албан тушаал</th><th>Нэвтрэх нэр</th><th>Сүүлд нэвтэрсэн</th><th>Төлөв</th></tr></thead>
                    <tbody>
                      {entries.map((entry, index) => {
                        const recent = isRecentlyActive(entry.lastLoginAt);
                        const last30Days = isWithinLast30Days(entry.lastLoginAt);
                        const status = !entry.hasAccount
                          ? "ERP эрхгүй"
                          : !entry.lastLoginAt
                            ? "Нэвтрээгүй"
                            : recent
                              ? "Саяхан идэвхтэй"
                              : last30Days
                                ? "30 хоногт нэвтэрсэн"
                                : "30 хоногт нэвтрээгүй";
                        return (
                          <tr key={entry.id}>
                            <td>{index + 1}</td>
                            <td><strong>{entry.name}</strong><small>{entry.portalUser ? "Портал хэрэглэгч" : "Дотоод хэрэглэгч"}</small></td>
                            <td><strong>{entry.department || "Хэлтэсгүй"}</strong><small>{entry.jobTitle || "Албан тушаалгүй"}</small></td>
                            <td>{entry.login || "—"}</td>
                            <td>{formatDate(entry.lastLoginAt)}</td>
                            <td><span className={recent ? styles.online : last30Days ? styles.enabled : styles.disabled}>{status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <div className={styles.empty}>Нэвтрэлтийн мэдээлэл татагдсангүй.</div>}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

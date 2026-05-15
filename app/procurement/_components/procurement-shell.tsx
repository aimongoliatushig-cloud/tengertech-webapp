import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, CalendarDays, ChevronDown, PlusCircle, UserCircle } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  type AppSession,
} from "@/lib/auth";
import type { ProcurementUser } from "@/lib/procurement";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";

import styles from "../procurement.module.css";

type ProcurementShellProps = {
  session: AppSession;
  procurementUser: ProcurementUser;
  title: string;
  description: string;
  activeTab: "list" | "assigned" | "dashboard" | "new";
  children: ReactNode;
};

function getTodayLabel() {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).format(new Date());
}

export async function ProcurementShell({
  session,
  procurementUser,
  title,
  description,
  activeTab,
  children,
}: ProcurementShellProps) {
  const roleLabel = getRoleLabel(session.role);
  const [departmentScopeName, notificationCount] = await Promise.all([
    loadSessionDepartmentName(session),
    loadWorkspaceNotificationCount(session).catch(() => 0),
  ]);
  const showCreate = procurementUser.flags.requester || procurementUser.flags.admin;

  return (
    <main className={`${shellStyles.shell} ${styles.procurementApp}`}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="procurement"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              masterMode={isMasterRole(session.role)}
              workerMode={isWorkerOnly(session)}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={`${shellStyles.pageContent} ${styles.procurementPageContent}`}>
            <header className={styles.procurementTopbar}>
              <div className={styles.topbarActions}>
                <span className={styles.dateChip}>
                  <CalendarDays aria-hidden />
                  {getTodayLabel()}
                </span>
                <Link href="/notifications" className={styles.iconButton} aria-label="Мэдэгдэл">
                  <Bell aria-hidden />
                  {notificationCount > 0 ? <span className={styles.notificationBadge}>{notificationCount}</span> : null}
                </Link>
                <div className={styles.userChip}>
                  <UserCircle aria-hidden />
                  <div>
                    <strong>{session.name}</strong>
                    <small>{roleLabel}</small>
                  </div>
                  <ChevronDown aria-hidden />
                </div>
              </div>
            </header>

            <section className={styles.pageTitleBar} data-view={activeTab}>
              <div>
                <h1>{title}</h1>
                <p>{description}</p>
              </div>
              <div className={styles.titleActions}>
                {activeTab !== "dashboard" ? (
                  <Link href="/procurement/dashboard" className={styles.secondaryButton}>
                    Хяналтын самбар
                  </Link>
                ) : null}
                {showCreate ? (
                  <Link href="/procurement/new" className={styles.primaryButton}>
                    <PlusCircle aria-hidden />
                    Шинэ хүсэлт үүсгэх
                  </Link>
                ) : null}
              </div>
            </section>

            <div className={styles.pageStack}>{children}</div>
          </div>
        </div>
      </div>
    </main>
  );
}

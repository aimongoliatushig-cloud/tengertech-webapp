import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3,
  ClipboardList,
  FileText,
  Home,
  PlusCircle,
  WalletCards,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  type AppSession,
} from "@/lib/auth";
import type { ProcurementUser } from "@/lib/procurement";
import { loadProcurementNotificationCount, loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";

import styles from "../procurement.module.css";

type ProcurementShellProps = {
  session: AppSession;
  procurementUser: ProcurementUser;
  title: string;
  description: string;
  activeTab: "list" | "assigned" | "dashboard" | "new";
  departmentScopeName?: string | null;
  notificationCount?: number;
  children: ReactNode;
};

export async function ProcurementShell({
  session,
  procurementUser,
  title,
  description,
  activeTab,
  departmentScopeName,
  notificationCount,
  children,
}: ProcurementShellProps) {
  const roleLabel = getSessionRoleLabel(session);
  const [resolvedDepartmentScopeName, resolvedNotificationCount] = await Promise.all([
    departmentScopeName !== undefined
      ? Promise.resolve(departmentScopeName)
      : loadSessionDepartmentName(session),
    notificationCount !== undefined
      ? Promise.resolve(notificationCount)
      : Promise.all([
          loadWorkspaceNotificationCount(session).catch(() => 0),
          loadProcurementNotificationCount(session).catch(() => 0),
        ]).then(([workspaceCount, procurementCount]) => workspaceCount + procurementCount),
  ]);
  const isDepartmentHead =
    session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
  const showCreate = procurementUser.flags.requester || procurementUser.flags.admin || isDepartmentHead;

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
              notificationCount={resolvedNotificationCount}
              masterMode={isMasterRole(session.role)}
              workerMode={isWorkerOnly(session)}
              departmentScopeName={resolvedDepartmentScopeName}
            />
          </aside>

          <div className={`${shellStyles.pageContent} ${styles.procurementPageContent}`}>
            <WorkspaceHeader
              title={title}
              subtitle={description}
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={resolvedNotificationCount}
              notificationNote={
                resolvedNotificationCount > 0
                  ? `${resolvedNotificationCount} худалдан авалт болон ажлын мэдэгдэл байна`
                  : "Шинэ худалдан авалтын мэдэгдэл алга"
              }
              showMobileBack={activeTab !== "dashboard"}
              mobileBackHref="/procurement/dashboard"
            />

            {activeTab !== "dashboard" || showCreate ? (
              <section className={styles.pageTitleBar} data-view={activeTab}>
                <div>
                  {activeTab !== "dashboard" ? (
                    <>
                      <h1>{title}</h1>
                      <p>{description}</p>
                    </>
                  ) : null}
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
            ) : null}

            <div className={styles.pageStack}>{children}</div>
          </div>
        </div>
      </div>
      <nav className={styles.mobileDock} aria-label="Худалдан авалтын доод цэс">
        <Link href="/procurement/dashboard" className={`${styles.mobileDockLink} ${activeTab === "dashboard" ? styles.mobileDockLinkActive : ""}`}>
          <Home aria-hidden />
          Самбар
        </Link>
        <Link href="/procurement" className={`${styles.mobileDockLink} ${activeTab === "list" ? styles.mobileDockLinkActive : ""}`}>
          <ClipboardList aria-hidden />
          Хүсэлт
        </Link>
        <Link href="/procurement?state=contract_review" className={styles.mobileDockLink}>
          <FileText aria-hidden />
          Гэрээ
        </Link>
        <Link href="/procurement?state=payment" className={styles.mobileDockLink}>
          <WalletCards aria-hidden />
          Төлбөр
        </Link>
        {showCreate ? (
          <Link href="/procurement/new" className={`${styles.mobileDockLink} ${activeTab === "new" ? styles.mobileDockLinkActive : ""}`}>
            <PlusCircle aria-hidden />
            Шинэ
          </Link>
        ) : null}
        {!showCreate ? (
        <Link href="/procurement/dashboard" className={styles.mobileDockLink}>
          <BarChart3 aria-hidden />
          Тайлан
        </Link>
        ) : null}
      </nav>
    </main>
  );
}

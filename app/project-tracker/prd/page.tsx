import { promises as fs } from "node:fs";
import path from "node:path";

import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessHr } from "@/lib/hr";
import { canAccessProjectTracker } from "@/lib/project-tracker";

import styles from "../project-tracker.module.css";

export const dynamic = "force-dynamic";

export default async function ProjectTrackerPrdPage() {
  const session = await requireSession();
  if (!canAccessProjectTracker(session)) {
    redirect("/");
  }

  const [content, scopedDepartmentName, canViewHr] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "docs", "municipal-erp-prd-roadmap.md"), "utf8"),
    loadSessionDepartmentName(session).catch(() => null),
    canAccessHr(session).catch(() => false),
  ]);

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="project-tracker"
            canCreateProject={hasCapability(session, "create_projects")}
            canCreateTasks={hasCapability(session, "create_tasks")}
            canWriteReports={hasCapability(session, "write_workspace_reports")}
            canViewQualityCenter={hasCapability(session, "view_quality_center")}
            canUseFieldConsole={hasCapability(session, "use_field_console")}
            canViewHr={canViewHr}
            canViewGeneralDashboard
            userName={session.name}
            roleLabel={getRoleLabel(session.role)}
            groupFlags={session.groupFlags}
            masterMode={isMasterRole(session.role)}
            departmentScopeName={scopedDepartmentName}
          />
        </aside>

        <div className={`${shellStyles.pageContent} ${styles.page}`}>
          <header className={styles.header}>
            <div>
              <span className={styles.kicker}>Шаардлага / Замын зураг</span>
              <h1>Төслийн албан хамрах хүрээ ба замын зураг</h1>
              <p>Энэ баримт нь бэлэн байдлын самбарын эх сурвалж бөгөөд V1-д юу орох, юу орохгүйг нэг дор тогтооно.</p>
            </div>
            <div className={styles.headerMeta}>
              <Link href="/project-tracker" className={styles.refreshLink}>
                Хяналт руу буцах
              </Link>
            </div>
          </header>

          <article className={styles.warningCard}>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit", lineHeight: 1.65 }}>
              {content}
            </pre>
          </article>
        </div>
      </div>
    </main>
  );
}

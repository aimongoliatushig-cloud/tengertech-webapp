import Image from "next/image";
import Link from "next/link";
import { BookOpenCheck, ExternalLink } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { HelpSearch } from "@/app/help/help-search";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getRoleLabel, hasCapability, isMasterRole, isWorkerOnly, requireSession } from "@/lib/auth";
import { canAccessGeneralDashboard } from "@/lib/general-dashboard-access";
import { getHelpAudienceLabel, getVisibleHelpTopics } from "@/lib/help-content";
import { canAccessHr } from "@/lib/hr";

import styles from "./help.module.css";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const session = await requireSession();
  const [
    departmentScopeName,
    canViewHr,
  ] = await Promise.all([
    loadSessionDepartmentName(session),
    canAccessHr(session).catch(() => false),
  ]);
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canViewGeneralDashboard = canAccessGeneralDashboard(session);
  const visibleTopics = getVisibleHelpTopics({
    role: session.role,
    groupFlags: session.groupFlags,
    login: session.login,
    departmentScopeName,
  });
  const audienceLabels = Array.from(
    new Set(visibleTopics.map((topic) => getHelpAudienceLabel(topic.audience))),
  );

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="help"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              canViewHr={canViewHr}
              canViewGeneralDashboard={canViewGeneralDashboard}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              groupFlags={session.groupFlags}
              workerMode={workerMode}
              masterMode={masterMode}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Тусламж"
              subtitle="Таны эрхийн хүрээнд харагдах дэлгэц бүрийн зурагтай заавар"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={0}
              notificationNote="Тусламжийн сэдэв"
            />

            <header className={styles.hero}>
              <div>
                <span className={styles.kicker}>Role-д тохирсон заавар</span>
                <h1>Яг таны харах дэлгэц, хийх үйлдлийн тусламж</h1>
                <p>
                  Нэвтэрсэн хэрэглэгчийн role, нэмэлт эрх, хэлтсийн хүрээгээр тусламжийн
                  сэдвүүд автоматаар шүүгдэнэ. Доорх хайлтаар “тайлан”, “зураг”,
                  “батлах”, “машин”, “HR” гэх мэт үгээр сэдэв олж болно.
                </p>
              </div>
              <div className={styles.heroMeta} aria-label="Харагдах хүрээ">
                <BookOpenCheck aria-hidden />
                <span>Харагдах сэдэв</span>
                <strong>{visibleTopics.length}</strong>
                <small>{audienceLabels.join(", ")}</small>
              </div>
            </header>

            <HelpSearch topics={visibleTopics} />

            <nav className={styles.topicNav} aria-label="Тусламжийн сэдвүүд">
              {visibleTopics.map((topic) => (
                <Link key={topic.id} href={`#${topic.id}`} className={styles.topicNavLink}>
                  <span>{getHelpAudienceLabel(topic.audience)}</span>
                  <strong>{topic.title}</strong>
                </Link>
              ))}
            </nav>

            <div className={styles.topicStack}>
              {visibleTopics.map((topic) => (
                <section key={topic.id} id={topic.id} className={styles.topicSection}>
                  <div className={styles.topicHeader}>
                    <div>
                      <span className={styles.kicker}>{getHelpAudienceLabel(topic.audience)}</span>
                      <h2>{topic.title}</h2>
                      <p>{topic.summary}</p>
                    </div>
                    <Link href={topic.route} className={styles.openRouteLink}>
                      <span>Дэлгэц нээх</span>
                      <ExternalLink aria-hidden />
                    </Link>
                  </div>

                  <div className={styles.topicBody}>
                    <figure className={styles.screenshotFrame}>
                      <Image
                        src={topic.screenshot}
                        alt={`${topic.title} дэлгэцийн зураг`}
                        width={1440}
                        height={900}
                        sizes="(max-width: 900px) 100vw, 58vw"
                        unoptimized
                      />
                      <figcaption>{topic.route}</figcaption>
                    </figure>

                    <ol className={styles.stepList}>
                      {topic.steps.map((step, index) => (
                        <li key={`${topic.id}-${index}`} className={styles.stepItem}>
                          <span className={styles.stepNumber}>{index + 1}</span>
                          <div>
                            <strong>{step.title}</strong>
                            <p>{step.body}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

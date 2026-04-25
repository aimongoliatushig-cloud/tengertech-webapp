import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/page.module.css";
import styles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadMunicipalSnapshot } from "@/lib/odoo";

export const dynamic = "force-dynamic";

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "amber" | "teal" | "red" | "slate";
}) {
  return (
    <article className={`${dashboardStyles.metricCard} ${dashboardStyles[`tone${tone}`]}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

export default async function QualityPage() {
  const session = await requireSession();
  if (isWorkerOnly(session) || isMasterRole(session.role)) {
    redirect("/");
  }
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  return (
    <main className={styles.shell}>
      <div className={styles.container} id="quality-top">
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="quality"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Чанарын төв"
              subtitle="Талбарын зөрчил, анхааруулгын нэгдсэн хяналт"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={snapshot.qualityAlerts.length}
              notificationNote={`${snapshot.qualityAlerts.length} чанарын анхааруулга бүртгэгдсэн`}
            />

            {!canViewQualityCenter ? (
              <section className={styles.emptyState}>
                <h2>Чанарын төв рүү хандах эрх алга</h2>
                <p>
                  Энэ хуудас нь удирдлага, диспетчер, хянагчийн чанарын хяналтад зориулагдсан.
                </p>
              </section>
            ) : (
              <>
                <section className={styles.heroCard}>
                  <span className={styles.eyebrow}>Чанарын төв</span>
                  <h1>Талбарын чанар ба зөрчлийн хяналт</h1>
                  <p>
                    Зураг дутуу тайлан, маршрут зөрүү, хаагдаагүй цэг, жингийн синкийн
                    анхааруулгыг нэгтгэж харуулна. Эхэнд нь тоон дүр зураг, доор нь анхаарах
                    ажлын жагсаалт гарна.
                  </p>

                  <div className={styles.statsGrid}>
                    <article className={styles.statCard}>
                      <span>Анхаарах ажил</span>
                      <strong>{snapshot.qualityAlerts.length}</strong>
                    </article>
                    <article className={styles.statCard}>
                <span>Хяналтын мөр</span>
                      <strong>{snapshot.reviewQueue.length}</strong>
                    </article>
                    <article className={styles.statCard}>
                      <span>Эх сурвалж</span>
                      <strong>{snapshot.source === "live" ? "Шууд" : "Жишээ"}</strong>
                    </article>
                    <article className={styles.statCard}>
                      <span>Шинэчлэгдсэн</span>
                      <strong>{snapshot.generatedAt}</strong>
                    </article>
                  </div>
                </section>

                <section className={dashboardStyles.metricsGrid}>
                  {snapshot.qualityMetrics.map((metric) => (
                    <MetricCard key={metric.label} {...metric} />
                  ))}
                </section>

                <section className={styles.panel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <span className={styles.eyebrow}>Ажлын зөрчил</span>
                      <h2>Анхаарах ажил</h2>
                    </div>
                    <p>
                      Ажил бүрийг нээж зураг, маршрут, жингийн синк, хаагдаагүй цэгийн
                      дэлгэрэнгүйг шалгана.
                    </p>
                  </div>

                  {snapshot.qualityAlerts.length ? (
                    <div className={dashboardStyles.reviewList}>
                      {snapshot.qualityAlerts.map((alert) => (
                        <Link key={alert.id} href={alert.href} className={dashboardStyles.reviewItem}>
                          <div>
                            <h3>{alert.name}</h3>
                            <p>
                              {alert.projectName} / {alert.routeName}
                            </p>
                          </div>
                          <div className={dashboardStyles.reviewMeta}>
                            <strong>{alert.exceptionCount} анхааруулга</strong>
                            <span>{alert.operationTypeLabel}</span>
                            <span>{alert.departmentName}</span>
                            <span>Дутуу зураг {alert.missingProofStopCount}</span>
                            <span>Хаагдаагүй {alert.unresolvedStopCount}</span>
                            {alert.hasWeightWarning ? (
                              <span>Жингийн синкийн анхааруулга</span>
                            ) : null}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <h2>Чанарын анхааруулга алга</h2>
                      <p>Энэ агшинд талбарын гүйцэтгэлийн зөрчил илрээгүй байна.</p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

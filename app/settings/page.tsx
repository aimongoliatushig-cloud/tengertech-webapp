import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getSessionRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import {
  loadProcurementNotificationCount,
  loadWorkspaceNotificationCount,
} from "@/lib/workspace-notifications";

import {
  archiveAllGeneralCollectionPointsAction,
  archiveGeneralSubdistrictAction,
  createGeneralSubdistrictAction,
  updateGeneralSubdistrictAction,
} from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SubdistrictRecord = {
  id: number;
  name: string;
  district_id?: [number, string] | false;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function relationName(value: [number, string] | false | undefined) {
  return Array.isArray(value) ? value[1] : "";
}

async function loadGeneralSettingsData(connection: Partial<OdooConnection>) {
  const [subdistricts, points] = await Promise.all([
    executeOdooKw<SubdistrictRecord[]>(
      "mfo.subdistrict",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["name", "district_id"], order: "district_id asc, name asc", limit: 500 },
      connection,
    ).catch(() => []),
    executeOdooKw<Array<{ id: number; subdistrict_id?: [number, string] | false }>>(
      "mfo.collection.point",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["subdistrict_id"], limit: 1000 },
      connection,
    ).catch(() => []),
  ]);

  const pointCountsBySubdistrict = new Map<number, number>();
  for (const point of points) {
    if (Array.isArray(point.subdistrict_id)) {
      const subdistrictId = point.subdistrict_id[0];
      pointCountsBySubdistrict.set(subdistrictId, (pointCountsBySubdistrict.get(subdistrictId) ?? 0) + 1);
    }
  }

  return {
    subdistricts,
    pointCount: points.length,
    pointCountsBySubdistrict,
  };
}

export default async function GeneralSettingsPage({ searchParams }: PageProps) {
  const session = await requireSession();

  if (session.role !== "system_admin") {
    redirect("/");
  }

  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const departmentScopeName = await loadSessionDepartmentName(session);
  const connection = {
    login: session.login,
    password: session.password,
  };
  const [
    { subdistricts, pointCount, pointCountsBySubdistrict },
    workspaceNotificationCount,
    procurementNotificationCount,
  ] = await Promise.all([
    loadGeneralSettingsData(connection),
    loadWorkspaceNotificationCount(session, { scopedDepartmentName: departmentScopeName }).catch(() => 0),
    loadProcurementNotificationCount(session).catch(() => 0),
  ]);
  const notificationCount = workspaceNotificationCount + procurementNotificationCount;
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const roleLabel = getSessionRoleLabel(session);

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="settings"
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

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Ерөнхий тохиргоо"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
              notificationNote={
                notificationCount > 0
                  ? `${notificationCount} уншаагүй мэдэгдэл`
                  : "Шинэ мэдэгдэл алга"
              }
            />

            {notice ? <div className={`${styles.message} ${styles.noticeMessage}`}>{notice}</div> : null}
            {error ? <div className={`${styles.message} ${styles.errorMessage}`}>{error}</div> : null}

            <section id="subdistricts" className={styles.heroCard}>
              <h1>Хорооны бүртгэл</h1>
            </section>

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Хороо нэмэх</span>
                  <h2>Дүүрэг, хороо</h2>
                </div>
                <p>Зөвхөн Хан-Уул дүүргийн хороо бүртгэнэ.</p>
              </div>

              <form action={createGeneralSubdistrictAction} className={styles.formCard}>
                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span>Дүүрэг</span>
                    <input value="Хан-Уул дүүрэг" readOnly />
                  </label>

                  <label className={styles.field}>
                    <span>Хороо</span>
                    <input name="subdistrict_name" placeholder="Жишээ: 9-р хороо" required />
                  </label>
                </div>

                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    Хороо нэмэх
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>Хороод</span>
                  <h2>Бүртгэлтэй хороод</h2>
                </div>
                <p>{pointCount} хогийн цэг бүртгэлтэй байна.</p>
              </div>

              <form action={archiveAllGeneralCollectionPointsAction} className={styles.buttonRow}>
                <button type="submit" className={styles.dangerButton}>
                  Бүх хогийн цэг устгах
                </button>
              </form>

              {subdistricts.length ? (
                <div className={styles.projectTaskFlowList}>
                  {subdistricts.map((subdistrict) => {
                    const pointCount = pointCountsBySubdistrict.get(subdistrict.id) ?? 0;
                    return (
                      <article key={subdistrict.id} className={styles.projectTaskFlowItem}>
                        <div>
                          <strong>
                            {[relationName(subdistrict.district_id), subdistrict.name].filter(Boolean).join(" · ")}
                          </strong>
                          <p className={styles.fieldHint}>{pointCount} хогийн цэг холбогдсон</p>
                        </div>
                        <div className={styles.buttonRow}>
                          <form action={archiveGeneralSubdistrictAction}>
                            <input type="hidden" name="subdistrict_id" value={subdistrict.id} />
                            <button
                              type="submit"
                              className={styles.dangerButton}
                              title="Энэ хорооны хогийн цэгүүдийг хамт идэвхгүй болгоно."
                            >
                              Устгах
                            </button>
                          </form>
                          <details>
                            <summary className={styles.secondaryButton}>Засах</summary>
                            <form action={updateGeneralSubdistrictAction} className={styles.field}>
                              <input type="hidden" name="subdistrict_id" value={subdistrict.id} />
                              <label>
                                <span>Дүүрэг</span>
                                <input value="Хан-Уул дүүрэг" readOnly />
                              </label>
                              <label>
                                <span>Хороо</span>
                                <input name="subdistrict_name" defaultValue={subdistrict.name} required />
                              </label>
                              <button type="submit" className={styles.primaryButton}>
                                Хадгалах
                              </button>
                            </form>
                          </details>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h2>Хороо бүртгэгдээгүй байна</h2>
                  <p>Дээрх form-оор эхний хороогоо нэмнэ.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

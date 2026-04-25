import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import { loadHrEmployeeDirectory } from "@/lib/odoo";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function HrPage() {
  const session = await requireSession();
  const allowedRoles = new Set(["system_admin", "director", "general_manager"]);

  if (!allowedRoles.has(String(session.role))) {
    redirect("/");
  }

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  let employees = [] as Awaited<ReturnType<typeof loadHrEmployeeDirectory>>;
  let loadError = "";

  try {
    employees = await loadHrEmployeeDirectory({
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    console.error("HR directory could not be loaded:", error);
    loadError =
      "Хүний нөөцийн мэдээллийг Odoo-оос уншиж чадсангүй. Холболт болон эрхийн тохиргоог шалгана уу.";
  }

  const departments = Array.from(
    employees.reduce<Map<string, typeof employees>>((accumulator, employee) => {
      const current = accumulator.get(employee.departmentName) ?? [];
      current.push(employee);
      accumulator.set(employee.departmentName, current);
      return accumulator;
    }, new Map()),
  ).sort((left, right) => left[0].localeCompare(right[0], "mn"));

  const linkedUserCount = employees.filter((employee) => employee.userName).length;
  const contactCount = employees.filter(
    (employee) => employee.workPhone || employee.mobilePhone || employee.workEmail,
  ).length;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="hr"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Хүний нөөц"
              subtitle="Бүх бүртгэлтэй ажилтны нэгдсэн жагсаалт"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={employees.length}
              notificationNote={`${departments.length} хэлтсийн ${employees.length} ажилтан бүртгэлтэй`}
            />

            <section className={styles.introCard}>
              <span className={styles.eyebrow}>Ажилтны бүртгэл</span>
              <h1 className={styles.introTitle}>Байгууллагын бүх ажилтан</h1>
              <p className={styles.introText}>
                Ерөнхий менежер болон захирлын түвшинд бүх бүртгэлтэй ажилтныг
                хэлтсээр нь нэг дороос харна.
              </p>

              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span>Нийт ажилтан</span>
                  <strong>{employees.length}</strong>
                  <small>Odoo дээр идэвхтэй бүртгэлтэй ажилтан</small>
                </article>

                <article className={styles.summaryCard}>
                  <span>Хэлтэс</span>
                  <strong>{departments.length}</strong>
                  <small>Ажилтан бүхий алба, нэгж</small>
                </article>

                <article className={styles.summaryCard}>
                  <span>Холбоостой бүртгэл</span>
                  <strong>{linkedUserCount}</strong>
                  <small>{contactCount} ажилтан холбоо барих мэдээлэлтэй байна</small>
                </article>
              </div>
            </section>

            {loadError ? (
              <section className={styles.errorCard}>
                <h2>Хүний нөөцийн өгөгдөл ачаалж чадсангүй</h2>
                <p>{loadError}</p>
              </section>
            ) : null}

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Хэлтсийн жагсаалт</span>
                  <h2>Бүх бүртгэлтэй ажилтан</h2>
                </div>
                <p>Хэлтэс бүрийн дотор ажилтны нэр, албан тушаал, холбоо барих мэдээлэл харагдана.</p>
              </div>

              {departments.length ? (
                <div className={styles.departmentList}>
                  {departments.map(([departmentName, departmentEmployees]) => (
                    <section key={departmentName} className={styles.departmentCard}>
                      <div className={styles.departmentHeader}>
                        <div>
                          <h3>{departmentName}</h3>
                          <p>Энэ хэлтэст {departmentEmployees.length} ажилтан бүртгэлтэй байна.</p>
                        </div>
                        <span className={styles.departmentBadge}>{departmentEmployees.length}</span>
                      </div>

                      <div className={styles.employeeGrid}>
                        {departmentEmployees.map((employee) => (
                          <article key={employee.id} className={styles.employeeCard}>
                            <h4>{employee.name}</h4>
                            <p className={styles.jobTitle}>{employee.jobTitle}</p>

                            <div className={styles.metaStack}>
                              <div className={styles.metaRow}>
                                <span>Хэрэглэгч</span>
                                <strong>{employee.userName || "Холбоогүй"}</strong>
                              </div>
                              <div className={styles.metaRow}>
                                <span>Ажлын утас</span>
                                <strong>{employee.workPhone || "Бүртгээгүй"}</strong>
                              </div>
                              <div className={styles.metaRow}>
                                <span>Гар утас</span>
                                <strong>{employee.mobilePhone || "Бүртгээгүй"}</strong>
                              </div>
                              <div className={styles.metaRow}>
                                <span>И-мэйл</span>
                                <strong>{employee.workEmail || "Бүртгээгүй"}</strong>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>Одоогоор харагдах бүртгэлтэй ажилтан алга.</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

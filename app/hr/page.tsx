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

import { HrDirectory } from "./hr-directory";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    employee?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
};

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function HrPage({ searchParams }: PageProps) {
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
  const params = (await searchParams) ?? {};
  const selectedEmployeeId = Number(getParam(params.employee) || 0);
  const noticeMessage = getParam(params.notice);
  const errorMessage = getParam(params.error);
  const departmentGroups = departments.map(([departmentName, departmentEmployees]) => ({
    departmentName,
    employees: departmentEmployees,
  }));

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
                Үйл ажиллагаа хариуцсан менежер болон захирлын түвшинд бүх бүртгэлтэй ажилтныг
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

            {noticeMessage || errorMessage ? (
              <section className={errorMessage ? styles.errorCard : styles.noticeCard}>
                <h2>{errorMessage ? "Бүртгэл хадгалагдсангүй" : "Бүртгэл хадгалагдлаа"}</h2>
                <p>{errorMessage || noticeMessage}</p>
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

              <HrDirectory
                departments={departmentGroups}
                initialEmployeeId={Number.isFinite(selectedEmployeeId) ? selectedEmployeeId : null}
              />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Archive, ClipboardPlus, HeartPulse, Users } from "lucide-react";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getDisciplineRecords, getEmployees, getTimeoffDashboard, getTimeoffRequests, requireHrAccess } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import { HrDashboardClient } from "./hr-dashboard-client";
import { HrSectionNav } from "./hr-section-nav";
import styles from "./hr.module.css";

export const dynamic = "force-dynamic";

function buildDepartmentGroups(employees: HrEmployeeDirectoryItem[]) {
  const groups = new Map<string, HrEmployeeDirectoryItem[]>();
  for (const employee of employees) {
    const departmentName = employee.departmentName || "Хэлтэсгүй";
    groups.set(departmentName, [...(groups.get(departmentName) ?? []), employee]);
  }

  return Array.from(groups, ([departmentName, departmentEmployees]) => ({
    departmentName,
    employees: departmentEmployees.sort((left, right) => left.name.localeCompare(right.name, "mn")),
  })).sort((left, right) => right.employees.length - left.employees.length);
}

function DepartmentManpower({ employees }: { employees: HrEmployeeDirectoryItem[] }) {
  const departmentGroups = buildDepartmentGroups(employees);
  const maxCount = Math.max(...departmentGroups.map((group) => group.employees.length), 1);

  return (
    <section className={styles.manpowerPanel}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>Odoo hr.employee</span>
          <h2>Хэлтсийн хүн хүч</h2>
        </div>
        <p>{employees.length} ажилтны бүртгэл хэлтэс, албаар бүлэглэгдсэн байна.</p>
      </div>

      <div className={styles.manpowerGrid}>
        {departmentGroups.map((group) => (
          <article key={group.departmentName} className={styles.manpowerDepartment}>
            <header className={styles.manpowerHeader}>
              <div>
                <h3>{group.departmentName}</h3>
                <span>{group.employees.length} ажилтан</span>
              </div>
              <strong>{group.employees.length}</strong>
            </header>
            <div className={styles.manpowerTrack} aria-hidden="true">
              <span style={{ width: `${Math.max(4, Math.round((group.employees.length / maxCount) * 100))}%` }} />
            </div>
            <div className={styles.manpowerEmployees}>
              {group.employees.map((employee) => (
                <Link key={employee.id} href={`/hr/employees/${employee.id}`} className={styles.employeeRowLink}>
                  <span>
                    <strong>{employee.name}</strong>
                    <small>{employee.jobTitle || "Албан тушаал бүртгээгүй"}</small>
                  </span>
                  <em>{employee.statusLabel}</em>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function HrDashboardPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const [employees, timeoffDashboard, timeoffRequests, disciplineRecords] = await Promise.all([
    getEmployees(session).catch((error) => {
      console.warn("HR dashboard employee groups could not be loaded:", error);
      return [];
    }),
    getTimeoffDashboard(session).catch((error) => {
      console.warn("HR time off dashboard could not be loaded:", error);
      return null;
    }),
    getTimeoffRequests(session).catch((error) => {
      console.warn("HR time off requests could not be loaded:", error);
      return [];
    }),
    getDisciplineRecords(session).catch((error) => {
      console.warn("HR discipline records could not be loaded:", error);
      return [];
    }),
  ]);
  const mode = access.isHr ? "hr" : "department";
  const requestCards = timeoffDashboard?.cards;

  return (
    <>
      <WorkspaceHeader
        title={access.isHr ? "Хүний нөөцийн dashboard" : "Миний хэлтсийн хүний нөөц"}
        subtitle={access.isHr ? "Бүх хэлтсийн ажилтан, чөлөө / өвчтэй хүсэлт болон төлөвийг хянана" : "Өөрийн хэлтсийн ажилтны идэвхтэй, чөлөөтэй, өвчтэй төлөв болон илгээсэн хүсэлтүүд"}
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={requestCards?.pendingRequests ?? 0}
        notificationNote="Хүлээгдэж буй хүсэлт"
      />
      <HrSectionNav mode={mode} />

      <HrDashboardClient
        accessMode={mode}
        employees={employees}
        requests={timeoffRequests}
        dashboard={timeoffDashboard}
        disciplineRecords={disciplineRecords}
      />

      <DepartmentManpower employees={employees} />

      {timeoffDashboard?.departmentBreakdown?.length ? (
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Request workflow</span>
              <h2>Хэлтэс тус бүрийн төлөв</h2>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Хэлтэс</th>
                  <th>Нийт</th>
                  <th>Идэвхтэй</th>
                  <th>Чөлөөтэй</th>
                  <th>Өвчтэй</th>
                  <th>Хүлээгдэж буй</th>
                </tr>
              </thead>
              <tbody>
                {timeoffDashboard.departmentBreakdown.map((row) => (
                  <tr key={row.departmentId || row.departmentName}>
                    <td>{row.departmentName}</td>
                    <td>{row.totalEmployees}</td>
                    <td>{row.activeEmployees}</td>
                    <td>{row.timeOffEmployees}</td>
                    <td>{row.sickEmployees}</td>
                    <td>{row.pendingRequests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>{access.isHr ? "Хүний нөөц шалгах" : "Хэлтсийн дарга"}</span>
          <h2>{access.isHr ? "Хүсэлт хянах үйлдэл" : "Хүсэлт үүсгэх үйлдэл"}</h2>
        </div>
        <div className={styles.actionGrid}>
          {(access.isHr
            ? [{ href: "/hr/leaves", label: "Ирсэн хүсэлтүүд", icon: ClipboardPlus }]
            : [
                { href: "/hr/employees", label: "Миний хэлтсийн ажилтнууд", icon: Users },
                { href: "/hr/sick", label: "Чөлөө / өвчтэй хүсэлт", icon: HeartPulse },
              ]
          ).map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href + action.label} href={action.href} className={styles.actionButton}>
                <Icon aria-hidden />
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>Алба нэгж</span>
          <h2>Ажилтнуудыг нэгжээр харах</h2>
        </div>
        <div className={styles.actionGrid}>
          <Link href="/hr/employees" className={styles.actionButton}>
            <Users aria-hidden />
            <span>Ажилтны жагсаалт</span>
          </Link>
          <Link href="/hr/archive" className={styles.actionButton}>
            <Archive aria-hidden />
            <span>Архив</span>
          </Link>
        </div>
      </section>
    </>
  );
}

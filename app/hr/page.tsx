import Link from "next/link";
import { Archive, ClipboardPlus, HeartPulse, Users } from "lucide-react";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { compareHrDepartmentNames } from "@/lib/hr-department-order";
import { getDisciplineRecords, getEmployees, getTimeoffDashboard, getTimeoffRequests, requireHrAccess } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import { HrDashboardClient } from "./hr-dashboard-client";
import { HR_NOTIFICATION_HREF } from "./constants";
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
  })).sort((left, right) => compareHrDepartmentNames(left.departmentName, right.departmentName));
}

function DepartmentManpower({ employees }: { employees: HrEmployeeDirectoryItem[] }) {
  const departmentGroups = buildDepartmentGroups(employees);

  return (
    <section className={styles.manpowerPanel}>
      <div className={styles.sectionHeader}>
        <div>
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
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";
  const requestCards = timeoffDashboard?.cards;

  return (
    <>
      <WorkspaceHeader
        title={mode === "hr" ? "Хүний нөөцийн dashboard" : "Миний хэлтсийн хүний нөөц"}
        subtitle={mode === "hr" ? "Бүх хэлтсийн ажилтан, чөлөө / өвчтэй хүсэлт болон төлөвийг хянана" : "Өөрийн хэлтсийн ажилтны идэвхтэй, чөлөөтэй, өвчтэй төлөв болон илгээсэн хүсэлтүүд"}
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={requestCards?.pendingRequests ?? 0}
        notificationNote="Хүлээгдэж буй хүсэлт"
        notificationHref={HR_NOTIFICATION_HREF}
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

      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>{access.isHr ? "HR review" : "Department Head"}</span>
          <h2>{access.isHr ? "Хүсэлт хянах үйлдэл" : "Хүсэлт үүсгэх үйлдэл"}</h2>
        </div>
        <div className={styles.actionGrid}>
          {(access.isHr
            ? [{ href: "/hr/leaves", label: "Ирсэн хүсэлтүүд", icon: ClipboardPlus }]
            : [
                { href: "/hr/employees", label: "Манай хэлтсийн ажилтнууд", icon: Users },
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

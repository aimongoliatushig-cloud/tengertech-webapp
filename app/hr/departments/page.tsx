import Link from "next/link";
import { Building2, Users } from "lucide-react";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getDepartments, getEmployees, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import styles from "../hr.module.css";

export const dynamic = "force-dynamic";

export default async function HrDepartmentsPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }

  const [departments, employees] = await Promise.all([
    getDepartments(session),
    getEmployees(session).catch(() => []),
  ]);
  const employeeCountByDepartment = new Map<string, number>();
  for (const employee of employees) {
    employeeCountByDepartment.set(
      employee.departmentName,
      (employeeCountByDepartment.get(employee.departmentName) ?? 0) + 1,
    );
  }

  const cards = departments.length
    ? departments.map((department) => ({
        id: department.id,
        name: department.name,
        count: employeeCountByDepartment.get(department.name) ?? 0,
      }))
    : Array.from(employeeCountByDepartment).map(([name, count], index) => ({
        id: index,
        name,
        count,
      }));

  return (
    <>
      <WorkspaceHeader
        title="Алба нэгжүүд"
        subtitle="Хүний нөөцийн бүртгэл дотор алба нэгжээр ажилтнуудаа хурдан харна"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={cards.length}
        notificationNote={`${cards.length} алба нэгж`}
      />
      <HrSectionNav />

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>Алба нэгжийн товч жагсаалт</h2>
          <span>{cards.length}</span>
        </div>

        <div className={styles.departmentGrid}>
          {cards.map((department) => (
            <Link
              key={`${department.id}-${department.name}`}
              href={`/hr/employees?department=${encodeURIComponent(department.name)}`}
              className={styles.departmentTile}
            >
              <span className={styles.statIcon}>
                <Building2 aria-hidden />
              </span>
              <div>
                <strong>{department.name}</strong>
                <small>
                  <Users aria-hidden />
                  {department.count} ажилтан
                </small>
              </div>
            </Link>
          ))}
        </div>

        {!cards.length ? (
          <div className={styles.emptyState}>
            <strong>Одоогоор бүртгэл алга.</strong>
            <span>Шинэ бүртгэл үүсгэж эхлээрэй.</span>
          </div>
        ) : null}
      </section>
    </>
  );
}

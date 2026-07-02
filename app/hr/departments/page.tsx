import Link from "next/link";
import { Building2, Users } from "lucide-react";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { compareHrDepartmentNames, getHrDepartmentDisplayName } from "@/lib/hr-department-order";
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
    const departmentName = getHrDepartmentDisplayName(employee.departmentName);
    employeeCountByDepartment.set(
      departmentName,
      (employeeCountByDepartment.get(departmentName) ?? 0) + 1,
    );
  }

  const cardMap = new Map<string, { id: number; name: string; count: number }>();
  for (const department of departments) {
    const name = getHrDepartmentDisplayName(department.name);
    cardMap.set(name, {
      id: department.id,
      name,
      count: employeeCountByDepartment.get(name) ?? 0,
    });
  }
  for (const [name, count] of employeeCountByDepartment) {
    if (!cardMap.has(name)) {
      // hr.department-д тохирохгүй нэр (id=0) → хянах самбаргүй, шүүлтээр нээнэ
      cardMap.set(name, { id: 0, name, count });
    }
  }
  const cards = Array.from(cardMap.values());
  cards.sort((left, right) => compareHrDepartmentNames(left.name, right.name));

  return (
    <>
      <WorkspaceHeader
        title="Алба нэгжүүд"
        subtitle="Хүний нөөцийн бүртгэл дотор алба нэгжээр ажилтнуудаа хурдан харна"
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
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
              href={
                department.id > 0
                  ? `/hr/departments/${department.id}`
                  : `/hr/employees?department=${encodeURIComponent(department.name)}`
              }
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

import Link from "next/link";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, getEmployees, requireHrAccess } from "@/lib/hr";

import { EmployeeTable } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";
import styles from "../hr.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ employeeId?: string | string[] }>;
};

export default async function HrArchivePage({ searchParams }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const params = await searchParams;
  const rawEmployeeId = Array.isArray(params.employeeId) ? params.employeeId[0] : params.employeeId;
  const selectedEmployeeId = Number(rawEmployeeId);
  const selectedEmployee = Number.isFinite(selectedEmployeeId)
    ? await getEmployee(session, selectedEmployeeId).catch(() => null)
    : null;
  const employees = await getEmployees(session).catch(() => []);
  const archivedEmployees = employees.filter(
    (employee) => !employee.active || ["archived", "resigned", "terminated"].includes(employee.statusKey),
  );

  return (
    <>
      <WorkspaceHeader
        title="Архив"
        subtitle="Ажлаас гарсан болон архивлагдсан ажилтны түүх, гэрээ, тушаал, хавсралтыг тусад нь харна"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={archivedEmployees.length}
        notificationNote="Архивын бүртгэл"
      />
      <HrSectionNav />
      {selectedEmployee ? (
        <section className={styles.actionPanel}>
          <div>
            <span className={styles.eyebrow}>Архивлах ажилтан</span>
            <h2>{selectedEmployee.name}</h2>
            <p className={styles.mutedText}>
              {selectedEmployee.departmentName || "Хэлтэс бүртгээгүй"} ·{" "}
              {selectedEmployee.jobTitle || "Албан тушаал бүртгээгүй"}
            </p>
          </div>
          <div className={styles.actionGrid}>
            <Link href={`/hr/clearance?employeeId=${selectedEmployee.id}`} className={styles.actionButton}>
              Тойрох хуудас үүсгэх
            </Link>
            <Link href={`/hr/employees/${selectedEmployee.id}`} className={styles.actionButton}>
              Профайл руу буцах
            </Link>
          </div>
        </section>
      ) : null}
      <EmployeeTable employees={archivedEmployees} />
    </>
  );
}

import Link from "next/link";
import {
  Archive,
  BriefcaseBusiness,
  FileCheck2,
  HeartPulse,
  Pencil,
  Plane,
  Repeat2,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, requireHrAccess } from "@/lib/hr";

import { EmployeeDetailTabs } from "../../hr-client";
import { HrSectionNav } from "../../hr-section-nav";
import styles from "../../hr.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

function employeeActions(employeeId: number) {
  const employeeQuery = `employeeId=${employeeId}`;

  return [
    { label: "Засах", href: "#profile-info", icon: Pencil },
    { label: "Чөлөө бүртгэх", href: `/hr/leaves?${employeeQuery}`, icon: FileCheck2 },
    { label: "Өвчтэй бүртгэх", href: `/hr/sick?${employeeQuery}`, icon: HeartPulse },
    { label: "Томилолт бүртгэх", href: `/hr/trips?${employeeQuery}`, icon: Plane },
    { label: "Сахилгын бүртгэл", href: `/hr/discipline?${employeeQuery}`, icon: ShieldAlert },
    { label: "Тушаал / гэрээ", href: `/hr/orders?${employeeQuery}`, icon: ScrollText },
    { label: "Шилжилт хөдөлгөөн", href: `/hr/transfers?${employeeQuery}`, icon: Repeat2 },
    { label: "Тойрох хуудас", href: `/hr/clearance?${employeeQuery}`, icon: BriefcaseBusiness },
    { label: "Архивлах", href: `/hr/archive?${employeeQuery}`, icon: Archive },
  ];
}

export default async function HrEmployeeDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    notFound();
  }
  const employee = await getEmployee(session, employeeId);
  if (!employee) {
    notFound();
  }

  return (
    <>
      <WorkspaceHeader
        title={employee.name}
        subtitle={`${employee.departmentName || "Алба нэгж бүртгээгүй"} · ${employee.jobTitle || "Албан тушаал бүртгээгүй"}`}
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationNote="Ажилтны дэлгэрэнгүй"
      />
      <HrSectionNav />

      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>Ажилтны үйлдэл</span>
          <h2>{employee.name}</h2>
        </div>
        <div className={styles.actionGrid}>
          {employeeActions(employee.id).map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.label} href={action.href} className={styles.actionButton}>
                <Icon aria-hidden />
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <EmployeeDetailTabs employee={employee} />
    </>
  );
}

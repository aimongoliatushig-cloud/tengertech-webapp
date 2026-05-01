import Link from "next/link";
import { Archive, FileCheck2, HeartPulse, Pencil, Repeat2, ShieldAlert } from "lucide-react";
import { notFound } from "next/navigation";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployee, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../../hr-section-nav";
import { EmployeeDetailTabs } from "../../hr-client";
import styles from "../../hr.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const actions = [
  { label: "Засах", href: "#", icon: Pencil },
  { label: "Чөлөө бүртгэх", href: "/hr/leaves?type=leave", icon: FileCheck2 },
  { label: "Өвчтэй чөлөө бүртгэх", href: "/hr/leaves?type=sick", icon: HeartPulse },
  { label: "Хэлтэс шилжүүлэх", href: "/hr/transfers", icon: Repeat2 },
  { label: "Дэвшүүлэх", href: "/hr/transfers", icon: Repeat2 },
  { label: "Түдгэлзүүлэх", href: "/hr/transfers", icon: ShieldAlert },
  { label: "Архивлах", href: "#", icon: Archive },
  { label: "Тойрох хуудас үүсгэх", href: "/hr/clearance", icon: FileCheck2 },
];

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
        <div className={styles.actionGrid}>
          {actions.map((action) => {
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

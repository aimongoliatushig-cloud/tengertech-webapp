import Link from "next/link";
import {
  Activity,
  Archive,
  BriefcaseBusiness,
  ClipboardPlus,
  FileCheck2,
  FileWarning,
  HeartPulse,
  Plus,
  ShieldAlert,
  Shuffle,
  UserPlus,
  Users,
} from "lucide-react";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, getHrStats, requireHrAccess } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import { HrSectionNav } from "./hr-section-nav";
import styles from "./hr.module.css";

export const dynamic = "force-dynamic";

const actions = [
  { href: "/hr/employees/new", label: "Шинэ ажилтан бүртгэх", icon: Plus },
  { href: "/hr/leaves", label: "Чөлөө бүртгэх", icon: ClipboardPlus },
  { href: "/hr/sick", label: "Өвчтэй бүртгэх", icon: HeartPulse },
  { href: "/hr/trips", label: "Томилолт бүртгэх", icon: BriefcaseBusiness },
  { href: "/hr/clearance", label: "Тойрох хуудас", icon: FileCheck2 },
];

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
  const [stats, employees] = await Promise.all([
    getHrStats(session).catch((error) => {
      console.warn("HR dashboard stats could not be loaded:", error);
      return {
        totalEmployees: 0,
        activeEmployees: 0,
        leaveToday: 0,
        sickToday: 0,
        businessTripToday: 0,
        newEmployees: 0,
        resignedEmployees: 0,
        archivedEmployees: 0,
        activeDiscipline: 0,
        completedDiscipline: 0,
        transfers: 0,
        expiringContracts: 0,
        missingAttachmentEmployees: 0,
        pendingClearance: 0,
      };
    }),
    getEmployees(session).catch((error) => {
      console.warn("HR dashboard employee groups could not be loaded:", error);
      return [];
    }),
  ]);

  const cards = [
    { label: "Нийт ажилтан", value: stats.totalEmployees, icon: Users, note: "Бүх ажилтны мастер бүртгэл" },
    { label: "Идэвхтэй ажилтан", value: stats.activeEmployees, icon: Activity, note: "Одоо ажиллаж буй бүртгэл" },
    { label: "Чөлөөтэй ажилтан", value: stats.leaveToday, icon: ClipboardPlus, note: "Өнөөдрийн чөлөөний бүртгэл" },
    { label: "Өвчтэй ажилтан", value: stats.sickToday, icon: HeartPulse, note: "Өвчтэй бүртгэлтэй" },
    { label: "Томилолттой ажилтан", value: stats.businessTripToday, icon: BriefcaseBusiness, note: "Идэвхтэй томилолт" },
    { label: "Шинэ ажилтан", value: stats.newEmployees, icon: UserPlus, note: "Энэ сарын шинэ бүртгэл" },
    { label: "Ажлаас гарсан ажилтан", value: stats.resignedEmployees, icon: Archive, note: "Чөлөөлөгдсөн төлөвтэй" },
    { label: "Архивласан ажилтан", value: stats.archivedEmployees, icon: Archive, note: "Active жагсаалтаас тусдаа" },
    { label: "Сахилгын идэвхтэй бүртгэл", value: stats.activeDiscipline, icon: ShieldAlert, note: "Шалгах шаардлагатай" },
    { label: "Дууссан сахилгын бүртгэл", value: stats.completedDiscipline, icon: ShieldAlert, note: "Баталгаажсан эсвэл архивласан" },
    { label: "Шилжилт хөдөлгөөн", value: stats.transfers, icon: Shuffle, note: "Бүртгэсэн өөрчлөлт" },
    { label: "Дуусах дөхсөн гэрээ", value: stats.expiringContracts, icon: FileWarning, note: "60 хоногийн дотор" },
    { label: "Дутуу хавсралттай ажилтан", value: stats.missingAttachmentEmployees, icon: FileWarning, note: "Баримтын бүрдэл дутуу" },
    { label: "Тойрох хуудас", value: stats.pendingClearance, icon: FileCheck2, note: "Хүлээгдэж буй" },
  ];

  return (
    <>
      <WorkspaceHeader
        title="Хүний нөөцийн удирдлага"
        subtitle="Ажилтны бүртгэл, хувийн хэрэг, чөлөө, өвчтэй, томилолт, сахилга, шилжилт, архив болон тойрох хуудсыг удирдана"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={stats.leaveToday + stats.sickToday + stats.pendingClearance}
        notificationNote="HR бүртгэлийн анхаарах зүйлс"
      />
      <HrSectionNav />

      <section className={styles.statGrid}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className={styles.statCard}>
              <span className={styles.statIcon}>
                <Icon aria-hidden />
              </span>
              <div>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </div>
            </article>
          );
        })}
      </section>

      <DepartmentManpower employees={employees} />

      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>HR үйлдэл</span>
          <h2>HR бүртгэлийн гол үйлдэл</h2>
        </div>
        <div className={styles.actionGrid}>
          {actions.map((action) => {
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

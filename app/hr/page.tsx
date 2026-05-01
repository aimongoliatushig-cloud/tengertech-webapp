import Link from "next/link";
import { Activity, Building2, ClipboardPlus, FileCheck2, HeartPulse, Plus, Users } from "lucide-react";

import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getHrStats, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "./hr-section-nav";
import styles from "./hr.module.css";

export const dynamic = "force-dynamic";

const actions = [
  { href: "/hr/employees/new", label: "Шинэ ажилтан бүртгэх", icon: Plus },
  { href: "/hr/leaves", label: "Чөлөө / өвчтэй бүртгэх", icon: ClipboardPlus },
  { href: "/hr/clearance", label: "Тойрох хуудас", icon: FileCheck2 },
];

export default async function HrDashboardPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const stats = await getHrStats(session).catch((error) => {
    console.warn("HR dashboard stats could not be loaded:", error);
    return {
      totalEmployees: 0,
      activeEmployees: 0,
      leaveToday: 0,
      sickToday: 0,
      archivedEmployees: 0,
      pendingClearance: 0,
    };
  });

  const cards = [
    { label: "Нийт ажилтан", value: stats.totalEmployees, icon: Users, note: "Бүх ажилтны мастер бүртгэл" },
    { label: "Идэвхтэй ажилтан", value: stats.activeEmployees, icon: Activity, note: "Одоо ажиллаж буй бүртгэл" },
    { label: "Чөлөө / өвчтэй", value: stats.leaveToday + stats.sickToday, icon: HeartPulse, note: "Өнөөдрийн бүртгэл" },
    { label: "Тойрох хуудас", value: stats.pendingClearance, icon: FileCheck2, note: "Хүлээгдэж буй" },
  ];

  return (
    <>
      <WorkspaceHeader
        title="Хүний нөөцийн удирдлага"
        subtitle="Ажилтан, алба нэгж, чөлөө болон тойрох хуудсыг энгийн урсгалаар удирдана"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={stats.leaveToday + stats.pendingClearance}
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

      <section className={styles.actionPanel}>
        <div>
          <span className={styles.eyebrow}>HR үйлдэл</span>
          <h2>Өдөр тутмын гол үйлдэл</h2>
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
          <Link href="/hr/departments" className={styles.actionButton}>
            <Building2 aria-hidden />
            <span>Алба нэгжүүд</span>
          </Link>
          <Link href="/hr/employees" className={styles.actionButton}>
            <Users aria-hidden />
            <span>Ажилтны жагсаалт</span>
          </Link>
        </div>
      </section>
    </>
  );
}

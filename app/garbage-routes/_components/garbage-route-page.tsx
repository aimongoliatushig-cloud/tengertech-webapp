import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getRoleLabel, hasCapability, isMasterRole, isWorkerOnly, requireSession } from "@/lib/auth";
import { getGarbageRoutePermissions, type GarbageRoutePermissions } from "@/lib/garbage-routes";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";

import styles from "../garbage-routes.module.css";

type PermissionCheck = (permissions: GarbageRoutePermissions) => boolean;

type RoutePageProps = {
  title: string;
  eyebrow: string;
  description: string;
  isAllowed: PermissionCheck;
};

const routeCards: Array<{
  href: string;
  title: string;
  description: string;
  canShow: PermissionCheck;
}> = [
  {
    href: "/garbage-routes/weekly-plan",
    title: "Долоо хоногийн төлөвлөгөө",
    description: "Маршрут, баг, машины төлөвлөлтийг удирдана.",
    canShow: (permissions) => permissions.weekly_create || permissions.weekly_edit,
  },
  {
    href: "/garbage-routes/today",
    title: "Өнөөдрийн маршрут",
    description: "Өнөөдөр ажиллаж буй маршрут, явцыг харна.",
    canShow: (permissions) => permissions.today_view,
  },
  {
    href: "/garbage-routes/inspections",
    title: "Хяналтын тайлан",
    description: "Хяналт, шалгалтын бүртгэл болон тайланг харна.",
    canShow: (permissions) => permissions.all_view || permissions.inspection_write,
  },
  {
    href: "/garbage-routes/dashboard",
    title: "Маршрутын самбар",
    description: "Хог тээврийн маршрутын нэгтгэл үзүүлэлтүүд.",
    canShow: (permissions) => permissions.dashboard_view,
  },
];

export async function GarbageRoutePage({
  title,
  eyebrow,
  description,
  isAllowed,
}: RoutePageProps) {
  const session = await requireSession();
  const departmentScopeName = await loadSessionDepartmentName(session);
  const permissions = getGarbageRoutePermissions(session, departmentScopeName);

  if (!isAllowed(permissions)) {
    redirect("/");
  }

  const masterMode = isMasterRole(session.role);
  const workerMode = isWorkerOnly(session);
  const roleLabel = getRoleLabel(session.role);
  const notificationCount = await loadWorkspaceNotificationCount(session);
  const visibleCards = routeCards.filter((card) => card.canShow(permissions));

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="garbage-routes"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Хог тээврийн маршрут"
              subtitle="Төлөвлөгөө, өнөөдрийн явц, хяналтын тайлан"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
            />

            <div className={styles.routeShell}>
              <section className={styles.hero}>
                <span className={styles.eyebrow}>{eyebrow}</span>
                <h1>{title}</h1>
                <p>{description}</p>
              </section>

              <section className={styles.grid} aria-label="Хог тээврийн маршрутын холбоосууд">
                {visibleCards.map((card) => (
                  <Link key={card.href} href={card.href} className={styles.card}>
                    <strong>{card.title}</strong>
                    <span>{card.description}</span>
                  </Link>
                ))}
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

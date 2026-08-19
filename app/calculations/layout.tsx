import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getSessionRoleLabel, hasCapability, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CalculationLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const department = await loadSessionDepartmentName(session);
  const allowed = ["system_admin", "director", "general_manager"].includes(session.role) || department === "Тохижилтын хэлтэс" || department === "Тохижилт үйлчилгээ" || session.groupFlags?.improvementManager;
  if (!allowed) redirect("/");
  return <main className={shellStyles.shell}><div className={shellStyles.container}><div className={shellStyles.contentWithMenu}>
    <aside className={shellStyles.menuColumn}><AppMenu active="calculations" canCreateProject={hasCapability(session, "create_projects")} canCreateTasks={hasCapability(session, "create_tasks")} canWriteReports={hasCapability(session, "write_workspace_reports")} userName={session.name} userRole={session.role} roleLabel={getSessionRoleLabel(session)} groupFlags={session.groupFlags} departmentScopeName={department} /></aside>
    <div className={shellStyles.pageContent}>{children}</div>
  </div></div></main>;
}

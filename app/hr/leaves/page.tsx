import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, getLeaves, getLeaveTypes, requireHrAccess } from "@/lib/hr";

import { HrSectionNav } from "../hr-section-nav";
import { LeavesClient } from "../hr-client";

export const dynamic = "force-dynamic";

export default async function HrLeavesPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  const [employees, leaveTypes, leaves] = await Promise.all([
    getEmployees(session).catch(() => []),
    getLeaveTypes(session),
    getLeaves(session),
  ]);

  return (
    <>
      <WorkspaceHeader
        title="Чөлөө / өвчтэй"
        subtitle="Ээлжийн амралт, цалинтай болон цалингүй чөлөө, өвчтэй бүртгэлийг удирдана"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={leaves.length}
        notificationNote="Чөлөөний бүртгэл"
      />
      <HrSectionNav />
      <LeavesClient employees={employees} leaveTypes={leaveTypes} leaves={leaves} />
    </>
  );
}

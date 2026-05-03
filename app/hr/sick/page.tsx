import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { getRoleLabel, requireSession } from "@/lib/auth";
import { getEmployees, getLeaves, getLeaveTypes, requireHrAccess } from "@/lib/hr";

import { LeavesClient } from "../hr-client";
import { HrSectionNav } from "../hr-section-nav";

export const dynamic = "force-dynamic";

export default async function HrSickPage() {
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
        title="Өвчтэй"
        subtitle="Эмнэлгийн магадлагаа, хугацаа, шалтгаан болон хавсралттай өвчтэй бүртгэлийг удирдана"
        userName={session.name}
        roleLabel={getRoleLabel(session.role)}
        notificationCount={leaves.filter((leave) => leave.typeName.toLocaleLowerCase("mn-MN").includes("өвч")).length}
        notificationNote="Өвчтэй бүртгэл"
      />
      <HrSectionNav />
      <LeavesClient employees={employees} leaveTypes={leaveTypes} leaves={leaves} defaultKind="sick" />
    </>
  );
}

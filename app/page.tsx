import { DashboardView } from "@/app/dashboard-view";
import { hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { loadAssignedGarbageTasks } from "@/lib/field-ops";
import { loadMunicipalSnapshot } from "@/lib/odoo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession();
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  const canUseFieldConsole = hasCapability(session, "use_field_console");
  let todayAssignments: Awaited<ReturnType<typeof loadAssignedGarbageTasks>>["assignments"] = [];

  if (isWorkerOnly(session) && canUseFieldConsole) {
    try {
      const bundle = await loadAssignedGarbageTasks(
        {
          userId: session.uid,
        },
        {
          login: session.login,
          password: session.password,
        },
      );
      todayAssignments = bundle.assignments;
    } catch (error) {
      console.warn("Worker daily assignments could not be loaded:", error);
    }
  }

  return (
    <DashboardView
      session={session}
      snapshot={snapshot}
      todayAssignments={todayAssignments}
    />
  );
}

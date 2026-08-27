import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createTaskReportAction } from "@/app/actions";
import { TaskReportModal } from "@/app/tasks/[taskId]/task-report-modal";
import { requireSession,
  getSessionRoleLabel,
  isHrOnlyRole,
} from "@/lib/auth";
import { getDepartmentJobCounts, getDisciplineRecords, getEmployees, getHeadcountTrend, getTimeoffDashboard, getTimeoffRequests, requireHrAccess } from "@/lib/hr";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { loadUserAssignedTasks } from "@/lib/odoo";

import { HrDashboardClient } from "./hr-dashboard-client";
import { HR_NOTIFICATION_HREF } from "./constants";
import { HrSectionNav } from "./hr-section-nav";
import styles from "./hr.module.css";

export const dynamic = "force-dynamic";

export default async function HrDashboardPage() {
  const session = await requireSession();
  const access = await requireHrAccess(session).catch(() => null);
  if (!access) {
    return null;
  }
  // Зөвхөн ХН-ийн ажилтан (нүүр хуудас нь /hr) өөрт оноогдсон даалгавраа
  // эндээс харна; админ, хэлтсийн дарга нар өөрийн хяналтын самбартаа хардаг
  // тул ХН самбарт давхардуулж үзүүлэхгүй.
  const showAssignedTasks = isHrOnlyRole(session);
  const assignedTasksPromise = showAssignedTasks
    ? loadUserAssignedTasks(session.uid).catch(() => [])
    : Promise.resolve([]);
  const [employees, timeoffDashboard, timeoffRequests, disciplineRecords, departmentJobCounts, headcountTrend] = await Promise.all([
    getEmployees(session).catch((error) => {
      console.warn("HR dashboard employee groups could not be loaded:", error);
      return [];
    }),
    getTimeoffDashboard(session).catch((error) => {
      console.warn("HR time off dashboard could not be loaded:", error);
      return null;
    }),
    getTimeoffRequests(session).catch((error) => {
      console.warn("HR time off requests could not be loaded:", error);
      return [];
    }),
    getDisciplineRecords(session).catch((error) => {
      console.warn("HR discipline records could not be loaded:", error);
      return [];
    }),
    getDepartmentJobCounts(session).catch((error) => {
      console.warn("HR department job counts could not be loaded:", error);
      return [];
    }),
    getHeadcountTrend(session).catch((error) => {
      console.warn("HR headcount trend could not be loaded:", error);
      return [];
    }),
  ]);
  const assignedTasks = await assignedTasksPromise;
  const activeAssignedTasks = assignedTasks.filter((task) => task.statusKey !== "done");
  const mode: "hr" | "department" = access.scope === "hr" ? "hr" : "department";
  // Хэлтэст хязгаарлагдсан хэрэглэгч (хэлтсийн дарга)-д байгууллагын бүтцийг
  // зөвхөн өөрийн хэлтсээр харуулна. Бүх ХН харах эрхтэйд null → бүрэн бүтэц.
  const scopedDepartmentName = mode === "department" ? await loadSessionDepartmentName(session) : null;
  const requestCards = timeoffDashboard?.cards;

  return (
    <>
      <WorkspaceHeader
        title={mode === "hr" ? "Хүний нөөцийн хянах самбар" : "Миний хэлтсийн хүний нөөц"}
        subtitle={mode === "hr" ? "Бүх хэлтсийн ажилтан, чөлөө / өвчтэй хүсэлт болон төлөвийг хянана" : "Өөрийн хэлтсийн ажилтны идэвхтэй, чөлөөтэй, өвчтэй төлөв болон илгээсэн хүсэлтүүд"}
        userName={session.name}
        roleLabel={getSessionRoleLabel(session)}
        notificationCount={requestCards?.pendingRequests ?? 0}
        notificationNote="Хүлээгдэж буй хүсэлт"
        notificationHref={HR_NOTIFICATION_HREF}
      />
      <HrSectionNav mode={mode} />

      {assignedTasks.length ? (
        <section className={styles.assignedTasksCard} id="my-assigned-tasks">
          <div className={styles.assignedTasksHead}>
            <div>
              <h2>Надад оноогдсон даалгавар</h2>
              <p>Захирал, удирдлагаас танд оноосон үүрэг даалгаврууд</p>
            </div>
            <span className={styles.assignedTasksCount}>
              {activeAssignedTasks.length} идэвхтэй
            </span>
          </div>
          <div className={styles.assignedTasksList}>
            {assignedTasks.slice(0, 8).map((task) => (
              <div
                key={task.id}
                className={styles.assignedTaskRow}
              >
                <a
                  href={`/tasks/${task.id}?returnTo=%2Fhr&composer=report`}
                  className={styles.assignedTaskName}
                >
                  {task.name}
                </a>
                <span className={styles.assignedTaskMeta}>
                  {task.projectName ? <small>{task.projectName}</small> : null}
                  {task.deadline ? <small>{task.deadline}</small> : null}
                  <span
                    className={`${styles.assignedTaskStatus} ${
                      task.statusKey === "done"
                        ? styles.assignedTaskStatusDone
                        : task.statusKey === "review"
                          ? styles.assignedTaskStatusReview
                          : ""
                    }`}
                  >
                    {task.statusLabel}
                  </span>
                  {task.statusKey !== "done" ? (
                    <TaskReportModal
                      action={createTaskReportAction}
                      taskId={task.id}
                      quantityOptional
                      simpleMobile
                      workItemName={task.name}
                      returnTo="/hr#my-assigned-tasks"
                      triggerClassName={styles.assignedTaskOpen}
                      triggerContent="Тайлан оруулах"
                    />
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          {assignedTasks.length > 8 ? (
            <p className={styles.assignedTasksMore}>+{assignedTasks.length - 8} бусад даалгавар</p>
          ) : null}
        </section>
      ) : null}

      <HrDashboardClient
        accessMode={mode}
        employees={employees}
        requests={timeoffRequests}
        dashboard={timeoffDashboard}
        disciplineRecords={disciplineRecords}
        departmentJobCounts={departmentJobCounts}
        headcountTrend={headcountTrend}
        scopedDepartmentName={scopedDepartmentName}
      />
    </>
  );
}

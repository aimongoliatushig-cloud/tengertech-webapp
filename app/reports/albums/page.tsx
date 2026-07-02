import Link from "next/link";
import { Building2, CalendarDays, ChevronRight, ImageOff } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  findDepartmentGroupByName,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import {
  loadReportAlbumMonths,
  loadReportAlbums,
  type AlbumImage,
} from "@/lib/report-albums";

import styles from "./albums.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

function imageHref(attachmentId: number) {
  return `/api/reports/album-image/${attachmentId}`;
}

function ThumbGrid({ images }: { images: AlbumImage[] }) {
  return (
    <div className={styles.thumbGrid}>
      {images.map((image) => (
        <a
          key={image.id}
          href={imageHref(image.id)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.thumbButton}
          title={image.name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageHref(image.id)}
            alt={image.name}
            loading="lazy"
            className={styles.thumbImage}
          />
        </a>
      ))}
    </div>
  );
}

export default async function ReportAlbumsPage({ searchParams }: PageProps) {
  const session = await requireSession();

  const roleLabel = getSessionRoleLabel(session);
  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const scopedDepartmentName = await loadSessionDepartmentName(session);

  const rawParams = (await searchParams) ?? {};
  const viewParam = Array.isArray(rawParams.view) ? rawParams.view[0] : rawParams.view;
  const view = viewParam === "month" ? "month" : "department";

  // Бүх тайлан харах эрхгүй бол зөвхөн өөрийн хэлтсийн цомгийг харуулна
  let departmentFilter: ((departmentName: string) => boolean) | undefined;
  if (!canViewAllReports && scopedDepartmentName) {
    const scopeName = scopedDepartmentName.trim();
    const group = findDepartmentGroupByName(scopeName);
    const normalizedScope = scopeName.toLocaleLowerCase("mn-MN");
    departmentFilter = (departmentName: string) => {
      if (group && matchesDepartmentGroup(group, departmentName)) {
        return true;
      }
      const normalized = departmentName.trim().toLocaleLowerCase("mn-MN");
      return (
        normalized === normalizedScope ||
        normalized.includes(normalizedScope) ||
        normalizedScope.includes(normalized)
      );
    };
  }

  const connection = { login: session.login, password: session.password };
  const filterOpts = departmentFilter ? { departmentFilter } : {};

  let departments: Awaited<ReturnType<typeof loadReportAlbums>> = [];
  let months: Awaited<ReturnType<typeof loadReportAlbumMonths>> = [];
  let loadError = "";
  try {
    if (view === "month") {
      months = await loadReportAlbumMonths(connection, filterOpts);
    } else {
      departments = await loadReportAlbums(connection, filterOpts);
    }
  } catch (error) {
    console.error("Report albums could not be loaded:", error);
    loadError = "Зургийн цомгийг уншиж чадсангүй. Холболт болон эрхээ шалгана уу.";
  }

  const totalImages =
    view === "month"
      ? months.reduce((sum, month) => sum + month.imageCount, 0)
      : departments.reduce((sum, department) => sum + department.imageCount, 0);

  const tabs = [
    { key: "department", label: "Хэлтсээр", href: "/reports/albums", icon: Building2 },
    { key: "month", label: "Он-сараар", href: "/reports/albums?view=month", icon: CalendarDays },
  ] as const;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="reports-albums"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              canViewAllReports={canViewAllReports}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Зургийн цомог"
              subtitle="Хагас жилийн тайлангийн гэрэл зургууд — хэлтэс болон он-сараар"
              userName={session.name}
              roleLabel={roleLabel}
            />

            <section className={styles.board}>
              <div className={styles.tabs} role="tablist" aria-label="Харагдац">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = view === tab.key;
                  return (
                    <Link
                      key={tab.key}
                      href={tab.href}
                      className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
                    >
                      <Icon aria-hidden size={16} />
                      {tab.label}
                    </Link>
                  );
                })}
              </div>

              <p className={styles.intro}>
                {view === "month"
                  ? "Огноот ажлуудын зургийг гүйцэтгэлийн он-сараар нь бүлэглэв. Сар дээр дарж дэлгэнэ."
                  : totalImages
                    ? `Нийт ${totalImages.toLocaleString("mn-MN")} зураг. Хэлтсийн нэр дээр дарж дэлгэх, зураг дээр дарж томоор үзнэ.`
                    : "Тайлангийн зургийн цомог."}
              </p>

              {loadError ? (
                <div className={styles.emptyState}>
                  <ImageOff aria-hidden size={28} />
                  <p>{loadError}</p>
                </div>
              ) : view === "month" ? (
                months.length === 0 ? (
                  <div className={styles.emptyState}>
                    <ImageOff aria-hidden size={28} />
                    <p>Огноотой зурагт ажил олдсонгүй.</p>
                  </div>
                ) : (
                  <div className={styles.galleryRoot}>
                    {months.map((month) => (
                      <details key={month.monthKey} className={styles.departmentCard}>
                        <summary className={styles.departmentHeader}>
                          <ChevronRight
                            aria-hidden
                            size={18}
                            className={styles.summaryChevron}
                          />
                          <span className={styles.departmentName}>{month.monthLabel}</span>
                          <span className={styles.departmentCount}>
                            {month.imageCount} зураг
                          </span>
                        </summary>
                        <div className={styles.projectList}>
                          {month.tasks.map((task) => (
                            <div key={task.taskId} className={styles.projectBlock}>
                              <div className={styles.projectTitle}>
                                <span className={styles.projectNameText}>
                                  {task.taskName}
                                </span>
                                {task.date ? (
                                  <span className={styles.projectDate}>{task.date}</span>
                                ) : null}
                                <span className={styles.projectCount}>
                                  {task.images.length}
                                </span>
                              </div>
                              <ThumbGrid images={task.images} />
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                )
              ) : departments.length === 0 ? (
                <div className={styles.emptyState}>
                  <ImageOff aria-hidden size={28} />
                  <p>Хавсаргасан зурагт тайлан олдсонгүй.</p>
                </div>
              ) : (
                <div className={styles.galleryRoot}>
                  {departments.map((department) => (
                    <details
                      key={department.departmentId}
                      className={styles.departmentCard}
                    >
                      <summary className={styles.departmentHeader}>
                        <ChevronRight
                          aria-hidden
                          size={18}
                          className={styles.summaryChevron}
                        />
                        <span className={styles.departmentName}>
                          {department.departmentName}
                        </span>
                        <span className={styles.departmentCount}>
                          {department.imageCount} зураг
                        </span>
                      </summary>

                      <div className={styles.projectList}>
                        {department.projects.map((project) => (
                          <div key={project.projectId} className={styles.projectBlock}>
                            <div className={styles.projectTitle}>
                              <span className={styles.projectNameText}>
                                {project.projectName}
                              </span>
                              <span className={styles.projectCount}>
                                {project.images.length}
                              </span>
                            </div>
                            <ThumbGrid images={project.images} />
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

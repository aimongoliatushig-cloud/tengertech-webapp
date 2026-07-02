import { ChevronRight, ImageOff } from "lucide-react";

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
import { loadReportAlbums } from "@/lib/report-albums";

import styles from "./albums.module.css";

export const dynamic = "force-dynamic";

function imageHref(attachmentId: number) {
  return `/api/reports/album-image/${attachmentId}`;
}

export default async function ReportAlbumsPage() {
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

  let departments: Awaited<ReturnType<typeof loadReportAlbums>> = [];
  let loadError = "";
  try {
    departments = await loadReportAlbums(
      { login: session.login, password: session.password },
      departmentFilter ? { departmentFilter } : {},
    );
  } catch (error) {
    console.error("Report albums could not be loaded:", error);
    loadError = "Зургийн цомгийг уншиж чадсангүй. Холболт болон эрхээ шалгана уу.";
  }

  const totalImages = departments.reduce(
    (sum, department) => sum + department.imageCount,
    0,
  );

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
              subtitle="Хагас жилийн тайлангийн гэрэл зургууд — хэлтэс, төслөөр"
              userName={session.name}
              roleLabel={roleLabel}
            />

            <section className={styles.board}>
              <p className={styles.intro}>
                {totalImages
                  ? `Нийт ${totalImages.toLocaleString("mn-MN")} зураг. Хэлтсийн нэр дээр дарж дэлгэх, зураг дээр дарж томоор үзнэ.`
                  : "Тайлангийн зургийн цомог."}
              </p>

              {loadError ? (
                <div className={styles.emptyState}>
                  <ImageOff aria-hidden size={28} />
                  <p>{loadError}</p>
                </div>
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
                            <div className={styles.thumbGrid}>
                              {project.images.map((image) => (
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

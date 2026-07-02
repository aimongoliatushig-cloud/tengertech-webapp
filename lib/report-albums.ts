import "server-only";

import { executeOdooKw } from "@/lib/odoo";
import { fixMojibakeText } from "@/lib/text-normalize";

export type AlbumImage = {
  id: number;
  name: string;
};

export type AlbumProject = {
  projectId: number;
  projectName: string;
  isAlbum: boolean;
  images: AlbumImage[];
};

export type AlbumDepartment = {
  departmentId: number;
  departmentName: string;
  imageCount: number;
  projects: AlbumProject[];
};

type OdooConnection = {
  login: string;
  password: string;
};

type AttachmentRow = {
  id: number;
  name: string | false;
  res_id: number;
};

type ProjectRow = {
  id: number;
  name: string;
  ops_department_id: [number, string] | false;
};

const ALBUM_NAME_PREFIX = "🖼";

/**
 * Тайлангийн зургийн цомог: project.project бичлэгүүдэд хавсаргасан зургууд.
 * Хэлтэс → project → зураг гэсэн бүтцээр бүлэглэн буцаана.
 */
export async function loadReportAlbums(
  connection: OdooConnection,
  options: { departmentFilter?: (departmentName: string) => boolean } = {},
): Promise<AlbumDepartment[]> {
  const attachments = await executeOdooKw<AttachmentRow[]>(
    "ir.attachment",
    "search_read",
    [
      [
        ["res_model", "=", "project.project"],
        ["mimetype", "like", "image"],
      ],
    ],
    {
      fields: ["name", "res_id"],
      order: "res_id asc, id asc",
      limit: 5000,
    },
    connection,
  ).catch(() => [] as AttachmentRow[]);

  if (!attachments.length) {
    return [];
  }

  const projectIds = Array.from(new Set(attachments.map((row) => row.res_id)));
  const projects = await executeOdooKw<ProjectRow[]>(
    "project.project",
    "read",
    [projectIds],
    { fields: ["name", "ops_department_id"] },
    connection,
  ).catch(() => [] as ProjectRow[]);

  const projectById = new Map(projects.map((project) => [project.id, project]));

  const departmentMap = new Map<number, AlbumDepartment>();
  const projectGroupById = new Map<number, AlbumProject>();

  for (const attachment of attachments) {
    const project = projectById.get(attachment.res_id);
    if (!project) {
      continue;
    }

    const departmentRelation = project.ops_department_id || [0, "Бусад"];
    const departmentId = departmentRelation[0];
    const departmentName = fixMojibakeText(departmentRelation[1] || "Бусад");

    if (options.departmentFilter && !options.departmentFilter(departmentName)) {
      continue;
    }

    let projectGroup = projectGroupById.get(project.id);
    if (!projectGroup) {
      const projectName = fixMojibakeText(project.name || `Төсөл ${project.id}`);
      projectGroup = {
        projectId: project.id,
        projectName,
        isAlbum: projectName.startsWith(ALBUM_NAME_PREFIX),
        images: [],
      };
      projectGroupById.set(project.id, projectGroup);

      let department = departmentMap.get(departmentId);
      if (!department) {
        department = {
          departmentId,
          departmentName,
          imageCount: 0,
          projects: [],
        };
        departmentMap.set(departmentId, department);
      }
      department.projects.push(projectGroup);
    }

    projectGroup.images.push({
      id: attachment.id,
      name: fixMojibakeText(attachment.name || `Зураг ${attachment.id}`),
    });
  }

  const departments = Array.from(departmentMap.values());
  for (const department of departments) {
    department.imageCount = department.projects.reduce(
      (sum, project) => sum + project.images.length,
      0,
    );
    // Нэгдсэн цомог (🖼) эхэнд, дараа нь зураг ихтэй project эхэнд
    department.projects.sort(
      (left, right) =>
        Number(right.isAlbum) - Number(left.isAlbum) ||
        right.images.length - left.images.length,
    );
  }
  departments.sort((left, right) => right.imageCount - left.imageCount);

  return departments;
}

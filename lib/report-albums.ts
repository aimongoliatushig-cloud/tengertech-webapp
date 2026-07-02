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

export type AlbumMonthTask = {
  taskId: number;
  taskName: string;
  departmentName: string;
  date: string | null;
  images: AlbumImage[];
};

export type AlbumMonth = {
  monthKey: string; // "2026-02" эсвэл "unknown"
  monthLabel: string;
  imageCount: number;
  tasks: AlbumMonthTask[];
};

type TaskRow = {
  id: number;
  name: string;
  date_deadline: string | false;
  ops_department_id: [number, string] | false;
};

const MONTH_UNKNOWN = "unknown";

function monthLabelFromKey(monthKey: string): string {
  if (monthKey === MONTH_UNKNOWN) {
    return "Огноо тодорхойгүй";
  }
  const [year, month] = monthKey.split("-");
  return `${year} оны ${Number(month)}-р сар`;
}

/**
 * Огноот ажлын (project.task) зурган хавсралтуудыг task-ийн гүйцэтгэлийн
 * огноогоор нь он-сараар бүлэглэн буцаана.
 */
export async function loadReportAlbumMonths(
  connection: OdooConnection,
  options: { departmentFilter?: (departmentName: string) => boolean } = {},
): Promise<AlbumMonth[]> {
  const attachments = await executeOdooKw<AttachmentRow[]>(
    "ir.attachment",
    "search_read",
    [
      [
        ["res_model", "=", "project.task"],
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

  const taskIds = Array.from(new Set(attachments.map((row) => row.res_id)));
  const tasks = await executeOdooKw<TaskRow[]>(
    "project.task",
    "read",
    [taskIds],
    { fields: ["name", "date_deadline", "ops_department_id"] },
    connection,
  ).catch(() => [] as TaskRow[]);

  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const monthMap = new Map<string, AlbumMonth>();
  const taskGroupById = new Map<number, AlbumMonthTask>();

  for (const attachment of attachments) {
    const task = taskById.get(attachment.res_id);
    if (!task) {
      continue;
    }

    const departmentRelation = task.ops_department_id || [0, "Бусад"];
    const departmentName = fixMojibakeText(departmentRelation[1] || "Бусад");
    if (options.departmentFilter && !options.departmentFilter(departmentName)) {
      continue;
    }

    const date = typeof task.date_deadline === "string" ? task.date_deadline : null;
    const monthKey = date ? date.slice(0, 7) : MONTH_UNKNOWN;

    let taskGroup = taskGroupById.get(task.id);
    if (!taskGroup) {
      taskGroup = {
        taskId: task.id,
        taskName: fixMojibakeText(task.name || `Даалгавар ${task.id}`),
        departmentName,
        date: date ? date.slice(0, 10) : null,
        images: [],
      };
      taskGroupById.set(task.id, taskGroup);

      let month = monthMap.get(monthKey);
      if (!month) {
        month = {
          monthKey,
          monthLabel: monthLabelFromKey(monthKey),
          imageCount: 0,
          tasks: [],
        };
        monthMap.set(monthKey, month);
      }
      month.tasks.push(taskGroup);
    }

    taskGroup.images.push({
      id: attachment.id,
      name: fixMojibakeText(attachment.name || `Зураг ${attachment.id}`),
    });
  }

  const months = Array.from(monthMap.values());
  for (const month of months) {
    month.imageCount = month.tasks.reduce(
      (sum, task) => sum + task.images.length,
      0,
    );
    month.tasks.sort((left, right) =>
      (left.date || "").localeCompare(right.date || ""),
    );
  }
  // Он-сараар өсөхөөр эрэмбэлж, "Огноо тодорхойгүй"-г хамгийн сүүлд
  months.sort((left, right) => {
    if (left.monthKey === MONTH_UNKNOWN) return 1;
    if (right.monthKey === MONTH_UNKNOWN) return -1;
    return left.monthKey.localeCompare(right.monthKey);
  });

  return months;
}

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

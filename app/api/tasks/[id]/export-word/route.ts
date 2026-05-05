import { getSession, isWorkerOnly } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import {
  generateOfficialTaskDocx,
  officialReportFileName,
} from "@/lib/official-task-report";
import { loadTaskDetail } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ExportRequest = {
  selectedWorkItemIds?: unknown;
  exportType?: string;
};

function parseSelectedIds(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    : [];
}

async function loadScopeMeta(
  taskId: number,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
) {
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });
  const directoryTask = snapshot.taskDirectory.find((item) => item.id === taskId);

  if (!directoryTask) {
    throw new Error("Даалгавар олдсонгүй эсвэл танд харах эрх алга.");
  }

  const isAssigned = directoryTask.assigneeIds?.includes(session.uid) ?? false;
  if (isWorkerOnly(session) && !isAssigned) {
    throw new Error("Даалгавар олдсонгүй эсвэл танд харах эрх алга.");
  }
  if (
    scopedDepartmentName &&
    !isAssigned &&
    filterByDepartment([directoryTask], scopedDepartmentName).length === 0
  ) {
    throw new Error("Даалгавар олдсонгүй эсвэл танд харах эрх алга.");
  }

  return directoryTask;
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }

  const { id } = await context.params;
  const taskId = Number(id);
  if (!taskId || !Number.isFinite(taskId)) {
    return Response.json({ error: "Даалгаврын дугаар буруу байна." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as ExportRequest;
  const selectedIds = parseSelectedIds(body.selectedWorkItemIds);
  if (!selectedIds.length) {
    return Response.json({ error: "Тайланд оруулах даалгавар сонгоно уу." }, { status: 400 });
  }

  try {
    const credentials = { login: session.login, password: session.password };
    const [task, scopeMeta] = await Promise.all([
      loadTaskDetail(taskId, credentials),
      loadScopeMeta(taskId, session),
    ]);
    const selectedSet = new Set(selectedIds);
    const selectedReports = task.reports.filter((report) => selectedSet.has(report.id));

    if (selectedReports.length !== selectedSet.size) {
      return Response.json(
        { error: "Сонгосон даалгавар энэ ажилд хамаарахгүй байна." },
        { status: 400 },
      );
    }

    const buffer = await generateOfficialTaskDocx({
      task,
      selectedReports,
      departmentName: scopeMeta.departmentName,
      reviewerName: scopeMeta.leaderName,
      authorName: selectedReports[0]?.reporter,
      credentials,
    });

    const body = new Blob([new Uint8Array(buffer)]);

    return new Response(body, {
      headers: {
        "Content-Disposition": `attachment; filename="${officialReportFileName(taskId, "docx")}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Тайлан үүсгэхэд алдаа гарлаа.";
    return Response.json({ error: message }, { status: 500 });
  }
}

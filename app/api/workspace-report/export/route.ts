import { getSession, isWorkerOnly } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { executeOdooKw, loadMunicipalSnapshot } from "@/lib/odoo";
import { loadProjectDetail, loadTaskDetail, type ProjectDetail, type TaskDetail } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OdooAttachmentPayload = {
  id: number;
  name?: string | false;
  mimetype?: string | false;
  datas?: string | false;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2br(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br/>");
}

function safeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function dateLabel() {
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

async function loadImageAttachments(ids: number[], credentials: { login: string; password: string }) {
  if (!ids.length) {
    return new Map<number, OdooAttachmentPayload>();
  }

  const attachments = await executeOdooKw<OdooAttachmentPayload[]>(
    "ir.attachment",
    "search_read",
    [[["id", "in", ids]]],
    {
      fields: ["name", "mimetype", "datas"],
      limit: ids.length,
    },
    credentials,
  ).catch(() => []);

  return new Map(attachments.map((attachment) => [attachment.id, attachment]));
}

function documentShell(title: string, body: string, options: { autoPrint?: boolean } = {}) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      color: #111827;
      font-family: Arial, "Times New Roman", sans-serif;
      font-size: 12pt;
      line-height: 1.45;
      margin: 0;
    }
    h1 { font-size: 18pt; text-align: center; margin: 0 0 12px; text-transform: uppercase; }
    h2 { font-size: 14pt; margin: 18px 0 8px; }
    h3 { font-size: 12pt; margin: 14px 0 6px; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; }
    th, td { border: 1px solid #4b5563; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #eef6f0; font-weight: 700; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-bottom: 14px; }
    .box { border: 1px solid #9ca3af; padding: 10px 12px; margin: 10px 0; }
    .muted { color: #4b5563; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .photo { border: 1px solid #d1d5db; padding: 6px; break-inside: avoid; }
    .photo img { display: block; max-width: 100%; height: auto; }
    .signature { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .signature div { border-top: 1px solid #111827; padding-top: 6px; text-align: center; }
    @media print {
      .print-actions { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${
    options.autoPrint
      ? '<div class="print-actions"><button onclick="window.print()">PDF болгон хадгалах / хэвлэх</button></div><script>setTimeout(() => window.print(), 400);</script>'
      : ""
  }
  ${body}
</body>
</html>`;
}

function quantitySummary(task: TaskDetail) {
  if (task.quantityLines.length) {
    return task.quantityLines
      .map((line, index) => `${index + 1}. ${line.unit}: ${line.completedQuantity ?? 0}/${line.quantity}`)
      .join("<br/>");
  }

  return task.measurementUnit
    ? `${task.completedQuantity}/${task.plannedQuantity} ${escapeHtml(task.measurementUnit)}`
    : "Тоо хэмжээ бүртгээгүй";
}

async function renderTaskReport(task: TaskDetail, credentials: { login: string; password: string }) {
  const imageIds = Array.from(new Set(task.reports.flatMap((report) => report.images.map((image) => image.id))));
  const imageById = await loadImageAttachments(imageIds, credentials);

  const reportsHtml = task.reports.length
    ? task.reports
        .map((report, index) => {
          const imagesHtml = report.images.length
            ? `<div class="photo-grid">${report.images
                .map((image) => {
                  const attachment = imageById.get(image.id);
                  const src = attachment?.datas
                    ? `data:${attachment.mimetype || "image/jpeg"};base64,${attachment.datas}`
                    : "";
                  return `<div class="photo">${
                    src ? `<img src="${src}" alt="${escapeHtml(image.name)}" />` : ""
                  }<div class="muted">${escapeHtml(attachment?.name || image.name)}</div></div>`;
                })
                .join("")}</div>`
            : "<p class=\"muted\">Зураг хавсаргаагүй.</p>";
          const audiosHtml = report.audios.length
            ? `<ul>${report.audios.map((audio) => `<li>${escapeHtml(audio.name)}</li>`).join("")}</ul>`
            : "<p class=\"muted\">Аудио хавсаргаагүй.</p>";

          return `<section class="box">
            <h3>${index + 1}. ${escapeHtml(report.reporter)} - ${escapeHtml(report.submittedAt)}</h3>
            <p>${nl2br(report.text || report.summary)}</p>
            <h3>Зураг</h3>
            ${imagesHtml}
            <h3>Аудио</h3>
            ${audiosHtml}
          </section>`;
        })
        .join("")
    : "<p class=\"muted\">Гүйцэтгэлийн тайлан бүртгэгдээгүй.</p>";

  return documentShell(
    `${task.name} - ажлын тайлан`,
    `<h1>Ажлын гүйцэтгэлийн тайлан</h1>
    <div class="meta">
      <div><strong>Ажилбар:</strong> ${escapeHtml(task.name)}</div>
      <div><strong>Төсөл/ажил:</strong> ${escapeHtml(task.projectName)}</div>
      <div><strong>Төлөв:</strong> ${escapeHtml(task.stageLabel)}</div>
      <div><strong>Явц:</strong> ${task.progress}%</div>
      <div><strong>Хугацаа:</strong> ${escapeHtml(task.deadline)}</div>
      <div><strong>Хэвлэсэн:</strong> ${escapeHtml(dateLabel())}</div>
    </div>
    <h2>Төлөвлөсөн ба гүйцэтгэсэн хэмжээ</h2>
    <div class="box">${quantitySummary(task)}</div>
    <h2>Ажилбарын тайлбар</h2>
    <div class="box">${nl2br(task.description || "Тайлбар оруулаагүй.")}</div>
    <h2>Гүйцэтгэлийн тайлангууд</h2>
    ${reportsHtml}
    <div class="signature">
      <div>Гүйцэтгэсэн ажилтан</div>
      <div>Хянасан ажилтан</div>
    </div>`,
  );
}

function renderProjectReport(project: ProjectDetail) {
  const rows = project.tasks
    .map(
      (task, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(task.name)}</td>
        <td>${escapeHtml(task.stageLabel)}</td>
        <td>${task.progress}%</td>
        <td>${escapeHtml(task.teamLeaderName)}</td>
        <td>${escapeHtml(task.deadline)}</td>
        <td>${escapeHtml(`${task.completedQuantity}/${task.plannedQuantity} ${task.measurementUnit}`.trim())}</td>
      </tr>`,
    )
    .join("");

  return documentShell(
    `${project.name} - ажлын дэлгэрэнгүй`,
    `<h1>Ажлын дэлгэрэнгүй тайлан</h1>
    <div class="meta">
      <div><strong>Ажил:</strong> ${escapeHtml(project.name)}</div>
      <div><strong>Хэлтэс:</strong> ${escapeHtml(project.departmentName)}</div>
      <div><strong>Менежер:</strong> ${escapeHtml(project.managerName)}</div>
      <div><strong>Явц:</strong> ${project.completion}%</div>
      <div><strong>Эхлэх огноо:</strong> ${escapeHtml(project.startDate)}</div>
      <div><strong>Дуусах огноо:</strong> ${escapeHtml(project.deadline)}</div>
    </div>
    <h2>Ерөнхий тайлбар</h2>
    <div class="box">${nl2br(project.description || "Тайлбар оруулаагүй.")}</div>
    <h2>Ажилбарууд</h2>
    <table>
      <thead>
        <tr>
          <th>№</th>
          <th>Ажилбар</th>
          <th>Төлөв</th>
          <th>Явц</th>
          <th>Хариуцсан ажилтан</th>
          <th>Хугацаа</th>
          <th>Тоо хэмжээ</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="7">Ажилбар бүртгэгдээгүй.</td></tr>'}</tbody>
    </table>
    <div class="signature">
      <div>Бэлтгэсэн</div>
      <div>Хянасан</div>
    </div>`,
  );
}

async function assertCanAccessTask(taskId: number, session: NonNullable<Awaited<ReturnType<typeof getSession>>>) {
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!isWorkerOnly(session) && !scopedDepartmentName) {
    return;
  }

  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });
  const directoryTask = snapshot.taskDirectory.find((item) => item.id === taskId);
  if (!directoryTask) {
    throw new Error("Ажилбар олдсонгүй эсвэл танд харах эрх алга.");
  }
  const isAssigned = directoryTask.assigneeIds?.includes(session.uid) ?? false;
  if (isWorkerOnly(session) && !isAssigned) {
    throw new Error("Ажилбар олдсонгүй эсвэл танд харах эрх алга.");
  }
  if (
    scopedDepartmentName &&
    !isAssigned &&
    filterByDepartment([directoryTask], scopedDepartmentName).length === 0
  ) {
    throw new Error("Ажилбар олдсонгүй эсвэл танд харах эрх алга.");
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "task";
  const id = Number(url.searchParams.get("id") || "");
  const format = url.searchParams.get("format") || "word";

  if (!id || !Number.isFinite(id)) {
    return Response.json({ error: "Тайлангийн ID буруу байна." }, { status: 400 });
  }

  const credentials = { login: session.login, password: session.password };
  const html =
    type === "project"
      ? renderProjectReport(await loadProjectDetail(id, credentials))
      : await (async () => {
          await assertCanAccessTask(id, session);
          return renderTaskReport(await loadTaskDetail(id, credentials), credentials);
        })();
  const printableHtml =
    format === "pdf"
      ? html.replace("<body>", '<body><div class="print-actions"><button onclick="window.print()">PDF болгон хадгалах / хэвлэх</button></div><script>setTimeout(() => window.print(), 400);</script>')
      : html;
  const fileStem = safeFileName(type === "project" ? `ajliin-tailan-${id}` : `ajilbar-tailan-${id}`);

  if (format === "pdf") {
    return new Response(printableHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  return new Response(`\uFEFF${html}`, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileStem}.doc"`,
      "Content-Type": "application/msword; charset=utf-8",
    },
  });
}

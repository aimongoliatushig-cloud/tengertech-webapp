import { filterRecentErpAccessEntries, loadErpAccessEntries } from "@/lib/access-monitor";
import { buildAccessMonitorDocx, buildAccessMonitorPdf, buildAccessMonitorXlsx } from "@/lib/access-monitor-export";
import { getSession } from "@/lib/auth";
import { isInternalControlPerson } from "@/lib/special-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  const allowed = session.role === "system_admin" || isInternalControlPerson(session.login, session.name, session.employeeJobTitle);
  if (!allowed) return Response.json({ error: "Тайлан татах эрхгүй байна." }, { status: 403 });

  const entries = filterRecentErpAccessEntries(await loadErpAccessEntries());
  const format = new URL(request.url).searchParams.get("format")?.toLowerCase() || "xlsx";
  const fileBase = `erp-login-report-${new Date().toISOString().slice(0, 10)}`;
  if (format === "docx" || format === "word") {
    const buffer = await buildAccessMonitorDocx(entries);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${fileBase}.docx"` } });
  }
  if (format === "pdf") {
    const buffer = await buildAccessMonitorPdf(entries);
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"` } });
  }
  const buffer = await buildAccessMonitorXlsx(entries);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fileBase}.xlsx"` } });
}

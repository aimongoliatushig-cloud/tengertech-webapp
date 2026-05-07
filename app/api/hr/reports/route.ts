import { getSession } from "@/lib/auth";
import { generateHrReport, getGeneratedHrReports, requireHrSpecialistAccess, type HrReportType } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? "");
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrSpecialistAccess(session);
    const searchParams = new URL(request.url).searchParams;
    return Response.json({
      reports: await getGeneratedHrReports(session, {
        reportType: searchParams.get("reportType") || undefined,
        dateFrom: searchParams.get("dateFrom") || undefined,
        dateTo: searchParams.get("dateTo") || undefined,
      }),
    });
  } catch {
    return jsonError("HR тайлан харах эрх хүрэлцэхгүй байна.", 403);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrSpecialistAccess(session);
    const formData = await request.formData();
    const reportType = getString(formData, "reportType") as HrReportType;
    const dateFrom = getString(formData, "dateFrom");
    const dateTo = getString(formData, "dateTo");
    if (!reportType) return jsonError("Тайлангийн төрөл сонгоно уу.", 400);
    if (!dateFrom || !dateTo) return jsonError("Эхлэх болон дуусах огноо заавал оруулна уу.", 400);
    const report = await generateHrReport(session, {
      reportType,
      dateFrom,
      dateTo,
      departmentId: getNumber(formData, "departmentId"),
    });
    return Response.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Энэ үйлдлийг зөвхөн хүний нөөцийн эрхтэй хэрэглэгч хийх боломжтой.", 403);
    }
    return jsonError(error instanceof Error ? error.message : "HR тайлан гаргахад алдаа гарлаа.", 400);
  }
}

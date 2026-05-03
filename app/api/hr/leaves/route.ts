import { getSession } from "@/lib/auth";
import { createLeave, getLeaves, requireHrAccess, type HrLeaveCreateInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? "");
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function files(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    return Response.json({ leaves: await getLeaves(session) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/leaves failed:", error);
    return jsonError("Чөлөөний бүртгэл уншихад алдаа гарлаа.");
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const formData = await request.formData();
    const input: HrLeaveCreateInput = {
      employeeId: getNumber(formData, "employeeId") ?? 0,
      leaveTypeId: getNumber(formData, "leaveTypeId"),
      dateFrom: getString(formData, "dateFrom"),
      dateTo: getString(formData, "dateTo"),
      note: getString(formData, "note"),
      confirm: formData.get("confirm") === "on",
      files: files(formData, "files"),
    };

    if (!input.employeeId) return jsonError("Ажилтан сонгоно уу.", 400);
    if (!input.dateFrom || !input.dateTo) return jsonError("Эхлэх болон дуусах огноо заавал бөглөнө үү.", 400);
    if (input.dateTo < input.dateFrom) {
      return jsonError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.", 400);
    }

    return Response.json({ leave: await createLeave(session, input) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("POST /api/hr/leaves failed:", error);
    return jsonError(error instanceof Error ? error.message : "Чөлөө бүртгэхэд алдаа гарлаа.");
  }
}

import { getSession } from "@/lib/auth";
import {
  requireHrAccess,
  updateTimeoffRequest,
  type HrTimeoffRequestCreateInput,
  type HrTimeoffRequestType,
} from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function files(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

function requestType(value: string): HrTimeoffRequestType {
  return value === "sick" ? "sick" : "time_off";
}

type RouteCtx = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return jsonError("Хүсэлтийн дугаар буруу байна.", 400);
    }
    const formData = await request.formData();
    const input: HrTimeoffRequestCreateInput = {
      employeeId: 0,
      requestType: requestType(getString(formData, "requestType")),
      dateFrom: getString(formData, "dateFrom"),
      dateTo: getString(formData, "dateTo"),
      reason: getString(formData, "reason"),
      note: getString(formData, "note"),
      submit: formData.get("intent") !== "draft",
      files: files(formData, "files"),
    };

    if (!input.dateFrom || !input.dateTo) return jsonError("Эхлэх болон дуусах огноо заавал оруулна уу.", 400);
    if (input.dateTo < input.dateFrom) return jsonError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.", 400);
    if (!input.reason) return jsonError("Шалтгаан заавал оруулна уу.", 400);

    return Response.json({ request: await updateTimeoffRequest(session, requestId, input) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("PATCH /api/hr/timeoff-requests/[id] failed:", error);
    return jsonError(error instanceof Error ? error.message : "Хүсэлт засахад алдаа гарлаа.");
  }
}

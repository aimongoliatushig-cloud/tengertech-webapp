import { getSession } from "@/lib/auth";
import {
  createTimeoffRequest,
  getTimeoffRequests,
  requireHrAccess,
  type HrTimeoffRequestCreateInput,
  type HrTimeoffRequestType,
} from "@/lib/hr";

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

function requestType(value: string): HrTimeoffRequestType {
  return value === "sick" ? "sick" : "time_off";
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Чөлөө / өвчтэй хүсэлт боловсруулахад алдаа гарлаа.";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const url = new URL(request.url);
    const filters = {
      state: url.searchParams.get("state") || undefined,
      requestType: url.searchParams.get("requestType") || undefined,
      employeeId: url.searchParams.get("employeeId") || undefined,
      departmentId: url.searchParams.get("departmentId") || undefined,
    };
    return Response.json({ requests: await getTimeoffRequests(session, filters) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/timeoff-requests failed:", error);
    return jsonError(errorMessage(error));
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const formData = await request.formData();
    const input: HrTimeoffRequestCreateInput = {
      employeeId: getNumber(formData, "employeeId") ?? 0,
      requestType: requestType(getString(formData, "requestType")),
      dateFrom: getString(formData, "dateFrom"),
      dateTo: getString(formData, "dateTo"),
      reason: getString(formData, "reason"),
      note: getString(formData, "note"),
      submit: formData.get("intent") !== "draft",
      files: files(formData, "files"),
    };

    if (!input.employeeId) return jsonError("Ажилтан сонгоно уу.", 400);
    if (!input.requestType) return jsonError("Хүсэлтийн төрөл заавал сонгоно уу.", 400);
    if (!input.dateFrom || !input.dateTo) return jsonError("Эхлэх болон дуусах огноо заавал оруулна уу.", 400);
    if (input.dateTo < input.dateFrom) return jsonError("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.", 400);
    if (!input.reason) return jsonError("Шалтгаан заавал оруулна уу.", 400);
    if (input.submit && !input.files?.length) {
      return jsonError("Хүсэлт илгээхийн тулд хавсралтын зураг заавал оруулна уу.", 400);
    }

    return Response.json({ request: await createTimeoffRequest(session, input) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    if (error instanceof Error && error.message === "HR_TIMEOFF_REQUESTER_ONLY") {
      return jsonError(
        "Зөвхөн хэлтсийн дарга өөрийн хэлтсийн ажилтанд чөлөө / өвчтэй хүсэлт илгээх боломжтой. Хүний нөөцийн мэргэжилтэн зөвхөн ирсэн хүсэлтийг хянаж батална эсвэл татгалзана.",
        403,
      );
    }
    console.error("POST /api/hr/timeoff-requests failed:", error);
    return jsonError(errorMessage(error));
  }
}

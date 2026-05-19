import {
  canAccessProcurementModule,
  getSession,
} from "@/lib/auth";
import { loadProcurementRequestDetail } from "@/lib/procurement";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

function jsonError(message: string, status = 500) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return jsonError("Нэвтрэх шаардлагатай.", 401);
  }
  if (!canAccessProcurementModule(session)) {
    return jsonError("Худалдан авалт харах эрхгүй байна.", 403);
  }

  const { requestId } = await context.params;
  const parsedRequestId = Number(requestId);
  if (!Number.isFinite(parsedRequestId) || parsedRequestId <= 0) {
    return jsonError("Хүсэлтийн дугаар буруу байна.", 400);
  }

  try {
    const item = await loadProcurementRequestDetail(parsedRequestId, {
      login: session.login,
      password: session.password,
    });
    return Response.json({ ok: true, item });
  } catch (error) {
    console.error("GET /api/procurement/requests/[requestId] failed:", error);
    return jsonError("Худалдан авалтын дэлгэрэнгүй мэдээлэл дуудагдсангүй.");
  }
}

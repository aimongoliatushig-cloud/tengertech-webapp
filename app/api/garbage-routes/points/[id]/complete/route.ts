import { completePoint } from "@/lib/garbage-routes";
import { jsonError, numberParam, withSession } from "../../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const stopLineId = numberParam(id);
  if (!stopLineId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  const payload = await request.json().catch(() => ({}));
  return withSession((session) =>
    completePoint(
      session,
      stopLineId,
      typeof payload.note === "string" ? payload.note : undefined,
      typeof payload.issueReason === "string" ? payload.issueReason : undefined,
    ),
  );
}

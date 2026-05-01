import { markPointArrived } from "@/lib/garbage-routes";
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
    markPointArrived(session, stopLineId, typeof payload.skipReason === "string" ? payload.skipReason : undefined),
  );
}

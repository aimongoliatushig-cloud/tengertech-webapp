import { loadDailyRoute } from "@/lib/garbage-routes";
import { jsonError, numberParam, withSession } from "../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const taskId = numberParam(id);
  if (!taskId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  return withSession(async (session) => {
    const result = await loadDailyRoute(session, taskId);
    if (!result) {
      throw new Error("Маршрут олдсонгүй.");
    }
    return result;
  });
}

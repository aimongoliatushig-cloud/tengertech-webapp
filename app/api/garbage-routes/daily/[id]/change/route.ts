import { changeDailyRoute, type DailyChangeInput } from "@/lib/garbage-routes";
import { jsonError, numberParam, withSession } from "../../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const taskId = numberParam(id);
  if (!taskId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  const payload = (await request.json().catch(() => null)) as DailyChangeInput | null;
  if (!payload) {
    return jsonError("Өөрчлөлтийн мэдээлэл буруу байна.", 400);
  }
  return withSession((session) => changeDailyRoute(session, taskId, payload));
}

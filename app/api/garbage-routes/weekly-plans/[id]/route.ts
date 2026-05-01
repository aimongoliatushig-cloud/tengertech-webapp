import { loadWeeklyPlan, saveWeeklyPlan, type WeeklyPlanInput } from "@/lib/garbage-routes";
import { jsonError, numberParam, withSession } from "../../_utils";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const planId = numberParam(id);
  if (!planId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  return withSession(async (session) => {
    const result = await loadWeeklyPlan(session, planId);
    if (!result) {
      throw new Error("Маршрут олдсонгүй.");
    }
    return result;
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const planId = numberParam(id);
  if (!planId) {
    return jsonError("Маршрут олдсонгүй.", 404);
  }
  let payload: WeeklyPlanInput;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Хадгалах мэдээлэл буруу байна.", 400);
  }
  return withSession((session) => saveWeeklyPlan(session, payload, planId));
}

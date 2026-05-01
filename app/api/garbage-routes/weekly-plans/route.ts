import { loadWeeklyPlans, saveWeeklyPlan, type WeeklyPlanInput } from "@/lib/garbage-routes";
import { jsonError, withSession } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSession((session) => loadWeeklyPlans(session));
}

export async function POST(request: Request) {
  let payload: WeeklyPlanInput;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Хадгалах мэдээлэл буруу байна.", 400);
  }
  return withSession((session) => saveWeeklyPlan(session, payload));
}

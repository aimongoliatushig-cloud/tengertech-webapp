import { generateTodayTasks } from "@/lib/garbage-routes";
import { withSession } from "../_utils";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  return withSession((session) => generateTodayTasks(session, typeof payload.date === "string" ? payload.date : undefined));
}

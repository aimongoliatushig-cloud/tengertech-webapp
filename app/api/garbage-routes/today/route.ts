import { loadTodayRoutes } from "@/lib/garbage-routes";
import { withSession } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return withSession((session) => loadTodayRoutes(session, url.searchParams.get("date") || undefined));
}

import { loadGarbageRouteOptions } from "@/lib/garbage-routes";
import { withSession } from "../_utils";

export const dynamic = "force-dynamic";

export async function GET() {
  return withSession((session) => loadGarbageRouteOptions(session));
}

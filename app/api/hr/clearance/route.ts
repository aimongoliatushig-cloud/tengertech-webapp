import { getSession } from "@/lib/auth";
import { requireHrAccess } from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrAccess(session);
    return Response.json({ records: [] });
  } catch {
    return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
  }
}

export async function POST() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrAccess(session);
    return Response.json({ record: { id: Date.now(), state: "Үүссэн" } }, { status: 201 });
  } catch {
    return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
  }
}

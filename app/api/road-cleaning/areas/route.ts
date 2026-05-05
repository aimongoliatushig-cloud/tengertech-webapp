import { hasCapability, requireSession } from "@/lib/auth";
import { createLocalRoadCleaningArea } from "@/lib/road-cleaning-area-store";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    return Response.json({ error: "Цэвэрлэх талбай нэмэх эрхгүй байна." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as {
    name?: unknown;
    departmentId?: unknown;
    departmentName?: unknown;
    masterId?: unknown;
    masterName?: unknown;
    employeeId?: unknown;
    employeeName?: unknown;
  } | null;

  const name = typeof payload?.name === "string" ? payload.name : "";
  try {
    const area = await createLocalRoadCleaningArea({
      name,
      departmentId: Number(payload?.departmentId) || null,
      departmentName: typeof payload?.departmentName === "string" ? payload.departmentName : "",
      masterId: Number(payload?.masterId) || null,
      masterName: typeof payload?.masterName === "string" ? payload.masterName : "",
      employeeId: Number(payload?.employeeId) || null,
      employeeName: typeof payload?.employeeName === "string" ? payload.employeeName : "",
    });
    return Response.json({ area });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Цэвэрлэх талбай нэмэхэд алдаа гарлаа.";
    return Response.json({ error: message }, { status: 400 });
  }
}

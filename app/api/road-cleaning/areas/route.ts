import { hasCapability, isMasterRole, requireSession } from "@/lib/auth";
import { createLocalRoadCleaningArea } from "@/lib/road-cleaning-area-store";
import { loadRoadCleaningMasterEmployeeForUser } from "@/lib/workspace";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!hasCapability(session, "create_projects")) {
    return Response.json({ error: "Цэвэрлэх талбай нэмэх эрхгүй байна." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null) as {
    name?: unknown;
    khorooName?: unknown;
    areaM2?: unknown;
    departmentId?: unknown;
    departmentName?: unknown;
    masterId?: unknown;
    masterName?: unknown;
    employeeId?: unknown;
    employeeName?: unknown;
    note?: unknown;
  } | null;

  const name = typeof payload?.name === "string" ? payload.name : "";
  try {
    const currentRoadCleaningMaster = isMasterRole(session.role)
      ? await loadRoadCleaningMasterEmployeeForUser(session.uid, {
          login: session.login,
          password: session.password,
        })
      : null;
    if (isMasterRole(session.role) && !currentRoadCleaningMaster) {
      return Response.json(
        {
          error:
            "Таны хэрэглэгчтэй холбогдсон зам талбайн мастер олдсонгүй. Админд хандаж ажилтны бүртгэлээ шалгуулна уу.",
        },
        { status: 400 },
      );
    }
    const payloadMasterId = Number(payload?.masterId) || null;
    const masterId = currentRoadCleaningMaster?.id ?? payloadMasterId;
    const masterName =
      currentRoadCleaningMaster?.name ??
      (typeof payload?.masterName === "string" ? payload.masterName : "");
    const area = await createLocalRoadCleaningArea({
      name,
      khorooName: typeof payload?.khorooName === "string" ? payload.khorooName : "",
      areaM2: Number(payload?.areaM2) || null,
      departmentId: Number(payload?.departmentId) || null,
      departmentName: typeof payload?.departmentName === "string" ? payload.departmentName : "",
      masterId,
      masterName,
      employeeId: Number(payload?.employeeId) || null,
      employeeName: typeof payload?.employeeName === "string" ? payload.employeeName : "",
      note: typeof payload?.note === "string" ? payload.note : "",
    });
    return Response.json({ area });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Цэвэрлэх талбай нэмэхэд алдаа гарлаа.";
    return Response.json({ error: message }, { status: 400 });
  }
}

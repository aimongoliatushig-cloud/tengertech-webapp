import { getSession } from "@/lib/auth";
import {
  createClearanceRecord,
  getClearanceRecords,
  requireHrSpecialistAccess,
  type HrClearanceCreateInput,
} from "@/lib/hr";

export const dynamic = "force-dynamic";

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? "");
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    return Response.json({ records: await getClearanceRecords(session) });
  } catch {
    return jsonError("Танд тойрох хуудасны хэсэгт хандах HR эрх байхгүй байна.", 403);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);
  try {
    await requireHrSpecialistAccess(session);
    const formData = await request.formData();
    const input: HrClearanceCreateInput = {
      employeeId: getNumber(formData, "employeeId") ?? 0,
      savedDate: getString(formData, "savedDate"),
      section: getString(formData, "section") || "hr",
      state: getString(formData, "state") || "draft",
      note: getString(formData, "note"),
      files: getFiles(formData, "files"),
    };

    if (!input.employeeId) return jsonError("Ажилтан сонгоно уу.", 400);
    if (!input.savedDate) return jsonError("Хадгалсан огноо заавал оруулна уу.", 400);

    return Response.json({ record: await createClearanceRecord(session, input) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Энэ үйлдлийг зөвхөн хүний нөөцийн менежер хийх эрхтэй.", 403);
    }
    return jsonError(error instanceof Error ? error.message : "Тойрох хуудас хадгалахад алдаа гарлаа.", 400);
  }
}

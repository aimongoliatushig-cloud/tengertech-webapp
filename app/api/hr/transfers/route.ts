import { getSession } from "@/lib/auth";
import {
  createEmployeeTransfer,
  requireHrSpecialistAccess,
  type HrEmployeeTransferInput,
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
    await requireHrSpecialistAccess(session);
    return Response.json({ records: [] });
  } catch {
    return jsonError("Энэ үйлдлийг зөвхөн хүний нөөцийн мэргэжилтэн хийх эрхтэй.", 403);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    const formData = await request.formData();
    const input: HrEmployeeTransferInput = {
      employeeId: getNumber(formData, "employeeId") ?? 0,
      newDepartmentId: getNumber(formData, "newDepartmentId"),
      newJobId: getNumber(formData, "newJobId"),
      newManagerId: getNumber(formData, "newManagerId"),
      effectiveDate: getString(formData, "effectiveDate"),
      reason: getString(formData, "reason"),
      files: getFiles(formData, "files"),
    };
    const record = await createEmployeeTransfer(session, input);
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Энэ үйлдлийг зөвхөн хүний нөөцийн мэргэжилтэн хийх эрхтэй.", 403);
    }
    return jsonError(error instanceof Error ? error.message : "Шилжилт хөдөлгөөн бүртгэхэд алдаа гарлаа.", 400);
  }
}

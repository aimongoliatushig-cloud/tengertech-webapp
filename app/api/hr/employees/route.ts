import { getSession } from "@/lib/auth";
import { createEmployee, getEmployees, requireHrAccess, requireHrSpecialistAccess, type HrEmployeeCreateInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

const MAX_EMPLOYEE_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_EMPLOYEE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error ?? "");
}

function isOdooAccessError(error: unknown) {
  const normalized = getErrorMessage(error).toLocaleLowerCase("en-US");
  return (
    normalized.includes("access denied") ||
    normalized.includes("access error") ||
    normalized.includes("accesserror") ||
    normalized.includes("not allowed") ||
    normalized.includes("эрх хүрэлцэхгүй") ||
    normalized.includes("зөвшөөрөгдөөгүй")
  );
}

function extractMongolianErrorMessage(error: unknown) {
  const message = getErrorMessage(error);
  const line = message
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => /[\u0400-\u04ff]/.test(item) && !item.toLocaleLowerCase("en-US").includes("traceback"));
  return line?.replace(/^.*?(?=[\u0400-\u04ff])/, "").trim() || "";
}

function getNumber(formData: FormData, key: string) {
  const value = Number(formData.get(key) ?? "");
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function getOptionalEmployeePhotoBase64(formData: FormData) {
  const photo = formData.get("profilePhoto");
  if (!(photo instanceof File) || photo.size <= 0) {
    return "";
  }
  if (!ALLOWED_EMPLOYEE_PHOTO_TYPES.has(photo.type)) {
    throw new Error("INVALID_EMPLOYEE_PHOTO_TYPE");
  }
  if (photo.size > MAX_EMPLOYEE_PHOTO_SIZE) {
    throw new Error("EMPLOYEE_PHOTO_TOO_LARGE");
  }
  return Buffer.from(await photo.arrayBuffer()).toString("base64");
}

export async function GET() {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    return Response.json({ employees: await getEmployees(session) });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees failed:", error);
    return jsonError("Ажилтны мэдээлэл уншихад алдаа гарлаа.");
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrSpecialistAccess(session);
    const formData = await request.formData();
    const profilePhotoBase64 = await getOptionalEmployeePhotoBase64(formData);
    const input: HrEmployeeCreateInput = {
      lastName: getString(formData, "lastName"),
      firstName: getString(formData, "firstName"),
      registerNumber: getString(formData, "registerNumber"),
      gender: getString(formData, "gender"),
      birthDate: getString(formData, "birthDate"),
      phone: getString(formData, "phone"),
      email: getString(formData, "email"),
      departmentId: getNumber(formData, "departmentId"),
      jobId: getNumber(formData, "jobId"),
      jobTitle: getString(formData, "jobTitle"),
      managerId: getNumber(formData, "managerId"),
      startDate: getString(formData, "startDate"),
      workType: getString(formData, "workType"),
      isFieldEmployee: formData.get("isFieldEmployee") === "on",
      fieldRole: getString(formData, "fieldRole"),
      workLocation: getString(formData, "workLocation"),
      emergencyContact: getString(formData, "emergencyContact"),
      emergencyPhone: getString(formData, "emergencyPhone"),
      homeAddress: getString(formData, "homeAddress"),
      birthPlace: getString(formData, "birthPlace"),
      addressProvince: getString(formData, "addressProvince"),
      addressDistrict: getString(formData, "addressDistrict"),
      addressSubdistrict: getString(formData, "addressSubdistrict"),
      familyStatus: getString(formData, "familyStatus"),
      childrenCount: getNumber(formData, "childrenCount"),
      childrenInfo: getString(formData, "childrenInfo"),
      childrenSchool: getString(formData, "childrenSchool"),
      bankName: getString(formData, "bankName"),
      bankAccountNumber: getString(formData, "bankAccountNumber"),
      baseSalary: getString(formData, "baseSalary"),
      taxNumber: getString(formData, "taxNumber"),
      socialInsuranceStartDate: getString(formData, "socialInsuranceStartDate"),
      annualLeaveNote: getString(formData, "annualLeaveNote"),
      talent: getString(formData, "talent"),
      skillLevel: getString(formData, "skillLevel"),
      previousEmployment: getString(formData, "previousEmployment"),
      additionalDuty: getString(formData, "additionalDuty"),
      trialEndDate: getString(formData, "trialEndDate"),
      note: getString(formData, "note"),
      profilePhotoBase64,
    };

    if (!input.lastName) {
      return jsonError("Ажилтны овог заавал бөглөнө үү.", 400);
    }
    if (!input.firstName) {
      return jsonError("Ажилтны нэр заавал бөглөнө үү.", 400);
    }
    if (!input.registerNumber) {
      return jsonError("Регистрийн дугаар заавал бөглөнө үү.", 400);
    }
    if (!input.departmentId) {
      return jsonError("Хэлтэс / алба заавал сонгоно уу.", 400);
    }
    if (!input.jobId) {
      return jsonError("Албан тушаал заавал сонгоно уу.", 400);
    }
    if (input.startDate) {
      const startDate = new Date(`${input.startDate}T00:00:00`);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (!Number.isNaN(startDate.getTime()) && startDate > today) {
        return jsonError("Ажилд орсон огноо ирээдүйн огноо байж болохгүй.", 400);
      }
    }

    const employee = await createEmployee(session, input);
    return Response.json({ employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    if (error instanceof Error && error.message === "INVALID_EMPLOYEE_PHOTO_TYPE") {
      return jsonError("Зөвхөн JPG, PNG эсвэл WebP зураг оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_PHOTO_TOO_LARGE") {
      return jsonError("Ажилтны зураг 5MB-аас бага байх ёстой.", 400);
    }
    console.error("POST /api/hr/employees failed:", error);
    if (isOdooAccessError(error)) {
      return jsonError("Ажилтан бүртгэх эрх хүрэлцэхгүй байна. Хэрэглэгчийн HR эрхийг шалгана уу.", 403);
    }
    return jsonError(extractMongolianErrorMessage(error) || "Ажилтан бүртгэхэд алдаа гарлаа. Мэдээллээ шалгана уу.", 400);
  }
}

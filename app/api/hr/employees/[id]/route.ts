import { getSession } from "@/lib/auth";
import { getEmployee, requireHrAccess, requireHrSpecialistAccess, updateEmployee } from "@/lib/hr";

export const dynamic = "force-dynamic";

const MAX_EMPLOYEE_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_EMPLOYEE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function jsonError(message: string, status = 500) {
  return Response.json({ error: message }, { status });
}

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function formNumber(formData: FormData, key: string) {
  if (!formData.has(key)) return undefined;
  const value = Number(formData.get(key));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formNumberOrZero(formData: FormData, key: string) {
  if (!formData.has(key)) return undefined;
  const value = Number(formData.get(key));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function payloadString(payload: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
  return String(payload[key] ?? "").trim();
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
  const value = Number(payload[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function payloadNumberOrZero(payload: Record<string, unknown>, key: string) {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
  const value = Number(payload[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeEmployeeUpdatePayload(payload: Record<string, unknown>) {
  return {
    name: payloadString(payload, "name"),
    employeeCode: payloadString(payload, "employeeCode"),
    registerNumber: payloadString(payload, "registerNumber"),
    genderKey: payloadString(payload, "genderKey"),
    birthDate: payloadString(payload, "birthDate"),
    workPhone: payloadString(payload, "workPhone"),
    mobilePhone: payloadString(payload, "mobilePhone"),
    workEmail: payloadString(payload, "workEmail"),
    privatePhone: payloadString(payload, "privatePhone"),
    privateEmail: payloadString(payload, "privateEmail"),
    homeAddress: payloadString(payload, "homeAddress"),
    birthPlace: payloadString(payload, "birthPlace"),
    familyStatus: payloadString(payload, "familyStatus"),
    spouseName: payloadString(payload, "spouseName"),
    spouseBirthDate: payloadString(payload, "spouseBirthDate"),
    childrenCount: payloadNumberOrZero(payload, "childrenCount"),
    childrenInfo: payloadString(payload, "childrenInfo"),
    childrenSchool: payloadString(payload, "childrenSchool"),
    emergencyContact: payloadString(payload, "emergencyContact"),
    emergencyPhone: payloadString(payload, "emergencyPhone"),
    departmentId: payloadNumber(payload, "departmentId"),
    jobId: payloadNumber(payload, "jobId"),
    jobTitle: payloadString(payload, "jobTitle"),
    managerId: payloadNumber(payload, "managerId"),
    startDate: payloadString(payload, "startDate"),
    contractEndDate: payloadString(payload, "contractEndDate"),
    gradeRank: payloadString(payload, "gradeRank"),
    annualLeaveNote: payloadString(payload, "annualLeaveNote"),
    payCategory: payloadString(payload, "payCategory"),
    bankName: payloadString(payload, "bankName"),
    bankAccountNumber: payloadString(payload, "bankAccountNumber"),
    baseSalary: payloadString(payload, "baseSalary"),
    taxNumber: payloadString(payload, "taxNumber"),
    socialInsuranceStartDate: payloadString(payload, "socialInsuranceStartDate"),
    kpiScore: payloadNumberOrZero(payload, "kpiScore"),
    taskCompletionPercent: payloadNumberOrZero(payload, "taskCompletionPercent"),
    disciplineScore: payloadNumberOrZero(payload, "disciplineScore"),
    studyField: payloadString(payload, "studyField"),
    studySchool: payloadString(payload, "studySchool"),
    talent: payloadString(payload, "talent"),
    skillLevel: payloadString(payload, "skillLevel"),
    previousEmployment: payloadString(payload, "previousEmployment"),
    additionalDuty: payloadString(payload, "additionalDuty"),
    trialEndDate: payloadString(payload, "trialEndDate"),
    missingDocumentCount: payloadNumberOrZero(payload, "missingDocumentCount"),
    departureDate: payloadString(payload, "departureDate"),
    departureDescription: payloadString(payload, "departureDescription"),
    notes: payloadString(payload, "notes"),
  };
}

function compactUndefinedValues(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function validateEmployeeUpdatePayload(payload: Record<string, unknown>) {
  if (Object.prototype.hasOwnProperty.call(payload, "name") && !payload.name) {
    throw new Error("EMPLOYEE_NAME_REQUIRED");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "departmentId") && !payload.departmentId) {
    throw new Error("EMPLOYEE_DEPARTMENT_REQUIRED");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "jobId") && !payload.jobId) {
    throw new Error("EMPLOYEE_JOB_REQUIRED");
  }
}

async function parseEmployeeUpdatePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const payload = (await request.json()) as Record<string, unknown>;
    const normalized = compactUndefinedValues(normalizeEmployeeUpdatePayload(payload));
    validateEmployeeUpdatePayload(normalized);
    return normalized;
  }

  const formData = await request.formData();
  const payload: Record<string, unknown> = {};
  [
    "name",
    "employeeCode",
    "registerNumber",
    "genderKey",
    "birthDate",
    "workPhone",
    "mobilePhone",
    "workEmail",
    "privatePhone",
    "privateEmail",
    "homeAddress",
    "birthPlace",
    "familyStatus",
    "spouseName",
    "spouseBirthDate",
    "childrenInfo",
    "childrenSchool",
    "emergencyContact",
    "emergencyPhone",
    "jobTitle",
    "startDate",
    "contractEndDate",
    "gradeRank",
    "annualLeaveNote",
    "payCategory",
    "bankName",
    "bankAccountNumber",
    "baseSalary",
    "taxNumber",
    "socialInsuranceStartDate",
    "studyField",
    "studySchool",
    "talent",
    "skillLevel",
    "previousEmployment",
    "additionalDuty",
    "trialEndDate",
    "departureDate",
    "departureDescription",
    "notes",
  ].forEach((key) => {
    if (formData.has(key)) payload[key] = formString(formData, key);
  });
  ["departmentId", "jobId", "managerId"].forEach((key) => {
    const value = formNumber(formData, key);
    if (value !== undefined) payload[key] = value;
  });
  ["childrenCount", "kpiScore", "taskCompletionPercent", "disciplineScore", "missingDocumentCount"].forEach((key) => {
    const value = formNumberOrZero(formData, key);
    if (value !== undefined) payload[key] = value;
  });
  const photo = formData.get("profilePhoto");
  if (formData.get("removeProfilePhoto") === "1") {
    payload.profilePhotoBase64 = "";
  }

  validateEmployeeUpdatePayload(payload);

  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_EMPLOYEE_PHOTO_TYPES.has(photo.type)) {
      throw new Error("INVALID_EMPLOYEE_PHOTO_TYPE");
    }
    if (photo.size > MAX_EMPLOYEE_PHOTO_SIZE) {
      throw new Error("EMPLOYEE_PHOTO_TOO_LARGE");
    }
    payload.profilePhotoBase64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
  }

  return payload;
}

type RouteCtx = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrAccess(session);
    const { id } = await ctx.params;
    const employee = await getEmployee(session, Number(id));
    if (!employee) return jsonError("Ажилтны бүртгэл олдсонгүй.", 404);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    console.error("GET /api/hr/employees/[id] failed:", error);
    return jsonError("Ажилтны мэдээлэл уншихад алдаа гарлаа.");
  }
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const session = await getSession();
  if (!session) return jsonError("Нэвтрэх шаардлагатай.", 401);

  try {
    await requireHrSpecialistAccess(session);
    const { id } = await ctx.params;
    const employeeId = Number(id);
    const visibleEmployee = await getEmployee(session, employeeId);
    if (!visibleEmployee) return jsonError("Энэ ажилтны мэдээллийг засах эрхгүй байна.", 403);

    const payload = await parseEmployeeUpdatePayload(request);
    const employee = await updateEmployee(session, employeeId, payload);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Error && error.message === "HR_ACCESS_DENIED") {
      return jsonError("Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.", 403);
    }
    if (error instanceof Error && error.message === "INVALID_EMPLOYEE_PHOTO_TYPE") {
      return jsonError("Зөвхөн JPG, PNG эсвэл WebP зураг оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_PHOTO_TOO_LARGE") {
      return jsonError("Профайл зураг 5MB-аас бага байх ёстой.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_NAME_REQUIRED") {
      return jsonError("Ажилтны нэр заавал оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_DEPARTMENT_REQUIRED") {
      return jsonError("Хэлтэс / алба заавал сонгоно уу.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_JOB_REQUIRED") {
      return jsonError("Албан тушаал заавал сонгоно уу.", 400);
    }
    console.error("PATCH /api/hr/employees/[id] failed:", error);
    return jsonError("Ажилтны мэдээлэл шинэчлэхэд алдаа гарлаа.");
  }
}

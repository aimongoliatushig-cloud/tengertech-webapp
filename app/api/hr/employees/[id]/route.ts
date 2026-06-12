import { getSession } from "@/lib/auth";
import { getEmployee, requireHrAccess, requireHrSpecialistAccess, updateEmployee } from "@/lib/hr";

export const dynamic = "force-dynamic";

const MAX_EMPLOYEE_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_EDUCATION_DOCUMENT_SIZE = 10 * 1024 * 1024;
const MAX_EMPLOYEE_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_EMPLOYEE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EDUCATION_DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const ALLOWED_EMPLOYEE_DOCUMENT_TYPES = ALLOWED_EDUCATION_DOCUMENT_TYPES;

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

function isFutureDateValue(value: unknown) {
  const dateValue = String(value || "").trim();
  if (!dateValue) return false;
  const parsedDate = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate > today;
}

function parseEducationRecords(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return [];

  let rawRecords: unknown;
  try {
    rawRecords = typeof value === "string" ? JSON.parse(value) as unknown : value;
  } catch {
    throw new Error("INVALID_EDUCATION_RECORDS");
  }
  if (!Array.isArray(rawRecords)) {
    throw new Error("INVALID_EDUCATION_RECORDS");
  }

  return rawRecords
    .map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        id: String(record.id || `education-${index + 1}`),
        level: String(record.level ?? "").trim(),
        field: String(record.field ?? "").trim(),
        school: String(record.school ?? "").trim(),
      };
    })
    .filter((record) => record.level || record.field || record.school);
}

function parseDocumentRecords(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return [];

  let rawRecords: unknown;
  try {
    rawRecords = typeof value === "string" ? JSON.parse(value) as unknown : value;
  } catch {
    throw new Error("INVALID_DOCUMENT_RECORDS");
  }
  if (!Array.isArray(rawRecords)) {
    throw new Error("INVALID_DOCUMENT_RECORDS");
  }

  return rawRecords
    .map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        id: String(record.id || `document-${index + 1}`),
        name: String(record.name ?? "").trim(),
        type: String(record.type ?? "").trim(),
        status: String(record.status ?? "").trim(),
        date: String(record.date ?? "").trim(),
        attachmentIds: Array.isArray(record.attachmentIds)
          ? record.attachmentIds.map(Number).filter((attachmentId) => Number.isFinite(attachmentId) && attachmentId > 0)
          : [],
      };
    })
    .filter((record) => record.name || record.type || record.status || record.date || record.attachmentIds.length);
}

function normalizeEmployeeUpdatePayload(payload: Record<string, unknown>) {
  const educationRecords = parseEducationRecords(payload.educationRecords);
  const documentRecords = parseDocumentRecords(payload.documentRecords);
  const primaryEducationRecord = educationRecords?.[0];

  return {
    name: payloadString(payload, "name"),
    lastName: payloadString(payload, "lastName"),
    firstName: payloadString(payload, "firstName"),
    employeeCode: payloadString(payload, "employeeCode"),
    registerNumber: payloadString(payload, "registerNumber"),
    genderKey: payloadString(payload, "genderKey"),
    birthDate: payloadString(payload, "birthDate"),
    countryOfBirth: payloadString(payload, "countryOfBirth"),
    nationality: payloadString(payload, "nationality"),
    countryOfBirthId: payloadNumber(payload, "countryOfBirthId"),
    nationalityId: payloadNumber(payload, "nationalityId"),
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
    workType: payloadString(payload, "workType"),
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
    educationLevel: primaryEducationRecord ? primaryEducationRecord.level : payloadString(payload, "educationLevel"),
    educationRecords,
    studyField: primaryEducationRecord ? primaryEducationRecord.field : payloadString(payload, "studyField"),
    studySchool: primaryEducationRecord ? primaryEducationRecord.school : payloadString(payload, "studySchool"),
    talent: payloadString(payload, "talent"),
    skillLevel: payloadString(payload, "skillLevel"),
    previousEmployment: payloadString(payload, "previousEmployment"),
    additionalDuty: payloadString(payload, "additionalDuty"),
    trialEndDate: payloadString(payload, "trialEndDate"),
    missingDocumentCount: payloadNumberOrZero(payload, "missingDocumentCount"),
    documentRecords,
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
  if (Object.prototype.hasOwnProperty.call(payload, "startDate") && isFutureDateValue(payload.startDate)) {
    throw new Error("EMPLOYEE_START_DATE_IN_FUTURE");
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
    "lastName",
    "firstName",
    "genderKey",
    "birthDate",
    "countryOfBirth",
    "nationality",
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
    "workType",
    "annualLeaveNote",
    "payCategory",
    "bankName",
    "bankAccountNumber",
    "baseSalary",
    "taxNumber",
    "socialInsuranceStartDate",
    "educationLevel",
    "educationRecords",
    "studyField",
    "studySchool",
    "talent",
    "skillLevel",
    "previousEmployment",
    "additionalDuty",
    "trialEndDate",
    "documentRecords",
    "departureDate",
    "departureDescription",
    "notes",
  ].forEach((key) => {
    if (formData.has(key)) payload[key] = formString(formData, key);
  });
  ["departmentId", "jobId", "managerId", "countryOfBirthId", "nationalityId"].forEach((key) => {
    const value = formNumber(formData, key);
    if (value !== undefined) payload[key] = value;
  });
  ["childrenCount", "kpiScore", "taskCompletionPercent", "disciplineScore", "missingDocumentCount"].forEach((key) => {
    const value = formNumberOrZero(formData, key);
    if (value !== undefined) payload[key] = value;
  });
  const photo = formData.get("profilePhoto");
  const educationDocument = formData.get("educationDocument");
  if (formData.get("removeProfilePhoto") === "1") {
    payload.profilePhotoBase64 = "";
  }

  if (photo instanceof File && photo.size > 0) {
    if (!ALLOWED_EMPLOYEE_PHOTO_TYPES.has(photo.type)) {
      throw new Error("INVALID_EMPLOYEE_PHOTO_TYPE");
    }
    if (photo.size > MAX_EMPLOYEE_PHOTO_SIZE) {
      throw new Error("EMPLOYEE_PHOTO_TOO_LARGE");
    }
    payload.profilePhotoBase64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
  }
  if (educationDocument instanceof File && educationDocument.size > 0) {
    if (!ALLOWED_EDUCATION_DOCUMENT_TYPES.has(educationDocument.type)) {
      throw new Error("INVALID_EDUCATION_DOCUMENT_TYPE");
    }
    if (educationDocument.size > MAX_EDUCATION_DOCUMENT_SIZE) {
      throw new Error("EDUCATION_DOCUMENT_TOO_LARGE");
    }
    payload.educationAttachmentBase64 = Buffer.from(await educationDocument.arrayBuffer()).toString("base64");
    payload.educationAttachmentName = educationDocument.name || "Боловсролын баримт";
    payload.educationAttachmentMimeType = educationDocument.type || "application/octet-stream";
  }

  const normalizedPayload = normalizeEmployeeUpdatePayload(payload);
  const documentAttachments = [];
  if (normalizedPayload.documentRecords?.length) {
    for (const documentRecord of normalizedPayload.documentRecords) {
      const documentFile = formData.get(`documentFile-${documentRecord.id}`);
      if (!(documentFile instanceof File) || documentFile.size <= 0) continue;
      if (!ALLOWED_EMPLOYEE_DOCUMENT_TYPES.has(documentFile.type)) {
        throw new Error("INVALID_EMPLOYEE_DOCUMENT_TYPE");
      }
      if (documentFile.size > MAX_EMPLOYEE_DOCUMENT_SIZE) {
        throw new Error("EMPLOYEE_DOCUMENT_TOO_LARGE");
      }
      documentAttachments.push({
        recordId: documentRecord.id,
        name: documentFile.name || documentRecord.name || "Баримт бичиг",
        datas: Buffer.from(await documentFile.arrayBuffer()).toString("base64"),
        mimetype: documentFile.type || "application/octet-stream",
        documentType: documentRecord.type || "document",
      });
    }
  }

  const normalized = compactUndefinedValues({
    ...normalizedPayload,
    profilePhotoBase64: payload.profilePhotoBase64,
    educationAttachmentBase64: payload.educationAttachmentBase64,
    educationAttachmentName: payload.educationAttachmentName,
    educationAttachmentMimeType: payload.educationAttachmentMimeType,
    documentAttachments,
  });
  validateEmployeeUpdatePayload(normalized);
  return normalized;
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
    if (error instanceof Error && error.message === "INVALID_EDUCATION_DOCUMENT_TYPE") {
      return jsonError("Боловсролын баримтад зөвхөн JPG, PNG, WebP зураг эсвэл PDF файл оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EDUCATION_DOCUMENT_TOO_LARGE") {
      return jsonError("Боловсролын баримт 10MB-аас бага байх ёстой.", 400);
    }
    if (error instanceof Error && error.message === "INVALID_EMPLOYEE_DOCUMENT_TYPE") {
      return jsonError("Баримт бичигт зөвхөн JPG, PNG, WebP зураг эсвэл PDF файл оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EMPLOYEE_DOCUMENT_TOO_LARGE") {
      return jsonError("Баримт бичгийн файл 10MB-аас бага байх ёстой.", 400);
    }
    if (error instanceof Error && error.message === "INVALID_EDUCATION_RECORDS") {
      return jsonError("Боловсролын мөрүүдийн мэдээлэл буруу байна.", 400);
    }
    if (error instanceof Error && error.message === "INVALID_DOCUMENT_RECORDS") {
      return jsonError("Баримт бичгийн мөрүүдийн мэдээлэл буруу байна.", 400);
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
    if (error instanceof Error && error.message === "EMPLOYEE_START_DATE_IN_FUTURE") {
      return jsonError("Ажилд орсон огноо ирээдүйн огноо байж болохгүй.", 400);
    }
    console.error("PATCH /api/hr/employees/[id] failed:", error);
    return jsonError("Ажилтны мэдээлэл шинэчлэхэд алдаа гарлаа.");
  }
}

import { getSession } from "@/lib/auth";
import { createEmployee, createEmployeeTalentSkill, getEmployees, requireHrAccess, requireHrSpecialistAccess, type HrEmployeeCreateInput } from "@/lib/hr";

export const dynamic = "force-dynamic";

const MAX_EMPLOYEE_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_EDUCATION_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_EMPLOYEE_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EDUCATION_DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

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

function parseEducationRecords(value: unknown) {
  if (value === null || value === undefined || value === "") return [];

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

function parseTalentSkillRecords(value: unknown) {
  if (value === null || value === undefined || value === "") return [];

  let rawRecords: unknown;
  try {
    rawRecords = typeof value === "string" ? JSON.parse(value) as unknown : value;
  } catch {
    throw new Error("INVALID_TALENT_SKILL_RECORDS");
  }
  if (!Array.isArray(rawRecords)) {
    throw new Error("INVALID_TALENT_SKILL_RECORDS");
  }

  return rawRecords
    .map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        id: String(record.id || `talent-${index + 1}`),
        name: String(record.name ?? "").trim(),
        type: String(record.type ?? "").trim(),
        level: String(record.level ?? "").trim(),
        note: String(record.note ?? "").trim(),
      };
    })
    .filter((record) => record.name || record.type || record.level || record.note);
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

async function getOptionalEducationDocument(formData: FormData) {
  const document = formData.get("educationDocument");
  if (!(document instanceof File) || document.size <= 0) {
    return {};
  }
  if (!ALLOWED_EDUCATION_DOCUMENT_TYPES.has(document.type)) {
    throw new Error("INVALID_EDUCATION_DOCUMENT_TYPE");
  }
  if (document.size > MAX_EDUCATION_DOCUMENT_SIZE) {
    throw new Error("EDUCATION_DOCUMENT_TOO_LARGE");
  }
  return {
    educationAttachmentBase64: Buffer.from(await document.arrayBuffer()).toString("base64"),
    educationAttachmentName: document.name || "Боловсролын баримт",
    educationAttachmentMimeType: document.type || "application/octet-stream",
  };
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
    const educationDocument = await getOptionalEducationDocument(formData);
    const workType = getString(formData, "workType");
    const isTrialEmployee = workType === "Туршилтаар";
    const educationRecords = parseEducationRecords(formData.get("educationRecords"));
    const primaryEducationRecord = educationRecords[0];
    const talentSkillRecords = parseTalentSkillRecords(formData.get("talentSkillRecords"));
    const primaryTalentSkillRecord = talentSkillRecords[0];
    const input: HrEmployeeCreateInput = {
      lastName: getString(formData, "lastName"),
      firstName: getString(formData, "firstName"),
      registerNumber: getString(formData, "registerNumber"),
      gender: getString(formData, "gender"),
      birthDate: getString(formData, "birthDate"),
      countryOfBirth: getString(formData, "countryOfBirth"),
      nationality: getString(formData, "nationality"),
      countryOfBirthId: getNumber(formData, "countryOfBirthId"),
      nationalityId: getNumber(formData, "nationalityId"),
      phone: getString(formData, "phone"),
      email: getString(formData, "email"),
      departmentId: getNumber(formData, "departmentId"),
      jobId: getNumber(formData, "jobId"),
      jobTitle: getString(formData, "jobTitle"),
      managerId: getNumber(formData, "managerId"),
      startDate: getString(formData, "startDate"),
      workType,
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
      talent: primaryTalentSkillRecord?.name || getString(formData, "talent"),
      skillLevel: primaryTalentSkillRecord?.level || getString(formData, "skillLevel"),
      previousEmployment: primaryTalentSkillRecord?.type || getString(formData, "previousEmployment"),
      additionalDuty: primaryTalentSkillRecord?.note || getString(formData, "additionalDuty"),
      trialEndDate: isTrialEmployee ? getString(formData, "trialEndDate") : "",
      educationLevel: primaryEducationRecord?.level || getString(formData, "educationLevel"),
      educationRecords,
      studyField: primaryEducationRecord?.field || getString(formData, "studyField"),
      studySchool: primaryEducationRecord?.school || getString(formData, "studySchool"),
      note: getString(formData, "note"),
      profilePhotoBase64,
      ...educationDocument,
    };

    if (!input.lastName) {
      return jsonError("Ажилтны овог заавал бөглөнө үү.", 400);
    }
    if (!input.firstName) {
      return jsonError("Ажилтны нэр заавал бөглөнө үү.", 400);
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
    if (employee?.id && talentSkillRecords.length) {
      await Promise.all(
        talentSkillRecords.map((record) =>
          createEmployeeTalentSkill(session, employee.id, {
            name: record.name || record.level || record.type || "Ур чадвар",
            type: record.type,
            level: record.level,
            note: record.note,
          }),
        ),
      );
    }
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
    if (error instanceof Error && error.message === "INVALID_EDUCATION_DOCUMENT_TYPE") {
      return jsonError("Боловсролын баримтад зөвхөн JPG, PNG, WebP зураг эсвэл PDF файл оруулна уу.", 400);
    }
    if (error instanceof Error && error.message === "EDUCATION_DOCUMENT_TOO_LARGE") {
      return jsonError("Боловсролын баримт 10MB-аас бага байх ёстой.", 400);
    }
    if (error instanceof Error && error.message === "INVALID_EDUCATION_RECORDS") {
      return jsonError("Боловсролын мөрүүдийн мэдээлэл буруу байна.", 400);
    }
    if (error instanceof Error && error.message === "INVALID_TALENT_SKILL_RECORDS") {
      return jsonError("Ур чадварын мөрүүдийн мэдээлэл буруу байна.", 400);
    }
    console.error("POST /api/hr/employees failed:", error);
    if (isOdooAccessError(error)) {
      return jsonError("Ажилтан бүртгэх эрх хүрэлцэхгүй байна. Хэрэглэгчийн HR эрхийг шалгана уу.", 403);
    }
    return jsonError(extractMongolianErrorMessage(error) || "Ажилтан бүртгэхэд алдаа гарлаа. Мэдээллээ шалгана уу.", 400);
  }
}

import { fixMojibakeText } from "@/lib/text-normalize";

export const HR_DEPARTMENT_DISPLAY_ORDER = [
  "Удирдлага",
  "Дотоод хяналт",
  "Санхүүгийн хэлтэс",
  "Захиргаа",
  "Авто бааз, хог тээврийн хэлтэс",
  "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
  "Тохижилтын хэлтэс",
] as const;

const HR_DEPARTMENT_ORDER_INDEX = new Map<string, number>(
  HR_DEPARTMENT_DISPLAY_ORDER.map((departmentName, index) => [departmentName, index]),
);

function normalizeHrDepartmentText(value: unknown) {
  return fixMojibakeText(String(value ?? "")).trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function normalizeHrPersonKey(value: unknown) {
  return normalizeHrDepartmentText(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function isHrLeadershipTitle(normalizedTitle: string) {
  return (
    normalizedTitle.includes("захирал") ||
    normalizedTitle.includes("үйл ажиллагаа хариуцсан менежер") ||
    normalizedTitle.includes("uil ajillagaa hariutssan manager") ||
    normalizedTitle.includes("operations manager")
  );
}

function isHrFinanceTitle(normalizedTitle: string) {
  return (
    normalizedTitle.includes("ерөнхий ня-бо") ||
    normalizedTitle.includes("ерөнхий нягтлан") ||
    normalizedTitle.includes("нягтлан") ||
    normalizedTitle.includes("ня-бо") ||
    normalizedTitle.includes("нябо") ||
    normalizedTitle.includes("нярав") ||
    normalizedTitle.includes("accountant") ||
    normalizedTitle.includes("bookkeeper") ||
    normalizedTitle.includes("cashier")
  );
}

function isHrAdministrationTitle(normalizedTitle: string) {
  return (
    normalizedTitle.includes("хуулийн мэргэжилтэн") ||
    normalizedTitle.includes("тайлан") ||
    normalizedTitle.includes("төлөвлөгөө") ||
    normalizedTitle.includes("хүний нөөц") ||
    normalizedTitle.includes("олон нийт") ||
    normalizedTitle.includes("харилцах ажилтан") ||
    normalizedTitle.includes("мэдээлэл") ||
    normalizedTitle.includes("технолог") ||
    normalizedTitle.includes("technology") ||
    normalizedTitle.includes("information") ||
    normalizedTitle.includes("legal") ||
    normalizedTitle.includes("human resource") ||
    normalizedTitle.includes("public relation") ||
    normalizedTitle.includes("planning") ||
    normalizedTitle.includes("report")
  );
}

export function getHrJobTitleDisplayName(employeeName: string, jobTitle?: string | false | null) {
  const normalizedName = normalizeHrPersonKey(employeeName);
  const normalizedTitle = normalizeHrDepartmentText(jobTitle);
  // Байгууллагад ганц "Менежер" (Удирдлагын нэгж) = Үйл ажиллагаа хариуцсан
  // менежер. Odoo-д зүгээр "Менежер" гэж бүртгэгдсэн тул дэлгэцэнд бүтэн нэрээр.
  if (
    normalizedName === "ганхбаяр" ||
    normalizedName.endsWith("ганхбаяр") ||
    normalizedTitle === "менежер"
  ) {
    return "Үйл ажиллагаа хариуцсан менежер";
  }
  return fixMojibakeText(String(jobTitle || "Албан тушаал бүртгээгүй")).trim() || "Албан тушаал бүртгээгүй";
}

export function getHrEmployeeDepartmentDisplayName(
  employeeName: string,
  departmentName: string,
  jobTitle?: string | false | null,
) {
  const normalizedName = normalizeHrPersonKey(employeeName);
  const normalizedTitle = normalizeHrDepartmentText(jobTitle);
  if (
    normalizedName === "нарангоо" ||
    normalizedName.endsWith("нарангоо") ||
    normalizedName === "narangoo" ||
    normalizedName.endsWith("narangoo") ||
    normalizedTitle.includes("дотоод хяналт")
  ) {
    return "Дотоод хяналт";
  }
  return getHrDepartmentDisplayName(departmentName, jobTitle);
}

// Хэлтсийн даргын шууд удирдлага нь Захирал БА Үйл ажиллагаа хариуцсан менежер
// хоёулаа. Odoo-д parent_id ганц тул дэлгэцэнд хоёуланг нь харуулна.
export function getHrManagerDisplayName(
  jobTitle: string | false | null,
  rawManagerName: string,
) {
  const title = normalizeHrDepartmentText(jobTitle);
  const isDepartmentHead =
    title.includes("хэлтсийн дарга") ||
    title.includes("хэлтэсийн дарга") ||
    title.includes("албаны дарга");
  if (isDepartmentHead) {
    return "Захирал, Үйл ажиллагаа хариуцсан менежер";
  }
  return rawManagerName;
}

export function getHrDepartmentDisplayName(departmentName: string, jobTitle?: string | false | null) {
  const normalizedDepartment = normalizeHrDepartmentText(departmentName);
  const normalizedTitle = normalizeHrDepartmentText(jobTitle);

  if (
    normalizedDepartment.includes("дотоод хяналт") ||
    normalizedTitle.includes("дотоод хяналт")
  ) {
    return "Дотоод хяналт";
  }

  if (
    normalizedDepartment.includes("санхүү") ||
    normalizedDepartment.includes("нягтлан") ||
    normalizedDepartment.includes("ня-бо") ||
    normalizedDepartment.includes("finance") ||
    isHrFinanceTitle(normalizedTitle)
  ) {
    return "Санхүүгийн хэлтэс";
  }

  if (
    (normalizedTitle.includes("тээвэр") && normalizedTitle.includes("хяналт")) ||
    (normalizedTitle.includes("хог") && normalizedTitle.includes("хяналт"))
  ) {
    return "Авто бааз, хог тээврийн хэлтэс";
  }

  if (isHrLeadershipTitle(normalizedTitle)) {
    return "Удирдлага";
  }

  if (
    normalizedDepartment.includes("захиргаа") ||
    (normalizedDepartment.includes("удирдлага") && Boolean(normalizedTitle)) ||
    isHrAdministrationTitle(normalizedTitle)
  ) {
    return "Захиргаа";
  }

  if (
    normalizedDepartment.includes("хог") ||
    normalizedDepartment.includes("тээвэр") ||
    normalizedDepartment.includes("авто бааз")
  ) {
    return "Авто бааз, хог тээврийн хэлтэс";
  }
  if (
    normalizedDepartment.includes("ногоон") ||
    normalizedDepartment.includes("зам талбай") ||
    normalizedDepartment.includes("цэвэрлэгээ")
  ) {
    return "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
  }
  if (normalizedDepartment.includes("тохиж")) {
    return "Тохижилтын хэлтэс";
  }

  return fixMojibakeText(String(departmentName || "Хэлтэсгүй")).trim() || "Хэлтэсгүй";
}

export function getHrDepartmentOrderIndex(departmentName: string) {
  return HR_DEPARTMENT_ORDER_INDEX.get(getHrDepartmentDisplayName(departmentName)) ?? HR_DEPARTMENT_DISPLAY_ORDER.length;
}

export function compareHrDepartmentNames(left: string, right: string) {
  const leftName = getHrDepartmentDisplayName(left);
  const rightName = getHrDepartmentDisplayName(right);
  const rank = getHrDepartmentOrderIndex(leftName) - getHrDepartmentOrderIndex(rightName);
  return rank || leftName.localeCompare(rightName, "mn");
}

export function compareHrDepartmentThenName<T extends { departmentName?: string; name?: string }>(left: T, right: T) {
  const departmentOrder = compareHrDepartmentNames(left.departmentName || "", right.departmentName || "");
  return departmentOrder || String(left.name || "").localeCompare(String(right.name || ""), "mn");
}

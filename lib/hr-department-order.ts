import { fixMojibakeText } from "@/lib/text-normalize";

export const HR_DEPARTMENT_DISPLAY_ORDER = [
  "Удирдлага",
  "Захиргаа",
  "Санхүү",
  "Хог тээвэр",
  "Ногоон байгууламж",
  "Тохижилт",
] as const;

const HR_DEPARTMENT_ORDER_INDEX = new Map<string, number>(
  HR_DEPARTMENT_DISPLAY_ORDER.map((departmentName, index) => [departmentName, index]),
);

function normalizeHrDepartmentText(value: unknown) {
  return fixMojibakeText(String(value ?? "")).trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

export function getHrDepartmentDisplayName(departmentName: string, jobTitle?: string | false | null) {
  const normalizedDepartment = normalizeHrDepartmentText(departmentName);
  const normalizedTitle = normalizeHrDepartmentText(jobTitle);

  if (
    normalizedTitle.includes("захирал") ||
    normalizedTitle.includes("үйл ажиллагаа хариуцсан менежер") ||
    normalizedTitle.includes("uil ajillagaa hariutssan manager") ||
    normalizedTitle.includes("operations manager") ||
    normalizedDepartment.includes("удирдлага")
  ) {
    return "Удирдлага";
  }
  if (normalizedDepartment.includes("захиргаа")) {
    return "Захиргаа";
  }
  if (
    normalizedDepartment.includes("санхүү") ||
    normalizedDepartment.includes("нягтлан") ||
    normalizedDepartment.includes("ня-бо") ||
    normalizedDepartment.includes("finance")
  ) {
    return "Санхүү";
  }
  if (
    normalizedDepartment.includes("хог") ||
    normalizedDepartment.includes("тээвэр") ||
    normalizedDepartment.includes("авто бааз")
  ) {
    return "Хог тээвэр";
  }
  if (normalizedDepartment.includes("ногоон")) {
    return "Ногоон байгууламж";
  }
  if (normalizedDepartment.includes("тохиж")) {
    return "Тохижилт";
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

import { normalizeOrganizationUnitName } from "@/lib/department-groups";

const GARBAGE_DEPARTMENT_CANONICAL_NAME = "\u0410\u0432\u0442\u043e \u0431\u0430\u0430\u0437, \u0445\u043e\u0433 \u0442\u044d\u044d\u0432\u044d\u0440\u043b\u044d\u043b\u0442\u0438\u0439\u043d \u0445\u044d\u043b\u0442\u044d\u0441";

export function normalizeDepartmentText(value: string | null | undefined) {
  return (value || "").toLocaleLowerCase("mn-MN").replace(/\s+/g, " ").trim();
}

export function isAutoGarbageDepartment(departmentName: string | null | undefined) {
  // Canonical \u0442\u0430\u043d\u0438\u0445 \u043b\u043e\u0433\u0438\u043a \u043d\u044d\u0433 \u044d\u0445 \u0441\u0443\u0440\u0432\u0430\u043b\u0436\u0442\u0430\u0439 \u0431\u0430\u0439\u0445 \u0451\u0441\u0442\u043e\u0439 \u0442\u0443\u043b department-groups-\u0438\u0439\u043d
  // normalizeOrganizationUnitName-\u0438\u0439\u0433 \u0430\u0448\u0438\u0433\u043b\u0430\u043d\u0430 ("\u0410\u0432\u0442\u043e \u0431\u0430\u0430\u0437" \u044d\u0441\u0432\u044d\u043b "\u0425\u043e\u0433 \u0442\u044d\u044d\u0432\u044d\u0440\u043b\u044d\u043b\u0442"
  // \u0434\u0430\u043d\u0433\u0430\u0430\u0440 \u043d\u044c \u0447 \u0433\u044d\u0441\u044d\u043d \u043d\u044d\u0433 \u0445\u044d\u043b\u0442\u044d\u0441\u0442 \u0445\u0430\u043c\u0430\u0430\u0440\u043d\u0430, "\u0410\u0432\u0442\u043e \u0437\u0430\u0441\u0432\u0430\u0440" \u0433\u044d\u0445 \u043c\u044d\u0442 repair \u0445\u0430\u0441\u0430\u0433\u0434\u0430\u043d\u0430).
  return normalizeOrganizationUnitName(departmentName) === GARBAGE_DEPARTMENT_CANONICAL_NAME;
}

export function isGarbageTransportDepartment(departmentName: string | null | undefined) {
  const value = normalizeDepartmentText(departmentName);
  const hasGarbage =
    value.includes("\u0445\u043e\u0433") ||
    value.includes("garbage") ||
    value.includes("hog");
  const hasTransport =
    value.includes("\u0442\u044d\u044d\u0432\u044d\u0440") ||
    value.includes("transport") ||
    value.includes("teever");

  return hasGarbage && hasTransport;
}

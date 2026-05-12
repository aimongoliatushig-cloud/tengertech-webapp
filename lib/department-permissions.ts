export function normalizeDepartmentText(value: string | null | undefined) {
  return (value || "").toLocaleLowerCase("mn-MN").replace(/\s+/g, " ").trim();
}

export function isAutoGarbageDepartment(departmentName: string | null | undefined) {
  const value = normalizeDepartmentText(departmentName);
  const hasAuto = value.includes("\u0430\u0432\u0442\u043e") || value.includes("auto");
  const hasGarbageTransport =
    value.includes("\u0445\u043e\u0433") ||
    value.includes("\u0442\u044d\u044d\u0432\u044d\u0440") ||
    value.includes("garbage") ||
    value.includes("hog");

  return hasAuto && hasGarbageTransport;
}

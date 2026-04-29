export function normalizeDepartmentText(value: string | null | undefined) {
  return (value || "").toLocaleLowerCase("mn-MN").replace(/\s+/g, " ").trim();
}

export function isAutoGarbageDepartment(departmentName: string | null | undefined) {
  const value = normalizeDepartmentText(departmentName);
  return (
    value.includes("авто") ||
    value.includes("хог") ||
    value.includes("тээвэр") ||
    value.includes("auto") ||
    value.includes("hog")
  );
}

const NON_EMPLOYEE_ASSIGNMENT_NAMES = [
  "системийн админ",
  "system admin",
  "уртбаяр",
  "амарсанаа",
  "эрдэнэбат",
  "эрдэнэбулга",
  "сонорбилэг",
  "батсуурь",
  "чулуун",
  "чимэдочир",
  "чимэд-очир",
  "ганзориг",
];

export function isNonEmployeeAssignmentAccount(name: string) {
  const normalized = name.trim().toLocaleLowerCase("mn-MN");
  return NON_EMPLOYEE_ASSIGNMENT_NAMES.some((needle) => normalized.includes(needle));
}


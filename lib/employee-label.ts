/**
 * Ажилтан/хэрэглэгчийг ERP даяар нэг ижил форматаар харуулах туслах функцүүд:
 *   Нэр · Албан тушаал · Харьяалагдах хэлтэс
 * Утас/нэвтрэх нэрийг дэлгэцэнд харуулахгүй (зөвхөн хайлтад ашиглана).
 */

function cleanParts(values: Array<string | null | undefined>): string[] {
  return values.map((value) => (value ?? "").trim()).filter(Boolean);
}

/** Дэд мэдээлэл: "Албан тушаал · Хэлтэс" (нэр тусдаа гарчиг болж харагдах үед). */
export function formatEmployeeMeta(
  jobTitle?: string | null,
  departmentName?: string | null,
): string {
  const parts = cleanParts([jobTitle, departmentName]);
  return parts.length ? parts.join(" · ") : "Албан тушаал бүртгэлгүй";
}

/** Бүтэн шошго: "Нэр · Албан тушаал · Хэлтэс" (нэг мөрөнд харуулах үед). */
export function formatEmployeeLabel(
  name?: string | null,
  jobTitle?: string | null,
  departmentName?: string | null,
): string {
  const displayName = (name ?? "").trim() || "Нэргүй";
  return [displayName, ...cleanParts([jobTitle, departmentName])].join(" · ");
}

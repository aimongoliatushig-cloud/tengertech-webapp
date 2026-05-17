export const AUTO_GARBAGE_TRUCK_HERO_IMAGE =
  "/department-assets/auto-garbage-truck-hero.png";

function normalizeVisualScope(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

export function isAutoGarbageDepartmentScope(value?: string | null) {
  const normalized = normalizeVisualScope(value);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("хог тээвэр") ||
    (normalized.includes("авто") && normalized.includes("хог")) ||
    normalized.includes("garbage transport") ||
    normalized.includes("waste transport")
  );
}

export function resolveDepartmentHeaderImage(value?: string | null) {
  return isAutoGarbageDepartmentScope(value) ? AUTO_GARBAGE_TRUCK_HERO_IMAGE : "";
}


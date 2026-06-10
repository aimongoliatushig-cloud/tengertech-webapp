export function formatEmployeeDisplayName(name?: string | null) {
  const normalized = String(name || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  const existingInitialMatch = normalized.match(/^([\p{L}])\.\s*(.+)$/u);
  if (existingInitialMatch) {
    return `${existingInitialMatch[1].toLocaleUpperCase("mn-MN")}.${existingInitialMatch[2].trim()}`;
  }

  const parts = normalized.split(" ");
  if (parts.length < 2) {
    return normalized;
  }

  const [lastName, ...firstNameParts] = parts;
  const initial = Array.from(lastName)[0];
  const firstName = firstNameParts.join(" ");
  return initial && firstName ? `${initial.toLocaleUpperCase("mn-MN")}.${firstName}` : normalized;
}

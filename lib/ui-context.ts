export const UI_CONTEXT_FIELD = "__ui_context";

const MESSAGE_PARAMS = new Set(["notice", "error"]);

function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function safeInternalPath(value: string, fallback: string) {
  const candidate = value.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(candidate, "http://local.app");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function uiContextPathFromForm(formData: FormData, fallback: string) {
  const context =
    formString(formData, UI_CONTEXT_FIELD) ||
    formString(formData, "redirect_path") ||
    formString(formData, "returnTo") ||
    formString(formData, "return_to");

  return safeInternalPath(context, fallback);
}

export function pathWithActionMessage(
  path: string,
  kind: "notice" | "error",
  message: string,
  hashFallback = "",
) {
  const url = new URL(safeInternalPath(path, "/"), "http://local.app");
  for (const param of MESSAGE_PARAMS) {
    url.searchParams.delete(param);
  }
  url.searchParams.set(kind, message);

  if (!url.hash && hashFallback) {
    url.hash = hashFallback.startsWith("#") ? hashFallback : `#${hashFallback}`;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function uiContextPathWithMessage(
  formData: FormData,
  fallback: string,
  kind: "notice" | "error",
  message: string,
  hashFallback = "",
) {
  return pathWithActionMessage(uiContextPathFromForm(formData, fallback), kind, message, hashFallback);
}

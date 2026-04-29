type RequestUrlSource = {
  headers: Headers;
  url: string;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function normalizeOrigin(value?: string | null) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return "";
  }
}

function isInternalHost(host: string) {
  const normalized = host.toLowerCase().split(":")[0];
  return (
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "[::]" ||
    normalized === "127.0.0.1" ||
    normalized === "localhost"
  );
}

export function buildPublicUrl(request: RequestUrlSource, path: string) {
  const configuredOrigin = normalizeOrigin(
    process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL,
  );
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));

  if (configuredOrigin && (!host || isInternalHost(host))) {
    return new URL(path, configuredOrigin);
  }

  if (host) {
    const fallbackProtocol = new URL(request.url).protocol.replace(":", "") || "https";
    const protocol = forwardedProto || fallbackProtocol;
    return new URL(path, `${protocol}://${host}`);
  }

  if (configuredOrigin) {
    return new URL(path, configuredOrigin);
  }

  return new URL(path, request.url);
}

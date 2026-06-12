const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function hostnameFromHost(host: string) {
  const normalized = host.trim().toLowerCase();
  if (normalized.startsWith("[")) {
    return normalized.slice(0, normalized.indexOf("]") + 1);
  }
  return normalized.split(":")[0];
}

function isLoopbackHost(host: string) {
  const normalized = hostnameFromHost(host);
  return (
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "[::]" ||
    normalized === "[::1]" ||
    normalized === "127.0.0.1" ||
    normalized === "localhost"
  );
}

function originsMatch(left: string, right: string) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    if (leftUrl.origin === rightUrl.origin) {
      return true;
    }

    return (
      leftUrl.protocol === rightUrl.protocol &&
      leftUrl.port === rightUrl.port &&
      isLoopbackHost(leftUrl.host) &&
      isLoopbackHost(rightUrl.host)
    );
  } catch {
    return false;
  }
}

function getRequestOrigins(request: Request) {
  const origins = new Set<string>([new URL(request.url).origin]);
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));

  if (host) {
    const fallbackProtocol = new URL(request.url).protocol.replace(":", "") || "https";
    origins.add(`${forwardedProto || fallbackProtocol}://${host}`);
  }

  return Array.from(origins);
}

function getConfiguredOrigins() {
  return [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]
    .map((value) => {
      try {
        return value ? new URL(value).origin : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

export function isAllowedPostOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  return [...getRequestOrigins(request), ...getConfiguredOrigins()].some((allowedOrigin) =>
    originsMatch(origin, allowedOrigin),
  );
}

export function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function isLoginRateLimited(request: Request, login: string) {
  const now = Date.now();
  const key = `${getClientIp(request)}:${login.toLowerCase()}`;
  const current = loginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, {
      count: 1,
      resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  current.count += 1;
  return current.count > LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
}

export function clearLoginRateLimit(request: Request, login: string) {
  loginAttempts.delete(`${getClientIp(request)}:${login.toLowerCase()}`);
}

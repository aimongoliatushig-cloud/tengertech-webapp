const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const loginAttempts = new Map<string, LoginAttempt>();

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

  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || getConfiguredOrigins().includes(origin);
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

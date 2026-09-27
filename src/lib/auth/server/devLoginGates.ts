import { CANONICAL_SITE_URL, getCalculatorUrl } from "@/lib/common/site";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const LOCAL_APP_URL = "http://localhost:3000";

export function isDevLoginEnv(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "development";
}

export function isLocalDevLoginHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Fail closed unless `next dev` on localhost / 127.0.0.1. */
export function isDevLoginRequestAllowed(req: Request): boolean {
  if (!isDevLoginEnv()) return false;
  try {
    return isLocalDevLoginHost(new URL(req.url).hostname);
  } catch {
    return false;
  }
}

/**
 * Required query email must match `DEV_LOGIN_EMAIL`. Returns the normalized
 * email, or null when the query, env, or match is missing.
 */
export function matchDevLoginEmail(
  queryEmail: string | null | undefined,
  configured = process.env.DEV_LOGIN_EMAIL,
): string | null {
  const query = queryEmail ? normalizeEmail(queryEmail) : "";
  const expected = configured ? normalizeEmail(configured) : "";
  if (!query || !expected) return null;
  if (query !== expected) return null;
  return query;
}

function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedRedirectOrigins(): Set<string> {
  const allowed = new Set<string>([CANONICAL_SITE_URL]);
  for (const raw of [
    process.env.AUTH_URL,
    "http://localhost:3000",
    defaultCalculatorRedirect(),
  ]) {
    const origin = originOf(raw);
    if (origin) allowed.add(origin);
  }
  for (const origin of (process.env.AUTH_ALLOWED_ORIGINS ?? "").split(",")) {
    const trimmed = origin.trim();
    if (trimmed) allowed.add(trimmed);
  }
  return allowed;
}

export function defaultCalculatorRedirect(): string {
  if (isDevLoginEnv()) return LOCAL_APP_URL;
  return getCalculatorUrl();
}

/**
 * Resolve `next` onto an allowed origin. Relative paths stay on this app.
 * Invalid or disallowed `next` falls back to the app home.
 */
export function resolveDevLoginRedirect(
  next: string | null | undefined,
  requestUrl: string,
): string {
  const fallback = defaultCalculatorRedirect();
  const raw = next?.trim();
  if (!raw) return fallback;

  let target: URL;
  try {
    target = new URL(raw, requestUrl);
  } catch {
    return fallback;
  }

  if (!allowedRedirectOrigins().has(target.origin)) return fallback;
  return target.href;
}

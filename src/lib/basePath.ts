/**
 * Next.js `basePath`. Empty: this app is served at the site root.
 * Kept so fetches can still prefix a path if one is configured.
 */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}

/** App `basePath` from next.config, exposed for client fetches. */
export const BASE_PATH = getBasePath();

/** Prefix an absolute app path (e.g. `/api/plans`) with `basePath`. */
export function withBasePath(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalized;
  if (normalized === base || normalized.startsWith(`${base}/`)) {
    return normalized;
  }
  return `${base}${normalized}`;
}

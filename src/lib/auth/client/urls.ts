/** Auth.js API base. Same-origin `/api/auth` on this app. */
export function authApiBaseUrl(): string {
  return "/api/auth";
}

/** Full-page URL suitable as Auth.js callbackUrl (includes origin + path + query). */
export function currentCallbackUrl(fallbackPath = "/"): string {
  if (typeof window === "undefined") return fallbackPath;
  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

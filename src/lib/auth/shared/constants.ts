/** Cookie set by the client before sign-in so the server knows which tool to record */
export const AUTH_TOOL_COOKIE = "wl-auth-tool";

/** Entry surface stored on signup attempts (`calculator_gate` | `plan_share` | older names). */
export const AUTH_ENTRY_COOKIE = "wl-auth-entry";

/** Branded Auth.js error page (replaces `/api/auth/error`). */
export const AUTH_ERROR_PATH = "/auth/error";

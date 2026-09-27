/** Max length for a stored display name. */
export const USER_NAME_MAX_LENGTH = 100;

export function normalizeDisplayName(
  name: string | null | undefined,
): string {
  return typeof name === "string" ? name.trim() : "";
}

/**
 * True when the account has no usable display name (empty, or Auth.js left
 * the email in the name field after a magic-link signup).
 */
export function userNeedsName(
  name: string | null | undefined,
  email: string | null | undefined,
): boolean {
  const n = normalizeDisplayName(name);
  if (!n) return true;
  const e = typeof email === "string" ? email.trim() : "";
  if (e && n.toLowerCase() === e.toLowerCase()) return true;
  return false;
}

/** Validate and normalize a display name for persistence. */
export function parseDisplayName(
  name: unknown,
  email?: string | null,
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof name !== "string") {
    return { ok: false, error: "Enter your name." };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter your name." };
  }
  if (trimmed.length > USER_NAME_MAX_LENGTH) {
    return { ok: false, error: "Name is too long." };
  }
  const e = typeof email === "string" ? email.trim() : "";
  if (e && trimmed.toLowerCase() === e.toLowerCase()) {
    return { ok: false, error: "Enter your name, not your email." };
  }
  return { ok: true, name: trimmed };
}

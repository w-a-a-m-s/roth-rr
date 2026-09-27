import { AUTH_INVITE_COOKIE } from "@/lib/auth/client";

/**
 * Tab-scoped flag: set only when this visit captured `?invite=` from the URL.
 * The invite cookie alone must not open the guest calculator (it can linger).
 */
const INVITE_GUEST_SESSION_KEY = "wl-invite-guest-session";

/** Read the invite-code cookie set by `?invite=` capture. */
export function readInviteCodeFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${AUTH_INVITE_COOKIE}=`;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(prefix));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.slice(prefix.length)).trim();
    return value || null;
  } catch {
    return null;
  }
}

export function hasInviteCookie(): boolean {
  return Boolean(readInviteCodeFromDocument());
}

/** Mark this tab as an invite-link guest (build plan before auth). */
export function beginInviteGuestSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(INVITE_GUEST_SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearInviteGuestSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(INVITE_GUEST_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** True only after this tab landed with `?invite=`. */
export function hasInviteGuestSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(INVITE_GUEST_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

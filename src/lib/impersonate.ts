/**
 * Calculator-local impersonation APIs (same origin as the session cookie jar).
 * Same origin as the session cookie. Set-Cookie must hit this host.
 * There is no stop call: impersonation ends on sign-out or cookie expiry.
 */

import { withBasePath } from "@/lib/basePath";

export type ImpersonationUser = {
  id: string;
  email: string | null;
  name: string | null;
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // ignore
  }
  return res.statusText || "Request failed";
}

export async function fetchImpersonationUsers(): Promise<ImpersonationUser[]> {
  const res = await fetch(withBasePath("/api/impersonate/users"));
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { users?: ImpersonationUser[] };
  return Array.isArray(body.users) ? body.users : [];
}

export async function startImpersonation(userId: string): Promise<void> {
  const res = await fetch(withBasePath("/api/impersonate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

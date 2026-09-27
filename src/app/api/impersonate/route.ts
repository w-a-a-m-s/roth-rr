import {
  auth,
  getUserForImpersonation,
  isSuperAdminUser,
  startImpersonationCookie,
} from "@/lib/auth/server";

async function requireSuperAdmin(): Promise<
  { real: { id: string } } | { error: Response }
> {
  const session = await auth();
  const realId =
    session?.impersonation?.realUserId ?? session?.user?.id ?? null;
  if (!realId) return { error: new Response(null, { status: 401 }) };

  // Re-check the flag on the real user document, never trust the session alone.
  const real = await getUserForImpersonation(realId);
  if (!real || !isSuperAdminUser(real)) {
    return { error: new Response(null, { status: 403 }) };
  }
  return { real: { id: real.id } };
}

/**
 * Start impersonating another user: sets the signed impersonation cookie.
 * There is no stop endpoint - impersonation ends on sign-out (the cookie is
 * bound to the session token) or when the cookie expires.
 */
export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate.error;

  let body: { userId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }
  if (userId === gate.real.id) {
    return Response.json(
      { error: "Cannot impersonate yourself" },
      { status: 400 },
    );
  }

  const target = await getUserForImpersonation(userId);
  if (!target) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const ok = await startImpersonationCookie(gate.real.id, userId);
  if (!ok) return new Response(null, { status: 403 });

  return Response.json({
    ok: true,
    user: { id: target.id, email: target.email, name: target.name },
  });
}

import "server-only";

import {
  auth,
  getUserForImpersonation,
  isSuperAdminUser,
} from "@/lib/auth/server";

/** Real superAdmin id (never the impersonation target). */
export async function requireSuperAdmin(): Promise<
  { real: { id: string } } | { error: Response }
> {
  const session = await auth();
  const realId =
    session?.impersonation?.realUserId ?? session?.user?.id ?? null;
  if (!realId) return { error: new Response(null, { status: 401 }) };

  const real = await getUserForImpersonation(realId);
  if (!real || !isSuperAdminUser(real)) {
    return { error: new Response(null, { status: 403 }) };
  }
  return { real: { id: real.id } };
}

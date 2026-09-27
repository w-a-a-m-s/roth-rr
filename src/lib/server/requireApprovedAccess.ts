import "server-only";

import { auth } from "@/lib/auth/server";

export type ApprovedSession = {
  userId: string;
  email: string | null;
  impersonating: boolean;
};

/**
 * Require a signed-in user. Returns 401 when there is no session.
 */
export async function requireApprovedAccess(): Promise<
  ApprovedSession | { error: Response }
> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!session?.user || !userId) {
    return { error: new Response(null, { status: 401 }) };
  }

  return {
    userId,
    email: session.user.email ?? null,
    impersonating: Boolean(session.impersonation?.active),
  };
}

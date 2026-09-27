import {
  auth,
  getUserForImpersonation,
  isSuperAdminUser,
  listUsersForImpersonation,
} from "@/lib/auth/server";

/** List users for the impersonation picker (superAdmin only). */
export async function GET() {
  const session = await auth();
  const realId =
    session?.impersonation?.realUserId ?? session?.user?.id ?? null;
  if (!realId) return new Response(null, { status: 401 });

  const real = await getUserForImpersonation(realId);
  if (!real || !isSuperAdminUser(real)) {
    return new Response(null, { status: 403 });
  }

  const users = await listUsersForImpersonation();
  return Response.json({
    users: users.filter((u) => u.id !== real.id),
  });
}

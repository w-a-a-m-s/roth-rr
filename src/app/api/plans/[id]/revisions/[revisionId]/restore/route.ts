import { auth } from "@/lib/auth/server";
import { restoreRevision } from "@/lib/server/planRevisions";

type Ctx = { params: Promise<{ id: string; revisionId: string }> };

/** Restore a plan to a revision and append that restore as a new history entry. */
export async function POST(_req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  const { id, revisionId } = await ctx.params;
  const plan = await restoreRevision(userId, id, revisionId);
  if (!plan) return new Response(null, { status: 404 });
  return Response.json({ plan });
}

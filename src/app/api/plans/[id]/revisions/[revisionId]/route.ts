import { auth } from "@/lib/auth/server";
import { getRevision } from "@/lib/server/planRevisions";

type Ctx = { params: Promise<{ id: string; revisionId: string }> };

/** Load one revision (full snapshot) for preview. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  const { id, revisionId } = await ctx.params;
  const revision = await getRevision(userId, id, revisionId);
  if (!revision) return new Response(null, { status: 404 });
  return Response.json({ revision });
}

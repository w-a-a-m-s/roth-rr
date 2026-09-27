import { auth } from "@/lib/auth/server";
import { listRevisions } from "@/lib/server/planRevisions";

type Ctx = { params: Promise<{ id: string }> };

/** List revision summaries for a plan the signed-in user can access. */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  const { id } = await ctx.params;
  const revisions = await listRevisions(userId, id);
  if (!revisions) return new Response(null, { status: 404 });
  return Response.json({ revisions });
}

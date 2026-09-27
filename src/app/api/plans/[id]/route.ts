import { deletePlan, updatePlan } from "@/lib/server/plans";
import { requireApprovedAccess } from "@/lib/server/requireApprovedAccess";
import { maybeActivatePlanner } from "@/lib/server/activation";
import type { Household } from "@/lib/domain/types";

/** Update a plan the signed-in user owns. */
export async function PUT(req: Request, ctx: RouteContext<"/api/plans/[id]">) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;

  let body: { name?: unknown; household?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { name?: string; household?: Household } = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (body.household && typeof body.household === "object") {
    patch.household = body.household as Household;
  }

  const plan = await updatePlan(gate.userId, id, patch);
  if (plan === "name_taken") {
    return Response.json({ error: "name_taken" }, { status: 409 });
  }
  if (plan === "forbidden") return new Response(null, { status: 403 });
  if (!plan) return new Response(null, { status: 404 });
  if (body.source === "edit") {
    await maybeActivatePlanner(gate.userId, {
      impersonating: gate.impersonating,
    });
  }
  return Response.json({ plan });
}

/** Delete a plan the signed-in user owns. */
export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/plans/[id]">,
) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  const ok = await deletePlan(gate.userId, id);
  if (!ok) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}

import {
  addMember,
  listMembers,
  lookupShareEmail,
  removeMember,
  resendInvite,
  updateMemberRole,
} from "@/lib/server/plans";
import { requireApprovedAccess } from "@/lib/server/requireApprovedAccess";
import { isPlanRole } from "@/lib/sharing";

type Ctx = RouteContext<"/api/plans/[id]/members">;

/** List the members + pending invites of a plan the user can access. */
export async function GET(req: Request, ctx: Ctx) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;
  const userId = gate.userId;

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const lookup = url.searchParams.get("lookup");
  if (lookup != null) {
    const result = await lookupShareEmail(userId, id, lookup);
    if (result === "notFound") return new Response(null, { status: 404 });
    if (result === "forbidden") return new Response(null, { status: 403 });
    if (result === "invalid") {
      return Response.json({ error: "invalidEmail" }, { status: 400 });
    }
    return Response.json({ status: result });
  }

  const members = await listMembers(userId, id);
  if (!members) return new Response(null, { status: 404 });
  return Response.json({ members });
}

/** Share the plan with someone by email + role, or resend a pending invite. */
export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;
  const userId = gate.userId;

  const { id } = await ctx.params;

  let body: { email?: unknown; role?: unknown; resend?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";

  if (body.resend === true) {
    const result = await resendInvite(userId, id, email);
    if (result === "ok") return Response.json({ ok: true });
    if (result === "notFound") return new Response(null, { status: 404 });
    if (result === "forbidden") return new Response(null, { status: 403 });
    return Response.json({ error: "invalidEmail" }, { status: 400 });
  }

  const role = isPlanRole(body.role) ? body.role : "editor";

  const result = await addMember(userId, id, email, role);
  if (result.ok) {
    return Response.json({ ok: true, kind: result.kind }, { status: 201 });
  }
  if (result.error === "notFound") return new Response(null, { status: 404 });
  if (result.error === "forbidden") return new Response(null, { status: 403 });
  if (result.error === "alreadyMember") {
    return Response.json({ error: "alreadyMember" }, { status: 409 });
  }
  return Response.json({ error: "invalidEmail" }, { status: 400 });
}

/** Change the role of a member (by userId) or a pending invite (by email). */
export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;
  const userId = gate.userId;

  const { id } = await ctx.params;

  let body: { userId?: unknown; email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isPlanRole(body.role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  const target = {
    userId: typeof body.userId === "string" ? body.userId : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
  };

  const ok = await updateMemberRole(userId, id, target, body.role);
  if (!ok) return new Response(null, { status: 404 });
  return Response.json({ ok: true });
}

/** Remove a member (by userId) or a pending invite (by email). */
export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;
  const userId = gate.userId;

  const { id } = await ctx.params;

  let body: { userId?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const target = {
    userId: typeof body.userId === "string" ? body.userId : undefined,
    email: typeof body.email === "string" ? body.email : undefined,
  };

  const ok = await removeMember(userId, id, target);
  if (!ok) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}

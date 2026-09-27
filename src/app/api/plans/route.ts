import { claimInvites, createPlan, listPlans } from "@/lib/server/plans";
import { requireApprovedAccess } from "@/lib/server/requireApprovedAccess";
import {
  analyticsSessionStartedAt,
  markFirstPlanGenerated,
  maybeActivatePlanner,
} from "@/lib/server/activation";
import { getToolRegistration } from "@/lib/auth/server";
import type { Household } from "@/lib/domain/types";

/** List the plans the signed-in user can access (owned + shared with them). */
export async function GET() {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;

  // Pick up any plans shared to this user's email before they had an account.
  await claimInvites(gate.userId, gate.email);
  await analyticsSessionStartedAt();
  const plans = await listPlans(gate.userId);
  return Response.json({ plans });
}

/** Create a new plan for the signed-in user. */
export async function POST(req: Request) {
  const gate = await requireApprovedAccess();
  if ("error" in gate) return gate.error;

  let body: { name?: unknown; household?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const household = body.household;
  if (!household || typeof household !== "object") {
    return Response.json({ error: "Missing household" }, { status: 400 });
  }

  const plan = await createPlan(gate.userId, {
    name,
    household: household as Household,
  });
  if (plan === "name_taken") {
    return Response.json({ error: "name_taken" }, { status: 409 });
  }
  const prior = await getToolRegistration(gate.userId, "roth");
  if (prior?.firstPlanGeneratedAt) {
    await maybeActivatePlanner(gate.userId, {
      impersonating: gate.impersonating,
    });
  } else {
    await markFirstPlanGenerated(gate.userId);
  }
  return Response.json({ plan }, { status: 201 });
}

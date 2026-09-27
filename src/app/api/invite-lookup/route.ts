import { lookupInviteCode } from "@/lib/auth/server";

/** Public: resolve a plan-share (or leftover admin) invite link code. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const result = await lookupInviteCode(code);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 });
  }
  return Response.json({
    usable: result.usable,
    status: result.status,
    source: result.source,
    email: result.email,
  });
}

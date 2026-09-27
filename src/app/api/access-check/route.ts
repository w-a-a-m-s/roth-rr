import { lookupEmailForAuth } from "@/lib/auth/server";

/** Public: lookup email for Login / Register branching. */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email") ?? "";
  const result = await lookupEmailForAuth(email);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(result.lookup);
}

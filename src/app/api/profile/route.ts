import { auth, updateUserName } from "@/lib/auth/server";

/** Update the signed-in user's display name. */
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name =
    body && typeof body === "object" && "name" in body
      ? (body as { name: unknown }).name
      : undefined;

  const result = await updateUserName(
    userId,
    typeof name === "string" ? name : "",
    session.user?.email,
  );
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true, name: result.name });
}

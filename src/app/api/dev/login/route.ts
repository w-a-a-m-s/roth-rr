import { NextResponse } from "next/server";
import {
  createDevSession,
  findDevLoginUser,
  isDevLoginRequestAllowed,
  matchDevLoginEmail,
  resolveDevLoginRedirect,
  setDevSessionCookie,
} from "@/lib/auth/server";

export const runtime = "nodejs";

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * Local IDE login: mint an Auth.js session for DEV_LOGIN_EMAIL.
 * Fail closed (404) unless next dev + localhost + matching ?email=.
 */
export async function GET(req: Request) {
  if (!isDevLoginRequestAllowed(req)) return notFound();

  const url = new URL(req.url);
  const email = matchDevLoginEmail(url.searchParams.get("email"));
  if (!email) return notFound();

  const user = await findDevLoginUser(email);
  if (!user) return notFound();

  const session = await createDevSession(user.id);
  if (!session) return notFound();

  await setDevSessionCookie(session.sessionToken, session.expires);
  return NextResponse.redirect(resolveDevLoginRedirect(url.searchParams.get("next"), req.url));
}

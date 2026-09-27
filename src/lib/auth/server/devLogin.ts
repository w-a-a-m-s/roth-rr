import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/connection";
import { sessionTokenCookieName } from "./impersonate";
import { normalizeInviteEmail } from "./invites";

export {
  defaultCalculatorRedirect,
  isDevLoginEnv,
  isDevLoginRequestAllowed,
  isLocalDevLoginHost,
  matchDevLoginEmail,
  resolveDevLoginRedirect,
} from "./devLoginGates";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function findDevLoginUser(
  email: string,
): Promise<{ id: string } | null> {
  const lower = normalizeInviteEmail(email);
  if (!lower || !lower.includes("@")) return null;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { email: { $regex: `^${escapeRegex(lower)}$`, $options: "i" } },
    { projection: { _id: 1 } },
  );
  if (!user?._id) return null;
  return { id: String(user._id) };
}

export async function createDevSession(
  userId: string,
): Promise<{ sessionToken: string; expires: Date } | null> {
  if (!ObjectId.isValid(userId)) return null;
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  const db = await getDb();
  await db.collection("sessions").insertOne({
    sessionToken,
    userId: new ObjectId(userId),
    expires,
  });
  return { sessionToken, expires };
}

/** Set the Auth.js session cookie for the minted token. */
export async function setDevSessionCookie(
  sessionToken: string,
  expires: Date,
): Promise<void> {
  const jar = await cookies();
  jar.set(sessionTokenCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  });
}

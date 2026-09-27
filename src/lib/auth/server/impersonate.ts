import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/connection";
import type { RothUserFields } from "./users";

export type ImpersonationTarget = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
} & RothUserFields;

export type ImpersonationUserRow = {
  id: string;
  email: string | null;
  name: string | null;
};

export function isSuperAdminUser(
  user: RothUserFields | null | undefined,
): boolean {
  return user?.superAdmin === true;
}

/** Load a user document for session swap / listing. */
export async function getUserForImpersonation(
  userId: string,
): Promise<ImpersonationTarget | null> {
  if (!ObjectId.isValid(userId)) return null;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    {
      projection: {
        email: 1,
        name: 1,
        image: 1,
        legal: 1,
        tools: 1,
        superAdmin: 1,
      },
    },
  );
  if (!user) return null;
  const fields = user as RothUserFields & {
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };

  return {
    id: userId,
    email: typeof fields.email === "string" ? fields.email : null,
    name: typeof fields.name === "string" ? fields.name : null,
    image: typeof fields.image === "string" ? fields.image : null,
    legal: fields.legal,
    tools: fields.tools,
    superAdmin: fields.superAdmin === true,
  };
}

/*
 * Impersonation state lives in a signed, short-lived httpOnly cookie - never
 * in the DB. The token is bound to the admin's Auth.js session token, so a
 * full sign-out always ends impersonation (a new session gets a new token and
 * the leftover cookie no longer verifies). There is no explicit "exit".
 *
 * Token format: `adminId.targetId.sessionHash.exp.sig` (hex/int fields, so
 * `.` is a safe separator). `sig` is an HMAC-SHA256 over the other fields
 * using AUTH_SECRET.
 */

const IMPERSONATION_MAX_AGE_S = 60 * 60 * 2;

const isProd = () => process.env.NODE_ENV === "production";

export function impersonationCookieName(): string {
  return isProd() ? "__Secure-wl.impersonate" : "wl.impersonate";
}

/** Auth.js session cookie name (must match the NextAuth `cookies` config). */
export function sessionTokenCookieName(): string {
  return isProd() ? "__Secure-authjs.session-token" : "authjs.session-token";
}

function hmacHex(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

function hashSessionToken(sessionToken: string, key: string): string {
  return hmacHex(`session:${sessionToken}`, key);
}

/**
 * Sign and set the impersonation cookie for the current request's session.
 * Returns false when the secret or session token is unavailable.
 */
export async function startImpersonationCookie(
  adminUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(adminUserId) || !ObjectId.isValid(targetUserId)) {
    return false;
  }
  const key = process.env.AUTH_SECRET;
  if (!key) return false;

  const jar = await cookies();
  const sessionToken = jar.get(sessionTokenCookieName())?.value;
  if (!sessionToken) return false;

  const exp = Math.floor(Date.now() / 1000) + IMPERSONATION_MAX_AGE_S;
  const payload = `${adminUserId}.${targetUserId}.${hashSessionToken(sessionToken, key)}.${exp}`;
  jar.set(impersonationCookieName(), `${payload}.${hmacHex(payload, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    // Explicit "/" - an implicit path once broke clearing this cookie.
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE_S,
  });
  return true;
}

/**
 * Target user id from the impersonation cookie, or null when there is no
 * valid impersonation for this admin + session. Never throws (safe to call
 * from the session callback in any context).
 */
export async function getImpersonationTargetId(
  adminUserId: string,
): Promise<string | null> {
  const key = process.env.AUTH_SECRET;
  if (!key) return null;

  let token: string | undefined;
  let sessionToken: string | undefined;
  try {
    const jar = await cookies();
    token = jar.get(impersonationCookieName())?.value;
    sessionToken = jar.get(sessionTokenCookieName())?.value;
  } catch {
    // cookies() unavailable outside a request context
    return null;
  }
  if (!token || !sessionToken) return null;

  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [adminId, targetId, sessionHash, expRaw, sig] = parts;

  const expected = hmacHex(
    `${adminId}.${targetId}.${sessionHash}.${expRaw}`,
    key,
  );
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  if (adminId !== adminUserId) return null;
  if (sessionHash !== hashSessionToken(sessionToken, key)) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  if (!ObjectId.isValid(targetId) || targetId === adminId) return null;
  return targetId;
}

/** List auth users for the impersonation picker (superAdmin callers only). */
export async function listUsersForImpersonation(): Promise<
  ImpersonationUserRow[]
> {
  const db = await getDb();
  const rows = await db
    .collection("users")
    .find(
      {},
      {
        projection: { email: 1, name: 1 },
        sort: { email: 1 },
        limit: 500,
      },
    )
    .toArray();

  return rows.map((row) => {
    const id = String(row._id);
    const emailRaw = row.email;
    const nameRaw = row.name;
    const email = typeof emailRaw === "string" ? emailRaw : null;
    const name = typeof nameRaw === "string" ? nameRaw : null;
    return { id, email, name };
  });
}

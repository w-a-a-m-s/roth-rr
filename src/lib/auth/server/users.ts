import { ObjectId } from "mongodb";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/common/legal";
import { getDb } from "@/lib/db/connection";
import { AUTH_ENTRY_COOKIE, AUTH_TOOL_COOKIE } from "../shared/constants";
import { parseDisplayName } from "../shared/userName";

export { AUTH_ENTRY_COOKIE, AUTH_TOOL_COOKIE };
export {
  USER_NAME_MAX_LENGTH,
  normalizeDisplayName,
  parseDisplayName,
  userNeedsName,
} from "../shared/userName";

export type ToolId = string;

export type ToolRegistration = {
  registeredAt: Date;
  lastLoginAt: Date;
  firstPlanGeneratedAt?: Date;
  activatedAt?: Date;
};

export type UserLegal = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Date;
};

export type RothUserFields = {
  tools?: Record<string, ToolRegistration>;
  legal?: UserLegal;
  /** Manually set in Mongo (`users.superAdmin: true`). Enables impersonation. */
  superAdmin?: boolean;
};

export async function recordToolLogin(
  userId: string,
  toolId: ToolId,
): Promise<void> {
  if (!toolId || !ObjectId.isValid(userId)) return;
  const db = await getDb();
  const now = new Date();
  const users = db.collection("users");
  const existing = await users.findOne(
    { _id: new ObjectId(userId) },
    { projection: { [`tools.${toolId}`]: 1 } },
  );
  const prior = (existing as RothUserFields | null)?.tools?.[toolId];
  await users.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        [`tools.${toolId}`]: {
          ...prior,
          registeredAt: prior?.registeredAt ?? now,
          lastLoginAt: now,
        } satisfies ToolRegistration,
      },
    },
  );
}

export async function acceptLegal(
  userId: string,
  termsVersion: string = TERMS_VERSION,
  privacyVersion: string = PRIVACY_VERSION,
): Promise<void> {
  if (!ObjectId.isValid(userId)) return;
  const db = await getDb();
  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: {
        legal: {
          termsVersion,
          privacyVersion,
          acceptedAt: new Date(),
        } satisfies UserLegal,
      },
    },
  );
}

/** Contact fields from the user document. */
export type UserContact = {
  email: string;
  name: string | null;
};

/** Look up the user's email and name. */
export async function getUserContact(
  userId: string,
): Promise<UserContact | null> {
  if (!ObjectId.isValid(userId)) return null;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { email: 1, name: 1 } },
  );
  if (!user) return null;
  const emailRaw = (user as { email?: unknown }).email;
  if (typeof emailRaw !== "string") return null;
  const email = emailRaw.trim();
  if (!email) return null;
  const nameRaw = (user as { name?: unknown }).name;
  const name =
    typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null;
  return { email, name };
}

/** Persist a display name on the user document. */
export async function updateUserName(
  userId: string,
  name: string,
  email?: string | null,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, error: "Invalid user" };
  }
  const resolvedEmail =
    email ?? (await getUserContact(userId))?.email ?? null;
  const parsed = parseDisplayName(name, resolvedEmail);
  if (!parsed.ok) return parsed;

  const db = await getDb();
  const result = await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    { $set: { name: parsed.name } },
  );
  if (result.matchedCount === 0) {
    return { ok: false, error: "User not found" };
  }
  return { ok: true, name: parsed.name };
}

/** Look up the user's email. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const contact = await getUserContact(userId);
  return contact?.email ?? null;
}

export function userNeedsLegalReaccept(
  user: RothUserFields | null | undefined,
  termsVersion: string = TERMS_VERSION,
  privacyVersion: string = PRIVACY_VERSION,
): boolean {
  const legal = user?.legal;
  if (!legal) return true;
  return (
    legal.termsVersion !== termsVersion ||
    legal.privacyVersion !== privacyVersion
  );
}

export async function getToolRegistration(
  userId: string,
  toolId: ToolId,
): Promise<ToolRegistration | null> {
  if (!toolId || !ObjectId.isValid(userId)) return null;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { [`tools.${toolId}`]: 1 } },
  );
  return (user as RothUserFields | null)?.tools?.[toolId] ?? null;
}

/**
 * Set a timestamp on `tools.{toolId}.{field}` only if it is not already set.
 * Returns true when this call wrote the value.
 */
export async function setToolTimestampOnce(
  userId: string,
  toolId: ToolId,
  field: "firstPlanGeneratedAt" | "activatedAt",
  value: Date,
): Promise<boolean> {
  if (!toolId || !ObjectId.isValid(userId)) return false;
  const db = await getDb();
  const result = await db.collection("users").updateOne(
    {
      _id: new ObjectId(userId),
      [`tools.${toolId}.${field}`]: { $exists: false },
    },
    { $set: { [`tools.${toolId}.${field}`]: value } },
  );
  return result.modifiedCount > 0;
}

/** Hard force-logout: delete every Auth.js session. */
export async function invalidateAllSessions(): Promise<number> {
  const db = await getDb();
  const result = await db.collection("sessions").deleteMany({});
  return result.deletedCount;
}

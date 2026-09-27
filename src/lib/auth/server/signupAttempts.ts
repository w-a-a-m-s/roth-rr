import { cookies } from "next/headers";
import { parseEntrySurface, type EntrySurface } from "@/lib/common/analytics";
import { AUTH_ENTRY_COOKIE, AUTH_TOOL_COOKIE } from "../shared/constants";
import { lookupEmailForAuth, normalizeInviteEmail } from "./invites";
import { notifySignupAttempt } from "./mail";
import { getDb } from "@/lib/db/connection";

export type SignupAttemptDoc = {
  email: string;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  attemptCount: number;
  toolId: string;
  entrySurface: EntrySurface;
  invited: boolean;
  completedAt?: Date;
};

let indexesEnsured = false;

async function signupAttemptsCollection() {
  const db = await getDb();
  const col = db.collection<SignupAttemptDoc>("signupAttempts");
  if (!indexesEnsured) {
    indexesEnsured = true;
    await col
      .createIndex({ email: 1 }, { unique: true })
      .catch((err) => {
        console.error("Failed to ensure signupAttempts indexes:", err);
      });
  }
  return col;
}

async function resolveToolId(): Promise<string> {
  try {
    const jar = await cookies();
    return jar.get(AUTH_TOOL_COOKIE)?.value || "roth";
  } catch {
    return "roth";
  }
}

async function resolveEntrySurface(): Promise<EntrySurface> {
  try {
    const jar = await cookies();
    return parseEntrySurface(jar.get(AUTH_ENTRY_COOKIE)?.value) ?? "website_home";
  } catch {
    return "website_home";
  }
}

/**
 * Persist + notify when a magic link is requested for an email with no
 * Auth.js user yet. Logins (existing users) are ignored. Never throws.
 */
export async function noteMagicLinkSignupAttempt(email: string): Promise<void> {
  try {
    const normalized = normalizeInviteEmail(email);
    if (!normalized || !normalized.includes("@")) return;

    const lookup = await lookupEmailForAuth(normalized);
    if (!lookup.ok || lookup.lookup.userExists) return;

    const now = new Date();
    const toolId = await resolveToolId();
    const entrySurface = await resolveEntrySurface();
    const invited = lookup.lookup.invited;

    const col = await signupAttemptsCollection();
    const result = await col.findOneAndUpdate(
      { email: normalized },
      {
        $set: {
          lastAttemptAt: now,
          toolId,
          entrySurface,
          invited,
        },
        $setOnInsert: {
          email: normalized,
          firstAttemptAt: now,
        },
        $inc: { attemptCount: 1 },
      },
      { upsert: true, returnDocument: "after" },
    );

    const attemptCount = result?.attemptCount ?? 1;
    console.info("[auth] signup attempt", {
      email: normalized,
      toolId,
      entrySurface,
      invited,
      attemptCount,
    });

    await notifySignupAttempt({
      email: normalized,
      toolId,
      entrySurface,
      invited,
      attemptCount,
    });
  } catch (err) {
    console.error("Failed to record signup attempt:", err);
  }
}

/** Mark a recorded attempt as completed once Auth.js creates the user. */
export async function markSignupAttemptCompleted(
  email?: string | null,
): Promise<void> {
  const normalized = typeof email === "string" ? normalizeInviteEmail(email) : "";
  if (!normalized) return;
  try {
    const col = await signupAttemptsCollection();
    await col.updateOne(
      { email: normalized, completedAt: { $exists: false } },
      { $set: { completedAt: new Date() } },
    );
  } catch (err) {
    console.error("Failed to mark signup attempt completed:", err);
  }
}

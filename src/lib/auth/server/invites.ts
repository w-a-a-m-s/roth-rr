import { ObjectId, type Collection, type Document } from "mongodb";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/connection";
import { getSystemCampaignId } from "./campaigns";
import {
  AUTH_INVITE_COOKIE,
  SYSTEM_CAMPAIGN_SLUGS,
  type InviteSource,
  type InviteStatus,
} from "../shared/inviteConstants";

const CODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LEN = 11;

export type PlanShareEntry = {
  planId: ObjectId;
  role: string;
  invitedBy?: ObjectId;
  invitedAt?: number;
};

export type InviteDoc = {
  _id: ObjectId;
  /** Display name for the invitee (required on admin-created invites). */
  name?: string | null;
  email: string | null;
  code: string;
  status: InviteStatus;
  source: InviteSource;
  campaignId: ObjectId;
  invitedBy: ObjectId | null;
  userId: ObjectId | null;
  planShares: PlanShareEntry[];
  /** Optional note from a leftover request-to-join form. */
  about?: string | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  approvedBy?: ObjectId;
  rejectedAt?: Date;
  rejectedBy?: ObjectId;
  /** When the invitee actually signed up (status became `registered`). */
  registeredAt?: Date;
};

let indexesEnsured = false;

async function invitesCollection(): Promise<Collection<InviteDoc>> {
  const db = await getDb();
  const col = db.collection<InviteDoc>("invites");
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      col.createIndex({ code: 1 }, { unique: true }),
      col.createIndex(
        { email: 1 },
        { unique: true, partialFilterExpression: { email: { $type: "string" } } },
      ),
      col.createIndex({ status: 1, updatedAt: -1 }),
      col.createIndex({ "planShares.planId": 1 }),
      col.createIndex({ userId: 1 }, { sparse: true }),
    ]).catch((err) => {
      console.error("Failed to ensure invites indexes:", err);
    });
  }
  return col;
}

function generateInviteCode(): string {
  let out = "";
  while (out.length < CODE_LEN) {
    const bytes = new Uint8Array(CODE_LEN - out.length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
      if (out.length === CODE_LEN) break;
    }
  }
  return out;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function uniqueCode(col: Collection<InviteDoc>): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = generateInviteCode();
    const existing = await col.findOne({ code }, { projection: { _id: 1 } });
    if (!existing) return code;
  }
  throw new Error("Failed to allocate invite code");
}

export type EmailAuthLookup = {
  userExists: boolean;
  /** Pending plan-share (or leftover admin) invite for this email / cookie. */
  invited: boolean;
};

/** Lookup used by Login / Register email checks. */
export async function lookupEmailForAuth(
  email: string,
): Promise<
  | { ok: true; lookup: EmailAuthLookup }
  | { ok: false; error: "invalidEmail" }
> {
  const lower = normalizeInviteEmail(email);
  if (!lower || !lower.includes("@")) {
    return { ok: false, error: "invalidEmail" };
  }
  const userExists = await authUserExistsByEmail(lower);
  const invite = await getInviteByEmail(lower);
  const code = await readInviteCodeFromCookie();
  let invited = false;
  if (code) {
    const byCode = await getInviteByCode(code);
    if (
      byCode &&
      (byCode.status === "invited" || byCode.status === "approved") &&
      (byCode.email == null || byCode.email === lower)
    ) {
      invited = true;
    }
  }
  if (invite?.status === "invited" || invite?.status === "approved") {
    invited = true;
  }
  return {
    ok: true,
    lookup: {
      userExists,
      invited,
    },
  };
}

export async function getInviteByEmail(
  email: string,
): Promise<InviteDoc | null> {
  const lower = normalizeInviteEmail(email);
  if (!lower) return null;
  const col = await invitesCollection();
  return col.findOne({ email: lower });
}

export async function getInviteByUserId(
  userId: string,
): Promise<InviteDoc | null> {
  if (!ObjectId.isValid(userId)) return null;
  const col = await invitesCollection();
  return col.findOne({ userId: new ObjectId(userId) });
}

export async function getInviteByCode(
  code: string,
): Promise<InviteDoc | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const col = await invitesCollection();
  return col.findOne({ code: trimmed });
}

/**
 * Public lookup for invite links: whether the code can start guest signup.
 * Does not expose campaign or admin fields.
 */
export async function lookupInviteCode(code: string): Promise<
  | {
      ok: true;
      usable: boolean;
      status: InviteStatus;
      source: InviteSource;
      email: string | null;
    }
  | { ok: false; error: "invalid" | "notFound" }
> {
  const trimmed = code.trim();
  if (!trimmed || trimmed.length < 6) {
    return { ok: false, error: "invalid" };
  }
  const doc = await getInviteByCode(trimmed);
  if (!doc) return { ok: false, error: "notFound" };
  const usable = doc.status === "invited" || doc.status === "approved";
  return {
    ok: true,
    usable,
    status: doc.status,
    source: doc.source,
    email: doc.email,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function authUserExistsByEmail(email: string): Promise<boolean> {
  const lower = normalizeInviteEmail(email);
  if (!lower) return false;
  const db = await getDb();
  const user = await db.collection("users").findOne(
    { email: { $regex: `^${escapeRegex(lower)}$`, $options: "i" } },
    { projection: { _id: 1 } },
  );
  return Boolean(user);
}

/** Pending plan shares for a plan (replaces embedded plans.invites). */
export async function listPlanSharesForPlan(planId: string): Promise<
  Array<{
    email: string;
    role: string;
    invitedBy?: ObjectId;
    invitedAt?: number;
  }>
> {
  if (!ObjectId.isValid(planId)) return [];
  const col = await invitesCollection();
  const oid = new ObjectId(planId);
  const docs = await col
    .find({ "planShares.planId": oid, email: { $type: "string" } })
    .toArray();
  const out: Array<{
    email: string;
    role: string;
    invitedBy?: ObjectId;
    invitedAt?: number;
  }> = [];
  for (const doc of docs) {
    if (!doc.email) continue;
    const share = doc.planShares.find((p) => p.planId.equals(oid));
    if (!share) continue;
    out.push({
      email: doc.email,
      role: share.role,
      invitedBy: share.invitedBy,
      invitedAt: share.invitedAt,
    });
  }
  return out;
}

export async function countPlanSharesForPlan(planId: string): Promise<number> {
  if (!ObjectId.isValid(planId)) return 0;
  const col = await invitesCollection();
  return col.countDocuments({ "planShares.planId": new ObjectId(planId) });
}

/**
 * When sharing a plan with an existing account: upgrade leftover
 * requesting_access / rejected rows (no planShare attached).
 */
export async function upgradeAccessForPlanShare(params: {
  email: string;
  invitedBy: string;
}): Promise<void> {
  const lower = normalizeInviteEmail(params.email);
  if (!lower) return;
  const col = await invitesCollection();
  const existing = await col.findOne({ email: lower });
  if (!existing) return;
  if (
    existing.status !== "requesting_access" &&
    existing.status !== "rejected"
  ) {
    return;
  }
  const inviterOid = ObjectId.isValid(params.invitedBy)
    ? new ObjectId(params.invitedBy)
    : undefined;
  await col.updateOne(
    { _id: existing._id },
    {
      $set: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: inviterOid,
        updatedAt: new Date(),
      },
      $unset: { rejectedAt: "", rejectedBy: "" },
    },
  );
}

export async function upsertPlanShareInvite(params: {
  email: string;
  planId: string;
  role: string;
  invitedBy: string;
}): Promise<
  | {
      ok: true;
      kind: "invited" | "updated";
      upgradedToApproved: boolean;
      code: string;
    }
  | { ok: false; error: "invalidEmail" | "invalidPlan" }
> {
  const lower = normalizeInviteEmail(params.email);
  if (!lower || !lower.includes("@")) {
    return { ok: false, error: "invalidEmail" };
  }
  if (!ObjectId.isValid(params.planId)) {
    return { ok: false, error: "invalidPlan" };
  }

  const col = await invitesCollection();
  const campaignId = await getSystemCampaignId(
    SYSTEM_CAMPAIGN_SLUGS.plan_share,
  );
  const planOid = new ObjectId(params.planId);
  const inviterOid = ObjectId.isValid(params.invitedBy)
    ? new ObjectId(params.invitedBy)
    : null;
  const now = Date.now();
  const share: PlanShareEntry = {
    planId: planOid,
    role: params.role,
    invitedBy: inviterOid ?? undefined,
    invitedAt: now,
  };

  const existing = await col.findOne({ email: lower });
  if (!existing) {
    const doc: InviteDoc = {
      _id: new ObjectId(),
      email: lower,
      code: await uniqueCode(col),
      status: "invited",
      source: "plan_share",
      campaignId,
      invitedBy: inviterOid,
      userId: null,
      planShares: [share],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await col.insertOne(doc);
    return {
      ok: true,
      kind: "invited",
      upgradedToApproved: false,
      code: doc.code,
    };
  }

  const shares = [...(existing.planShares ?? [])];
  const idx = shares.findIndex((s) => s.planId.equals(planOid));
  if (idx >= 0) shares[idx] = share;
  else shares.push(share);

  let status = existing.status;
  let upgradedToApproved = false;
  const set: Document = {
    planShares: shares,
    updatedAt: new Date(),
  };

  if (status === "requesting_access" || status === "rejected") {
    status = "approved";
    upgradedToApproved = true;
    set.status = "approved";
    set.approvedAt = new Date();
    if (inviterOid) set.approvedBy = inviterOid;
  } else if (status === "invited") {
    if (existing.source !== "admin") {
      set.source = "plan_share";
      set.campaignId = campaignId;
    }
  }

  await col.updateOne({ _id: existing._id }, { $set: set });

  return {
    ok: true,
    kind: "updated",
    upgradedToApproved,
    code: existing.code,
  };
}

export async function updatePlanShareRole(params: {
  email: string;
  planId: string;
  role: string;
}): Promise<boolean> {
  const lower = normalizeInviteEmail(params.email);
  if (!lower || !ObjectId.isValid(params.planId)) return false;
  const col = await invitesCollection();
  const res = await col.updateOne(
    {
      email: lower,
      "planShares.planId": new ObjectId(params.planId),
    },
    { $set: { "planShares.$.role": params.role, updatedAt: new Date() } },
  );
  return res.matchedCount === 1;
}

export async function removePlanShare(params: {
  email: string;
  planId: string;
}): Promise<boolean> {
  const lower = normalizeInviteEmail(params.email);
  if (!lower || !ObjectId.isValid(params.planId)) return false;
  const col = await invitesCollection();
  const res = await col.updateOne(
    { email: lower },
    {
      $pull: { planShares: { planId: new ObjectId(params.planId) } },
      $set: { updatedAt: new Date() },
    },
  );
  return res.modifiedCount === 1;
}

export async function touchPlanShareInviter(params: {
  email: string;
  planId: string;
  invitedBy: string;
}): Promise<{ role: string; code: string } | null> {
  const lower = normalizeInviteEmail(params.email);
  if (!lower || !ObjectId.isValid(params.planId)) return null;
  const col = await invitesCollection();
  const planOid = new ObjectId(params.planId);
  const doc = await col.findOne({ email: lower, "planShares.planId": planOid });
  if (!doc) return null;
  const share = doc.planShares.find((s) => s.planId.equals(planOid));
  if (!share) return null;
  const inviterOid = ObjectId.isValid(params.invitedBy)
    ? new ObjectId(params.invitedBy)
    : undefined;
  await col.updateOne(
    { _id: doc._id, "planShares.planId": planOid },
    {
      $set: {
        "planShares.$.invitedBy": inviterOid,
        "planShares.$.invitedAt": Date.now(),
        updatedAt: new Date(),
      },
    },
  );
  return { role: share.role, code: doc.code };
}

/**
 * Claim planShares for this user into caller-provided applicator, then clear them.
 * Returns claimed shares so roth can push members + notify.
 */
export async function claimPlanSharesForEmail(
  email: string,
  userId: string,
): Promise<PlanShareEntry[]> {
  const lower = normalizeInviteEmail(email);
  if (!lower || !ObjectId.isValid(userId)) return [];
  const col = await invitesCollection();
  const doc = await col.findOne({ email: lower });
  if (!doc?.planShares?.length) {
    if (doc && !doc.userId) {
      await col.updateOne(
        { _id: doc._id },
        { $set: { userId: new ObjectId(userId), updatedAt: new Date() } },
      );
    }
    return [];
  }
  const shares = [...doc.planShares];
  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        planShares: [],
        userId: new ObjectId(userId),
        updatedAt: new Date(),
      },
    },
  );
  return shares;
}

async function readInviteCodeFromCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(AUTH_INVITE_COOKIE)?.value?.trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Claim invite code / email invite for a signed-in user (plan shares).
 * Signup is open: missing invite rows are a no-op.
 */
export async function ensureAccessOnSignIn(params: {
  userId: string;
  email?: string | null;
  isNewUser?: boolean;
}): Promise<InviteStatus> {
  if (!params.userId || !ObjectId.isValid(params.userId)) {
    return "approved";
  }
  const userOid = new ObjectId(params.userId);
  const email = params.email ? normalizeInviteEmail(params.email) : null;
  const col = await invitesCollection();
  const code = await readInviteCodeFromCookie();

  // 1) Claim by invite code (plan-share / leftover admin link).
  if (code) {
    const byCode = await col.findOne({ code });
    if (byCode && (byCode.status === "invited" || byCode.status === "approved")) {
      if (email) {
        const byEmail = await col.findOne({
          email,
          _id: { $ne: byCode._id },
        });
        if (byEmail) {
          const planShares = [
            ...(byEmail.planShares ?? []),
            ...(byCode.planShares ?? []),
          ];
          await col.updateOne(
            { _id: byEmail._id },
            {
              $set: {
                status: "registered",
                userId: userOid,
                planShares,
                updatedAt: new Date(),
                approvedAt: new Date(),
                registeredAt: new Date(),
              },
              $unset: { rejectedAt: "", rejectedBy: "" },
            },
          );
          await col.deleteOne({ _id: byCode._id });
          return "registered";
        }
      }
      await col.updateOne(
        { _id: byCode._id },
        {
          $set: {
            email: email ?? byCode.email,
            userId: userOid,
            status: "registered",
            approvedAt: new Date(),
            registeredAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: { rejectedAt: "", rejectedBy: "" },
        },
      );
      return "registered";
    }
  }

  // 2) Existing invite by email.
  if (email) {
    const byEmail = await col.findOne({ email });
    if (byEmail) {
      if (byEmail.status === "invited" || byEmail.status === "approved") {
        await col.updateOne(
          { _id: byEmail._id },
          {
            $set: {
              userId: userOid,
              status: "registered",
              approvedAt: byEmail.approvedAt ?? new Date(),
              registeredAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );
        return "registered";
      }
      await col.updateOne(
        { _id: byEmail._id },
        { $set: { userId: userOid, updatedAt: new Date() } },
      );
      return byEmail.status;
    }
  }

  // 3) Also match by userId (re-login).
  const byUser = await col.findOne({ userId: userOid });
  if (byUser) return byUser.status;

  return "approved";
}

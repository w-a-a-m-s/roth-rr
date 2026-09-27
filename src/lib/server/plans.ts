import "server-only";

import { ObjectId, type Collection } from "mongodb";
import {
  claimPlanSharesForEmail,
  countPlanSharesForPlan,
  listPlanSharesForPlan,
  removePlanShare,
  touchPlanShareInviter,
  updatePlanShareRole,
  upgradeAccessForPlanShare,
  upsertPlanShareInvite,
} from "@/lib/auth/server";
import { getDb } from "@/lib/db/mongo";
import type { Household, SavedConfig } from "@/lib/domain/types";
import { normalizePlanName } from "@/lib/planName";
import {
  canDeletePlan,
  canEditPlan,
  canRenamePlan,
  canSharePlan,
  type PlanMemberView,
  type PlanRole,
} from "@/lib/sharing";
import { recordRevision } from "@/lib/server/planRevisions";
import {
  sendInviteAcceptedEmail,
  sendPlanShareEmail,
} from "@/lib/server/shareEmails";
import type { PlanSnapshot } from "@/lib/planDiff";
import { generatePublicId } from "@/lib/publicId";
import { ensurePlansSetup } from "@/lib/server/planSetup";

/**
 * Plans use the embedded-members pattern: each plan document carries the list
 * of users who can access it (with a role). Pending email invites for people
 * who haven't signed in yet live in the `invites.planShares` array
 * (migrated from legacy `plans.invites[]`).
 *
 * `userId` here always refers to an Auth.js `users` collection `_id`.
 */
interface PlanMember {
  userId: ObjectId;
  role: PlanRole;
}

export type PlanStatus = "active" | "deleted";

interface PlanDoc {
  _id: ObjectId;
  /**
   * Opaque alphanumeric id used in shareable URLs
   * (`/{publicId}`). Backfilled for legacy docs in ensureSetup.
   */
  publicId: string;
  /** The creating user; retained so the owner can't be removed. */
  ownerId: ObjectId;
  members: PlanMember[];
  /** Legacy; pending invites now live in `invites.planShares`. */
  invites?: Array<{
    email: string;
    role: PlanRole;
    invitedBy?: ObjectId;
    invitedAt?: number;
  }>;
  name: string;
  household: Household;
  createdAt: number;
  updatedAt: number;
  /**
   * Lifecycle status. Missing on legacy docs means active. Soft-delete sets
   * `"deleted"` instead of removing the document.
   */
  status?: PlanStatus;
  /** Legacy single-owner field; migrated away on first access (see ensureSetup). */
  userId?: ObjectId;
}

/** Minimal projection of the Auth.js `users` collection we read for the UI. */
interface UserDoc {
  _id: ObjectId;
  email?: string | null;
  name?: string | null;
}

async function plansCollection(): Promise<Collection<PlanDoc>> {
  await ensurePlansSetup();
  const db = await getDb();
  return db.collection<PlanDoc>("plans");
}

async function usersCollection(): Promise<Collection<UserDoc>> {
  const db = await getDb();
  return db.collection<UserDoc>("users");
}

/** Match plans the user can access (is a member of). */
function memberFilter(userId: ObjectId) {
  return { "members.userId": userId };
}

/** Active plans only (legacy docs without `status` count as active). */
function activeFilter() {
  return { status: { $ne: "deleted" as const } };
}

function toSnapshot(doc: Pick<PlanDoc, "name" | "household">): PlanSnapshot {
  return { name: doc.name, household: doc.household };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roleOf(doc: PlanDoc, userId: ObjectId): PlanRole | null {
  return doc.members.find((m) => m.userId.equals(userId))?.role ?? null;
}

/** Map a stored document to the `SavedConfig` shape the client already uses. */
function toConfig(
  doc: PlanDoc,
  userId: ObjectId,
  pendingShareCount = 0,
): SavedConfig {
  return {
    id: doc._id.toHexString(),
    publicId: doc.publicId,
    name: doc.name,
    household: doc.household,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    role: roleOf(doc, userId) ?? undefined,
    isOwner: doc.ownerId.equals(userId),
    shareCount: doc.members.length + pendingShareCount,
  };
}

async function findUserByEmail(email: string): Promise<UserDoc | null> {
  const lower = normalizeEmail(email);
  if (!lower) return null;
  const users = await usersCollection();
  return users.findOne({
    email: { $regex: `^${escapeRegex(lower)}$`, $options: "i" },
  });
}

async function userById(userId: ObjectId): Promise<UserDoc | null> {
  const users = await usersCollection();
  return users.findOne({ _id: userId });
}

/**
 * Claim any pending plan shares for a user that just signed in: turn matching
 * auth `invites.planShares` into plan `members`. Safe to call on every plan load.
 * Notifies the inviting admin when an invite is claimed.
 */
export async function claimInvites(
  userId: string,
  email: string | null | undefined,
  opts?: { name?: string | null },
): Promise<void> {
  if (!ObjectId.isValid(userId) || !email) return;
  const oid = new ObjectId(userId);
  const lower = normalizeEmail(email);
  if (!lower) return;

  const shares = await claimPlanSharesForEmail(lower, userId);
  if (shares.length === 0) return;

  const plans = await plansCollection();
  for (const share of shares) {
    const doc = await plans.findOne({
      _id: share.planId,
      ...activeFilter(),
    });
    if (!doc) continue;
    const alreadyMember = doc.members.some((m) => m.userId.equals(oid));
    if (!alreadyMember) {
      await plans.updateOne(
        { _id: doc._id },
        {
          $push: {
            members: { userId: oid, role: share.role as PlanRole },
          },
        },
      );
    }

    if (alreadyMember) continue;

    const inviterId = share.invitedBy ?? doc.ownerId;
    const inviter = await userById(inviterId);
    if (inviter?.email) {
      void sendInviteAcceptedEmail({
        to: inviter.email,
        publicId: doc.publicId,
        planName: doc.name,
        joinerName: opts?.name,
        joinerEmail: lower,
      });
    }
  }
}

/** All active plans the user can access, newest-updated first. */
export async function listPlans(userId: string): Promise<SavedConfig[]> {
  if (!ObjectId.isValid(userId)) return [];
  const oid = new ObjectId(userId);
  const plans = await plansCollection();
  const docs = await plans
    .find({ ...memberFilter(oid), ...activeFilter() })
    .sort({ updatedAt: -1 })
    .toArray();
  return Promise.all(
    docs.map(async (doc) => {
      const pending = await countPlanSharesForPlan(doc._id.toHexString());
      return toConfig(doc, oid, pending);
    }),
  );
}

/**
 * Whether the user already has a plan with this name (case-insensitive).
 * Pass `excludeId` when renaming so the plan can keep its current name.
 */
export async function userHasPlanNamed(
  userId: string,
  name: string,
  excludeId?: string,
): Promise<boolean> {
  if (!ObjectId.isValid(userId)) return false;
  const normalized = normalizePlanName(name);
  if (!normalized) return false;
  const plans = await plansCollection();
  const docs = await plans
    .find({ ...memberFilter(new ObjectId(userId)), ...activeFilter() })
    .project({ name: 1 })
    .toArray();
  return docs.some(
    (d) =>
      d._id.toHexString() !== excludeId &&
      normalizePlanName(d.name) === normalized,
  );
}

/** Create a new plan owned by the user (who becomes its admin member). */
export async function createPlan(
  userId: string,
  input: { name: string; household: Household },
): Promise<SavedConfig | "name_taken"> {
  if (await userHasPlanNamed(userId, input.name)) return "name_taken";
  const plans = await plansCollection();
  const now = Date.now();
  const ownerId = new ObjectId(userId);
  for (let attempt = 0; attempt < 8; attempt++) {
    const doc: PlanDoc = {
      _id: new ObjectId(),
      publicId: generatePublicId(),
      ownerId,
      members: [{ userId: ownerId, role: "admin" }],
      invites: [],
      name: input.name,
      household: input.household,
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    try {
      await plans.insertOne(doc);
      await recordRevision(userId, doc._id.toHexString(), toSnapshot(doc), null);
      return toConfig(doc, ownerId);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: number }).code
          : undefined;
      if (code !== 11000) throw err;
    }
  }
  throw new Error("Failed to allocate a unique plan publicId");
}

/**
 * Update a plan the user can access.
 * - Viewer: denied
 * - Editor: household only (name changes denied)
 * - Admin: name + household
 */
export async function updatePlan(
  userId: string,
  id: string,
  patch: { name?: string; household?: Household },
): Promise<SavedConfig | null | "name_taken" | "forbidden"> {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return null;
  const oid = new ObjectId(userId);
  const plans = await plansCollection();
  const filter = {
    _id: new ObjectId(id),
    ...memberFilter(oid),
    ...activeFilter(),
  };
  const existing = await plans.findOne(filter);
  if (!existing) return null;

  const role = roleOf(existing, oid);
  if (!canEditPlan(role)) return "forbidden";

  const nameChanging =
    patch.name != null &&
    normalizePlanName(patch.name) !== normalizePlanName(existing.name);
  if (nameChanging && !canRenamePlan(role)) return "forbidden";

  if (
    patch.name != null &&
    (await userHasPlanNamed(userId, patch.name, id))
  ) {
    return "name_taken";
  }

  const set: Partial<PlanDoc> = { updatedAt: Date.now() };
  if (patch.name != null && canRenamePlan(role)) set.name = patch.name;
  if (patch.household != null) set.household = patch.household;

  const result = await plans.findOneAndUpdate(
    filter,
    { $set: set },
    { returnDocument: "after" },
  );
  if (!result) return null;

  await recordRevision(
    userId,
    id,
    toSnapshot(result),
    toSnapshot(existing),
  );
  return toConfig(result, oid);
}

/**
 * Soft-delete a plan. Admin only. Soft-delete does not write a revision.
 */
export async function deletePlan(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return false;
  const oid = new ObjectId(userId);
  const plans = await plansCollection();
  const existing = await plans.findOne({
    _id: new ObjectId(id),
    ...memberFilter(oid),
    ...activeFilter(),
  });
  if (!existing) return false;
  if (!canDeletePlan(roleOf(existing, oid))) return false;

  const result = await plans.updateOne(
    { _id: existing._id, ...activeFilter() },
    { $set: { status: "deleted", updatedAt: Date.now() } },
  );
  return result.matchedCount === 1;
}

/** Load an active plan the user can access (or null). */
async function getAccessiblePlan(
  userId: string,
  id: string,
): Promise<PlanDoc | null> {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(userId)) return null;
  const plans = await plansCollection();
  return plans.findOne({
    _id: new ObjectId(id),
    ...memberFilter(new ObjectId(userId)),
    ...activeFilter(),
  });
}

/** Role of the user on an accessible plan, or null when not a member. */
export async function getPlanRole(
  userId: string,
  id: string,
): Promise<PlanRole | null> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return null;
  return roleOf(doc, new ObjectId(userId));
}

/**
 * List the members + pending invites of a plan the user can access, resolving
 * member emails/names from the `users` collection. Returns null when the
 * plan doesn't exist or the user isn't a member.
 */
export async function listMembers(
  userId: string,
  id: string,
): Promise<PlanMemberView[] | null> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return null;

  const self = new ObjectId(userId);
  const users = await usersCollection();
  const userDocs = await users
    .find({ _id: { $in: doc.members.map((m) => m.userId) } })
    .toArray();
  const byId = new Map(userDocs.map((u) => [u._id.toHexString(), u]));

  const members: PlanMemberView[] = doc.members.map((m) => {
    const u = byId.get(m.userId.toHexString());
    return {
      userId: m.userId.toHexString(),
      email: u?.email ?? null,
      name: u?.name ?? null,
      role: m.role,
      isOwner: doc.ownerId.equals(m.userId),
      pending: false,
      isSelf: m.userId.equals(self),
    };
  });

  const pendingShares = await listPlanSharesForPlan(doc._id.toHexString());
  const invites: PlanMemberView[] = pendingShares.map((inv) => ({
    userId: null,
    email: inv.email,
    name: null,
    role: inv.role as PlanRole,
    isOwner: false,
    pending: true,
    isSelf: false,
  }));

  // Owner first, then other members, then pending invites.
  members.sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  return [...members, ...invites];
}

/** Whether an email already has an Auth.js account (for share UI hint). */
export async function lookupShareEmail(
  userId: string,
  id: string,
  email: string,
): Promise<"exists" | "invite" | "invalid" | "forbidden" | "notFound"> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return "notFound";
  if (!canSharePlan(roleOf(doc, new ObjectId(userId)))) return "forbidden";

  const lower = normalizeEmail(email);
  if (!lower || !lower.includes("@")) return "invalid";

  const target = await findUserByEmail(lower);
  return target ? "exists" : "invite";
}

export type AddMemberResult =
  | { ok: true; kind: "added" | "invited" | "updated_invite" }
  | {
      ok: false;
      error: "notFound" | "invalidEmail" | "alreadyMember" | "forbidden";
    };

/**
 * Share a plan with someone by email. Admin only. If the email already has an
 * account they become a member immediately; otherwise a pending invite is
 * stored and claimed when they next sign in. Sends a notification email.
 */
export async function addMember(
  userId: string,
  id: string,
  email: string,
  role: PlanRole,
): Promise<AddMemberResult> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return { ok: false, error: "notFound" };
  const actorId = new ObjectId(userId);
  if (!canSharePlan(roleOf(doc, actorId))) {
    return { ok: false, error: "forbidden" };
  }

  const lower = normalizeEmail(email);
  if (!lower || !lower.includes("@")) return { ok: false, error: "invalidEmail" };

  const plans = await plansCollection();
  const target = await findUserByEmail(lower);
  const actor = await userById(actorId);
  const sharerEmail = actor?.email ?? "";

  if (target) {
    if (doc.members.some((m) => m.userId.equals(target._id))) {
      return { ok: false, error: "alreadyMember" };
    }
    await plans.updateOne(
      { _id: doc._id },
      {
        $push: { members: { userId: target._id, role } },
      },
    );
    await removePlanShare({ email: lower, planId: doc._id.toHexString() });
    await upgradeAccessForPlanShare({
      email: lower,
      invitedBy: actorId.toHexString(),
    });
    if (target.email || lower) {
      void sendPlanShareEmail({
        to: target.email ?? lower,
        publicId: doc.publicId,
        planName: doc.name,
        role,
        sharerName: actor?.name,
        sharerEmail: sharerEmail || "a collaborator",
        isInvite: false,
      });
    }
    return { ok: true, kind: "added" };
  }

  // No account yet: upsert pending plan share on the auth invite.
  const result = await upsertPlanShareInvite({
    email: lower,
    planId: doc._id.toHexString(),
    role,
    invitedBy: actorId.toHexString(),
  });
  if (!result.ok) return { ok: false, error: "invalidEmail" };

  if (result.kind === "invited") {
    void sendPlanShareEmail({
      to: lower,
      publicId: doc.publicId,
      planName: doc.name,
      role,
      sharerName: actor?.name,
      sharerEmail: sharerEmail || "a collaborator",
      isInvite: true,
      inviteCode: result.code,
    });
    return { ok: true, kind: "invited" };
  }
  return { ok: true, kind: "updated_invite" };
}

/** Resend the invitation email for a pending invite. Admin only. */
export async function resendInvite(
  userId: string,
  id: string,
  email: string,
): Promise<"ok" | "notFound" | "forbidden" | "invalidEmail"> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return "notFound";
  const actorId = new ObjectId(userId);
  if (!canSharePlan(roleOf(doc, actorId))) return "forbidden";

  const lower = normalizeEmail(email);
  if (!lower || !lower.includes("@")) return "invalidEmail";

  const touched = await touchPlanShareInviter({
    email: lower,
    planId: doc._id.toHexString(),
    invitedBy: actorId.toHexString(),
  });
  if (!touched) return "notFound";

  const actor = await userById(actorId);
  void sendPlanShareEmail({
    to: lower,
    publicId: doc.publicId,
    planName: doc.name,
    role: touched.role as PlanRole,
    sharerName: actor?.name,
    sharerEmail: actor?.email ?? "a collaborator",
    isInvite: true,
    inviteCode: touched.code,
  });
  return "ok";
}

/**
 * Change the role of a member (by `userId`) or a pending invite (by `email`).
 * Admin only. The owner's role can't be changed.
 */
export async function updateMemberRole(
  userId: string,
  id: string,
  target: { userId?: string; email?: string },
  role: PlanRole,
): Promise<boolean> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return false;
  if (!canSharePlan(roleOf(doc, new ObjectId(userId)))) return false;
  const plans = await plansCollection();

  if (target.userId && ObjectId.isValid(target.userId)) {
    const targetId = new ObjectId(target.userId);
    if (doc.ownerId.equals(targetId)) return false; // owner stays admin
    const res = await plans.updateOne(
      { _id: doc._id, "members.userId": targetId },
      { $set: { "members.$.role": role } },
    );
    return res.matchedCount === 1;
  }

  if (target.email) {
    return updatePlanShareRole({
      email: normalizeEmail(target.email),
      planId: doc._id.toHexString(),
      role,
    });
  }
  return false;
}

/**
 * Remove a member (by `userId`) or a pending invite (by `email`). Admin only.
 * The owner can't be removed.
 */
export async function removeMember(
  userId: string,
  id: string,
  target: { userId?: string; email?: string },
): Promise<boolean> {
  const doc = await getAccessiblePlan(userId, id);
  if (!doc) return false;
  if (!canSharePlan(roleOf(doc, new ObjectId(userId)))) return false;
  const plans = await plansCollection();

  if (target.userId && ObjectId.isValid(target.userId)) {
    const targetId = new ObjectId(target.userId);
    if (doc.ownerId.equals(targetId)) return false; // owner can't be removed
    const res = await plans.updateOne(
      { _id: doc._id },
      { $pull: { members: { userId: targetId } } },
    );
    return res.modifiedCount === 1;
  }

  if (target.email) {
    return removePlanShare({
      email: normalizeEmail(target.email),
      planId: doc._id.toHexString(),
    });
  }
  return false;
}

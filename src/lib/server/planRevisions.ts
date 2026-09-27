import "server-only";

import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import type { Household, SavedConfig } from "@/lib/domain/types";
import {
  detailPlanSnapshots,
  diffPlanSnapshots,
  planSnapshotsEqual,
  type PlanFieldChange,
  type PlanSnapshot,
} from "@/lib/planDiff";
import {
  canRestoreHistory,
  canViewHistory,
  type PlanRole,
} from "@/lib/sharing";
import { ensurePlansSetup } from "@/lib/server/planSetup";

interface PlanRevisionDoc {
  _id: ObjectId;
  planId: ObjectId;
  createdAt: number;
  userId: ObjectId;
  changes: string[];
  plan: PlanSnapshot;
}

/** Minimal plan fields needed for access checks and restore. */
interface AccessiblePlanDoc {
  _id: ObjectId;
  publicId?: string;
  name: string;
  household: Household;
  createdAt: number;
  updatedAt: number;
  status?: "active" | "deleted";
  ownerId?: ObjectId;
  members: { userId: ObjectId; role: PlanRole }[];
  invites?: { email: string }[];
}

export interface PlanRevisionSummary {
  id: string;
  planId: string;
  createdAt: number;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  changes: string[];
  details: PlanFieldChange[];
}

export interface PlanRevisionDetail extends PlanRevisionSummary {
  plan: PlanSnapshot;
}

let setupPromise: Promise<void> | undefined;

async function revisionsCollection(): Promise<Collection<PlanRevisionDoc>> {
  const db = await getDb();
  const col = db.collection<PlanRevisionDoc>("plan_revisions");
  setupPromise ??= col
    .createIndexes([
      { key: { planId: 1, createdAt: -1 }, name: "planId_createdAt" },
    ])
    .then(() => undefined);
  await setupPromise;
  return col;
}

async function plansCollection(): Promise<Collection<AccessiblePlanDoc>> {
  const db = await getDb();
  return db.collection<AccessiblePlanDoc>("plans");
}

async function getAccessibleActivePlan(
  userId: string,
  planId: string,
): Promise<AccessiblePlanDoc | null> {
  if (!ObjectId.isValid(userId)) return null;
  await ensurePlansSetup();
  const plans = await plansCollection();
  const member = {
    "members.userId": new ObjectId(userId),
    status: { $ne: "deleted" as const },
  };
  if (ObjectId.isValid(planId) && planId.length === 24) {
    return plans.findOne({ _id: new ObjectId(planId), ...member });
  }
  return null;
}

function toSummary(
  doc: PlanRevisionDoc,
  user?: { email?: string | null; name?: string | null } | null,
  details: PlanFieldChange[] = [],
): PlanRevisionSummary {
  return {
    id: doc._id.toHexString(),
    planId: doc.planId.toHexString(),
    createdAt: doc.createdAt,
    userId: doc.userId.toHexString(),
    userEmail: user?.email ?? null,
    userName: user?.name ?? null,
    changes: doc.changes,
    details,
  };
}

function toConfig(doc: AccessiblePlanDoc, userId: string): SavedConfig {
  const oid = new ObjectId(userId);
  const role = doc.members.find((m) => m.userId.equals(oid))?.role;
  return {
    id: doc._id.toHexString(),
    publicId: doc.publicId,
    name: doc.name,
    household: doc.household,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    role,
    isOwner: doc.ownerId ? doc.ownerId.equals(oid) : undefined,
    shareCount: doc.members.length + (doc.invites?.length ?? 0),
  };
}

async function usersByIds(
  ids: string[],
): Promise<Map<string, { email?: string | null; name?: string | null }>> {
  const oids = ids.filter(ObjectId.isValid).map((id) => new ObjectId(id));
  if (oids.length === 0) return new Map();
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; email?: string | null; name?: string | null }>(
      "users",
    )
    .find({ _id: { $in: oids } })
    .toArray();
  return new Map(users.map((u) => [u._id.toHexString(), u]));
}

/**
 * Append a revision for a successful save. Skips when the snapshot matches the
 * previous one (or the latest stored revision when previous is omitted).
 */
export async function recordRevision(
  userId: string,
  planId: string,
  snapshot: PlanSnapshot,
  previousSnapshot?: PlanSnapshot | null,
): Promise<boolean> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(planId)) return false;

  const revisions = await revisionsCollection();
  const planOid = new ObjectId(planId);

  let previous = previousSnapshot;
  if (previous === undefined) {
    const latest = await revisions.findOne(
      { planId: planOid },
      { sort: { createdAt: -1 } },
    );
    previous = latest?.plan ?? null;
  }

  if (previous && planSnapshotsEqual(previous, snapshot)) return false;

  const changes = diffPlanSnapshots(previous, snapshot);
  await revisions.insertOne({
    _id: new ObjectId(),
    planId: planOid,
    createdAt: Date.now(),
    userId: new ObjectId(userId),
    changes,
    plan: {
      name: snapshot.name,
      household: snapshot.household as Household,
    },
  });
  return true;
}

function memberRole(
  plan: AccessiblePlanDoc,
  userId: string,
): PlanRole | undefined {
  return plan.members.find((m) => m.userId.equals(new ObjectId(userId)))?.role;
}

/** Newest-first revision summaries for a plan the user can access. */
export async function listRevisions(
  userId: string,
  planId: string,
): Promise<PlanRevisionSummary[] | null> {
  const plan = await getAccessibleActivePlan(userId, planId);
  if (!plan) return null;
  if (!canViewHistory(memberRole(plan, userId))) return null;

  const revisions = await revisionsCollection();
  // Newest-first; keep plan snapshots only long enough to compute details.
  const docs = await revisions
    .find({ planId: new ObjectId(planId) })
    .sort({ createdAt: -1 })
    .toArray();

  const byId = await usersByIds(docs.map((d) => d.userId.toHexString()));
  return docs.map((doc, index) => {
    const previous = docs[index + 1]?.plan ?? null;
    const details = detailPlanSnapshots(previous, doc.plan);
    return toSummary(doc, byId.get(doc.userId.toHexString()), details);
  });
}

/** Full revision (including plan snapshot) for preview/restore. */
export async function getRevision(
  userId: string,
  planId: string,
  revisionId: string,
): Promise<PlanRevisionDetail | null> {
  const plan = await getAccessibleActivePlan(userId, planId);
  if (!plan) return null;
  if (!canViewHistory(memberRole(plan, userId))) return null;
  if (!ObjectId.isValid(revisionId)) return null;

  const revisions = await revisionsCollection();
  const doc = await revisions.findOne({
    _id: new ObjectId(revisionId),
    planId: new ObjectId(planId),
  });
  if (!doc) return null;

  const byId = await usersByIds([doc.userId.toHexString()]);
  return {
    ...toSummary(doc, byId.get(doc.userId.toHexString())),
    plan: doc.plan,
  };
}

/**
 * Restore a plan to a revision snapshot and append that restore as a new
 * revision. Existing history is kept.
 */
export async function restoreRevision(
  userId: string,
  planId: string,
  revisionId: string,
): Promise<SavedConfig | null> {
  const plan = await getAccessibleActivePlan(userId, planId);
  if (!plan) return null;
  if (!canRestoreHistory(memberRole(plan, userId))) return null;

  const revision = await getRevision(userId, planId, revisionId);
  if (!revision) return null;

  const previous: PlanSnapshot = {
    name: plan.name,
    household: plan.household,
  };
  const snapshot: PlanSnapshot = {
    name: revision.plan.name,
    household: revision.plan.household,
  };

  const plans = await plansCollection();
  const result = await plans.findOneAndUpdate(
    {
      _id: new ObjectId(planId),
      "members.userId": new ObjectId(userId),
      status: { $ne: "deleted" },
    },
    {
      $set: {
        name: snapshot.name,
        household: snapshot.household,
        updatedAt: Date.now(),
      },
    },
    { returnDocument: "after" },
  );
  if (!result) return null;

  await recordRevision(userId, planId, snapshot, previous);

  return toConfig(result, userId);
}

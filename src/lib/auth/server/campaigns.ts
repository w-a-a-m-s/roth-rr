import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/db/connection";
import { SYSTEM_CAMPAIGN_SLUGS } from "../shared/inviteConstants";

/** Discriminator for the shared `campaigns` collection. */
export type CampaignType = "invite";

export const INVITE_CAMPAIGN_TYPE: CampaignType = "invite";

export type CampaignDoc = {
  _id: ObjectId;
  /** What this campaign labels (invite access today; more types later). */
  type: CampaignType;
  name: string;
  slug: string;
  system: boolean;
  createdAt: Date;
  createdBy: ObjectId | null;
};

export type CampaignView = {
  id: string;
  type: CampaignType;
  name: string;
  slug: string;
  system: boolean;
  createdAt: string;
};

let indexesEnsured = false;

async function campaignsCollection(): Promise<Collection<CampaignDoc>> {
  const db = await getDb();
  const col = db.collection<CampaignDoc>("campaigns");
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      col.createIndex({ type: 1, slug: 1 }, { unique: true }),
      col.createIndex(
        { type: 1, name: 1 },
        { unique: true, collation: { locale: "en", strength: 2 } },
      ),
    ]).catch((err) => {
      console.error("Failed to ensure campaigns indexes:", err);
    });
  }
  return col;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function toView(doc: CampaignDoc): CampaignView {
  return {
    id: doc._id.toHexString(),
    type: doc.type ?? INVITE_CAMPAIGN_TYPE,
    name: doc.name,
    slug: doc.slug,
    system: doc.system,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Ensure built-in invite campaigns (Plan share / Manual enrollment) exist. */
export async function ensureSystemCampaigns(): Promise<void> {
  const col = await campaignsCollection();
  const now = new Date();
  const seeds: Array<{ slug: string; name: string }> = [
    { slug: SYSTEM_CAMPAIGN_SLUGS.plan_share, name: "Plan share" },
    {
      slug: SYSTEM_CAMPAIGN_SLUGS.manual_enrollment,
      name: "Manual enrollment",
    },
  ];
  // Backfill type on older rows created before the field existed.
  await col.updateMany(
    { type: { $exists: false } },
    { $set: { type: INVITE_CAMPAIGN_TYPE } },
  );

  for (const seed of seeds) {
    await col.updateOne(
      { type: INVITE_CAMPAIGN_TYPE, slug: seed.slug },
      {
        $setOnInsert: {
          type: INVITE_CAMPAIGN_TYPE,
          name: seed.name,
          slug: seed.slug,
          system: true,
          createdAt: now,
          createdBy: null,
        },
      },
      { upsert: true },
    );
  }
}

export async function getSystemCampaignId(
  slug: (typeof SYSTEM_CAMPAIGN_SLUGS)[keyof typeof SYSTEM_CAMPAIGN_SLUGS],
): Promise<ObjectId> {
  await ensureSystemCampaigns();
  const col = await campaignsCollection();
  const doc = await col.findOne({ type: INVITE_CAMPAIGN_TYPE, slug });
  if (!doc) {
    throw new Error(`System invite campaign missing: ${slug}`);
  }
  return doc._id;
}

/** List invite campaigns (system + custom). */
export async function listCampaigns(): Promise<CampaignView[]> {
  await ensureSystemCampaigns();
  const col = await campaignsCollection();
  const docs = await col
    .find({ type: INVITE_CAMPAIGN_TYPE })
    .sort({ system: -1, name: 1 })
    .toArray();
  return docs.map(toView);
}

/** Invite campaigns an admin may pick when creating an invite (excludes system). */
export async function listSelectableCampaigns(): Promise<CampaignView[]> {
  await ensureSystemCampaigns();
  const col = await campaignsCollection();
  const docs = await col
    .find({ type: INVITE_CAMPAIGN_TYPE, system: false })
    .sort({ name: 1 })
    .toArray();
  return docs.map(toView);
}

export async function getCampaignById(
  id: string,
): Promise<CampaignDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  await ensureSystemCampaigns();
  const col = await campaignsCollection();
  return col.findOne({
    _id: new ObjectId(id),
    type: INVITE_CAMPAIGN_TYPE,
  });
}

/** Create a custom invite campaign. */
export async function createCampaign(
  name: string,
  createdBy: string | null,
): Promise<
  | { ok: true; campaign: CampaignView }
  | { ok: false; error: "invalid" | "duplicate" }
> {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > 80) return { ok: false, error: "invalid" };

  let slug = slugify(trimmed);
  if (!slug) return { ok: false, error: "invalid" };
  if (
    slug === SYSTEM_CAMPAIGN_SLUGS.plan_share ||
    slug === SYSTEM_CAMPAIGN_SLUGS.manual_enrollment
  ) {
    return { ok: false, error: "duplicate" };
  }

  const col = await campaignsCollection();
  await ensureSystemCampaigns();

  const existingSlug = await col.findOne({
    type: INVITE_CAMPAIGN_TYPE,
    slug,
  });
  if (existingSlug) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const doc: CampaignDoc = {
    _id: new ObjectId(),
    type: INVITE_CAMPAIGN_TYPE,
    name: trimmed,
    slug,
    system: false,
    createdAt: new Date(),
    createdBy:
      createdBy && ObjectId.isValid(createdBy)
        ? new ObjectId(createdBy)
        : null,
  };

  try {
    await col.insertOne(doc);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: number }).code
        : undefined;
    if (code === 11000) return { ok: false, error: "duplicate" };
    throw err;
  }
  return { ok: true, campaign: toView(doc) };
}

/** True when this invite campaign may be chosen for an admin-created invite. */
export async function isSelectableCampaignId(id: string): Promise<boolean> {
  const doc = await getCampaignById(id);
  return Boolean(doc && !doc.system && doc.type === INVITE_CAMPAIGN_TYPE);
}

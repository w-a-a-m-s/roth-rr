import "server-only";

import { type Collection, type Document } from "mongodb";
import { getDb, resolveRothDbName } from "@/lib/db/mongo";
import { generatePublicId } from "@/lib/publicId";

/** True when a stored plan still needs a publicId backfill. */
function missingPublicIdFilter(): Document {
  return {
    $or: [
      { publicId: { $exists: false } },
      { publicId: null },
      { publicId: "" },
    ],
  };
}

/**
 * Assign a unique alphanumeric `publicId` to every plan that lacks one.
 * Safe under concurrent servers: each update is gated on still-missing.
 */
async function backfillPublicIds(col: Collection<Document>): Promise<void> {
  const cursor = col.find(missingPublicIdFilter(), { projection: { _id: 1 } });
  for await (const doc of cursor) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const publicId = generatePublicId();
      try {
        const res = await col.updateOne(
          { _id: doc._id, ...missingPublicIdFilter() },
          { $set: { publicId } },
        );
        if (res.matchedCount === 0 || res.modifiedCount === 1) break;
      } catch (err) {
        // Unique index collision on publicId - generate another.
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: number }).code
            : undefined;
        if (code !== 11000) throw err;
      }
    }
  }
}

let setupPromise: Promise<void> | undefined;
/** DB name the cached setup ran against; reset when env points elsewhere. */
let setupDbName: string | undefined;

/**
 * One-time, lazy setup: create indexes, migrate legacy single-owner plans
 * ({ userId }) into the embedded-members shape, and backfill `publicId` on
 * any plan that lacks one. Idempotent and cached per database name for the
 * process lifetime (re-runs if `MONGODB_DB` changes in dev).
 */
export async function ensurePlansSetup(): Promise<void> {
  const dbName = resolveRothDbName();
  if (setupDbName !== dbName) {
    setupDbName = dbName;
    setupPromise = undefined;
  }
  setupPromise ??= (async () => {
    const db = await getDb();
    const col = db.collection<Document>("plans");
    await col.updateMany(
      { members: { $exists: false }, userId: { $exists: true } },
      [
        {
          $set: {
            ownerId: "$userId",
            members: [{ userId: "$userId", role: "admin" }],
          },
        },
        { $unset: "userId" },
      ] as Document[],
    );
    await backfillPublicIds(col);
    await col.createIndexes([
      { key: { "members.userId": 1 }, name: "members_userId" },
      { key: { "invites.email": 1 }, name: "invites_email" },
      { key: { publicId: 1 }, name: "publicId_unique", unique: true },
    ]);
  })();
  await setupPromise;
}

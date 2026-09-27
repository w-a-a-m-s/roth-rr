import "server-only";

import type { Collection } from "mongodb";
import { getDb } from "@/lib/db/mongo";
import type {
  ExternalDataKey,
  ExternalDataMeta,
  ExternalDataRecord,
} from "@/lib/externalData/types";

interface ExternalDataDoc {
  key: ExternalDataKey;
  year: number;
  data: unknown;
  meta: ExternalDataMeta;
  updatedAt: number;
  updatedBy?: string;
}

let setupPromise: Promise<void> | undefined;

async function ensureSetup(col: Collection<ExternalDataDoc>): Promise<void> {
  setupPromise ??= col
    .createIndexes([{ key: { key: 1 }, name: "key_unique", unique: true }])
    .then(() => undefined);
  await setupPromise;
}

async function externalDataCollection(): Promise<Collection<ExternalDataDoc>> {
  const db = await getDb();
  const col = db.collection<ExternalDataDoc>("external_data");
  await ensureSetup(col);
  return col;
}

function toRecord(doc: ExternalDataDoc): ExternalDataRecord {
  return {
    key: doc.key,
    year: doc.year,
    data: doc.data,
    meta: doc.meta,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
  };
}

export async function getExternalData(
  key: ExternalDataKey,
): Promise<ExternalDataRecord | null> {
  const col = await externalDataCollection();
  const doc = await col.findOne({ key });
  if (!doc) return null;
  return toRecord(doc);
}

export async function listExternalData(): Promise<
  Omit<ExternalDataRecord, "data">[]
> {
  const col = await externalDataCollection();
  const docs = await col
    .find({}, { projection: { data: 0 } })
    .sort({ key: 1 })
    .toArray();
  return docs.map((d) => ({
    key: d.key,
    year: d.year,
    meta: d.meta,
    updatedAt: d.updatedAt,
    updatedBy: d.updatedBy,
  }));
}

export async function upsertExternalData(input: {
  key: ExternalDataKey;
  year: number;
  data: unknown;
  meta: ExternalDataMeta;
  updatedBy?: string;
}): Promise<ExternalDataRecord> {
  const col = await externalDataCollection();
  const updatedAt = Date.now();
  const doc: ExternalDataDoc = {
    key: input.key,
    year: input.year,
    data: input.data,
    meta: input.meta,
    updatedAt,
    updatedBy: input.updatedBy,
  };
  await col.updateOne(
    { key: input.key },
    { $set: doc },
    { upsert: true },
  );
  return toRecord(doc);
}

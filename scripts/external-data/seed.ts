/**
 * Seed Mongo `external_data` from committed fallbacks via the admin API.
 *
 * Requires a running app + EXTERNAL_DATA_ADMIN_TOKEN + EXTERNAL_DATA_API_URL.
 *
 *   npm run external-data:seed
 *   npm run external-data:seed -- --dataset=medicare
 */
import fs from "node:fs";
import { DATASET_META } from "../../src/lib/externalData/meta";
import {
  isExternalDataKey,
  type ExternalDataKey,
} from "../../src/lib/externalData/types";
import {
  adminToken,
  apiBaseUrl,
  fallbackAbsolute,
  parseArgs,
} from "./util";

const SEEDABLE: ExternalDataKey[] = [
  "federal-tax",
  "medicare",
  "state-income-tax",
];

async function seedKey(key: ExternalDataKey): Promise<void> {
  const file = fallbackAbsolute(key);
  if (!file || !fs.existsSync(file)) {
    throw new Error(`Missing fallback for ${key}`);
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await fetch(`${apiBaseUrl()}/api/external-data`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify({
      key,
      data,
      meta: DATASET_META[key],
      updatedBy: "external-data:seed",
      allowRateChange: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Seed ${key} failed (${res.status}): ${text}`);
  }
  const body = (await res.json()) as { record: { year: number } };
  console.log(`Seeded ${key} year=${body.record.year}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.dataset !== "string") {
    for (const key of SEEDABLE) await seedKey(key);
    return;
  }
  const dataset = args.dataset;
  if (!isExternalDataKey(dataset) || !SEEDABLE.includes(dataset)) {
    throw new Error(
      `Seed supports: ${SEEDABLE.join(", ")} (got ${String(dataset)})`,
    );
  }
  await seedKey(dataset);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

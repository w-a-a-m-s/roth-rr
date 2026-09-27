/**
 * Atomic per-dataset apply: validate → PUT admin API → rewrite fallback →
 * re-bless tests when numbers move. Rolls back DB + fallback on failure.
 *
 *   npm run external-data:apply -- --dataset=federal-tax --from=./candidate.json
 *
 * See docs/external-data.md.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DATASET_META } from "../../src/lib/externalData/meta";
import {
  isExternalDataKey,
  type ExternalDataKey,
  type ExternalDataRecord,
} from "../../src/lib/externalData/types";
import { validateDatasetData } from "../../src/lib/externalData/validate";
import {
  adminToken,
  apiBaseUrl,
  fallbackAbsolute,
  parseArgs,
} from "./util";

async function getRecord(
  key: ExternalDataKey,
): Promise<ExternalDataRecord | null> {
  const res = await fetch(
    `${apiBaseUrl()}/api/external-data?key=${encodeURIComponent(key)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GET ${key} failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { record: ExternalDataRecord };
  return body.record;
}

async function putRecord(input: {
  key: ExternalDataKey;
  data: unknown;
  meta: ExternalDataRecord["meta"];
  updatedBy?: string;
  allowRateChange?: boolean;
}): Promise<ExternalDataRecord> {
  const res = await fetch(`${apiBaseUrl()}/api/external-data`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`PUT ${input.key} failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { record: ExternalDataRecord };
  return body.record;
}

function writeFallback(key: ExternalDataKey, data: unknown): void {
  const file = fallbackAbsolute(key);
  if (!file) {
    throw new Error(`No fallback path registered for ${key}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readFallbackRaw(key: ExternalDataKey): string | null {
  const file = fallbackAbsolute(key);
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function restoreFallbackRaw(key: ExternalDataKey, raw: string | null): void {
  const file = fallbackAbsolute(key);
  if (!file) return;
  if (raw == null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  fs.writeFileSync(file, raw, "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dataset = args.dataset;
  const from = args.from;
  const allowRateChange = args["allow-rate-change"] === true;
  const skipBless = args["skip-bless"] === true;

  if (typeof dataset !== "string" || !isExternalDataKey(dataset)) {
    throw new Error(
      "Required: --dataset=<key> (exactly one; e.g. federal-tax)",
    );
  }
  if (typeof from !== "string") {
    throw new Error("Required: --from=<path-to-candidate.json>");
  }

  const fallbackFile = fallbackAbsolute(dataset);
  if (!fallbackFile) {
    throw new Error(
      `Dataset "${dataset}" has no committed fallback path yet (not implemented)`,
    );
  }

  const candidateRaw = fs.readFileSync(from, "utf8");
  const candidateJson: unknown = JSON.parse(candidateRaw);
  // Validate the full candidate BEFORE any DB/fallback write. Incomplete data
  // (e.g. missing states) fails the entire apply — there is no partial update.
  const validated = validateDatasetData(dataset, candidateJson, {
    allowRateChange,
  });
  if (!validated.ok) {
    throw new Error(
      `Validation failed (atomic apply aborted; nothing written): ${validated.error}`,
    );
  }

  const previousRecord = await getRecord(dataset);
  const previousFallbackRaw = readFallbackRaw(dataset);
  let dbWritten = false;

  try {
    await putRecord({
      key: dataset,
      data: validated.value,
      meta: DATASET_META[dataset],
      updatedBy: "external-data:apply",
      allowRateChange,
    });
    dbWritten = true;

    writeFallback(dataset, validated.value);
    console.log(`Wrote fallback ${fallbackFile}`);

    if (!skipBless) {
      console.log("Re-blessing golden cases (GOLDEN_BLESS=1 npm test)…");
      execSync("GOLDEN_BLESS=1 npm test", {
        stdio: "inherit",
        env: { ...process.env, GOLDEN_BLESS: "1" },
      });
      console.log("Verifying tests…");
      execSync("npm test", { stdio: "inherit" });
    } else {
      console.log("Skipped bless (--skip-bless); run GOLDEN_BLESS=1 npm test yourself.");
    }

    console.log(
      `Apply succeeded for ${dataset}. Commit fallback + any test diffs.`,
    );
  } catch (err) {
    console.error(
      "Apply failed; rolling back DB and fallback…",
      err instanceof Error ? err.message : err,
    );
    restoreFallbackRaw(dataset, previousFallbackRaw);
    if (dbWritten) {
      if (previousRecord) {
        await putRecord({
          key: dataset,
          data: previousRecord.data,
          meta: previousRecord.meta,
          updatedBy: "external-data:apply-rollback",
          allowRateChange: true,
        });
        console.log("Restored previous DB document.");
      } else {
        console.warn(
          "No previous DB document to restore; new key may remain until deleted manually.",
        );
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

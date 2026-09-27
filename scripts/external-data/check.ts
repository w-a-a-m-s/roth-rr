/**
 * Staleness / drift check for external reference data.
 *
 *   npm run external-data:check
 *   npm run external-data:check -- --year=2027
 *
 * This is the single source of truth for "does any external dataset need an
 * update?" Every wired dataset MUST be listed in CHECKABLE with criteria that
 * match how that data goes stale. See docs/external-data.md → "Adding a dataset".
 */
import fs from "node:fs";
import {
  validateFederalTaxYear,
  validateMedicarePartBYear,
  validateStateIncomeTaxYear,
} from "../../src/lib/externalData/validate";
import type { ExternalDataKey } from "../../src/lib/externalData/types";
import type { StateIncomeTaxYear } from "../../src/lib/config/stateTax";
import { printStateTaxCheckInstructions } from "./stateTaxInstructions";
import {
  apiBaseUrl,
  fallbackAbsolute,
  parseArgs,
} from "./util";

/** Every wired external dataset must appear here with a checkKey implementation. */
const CHECKABLE: ExternalDataKey[] = [
  "federal-tax",
  "medicare",
  "state-income-tax",
];

/**
 * State income tax changes mid-year; calendar `year` alone is not enough.
 * Fail when the last human review (`reviewedAt`) is older than this many days
 * so the weekly Action forces a Tax Foundation / DOR re-check.
 */
const STATE_REVIEW_MAX_AGE_DAYS = 90;

function expectedTaxYear(override?: string): number {
  if (override && /^\d{4}$/.test(override)) return Number(override);
  return new Date().getFullYear();
}

function utcTodayIso(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function daysSince(isoDate: string, now = new Date()): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.floor((today - then) / (24 * 60 * 60 * 1000));
}

function validateFallback(
  key: ExternalDataKey,
  raw: unknown,
): { ok: true; year: number; value: unknown } | { ok: false; error: string } {
  if (key === "federal-tax") {
    const v = validateFederalTaxYear(raw, { allowRateChange: true });
    if (!v.ok) return v;
    return { ok: true, year: v.value.year, value: v.value };
  }
  if (key === "medicare") {
    const v = validateMedicarePartBYear(raw, { allowRateChange: true });
    if (!v.ok) return v;
    return { ok: true, year: v.value.year, value: v.value };
  }
  if (key === "state-income-tax") {
    const v = validateStateIncomeTaxYear(raw);
    if (!v.ok) return v;
    return { ok: true, year: v.value.year, value: v.value };
  }
  return { ok: false, error: `Unsupported key ${key}` };
}

function checkStateReviewFreshness(
  value: StateIncomeTaxYear,
  errors: string[],
): void {
  const age = daysSince(value.reviewedAt);
  if (age < 0) {
    errors.push(
      `state-income-tax reviewedAt ${value.reviewedAt} is in the future`,
    );
    return;
  }
  if (age > STATE_REVIEW_MAX_AGE_DAYS) {
    errors.push(
      `state-income-tax reviewedAt ${value.reviewedAt} is ${age} days old (max ${STATE_REVIEW_MAX_AGE_DAYS}). Re-check Tax Foundation / state DOR, bump reviewedAt (and tables if rates moved), then apply.`,
    );
    return;
  }
  console.log(
    `state-income-tax reviewedAt=${value.reviewedAt} (${age}d old, max ${STATE_REVIEW_MAX_AGE_DAYS}) OK`,
  );
}

async function checkKey(
  key: ExternalDataKey,
  expected: number,
  errors: string[],
): Promise<void> {
  const file = fallbackAbsolute(key);
  if (!file || !fs.existsSync(file)) {
    errors.push(`Missing committed fallback for ${key}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const validated = validateFallback(key, raw);
  if (!validated.ok) {
    errors.push(`${key} fallback invalid: ${validated.error}`);
    return;
  }
  if (validated.year < expected) {
    errors.push(
      `${key} fallback year ${validated.year} lags expected ${expected}. Update via docs/external-data.md`,
    );
  } else {
    console.log(
      `${key} fallback year=${validated.year} (expected >= ${expected}) OK`,
    );
  }
  if (key === "federal-tax") {
    const data = validated.value as {
      standardDeduction?: Record<string, unknown>;
      brackets?: Record<string, unknown>;
      seniorDeductionPhaseOut?: Record<string, unknown>;
      longTermCapitalGains?: Record<string, unknown>;
    };
    const missing = (
      [
        "standardDeduction",
        "brackets",
        "seniorDeductionPhaseOut",
        "longTermCapitalGains",
      ] as const
    ).filter((field) => data[field]?.hoh === undefined);
    if (missing.length > 0) {
      errors.push(
        `federal-tax fallback is missing hoh on: ${missing.join(", ")}`,
      );
    } else {
      console.log("federal-tax hoh completeness (deduction, brackets, phase-out, LTCG) OK");
    }
  }

  if (key === "state-income-tax") {
    checkStateReviewFreshness(validated.value as StateIncomeTaxYear, errors);
  }

  try {
    const res = await fetch(
      `${apiBaseUrl()}/api/external-data?key=${encodeURIComponent(key)}`,
    );
    if (res.ok) {
      const body = (await res.json()) as {
        record: { data: unknown; year: number };
      };
      const live = validateFallback(key, body.record.data);
      if (!live.ok) {
        errors.push(`Live ${key} invalid: ${live.error}`);
      } else if (!deepEqual(validated.value, live.value)) {
        errors.push(`Drift: committed fallback disagrees with live GET ${key}`);
      } else if (body.record.year < expected) {
        errors.push(
          `Live ${key} year ${body.record.year} lags expected ${expected}`,
        );
      } else {
        console.log(`Live GET ${key} matches fallback OK`);
      }
    } else if (res.status === 404) {
      console.warn(
        `Live ${key} not seeded (404). Run npm run external-data:seed -- --dataset=${key}`,
      );
    } else {
      console.warn(`Live GET ${key} skipped (${res.status})`);
    }
  } catch {
    console.warn(`Live GET ${key} unreachable; checked fallback only`);
  }
}

function isStateTaxError(message: string): boolean {
  return (
    message.startsWith("state-income-tax") ||
    message.includes("Live state-income-tax") ||
    message.includes("GET state-income-tax") ||
    (message.startsWith("Drift:") && message.includes("state-income-tax")) ||
    (message.startsWith("Missing committed fallback for state-income-tax"))
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const expected = expectedTaxYear(
    typeof args.year === "string" ? args.year : undefined,
  );
  const errors: string[] = [];

  for (const key of CHECKABLE) {
    await checkKey(key, expected, errors);
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    if (errors.some(isStateTaxError)) {
      printStateTaxCheckInstructions(utcTodayIso());
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

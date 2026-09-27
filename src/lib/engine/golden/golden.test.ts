/**
 * Golden-master regression runner.
 *
 * Loads every case in `./cases/*.json` - each one a full plan (`household`)
 * paired with the exact comparison metrics it produced when last blessed
 * (`expected`), the conversion `strategy` it relates to, and the git `commit`
 * that was current at the time. Running `calculate()` on the plan must still
 * produce `expected` to the cent; if it doesn't, the engine changed.
 *
 * THIS IS THE REGRESSION SAFETY NET. When you change `domain`, `engine`, or
 * `config` - or fix a behavior (real estate, Medicare/IRMAA, RMDs, inheritance,
 * taxes, ...) - a moved number fails here and the case's `commit` tells you the
 * last code state the expected value was verified against.
 *
 * Authoring / updating cases:
 *   - New case: copy a `cases/*.json`, edit `name`, `strategy`, `note`, and
 *     `household`, then run `GOLDEN_BLESS=1 npm test` to fill `expected` and
 *     stamp `commit` / `commitDate`.
 *   - Intentional model change: run `GOLDEN_BLESS=1 npm test`. Only the cases
 *     whose numbers actually moved are rewritten (and re-stamped with the
 *     current commit); unchanged cases keep their original commit. Call out the
 *     moved metrics and why in your summary - never bless blindly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { computeMetrics, type GoldenCase } from "./harness";

const here = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(here, "cases");
const BLESS = process.env.GOLDEN_BLESS === "1";

const files = fs.existsSync(casesDir)
  ? fs.readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort()
  : [];

function gitCommit(): { commit: string; commitDate: string } {
  return {
    commit: execSync("git rev-parse --short HEAD").toString().trim(),
    commitDate: execSync("git show -s --format=%cI HEAD").toString().trim(),
  };
}

describe("golden regression: comparison metrics", () => {
  it("has at least one golden case", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const full = path.join(casesDir, file);
    const gc = JSON.parse(fs.readFileSync(full, "utf8")) as GoldenCase;

    it(`${file} - ${gc.name} [${gc.strategy}]`, () => {
      // The recorded strategy must match the plan it describes.
      expect(gc.household.optimizer.strategy).toBe(gc.strategy);

      const actual = computeMetrics(gc.household);

      if (!BLESS) {
        expect(actual).toEqual(gc.expected);
        return;
      }

      // Bless mode: only rewrite (and re-stamp the commit) when the numbers
      // actually moved, so an unchanged case keeps the commit it was first
      // verified against.
      const unchanged =
        JSON.stringify(actual) === JSON.stringify(gc.expected);
      if (unchanged) return;

      const { commit, commitDate } = gitCommit();
      const updated: GoldenCase = { ...gc, commit, commitDate, expected: actual };
      fs.writeFileSync(full, JSON.stringify(updated, null, 2) + "\n");
    });
  }
});

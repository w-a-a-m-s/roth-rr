import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Household } from "@/lib/domain/types";
import { calculate, calculateSpendingCapacity } from "@/lib/calculate";
import { accountsLeft, spendingCapacity } from "@/lib/engine/spendingCapacity";
import { buildConversionSchedule } from "@/lib/optimizer";
import { runRothScenario } from "@/lib/engine/runScenario";

const golden = (name: string): Household =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "golden/cases", `${name}.json`), "utf8")).household;

describe("spendingCapacity", () => {
  const h = golden("single-filer");
  const c = calculateSpendingCapacity(h);

  it("finds the most the plan can spend, every year covered to the final age", () => {
    // The plan spends $6,000 a month; the money supports about $11,927
    // without conversions and $12,617 with them (brackets indexed 2% a year).
    expect(c.baseline.planMonthly).toBe(6000);
    expect(Math.round(c.baseline.capacityMonthly)).toBe(11_927);
    expect(Math.round(c.roth.capacityMonthly)).toBe(12_617);
    for (const s of [c.baseline, c.roth]) {
      for (const row of s.rows) expect(row.surplus).toBeGreaterThan(-1);
      expect(s.runsShort).toBeNull();
    }
  });

  it("spends the accounts down to about nothing at the final age", () => {
    const last = c.roth.rows[c.roth.rows.length - 1];
    expect(accountsLeft(last)).toBeLessThan(1_000);
    // Two dollars a month more and some year comes up short.
    const scale = c.roth.scale + 2 / c.roth.planMonthly;
    const more = runRothScenario(h, buildConversionSchedule(h), "more", undefined, {
      spendingScale: scale,
      coverShortfalls: true,
    });
    expect(more.rows.some((r) => r.surplus < -1)).toBe(true);
  });

  it("leaves the reserve when asked, at a lower capacity", () => {
    const kept = spendingCapacity(h, buildConversionSchedule(h), undefined, { endReserve: 200_000 });
    expect(accountsLeft(kept.roth.rows[kept.roth.rows.length - 1])).toBeGreaterThanOrEqual(200_000);
    expect(kept.roth.capacityMonthly).toBeLessThan(c.roth.capacityMonthly);
  });

  it("reports the first short year at the plan's spending", () => {
    const tight: Household = {
      ...h,
      expenses: h.expenses.map((e) => ({ ...e, amount: e.amount * 3 })),
    };
    const t = calculateSpendingCapacity(tight);
    expect(t.baseline.runsShort).not.toBeNull();
    expect(t.baseline.capacityMonthly).toBeLessThan(t.baseline.planMonthly);
  });

  it("leaves the Retirement analysis unchanged", () => {
    const plain = calculate(h);
    expect(plain.roth.rows.some((r) => Object.keys(r.incomeMonthly).some((k) => k.startsWith("topup:")))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/calculate";
import type { Household } from "@/lib/domain/types";
import { primaryPersonId } from "@/lib/engine/project";
import modernSample from "@/lib/engine/golden/cases/modern-sample.json";
import { buildSnapshotTable, snapshotRows } from "./snapshotTable";

const household = modernSample.household as unknown as Household;
const comparison = calculate(household);
const primaryId = primaryPersonId(household);
const firstYear = comparison.baseline.rows[0].calendarYear;

describe("snapshotRows", () => {
  it("takes six years from the start year", () => {
    const rows = snapshotRows(comparison.baseline.rows, firstYear + 2);
    expect(rows.map((r) => r.calendarYear)).toEqual(
      [2, 3, 4, 5, 6, 7].map((n) => firstYear + n),
    );
  });

  it("slides back so the window stays full at the end of the projection", () => {
    const all = comparison.baseline.rows;
    const last = all[all.length - 1].calendarYear;
    const rows = snapshotRows(all, last);
    expect(rows).toHaveLength(6);
    expect(rows[5].calendarYear).toBe(last);
  });
});

describe("buildSnapshotTable", () => {
  const table = buildSnapshotTable(
    comparison.baseline,
    household,
    primaryId,
    firstYear,
  );
  const section = (key: string) =>
    table.sections.find((s) => s.key === key)!;

  it("lists DROP first, one row per tax-deferred and after-tax account, then Roth", () => {
    const labels = section("assets").lines.map((l) => l.label);
    expect(labels[0]).toBe("DROP (David)");
    expect(labels[1]).toBe("DROP (Batsheva)");
    expect(labels).toContain("Investment account");
    expect(labels[labels.length - 1]).toBe("Roth");
  });

  it("shows ages for both people, the main person first", () => {
    expect(table.ages.map((a) => a.label)).toEqual([
      "Age · David",
      "Age · Batsheva",
    ]);
    expect(table.ages[0].values[0]).toBe(
      comparison.baseline.rows[0].ages[primaryId],
    );
  });

  it("keeps an RMD row that only pays later in the projection", () => {
    const rmd = section("income").lines.find((l) => l.key === "inc-rmd:drop-s1");
    expect(rmd).toBeDefined();
    expect(rmd!.values.every((v) => v === 0)).toBe(true);
  });

  it("reads cash flow straight off the projection rows", () => {
    const row = comparison.baseline.rows[0];
    const cash = section("cashflow").lines;
    const value = (key: string) => cash.find((l) => l.key === key)!.values[0];
    expect(value("gross")).toBe(row.totalMonthlyIncome);
    expect(value("tax")).toBe(row.monthlyTax);
    expect(value("net")).toBe(row.netMonthlyIncome);
    expect(value("surplus")).toBe(row.surplus);
  });

  it("adds a conversion row only in the scenario that converts", () => {
    const has = (s: typeof table) =>
      s.sections[0].lines.some((l) => l.key === "conversion");
    expect(has(table)).toBe(false);
    const roth = buildSnapshotTable(comparison.roth, household, primaryId, firstYear);
    expect(has(roth)).toBe(true);
    expect(roth.sections[0].lines.find((l) => l.key === "conversion")!.values[0]).toBe(
      comparison.roth.rows[0].conversion,
    );
  });
});

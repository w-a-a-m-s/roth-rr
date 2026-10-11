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

  it("groups assets: retirement, then regular investments, then Roth", () => {
    const lines = section("assets").lines;
    const labels = lines.map((l) => l.label);
    expect(labels[0]).toBe("DROP (David)");
    expect(labels[1]).toBe("DROP (Batsheva)");
    expect(labels).toContain("Investment account");
    const groups = lines.slice(0, -1).map((l) => l.group);
    expect(groups.every((g) => g != null)).toBe(true);
    // Groups never interleave: each starts after the previous one ends.
    const order = groups.filter((g, i) => g !== groups[i - 1]);
    expect(order).toEqual(["retirement", "regular", "roth"]);
    expect(labels[labels.length - 1]).toBe("Total assets");
    expect(labels[labels.length - 2]).toBe("Total Roth");
  });

  it("closes the assets with a total of every group", () => {
    const lines = section("assets").lines;
    const total = lines[lines.length - 1];
    expect(total.key).toBe("assets-total");
    expect(total.group).toBeUndefined();
    const row = comparison.baseline.rows[0];
    expect(total.values[0]).toBeCloseTo(
      row.retirementTotal +
        row.afterTaxTotal +
        row.realEstateEquity +
        row.businessEquity +
        row.rothTotal,
      6,
    );
    const groupTotals = ["retirement-total", "regular-total", "roth"].map(
      (key) => lines.find((l) => l.key === key)!.values[0],
    );
    expect(total.values[0]).toBeCloseTo(
      groupTotals.reduce((a, b) => a + b, 0),
      6,
    );
  });

  it("ends each group with a total that matches the projection", () => {
    const lines = section("assets").lines;
    const row = comparison.baseline.rows[0];
    const total = (key: string) => lines.find((l) => l.key === key)!;
    expect(total("retirement-total").subtotal).toBe(true);
    expect(total("retirement-total").values[0]).toBe(row.retirementTotal);
    expect(total("regular-total").values[0]).toBe(
      row.afterTaxTotal + row.realEstateEquity + row.businessEquity,
    );
    expect(total("roth").values[0]).toBe(row.rothTotal);
    // The member rows add up to their group's total.
    const sum = (group: string) =>
      lines
        .filter((l) => l.group === group && !l.subtotal)
        .reduce((acc, l) => acc + l.values[0], 0);
    expect(sum("retirement")).toBeCloseTo(row.retirementTotal, 6);
    expect(sum("regular")).toBeCloseTo(
      row.afterTaxTotal + row.realEstateEquity,
      6,
    );
  });

  it("lists each property's equity on its own row", () => {
    const two: Household = {
      ...household,
      realEstate: [
        ...household.realEstate,
        { ...household.realEstate[0], id: "re-2", label: "Beach condo" },
      ],
    };
    const result = calculate(two);
    const t = buildSnapshotTable(result.baseline, two, primaryId, firstYear);
    const lines = t.sections[0].lines;
    const row = result.baseline.rows[0];
    const condo = lines.find((l) => l.key === "re-re-2")!;
    expect(condo.label).toBe("Real estate · Beach condo");
    expect(condo.group).toBe("regular");
    expect(condo.values[0]).toBe(row.realEstateEquityById["re-2"]);
    expect(lines.some((l) => l.key === "re-equity")).toBe(false);
    const propertyRows = lines.filter((l) => l.key.startsWith("re-"));
    expect(propertyRows).toHaveLength(2);
    expect(propertyRows.reduce((a, l) => a + l.values[0], 0)).toBeCloseTo(
      row.realEstateEquity,
      6,
    );
  });

  it("lists each business under regular investments", () => {
    const withBiz: Household = {
      ...household,
      businesses: [{ id: "b1", label: "Shop", value: 200_000, growthRate: 0.05 }],
    };
    const result = calculate(withBiz);
    const t = buildSnapshotTable(result.baseline, withBiz, primaryId, firstYear);
    const lines = t.sections[0].lines;
    const biz = lines.find((l) => l.key === "biz-b1")!;
    expect(biz.label).toBe("Business · Shop");
    expect(biz.group).toBe("regular");
    expect(biz.values[0]).toBe(200_000);
    expect(biz.values[1]).toBeCloseTo(210_000, 6);
    const row = result.baseline.rows[0];
    expect(lines.find((l) => l.key === "regular-total")!.values[0]).toBe(
      row.afterTaxTotal + row.realEstateEquity + 200_000,
    );
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

describe("tax paid from conversion section", () => {
  const assets: Household = {
    ...household,
    optimizer: { ...household.optimizer, conversionTaxPaidFrom: "assets" },
  };
  const build = (h: Household) => {
    const c = calculate(h);
    return buildSnapshotTable(c.roth, h, primaryId, firstYear);
  };

  it("sits right after Cash flow with monthly and annual lines", () => {
    const t = build(assets);
    const keys = t.sections.map((s) => s.key);
    expect(keys.indexOf("conversionTax")).toBe(keys.indexOf("cashflow") + 1);
    const [monthly, annual] = t.sections.find((s) => s.key === "conversionTax")!
      .lines;
    expect(annual.values.some((v) => v > 0)).toBe(true);
    annual.values.forEach((v, i) => expect(monthly.values[i]).toBeCloseTo(v / 12, 6));
  });

  it("is hidden when conversion tax is paid from income", () => {
    expect(build(household).sections.map((s) => s.key)).not.toContain(
      "conversionTax",
    );
  });
});

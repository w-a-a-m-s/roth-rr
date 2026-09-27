import { describe, expect, it } from "vitest";
import { createBlankHousehold } from "@/lib/config/sampleData";
import {
  detailPlanSnapshots,
  diffPlanSnapshots,
  formatPlanChangeLabel,
  planSnapshotsEqual,
  type PlanSnapshot,
} from "@/lib/planDiff";

function snap(overrides: Partial<PlanSnapshot> = {}): PlanSnapshot {
  return {
    name: "Plan A",
    household: createBlankHousehold(),
    ...overrides,
  };
}

describe("diffPlanSnapshots", () => {
  it("returns created when there is no previous snapshot", () => {
    expect(diffPlanSnapshots(null, snap())).toEqual(["created"]);
  });

  it("returns empty when snapshots are identical", () => {
    const a = snap();
    const b = snap({ household: structuredClone(a.household) });
    expect(diffPlanSnapshots(a, b)).toEqual([]);
    expect(planSnapshotsEqual(a, b)).toBe(true);
  });

  it("detects a name-only change", () => {
    const previous = snap({ name: "Old" });
    const next = snap({ name: "New", household: previous.household });
    expect(diffPlanSnapshots(previous, next)).toEqual(["name"]);
  });

  it("detects a household top-level key change", () => {
    const previous = snap();
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        filingStatus: "mfj",
      },
    });
    // Blank household is single; flipping filing status should show up.
    if (previous.household.filingStatus === next.household.filingStatus) {
      next.household.residenceState =
        previous.household.residenceState === "FL" ? "CA" : "FL";
      expect(diffPlanSnapshots(previous, next)).toEqual(["residenceState"]);
      return;
    }
    expect(diffPlanSnapshots(previous, next)).toEqual(["filingStatus"]);
  });

  it("lists multiple changed fields", () => {
    const previous = snap({ name: "A" });
    const next: PlanSnapshot = {
      name: "B",
      household: {
        ...structuredClone(previous.household),
        assumptions: {
          ...previous.household.assumptions,
          finalAge: previous.household.assumptions.finalAge + 1,
        },
      },
    };
    expect(diffPlanSnapshots(previous, next).sort()).toEqual(
      ["assumptions", "name"].sort(),
    );
  });
});

describe("formatPlanChangeLabel", () => {
  it("labels known fields", () => {
    expect(formatPlanChangeLabel("created")).toBe("Created");
    expect(formatPlanChangeLabel("accounts")).toBe("Accounts");
  });

  it("falls back to the raw field name", () => {
    expect(formatPlanChangeLabel("customField")).toBe("customField");
  });
});

describe("detailPlanSnapshots", () => {
  it("reports created when there is no previous snapshot", () => {
    expect(detailPlanSnapshots(null, snap({ name: "Fresh" }))).toEqual([
      {
        section: "Created",
        property: "Plan",
        before: "Not set",
        after: "Fresh",
      },
    ]);
  });

  it("returns empty when snapshots are identical", () => {
    const a = snap();
    const b = snap({ household: structuredClone(a.household) });
    expect(detailPlanSnapshots(a, b)).toEqual([]);
  });

  it("details a scalar assumptions change", () => {
    const previous = snap();
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        assumptions: {
          ...previous.household.assumptions,
          finalAge: previous.household.assumptions.finalAge + 1,
        },
      },
    });
    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Assumptions",
        property: "Final age",
        before: String(previous.household.assumptions.finalAge),
        after: String(next.household.assumptions.finalAge),
      },
    ]);
  });

  it("details per-year conversion schedule changes", () => {
    const previous = snap();
    previous.household.people[0] = {
      ...previous.household.people[0],
      retirementYear: 2030,
    };
    previous.household.optimizer = {
      strategy: "manual",
      manualSchedule: [10_000, 20_000],
    };
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        optimizer: {
          strategy: "manual",
          manualSchedule: [10_000, 25_000],
        },
      },
    });
    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Conversion strategy",
        property: "Year 2031",
        before: "$20,000",
        after: "$25,000",
      },
    ]);
  });

  it("details an account property change", () => {
    const previous = snap();
    previous.household.accounts = [
      {
        id: "a1",
        label: "DROP",
        ownerId: previous.household.people[0].id,
        kind: "retirementTaxable",
        balance: 100_000,
        growthRate: 0.05,
      },
    ];
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        accounts: [
          {
            ...previous.household.accounts[0],
            balance: 150_000,
          },
        ],
      },
    });
    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Accounts",
        property: "DROP · Balance",
        before: "$100,000",
        after: "$150,000",
      },
    ]);
  });

  it("labels a retirement-type change with the shared display names", () => {
    const previous = snap();
    previous.household.accounts = [
      {
        id: "a1",
        label: "Retirement",
        ownerId: previous.household.people[0].id,
        kind: "retirementTaxable",
        retirementType: "drop",
        balance: 100_000,
        growthRate: 0.05,
      },
    ];
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        accounts: [
          {
            ...previous.household.accounts[0],
            retirementType: "ira",
          },
        ],
      },
    });
    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Accounts",
        property: "Retirement · Type",
        before: "DROP",
        after: "IRA",
      },
    ]);
  });

  it("describes deposit changes in one readable line", () => {
    const previous = snap();
    previous.household.accounts = [
      {
        id: "a1",
        label: "401(k)",
        ownerId: previous.household.people[0].id,
        kind: "retirementTaxable",
        balance: 100_000,
        growthRate: 0.05,
        deposits: [
          {
            id: "d1",
            label: "Contribution",
            amount: 500,
            frequency: "monthly",
            startYear: 2026,
            endYear: 2030,
          },
          {
            id: "d2",
            label: "Bonus",
            amount: 10_000,
            frequency: "oneTime",
            startYear: 2027,
          },
        ],
      },
    ];
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        accounts: [
          {
            ...structuredClone(previous.household.accounts[0]),
            deposits: [
              {
                id: "d1",
                label: "Contribution",
                amount: 800,
                frequency: "monthly",
                startYear: 2026,
                endYear: 2030,
              },
            ],
          },
        ],
      },
    });

    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Accounts",
        property: "401(k) · Deposit · Contribution",
        before: "Contribution: $500/mo, 2026 to 2030",
        after: "Contribution: $800/mo, 2026 to 2030",
      },
      {
        section: "Accounts",
        property: "401(k) · Deposit · Bonus",
        before: "Bonus: $10,000 one time, 2027",
        after: "Removed",
      },
    ]);
  });

  it("details entity add and remove", () => {
    const previous = snap();
    previous.household.accounts = [
      {
        id: "a1",
        label: "Old IRA",
        ownerId: previous.household.people[0].id,
        kind: "retirementTaxable",
        balance: 50_000,
        growthRate: 0.05,
      },
    ];
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        accounts: [
          {
            id: "a2",
            label: "New Roth",
            ownerId: previous.household.people[0].id,
            kind: "rothTaxFree",
            balance: 1_000,
            growthRate: 0.08,
          },
        ],
      },
    });
    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Accounts",
        property: "New Roth",
        before: "Not set",
        after: "Added",
      },
      {
        section: "Accounts",
        property: "Old IRA",
        before: "Present",
        after: "Removed",
      },
    ]);
  });

  it("mentions properties missing on the old snapshot", () => {
    const previous = snap();
    const prevHousehold = structuredClone(previous.household) as Record<
      string,
      unknown
    > &
      typeof previous.household;
    const prevOpt = { ...(prevHousehold.optimizer as object) } as Record<
      string,
      unknown
    >;
    delete prevOpt.allowOverConvertible;
    prevHousehold.optimizer = prevOpt;

    const next = snap({
      household: {
        ...structuredClone(previous.household),
        optimizer: {
          ...previous.household.optimizer,
          allowOverConvertible: true,
        },
      },
    });

    expect(
      detailPlanSnapshots(
        { name: previous.name, household: prevHousehold },
        next,
      ),
    ).toContainEqual({
      section: "Conversion strategy",
      property: "Allow over-convertible",
      before: "Not set",
      after: "Yes",
    });
  });

  it("describes a joint after-tax owner as Both", () => {
    const previous = snap();
    previous.household.filingStatus = "mfj";
    previous.household.people = [
      {
        id: "p1",
        name: "Alex",
        birthYear: 1960,
        retirementYear: 2026,
      },
      {
        id: "p2",
        name: "Sam",
        birthYear: 1962,
        retirementYear: 2028,
      },
    ];
    previous.household.accounts = [
      {
        id: "a1",
        label: "Brokerage",
        ownerId: "p1",
        kind: "investment",
        balance: 100_000,
        growthRate: 0.05,
      },
    ];
    const next = snap({
      household: {
        ...structuredClone(previous.household),
        accounts: [
          {
            ...previous.household.accounts[0],
            joint: true,
          },
        ],
      },
    });
    expect(detailPlanSnapshots(previous, next)).toEqual([
      {
        section: "Accounts",
        property: "Brokerage · Owner",
        before: "Alex",
        after: "Both",
      },
    ]);
  });

  it("ignores properties missing on the new snapshot (schema drop)", () => {
    const previous = snap();
    const prevHousehold = structuredClone(previous.household) as Record<
      string,
      unknown
    > &
      typeof previous.household;
    prevHousehold.optimizer = {
      ...(prevHousehold.optimizer as object),
      legacyFlag: true,
    };

    const next = snap({
      household: structuredClone(previous.household),
    });

    const details = detailPlanSnapshots(
      { name: previous.name, household: prevHousehold },
      next,
    );
    expect(details).toEqual([]);
    expect(
      details.some((d) => d.property.toLowerCase().includes("legacy")),
    ).toBe(false);
  });
});

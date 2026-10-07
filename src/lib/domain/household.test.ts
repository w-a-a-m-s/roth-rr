import { describe, expect, it } from "vitest";
import { createBlankHousehold } from "@/lib/config/sampleData";
import {
  accountDepositEndYear,
  accountGrowsInYear,
  accountsInDisplayOrder,
  firstYearGrowthFraction,
  accountOwnerLabel,
  applyFilingStatus,
  canAccountBeJoint,
  expenseMonthlyForYear,
  expenseYearsLabel,
  healRetirementType,
  incomeMonthlyForYear,
  isExpenseActive,
  isHouseholdReady,
  isIncomeActive,
  isJointAccount,
  isUntouchedHousehold,
} from "@/lib/domain/household";
import type { Account, Expense, Household, IncomeSource, Person } from "@/lib/domain/types";

function withPeople(
  household: Household,
  people: Person[],
  filingStatus: Household["filingStatus"] = household.filingStatus,
): Household {
  return { ...household, filingStatus, people };
}

const complete = (id: string, name: string): Person => ({
  id,
  name,
  birthYear: 1960,
  retirementYear: 2026,
});

describe("isHouseholdReady", () => {
  it("requires at least one complete person when single", () => {
    const blank = createBlankHousehold();
    expect(isHouseholdReady(blank)).toBe(false);

    expect(
      isHouseholdReady(
        withPeople(
          blank,
          [{ id: "p1", name: "", birthYear: 1960, retirementYear: 2026 }],
          "single",
        ),
      ),
    ).toBe(false);

    expect(
      isHouseholdReady(withPeople(blank, [complete("p1", "Alex")], "single")),
    ).toBe(true);
  });

  it("requires both people complete when married", () => {
    const blank = createBlankHousehold();
    const married = applyFilingStatus(blank, "mfj");
    expect(isHouseholdReady(married)).toBe(false);

    const oneDone = withPeople(
      married,
      [complete("p1", "Alex"), { id: "p2", name: "Sam" }],
      "mfj",
    );
    expect(isHouseholdReady(oneDone)).toBe(false);

    const bothDone = withPeople(
      married,
      [complete("p1", "Alex"), complete("p2", "Sam")],
      "mfj",
    );
    expect(isHouseholdReady(bothDone)).toBe(true);
  });

  it("requires one complete person when head of household", () => {
    const blank = createBlankHousehold();
    expect(
      isHouseholdReady(withPeople(blank, [complete("p1", "Alex")], "hoh")),
    ).toBe(true);
    expect(
      isHouseholdReady(
        withPeople(
          blank,
          [{ id: "p1", name: "", birthYear: 1960, retirementYear: 2026 }],
          "hoh",
        ),
      ),
    ).toBe(false);
  });

  it("blocks married plans that only have one person", () => {
    const blank = createBlankHousehold();
    expect(
      isHouseholdReady(withPeople(blank, [complete("p1", "Alex")], "mfj")),
    ).toBe(false);
  });
});

describe("isUntouchedHousehold", () => {
  it("is true for a brand-new blank household", () => {
    expect(isUntouchedHousehold(createBlankHousehold())).toBe(true);
  });

  it("is false once a person has any details, even with no accounts", () => {
    const blank = createBlankHousehold();
    expect(
      isUntouchedHousehold(
        withPeople(blank, [{ id: "p1", name: "Alex" }], "single"),
      ),
    ).toBe(false);
    expect(
      isUntouchedHousehold(withPeople(blank, [complete("p1", "Alex")], "single")),
    ).toBe(false);
  });

  it("is false when accounts or income exist", () => {
    const blank = createBlankHousehold();
    expect(
      isUntouchedHousehold({
        ...blank,
        accounts: [
          {
            id: "a1",
            name: "IRA",
            kind: "retirementTaxable",
            ownerId: blank.people[0].id,
            balance: 1,
          },
        ],
      }),
    ).toBe(false);
  });
});

function afterTaxAccount(
  people: Person[],
  ownerId: string,
  joint = false,
): Account {
  return {
    id: "brokerage",
    label: "Joint brokerage",
    ownerId,
    kind: "investment",
    balance: 1000,
    growthRate: 0.05,
    ...(joint ? { joint: true } : {}),
  };
}

describe("joint after-tax accounts", () => {
  it("allows joint only for after-tax accounts on an MFJ plan", () => {
    expect(canAccountBeJoint("investment", "mfj")).toBe(true);
    expect(canAccountBeJoint("savings", "mfj")).toBe(true);
    expect(canAccountBeJoint("retirementTaxable", "mfj")).toBe(false);
    expect(canAccountBeJoint("rothTaxFree", "mfj")).toBe(false);
    expect(canAccountBeJoint("investment", "single")).toBe(false);
    expect(canAccountBeJoint("investment", "hoh")).toBe(false);
  });

  it("labels a valid joint account as Both", () => {
    const people = [complete("p1", "Alex"), complete("p2", "Sam")];
    const account = afterTaxAccount(people, "p1", true);
    expect(isJointAccount(account, "mfj")).toBe(true);
    expect(accountOwnerLabel(account, people, "mfj")).toBe("Both");
    expect(accountOwnerLabel(account, people, "single")).toBe("Alex");
  });

  it("defaults a joint deposit end year to the later retirement year", () => {
    const people = [
      { ...complete("p1", "Alex"), retirementYear: 2028 },
      { ...complete("p2", "Sam"), retirementYear: 2032 },
    ];
    const joint = afterTaxAccount(people, "p1", true);
    expect(accountDepositEndYear(joint, people, "mfj")).toBe(2032);
    expect(accountDepositEndYear({ ...joint, joint: false }, people, "mfj")).toBe(
      2028,
    );
  });
});

describe("applyFilingStatus: joint after-tax accounts", () => {
  it("keeps a joint account and clears joint when switching to single", () => {
    const married = applyFilingStatus(createBlankHousehold(), "mfj");
    const p1 = married.people[0];
    const withAccount: Household = {
      ...married,
      accounts: [afterTaxAccount(married.people, p1.id, true)],
    };
    const single = applyFilingStatus(withAccount, "single");
    expect(single.accounts).toHaveLength(1);
    expect(single.accounts[0].joint).toBeUndefined();
    expect(single.accounts[0].ownerId).toBe(p1.id);
  });

  it("reassigns a joint account owned by the removed spouse", () => {
    const married = applyFilingStatus(createBlankHousehold(), "mfj");
    const p1 = married.people[0];
    const p2 = married.people[1];
    const withAccount: Household = {
      ...married,
      accounts: [afterTaxAccount(married.people, p2.id, true)],
    };
    const single = applyFilingStatus(withAccount, "single");
    expect(single.accounts).toHaveLength(1);
    expect(single.accounts[0].joint).toBeUndefined();
    expect(single.accounts[0].ownerId).toBe(p1.id);
  });

  it("drops the spouse when switching from MFJ to head of household", () => {
    const married = applyFilingStatus(createBlankHousehold(), "mfj");
    const p1 = married.people[0];
    const p2 = married.people[1];
    const withAccount: Household = {
      ...married,
      accounts: [afterTaxAccount(married.people, p2.id, false)],
    };
    const hoh = applyFilingStatus(withAccount, "hoh");
    expect(hoh.filingStatus).toBe("hoh");
    expect(hoh.people).toHaveLength(1);
    expect(hoh.people[0].id).toBe(p1.id);
    expect(hoh.accounts).toHaveLength(0);
  });

  it("still drops a non-joint account owned by the removed spouse", () => {
    const married = applyFilingStatus(createBlankHousehold(), "mfj");
    const p2 = married.people[1];
    const withAccount: Household = {
      ...married,
      accounts: [afterTaxAccount(married.people, p2.id, false)],
    };
    const single = applyFilingStatus(withAccount, "single");
    expect(single.accounts).toHaveLength(0);
  });
});

describe("accountsInDisplayOrder", () => {
  const acc = (label: string, retirementType?: "drop" | "403b" | "ira") => ({
    label,
    kind: "retirementTaxable" as const,
    retirementType,
  });

  it("puts DROP first and sick-days / Bencor accounts last, keeping plan order otherwise", () => {
    const accounts = [
      acc("Sick Days", "403b"),
      acc("Nationwide", "403b"),
      acc("Bencor", "403b"),
      acc("DROP", "drop"),
      acc("IRA", "ira"),
    ];
    expect(accountsInDisplayOrder(accounts).map((a) => a.label)).toEqual([
      "DROP",
      "Nationwide",
      "IRA",
      "Sick Days",
      "Bencor",
    ]);
  });

  it("leaves the input array untouched", () => {
    const accounts = [acc("Sick Days (Bencor)", "403b"), acc("DROP", "drop")];
    accountsInDisplayOrder(accounts);
    expect(accounts[0].label).toBe("Sick Days (Bencor)");
  });
});

describe("firstYearGrowthFraction", () => {
  it("is the share of the start year left after the as-of date", () => {
    expect(firstYearGrowthFraction(2026, "2026-01-01")).toBe(1);
    expect(firstYearGrowthFraction(2026, "2026-10-07")).toBeCloseTo(86 / 365, 10);
    expect(firstYearGrowthFraction(2026, "2026-12-31")).toBeCloseTo(1 / 365, 10);
    expect(firstYearGrowthFraction(2028, "2028-07-01")).toBeCloseTo(184 / 366, 10);
  });

  it("is a full year with no date, a bad date, or a date outside the start year", () => {
    expect(firstYearGrowthFraction(2026)).toBe(1);
    expect(firstYearGrowthFraction(2026, "soon")).toBe(1);
    expect(firstYearGrowthFraction(2027, "2026-10-07")).toBe(1);
    expect(firstYearGrowthFraction(2025, "2026-10-07")).toBe(1);
  });
});

describe("accountGrowsInYear", () => {
  const people: Person[] = [
    { id: "p1", name: "Pat", birthYear: 1970, retirementYear: 2026 },
    { id: "p2", name: "Sam", birthYear: 1972, retirementYear: 2028 },
  ];

  it("grows a non-DROP account every year", () => {
    const acc: Account = {
      id: "ira",
      label: "IRA",
      ownerId: "p1",
      kind: "retirementTaxable",
      retirementType: "ira",
      balance: 1,
      growthRate: 0.05,
    };
    expect(accountGrowsInYear(acc, people, 2026, 2026)).toBe(true);
  });

  it("grows a DROP only after the owner retires", () => {
    const acc: Account = {
      id: "drop",
      label: "DROP",
      ownerId: "p2",
      kind: "retirementTaxable",
      retirementType: "drop",
      balance: 1,
      growthRate: 0.05,
    };
    expect(accountGrowsInYear(acc, people, 2026, 2026)).toBe(false);
    expect(accountGrowsInYear(acc, people, 2028, 2026)).toBe(false);
    expect(accountGrowsInYear(acc, people, 2029, 2026)).toBe(true);
  });

  it("falls back to the household start year when retirement year is missing", () => {
    const acc: Account = {
      id: "drop",
      label: "DROP",
      ownerId: "p1",
      kind: "retirementTaxable",
      retirementType: "drop",
      balance: 1,
      growthRate: 0.05,
    };
    const noYear: Person[] = [{ id: "p1", name: "Pat", birthYear: 1970 }];
    expect(accountGrowsInYear(acc, noYear, 2026, 2026)).toBe(false);
    expect(accountGrowsInYear(acc, noYear, 2027, 2026)).toBe(true);
  });
});

describe("healRetirementType", () => {
  it("defaults a taxable-retirement account to DROP", () => {
    const acc: Account = {
      id: "ret",
      label: "Old",
      ownerId: "p1",
      kind: "retirementTaxable",
      balance: 1,
      growthRate: 0.05,
    };
    healRetirementType(acc);
    expect(acc.retirementType).toBe("drop");
  });
});

describe("expense date range", () => {
  const expense = (
    partial: Partial<Expense> & Pick<Expense, "id">,
  ): Expense => ({
    label: partial.id,
    amount: 1_000,
    frequency: "monthly",
    growthRate: 0.1,
    ...partial,
  });

  it("is active for the whole plan when both bounds are omitted", () => {
    const e = expense({ id: "open" });
    expect(isExpenseActive(e, 2020)).toBe(true);
    expect(isExpenseActive(e, 2099)).toBe(true);
  });

  it("treats start and end as inclusive", () => {
    const e = expense({ id: "window", startYear: 2030, endYear: 2032 });
    expect(isExpenseActive(e, 2029)).toBe(false);
    expect(isExpenseActive(e, 2030)).toBe(true);
    expect(isExpenseActive(e, 2032)).toBe(true);
    expect(isExpenseActive(e, 2033)).toBe(false);
  });

  it("uses the entered amount in the start year and grows only after", () => {
    const e = expense({
      id: "bridge",
      startYear: 2032,
      endYear: 2033,
    });
    expect(expenseMonthlyForYear(e, 2031, 2030)).toBe(0);
    expect(expenseMonthlyForYear(e, 2032, 2030)).toBe(1_000);
    expect(expenseMonthlyForYear(e, 2033, 2030)).toBeCloseTo(1_100, 6);
    expect(expenseMonthlyForYear(e, 2034, 2030)).toBe(0);
  });

  it("grows from the projection start when startYear is omitted", () => {
    const e = expense({ id: "open", endYear: 2031 });
    expect(expenseMonthlyForYear(e, 2030, 2030)).toBe(1_000);
    expect(expenseMonthlyForYear(e, 2031, 2030)).toBeCloseTo(1_100, 6);
    expect(expenseMonthlyForYear(e, 2032, 2030)).toBe(0);
  });

  it("labels a bounded, open, or one-sided window", () => {
    expect(expenseYearsLabel(expense({ id: "open" }))).toBeUndefined();
    expect(
      expenseYearsLabel(expense({ id: "from", startYear: 2028 })),
    ).toBe("2028 onward");
    expect(
      expenseYearsLabel(expense({ id: "to", endYear: 2032 })),
    ).toBe("through 2032");
    expect(
      expenseYearsLabel(
        expense({ id: "both", startYear: 2028, endYear: 2032 }),
      ),
    ).toBe("2028 to 2032");
    expect(
      expenseYearsLabel(
        expense({ id: "one", startYear: 2028, endYear: 2028 }),
      ),
    ).toBe("2028");
  });
});

describe("income date range", () => {
  const income = (
    partial: Partial<IncomeSource> & Pick<IncomeSource, "id">,
  ): IncomeSource => ({
    label: partial.id,
    ownerId: "p1",
    kind: "pension",
    monthlyAmount: 2_000,
    growthRate: 0.1,
    taxability: "full",
    ...partial,
  });

  it("uses the entered amount in the start year and grows only after", () => {
    const source = income({ id: "ss", startYear: 2032, endYear: 2033 });
    expect(isIncomeActive(source, 2031)).toBe(false);
    expect(incomeMonthlyForYear(source, 2031, 2030)).toBe(0);
    expect(incomeMonthlyForYear(source, 2032, 2030)).toBe(2_000);
    expect(incomeMonthlyForYear(source, 2033, 2030)).toBeCloseTo(2_200, 6);
    expect(incomeMonthlyForYear(source, 2034, 2030)).toBe(0);
  });

  it("keeps growthDelayYears relative to the start year", () => {
    const source = income({
      id: "rent",
      startYear: 2031,
      growthDelayYears: 1,
    });
    expect(incomeMonthlyForYear(source, 2031, 2030)).toBe(2_000);
    expect(incomeMonthlyForYear(source, 2032, 2030)).toBe(2_000);
    expect(incomeMonthlyForYear(source, 2033, 2030)).toBeCloseTo(2_200, 6);
  });
});

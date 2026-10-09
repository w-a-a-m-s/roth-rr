import type {
  Account,
  AccountKind,
  DepositFrequency,
  Expense,
  FilingStatus,
  GrowthStart,
  Household,
  IncomeKind,
  IncomeSource,
  PensionPayout,
  Person,
  RetirementAccountType,
} from "@/lib/domain/types";
import { uid } from "@/lib/id";

/** How often a deposit pays into an account. */
export const DEPOSIT_FREQUENCIES: DepositFrequency[] = [
  "monthly",
  "yearly",
  "oneTime",
];

/**
 * Account-withdrawal income kinds and the account kinds each can draw from.
 * These income streams reduce the balance of a chosen account (selected via
 * `IncomeSource.drawsFromAccountId`) instead of appearing out of nowhere.
 */
export const AFTER_TAX_ACCOUNT_KINDS: AccountKind[] = [
  "investment",
  "annuity",
  "cd",
  "savings",
];

export const RETIREMENT_ACCOUNT_TYPES: RetirementAccountType[] = [
  "401k",
  "403b",
  "457b",
  "ira",
  "tsp",
  "drop",
];

export const RETIREMENT_ACCOUNT_TYPE_LABELS: Record<
  RetirementAccountType,
  string
> = {
  "401k": "401(k)",
  "403b": "403(b)",
  "457b": "457(b)",
  ira: "IRA",
  tsp: "TSP",
  drop: "DROP",
};

export const DEFAULT_RETIREMENT_ACCOUNT_TYPE: RetirementAccountType = "drop";

export function isRetirementAccountType(
  value: unknown,
): value is RetirementAccountType {
  return (
    typeof value === "string" &&
    (RETIREMENT_ACCOUNT_TYPES as string[]).includes(value)
  );
}

export function isDropRetirementAccount(
  account: Pick<Account, "kind" | "retirementType">,
): boolean {
  return account.kind === "retirementTaxable" && account.retirementType === "drop";
}

/**
 * A sick-leave payout account, recognized by its label: "Sick Days", or
 * "Bencor" (the plan administrator it is often named after).
 */
function isSickDaysAccount(account: Pick<Account, "label">): boolean {
  return /\b(sick|bencor)\b/i.test(account.label ?? "");
}

/**
 * Accounts in the order the results list them: DROP first, sick-leave
 * accounts last, everything else in plan order between them. Display only:
 * the engine keeps plan order, which is also the conversion cascade order.
 */
export function accountsInDisplayOrder<
  T extends Pick<Account, "kind" | "retirementType" | "label">,
>(accounts: T[]): T[] {
  const rank = (acc: T) => {
    if (isDropRetirementAccount(acc)) return 0;
    if (isSickDaysAccount(acc)) return 2;
    return 1;
  };
  return accounts
    .map((acc, index) => ({ acc, index }))
    .sort((a, b) => rank(a.acc) - rank(b.acc) || a.index - b.index)
    .map(({ acc }) => acc);
}

/**
 * Share of the first projection year still ahead of `asOfDate` (an ISO
 * `YYYY-MM-DD`, normally today). Balances entered today have already earned
 * the months behind them, so year 0 grows only for the rest of the year: on
 * October 7 that is 86 of 365 days. With no date, or a date outside the start
 * year, balances are taken as January 1 of the start year and year 0 gets a
 * full year (1).
 */
export function firstYearGrowthFraction(
  startYear: number,
  asOfDate?: string,
): number {
  if (!asOfDate) return 1;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOfDate);
  if (!match) return 1;
  const year = Number(match[1]);
  if (year !== startYear) return 1;
  const asOf = Date.UTC(year, Number(match[2]) - 1, Number(match[3]));
  const yearStart = Date.UTC(year, 0, 1);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  if (!Number.isFinite(asOf)) return 1;
  return Math.min(1, Math.max(0, (nextYearStart - asOf) / (nextYearStart - yearStart)));
}

export const GROWTH_STARTS: GrowthStart[] = ["planStart", "afterRetirement"];

export const GROWTH_START_LABELS: Record<GrowthStart, string> = {
  planStart: "Plan start",
  afterRetirement: "After retirement",
};

export function isGrowthStart(value: unknown): value is GrowthStart {
  return value === "planStart" || value === "afterRetirement";
}

/** DROP waits for retirement by default; every other account grows right away. */
export function defaultGrowthStart(
  account: Pick<Account, "kind" | "retirementType">,
): GrowthStart {
  return isDropRetirementAccount(account) ? "afterRetirement" : "planStart";
}

/** The account's chosen growth start, or its type's default when unset. */
export function accountGrowthStart(
  account: Pick<Account, "kind" | "retirementType" | "growthStart">,
): GrowthStart {
  return isGrowthStart(account.growthStart)
    ? account.growthStart
    : defaultGrowthStart(account);
}

/**
 * Whether this account compounds in `calendarYear`. An `afterRetirement`
 * account (DROP by default) waits until the year after the owner's
 * retirement. If that year is missing, fall back to the household start year
 * (first growth is start + 1). A `planStart` account grows every projection
 * year, including year 0.
 */
export function accountGrowsInYear(
  account: Pick<Account, "kind" | "retirementType" | "growthStart" | "ownerId">,
  people: Person[],
  calendarYear: number,
  fallbackStartYear: number,
): boolean {
  if (accountGrowthStart(account) === "planStart") return true;
  const owner = people.find((p) => p.id === account.ownerId);
  const retire =
    owner?.retirementYear != null && Number.isFinite(owner.retirementYear)
      ? owner.retirementYear
      : fallbackStartYear;
  return calendarYear > retire;
}

/** Unknown growth starts are dropped so the account falls back to its default. */
export function healGrowthStart(account: Account): void {
  if (account.growthStart == null || isGrowthStart(account.growthStart)) return;
  delete account.growthStart;
}

/** Missing or unknown tax-deferred subtypes become DROP (legacy plans). */
export function healRetirementType(account: Account): void {
  if (account.kind !== "retirementTaxable") {
    delete account.retirementType;
    return;
  }
  if (!isRetirementAccountType(account.retirementType)) {
    account.retirementType = DEFAULT_RETIREMENT_ACCOUNT_TYPE;
  }
}

export const WITHDRAWAL_SOURCE_KINDS: Partial<Record<IncomeKind, AccountKind[]>> =
  {
    retirementDraw: ["retirementTaxable"],
    rothWithdrawal: ["rothTaxFree"],
    afterTaxWithdrawal: AFTER_TAX_ACCOUNT_KINDS,
  };

/** Select / revision-diff sentinel for a jointly owned after-tax account. */
export const JOINT_OWNER_VALUE = "__joint__";

export function isAfterTaxAccountKind(kind: AccountKind): boolean {
  return AFTER_TAX_ACCOUNT_KINDS.includes(kind);
}

/** Joint ownership is only valid for after-tax accounts on an MFJ plan. */
export function canAccountBeJoint(
  kind: AccountKind,
  filingStatus: FilingStatus,
): boolean {
  return filingStatus === "mfj" && isAfterTaxAccountKind(kind);
}

export function isJointAccount(
  account: Pick<Account, "joint" | "kind">,
  filingStatus: FilingStatus,
): boolean {
  return Boolean(account.joint) && canAccountBeJoint(account.kind, filingStatus);
}

/** Owner shown in the UI and revision history. */
export function accountOwnerLabel(
  account: Pick<Account, "ownerId" | "joint" | "kind">,
  people: Person[],
  filingStatus: FilingStatus,
): string {
  if (isJointAccount(account, filingStatus)) return "Both";
  return people.find((p) => p.id === account.ownerId)?.name || "Person";
}

/**
 * Default deposit end year: the account owner's retirement year, or the later
 * of the two when the account is joint (contributions while either is working).
 */
/** Drop `joint` when the account kind or filing status cannot support it. */
export function healAccountJoint(
  account: Account,
  filingStatus: FilingStatus,
): void {
  if (account.joint && !canAccountBeJoint(account.kind, filingStatus)) {
    delete account.joint;
  }
}

export function accountDepositEndYear(
  account: Pick<Account, "ownerId" | "joint" | "kind">,
  people: Person[],
  filingStatus: FilingStatus,
): number | undefined {
  const years = isJointAccount(account, filingStatus)
    ? people.map((p) => p.retirementYear)
    : [people.find((p) => p.id === account.ownerId)?.retirementYear];
  const known = years.filter((y): y is number => Number.isFinite(y));
  if (known.length === 0) return undefined;
  return Math.max(...known);
}

/** Pension kinds, the incomes that carry a life-only / survivorship choice. */
export function isPensionIncome(kind: IncomeKind): boolean {
  return kind === "pension" || kind === "militaryPension";
}

/**
 * The pension's payout option, or undefined for incomes that aren't pensions.
 * A pension without one is life only.
 */
export function pensionPayout(
  income: Pick<IncomeSource, "kind" | "pensionPayout">,
): PensionPayout | undefined {
  if (!isPensionIncome(income.kind)) return undefined;
  return income.pensionPayout === "survivor" ? "survivor" : "lifeOnly";
}

/** Whether an income kind withdraws from (and depletes) a specific account. */
export function isWithdrawalIncome(kind: IncomeKind): boolean {
  return kind in WITHDRAWAL_SOURCE_KINDS;
}

/**
 * A US tax return covers at most two adults (taxpayer + spouse). Dependents are
 * not modeled as separate retirement "people", so MFJ plans hold exactly two
 * people and single / head-of-household plans hold one.
 */
export function maxPeople(status: FilingStatus): number {
  return status === "mfj" ? 2 : 1;
}

function makeSpouse(): Person {
  return { id: uid("p"), name: "" };
}

/** Whether the household has enough data to run a projection. */
export function isHouseholdReady(household: Household): boolean {
  const required = maxPeople(household.filingStatus);
  if (household.people.length < required) return false;
  return household.people.every(
    (p) =>
      p.name.trim().length > 0 &&
      Number.isFinite(p.birthYear) &&
      Number.isFinite(p.retirementYear),
  );
}

/**
 * Whether this still looks like a brand-new empty plan (no people details and
 * no accounts / income / property / expenses). Used to decide whether to open
 * the first-run name prompt - a finished plan can omit accounts/income and
 * must not be treated as blank.
 */
export function isUntouchedHousehold(household: Household): boolean {
  if (household.accounts.length > 0) return false;
  if (household.incomes.length > 0) return false;
  if (household.realEstate.length > 0) return false;
  if (household.expenses.length > 0) return false;
  return household.people.every(
    (p) =>
      p.name.trim().length === 0 &&
      !Number.isFinite(p.birthYear) &&
      !Number.isFinite(p.retirementYear),
  );
}

function withoutJoint(account: Account, ownerId: string): Account {
  const next = { ...account, ownerId };
  delete next.joint;
  return next;
}

/**
 * Enforce the people rules for a filing status: single and head of household
 * keep one person, married keeps exactly two (adding a spouse if needed).
 * Accounts and income belonging to a removed person are dropped along with
 * them. Joint after-tax accounts stay: joint is cleared and the owner falls
 * back to whoever remains.
 */
export function applyFilingStatus(
  household: Household,
  filingStatus: FilingStatus,
): Household {
  const limit = maxPeople(filingStatus);
  let people = household.people.slice(0, limit);
  if (filingStatus === "mfj" && people.length < 2) {
    people = [...people, makeSpouse()];
  }

  const validIds = new Set(people.map((p) => p.id));
  const remainingOwnerId = people[0]?.id;
  const accounts = household.accounts.flatMap((a) => {
    const keepJoint =
      Boolean(a.joint) &&
      isAfterTaxAccountKind(a.kind) &&
      remainingOwnerId != null;
    if (validIds.has(a.ownerId)) {
      if (a.joint && filingStatus !== "mfj") return [withoutJoint(a, a.ownerId)];
      return [a];
    }
    if (keepJoint) return [withoutJoint(a, remainingOwnerId)];
    return [];
  });
  const accountIds = new Set(accounts.map((a) => a.id));

  const incomes = household.incomes
    .filter((i) => validIds.has(i.ownerId))
    // Clear references to any account that was just removed.
    .map((i) =>
      i.drawsFromAccountId && !accountIds.has(i.drawsFromAccountId)
        ? { ...i, drawsFromAccountId: undefined }
        : i,
    );

  // Keep a valid main person at all times: if the previous one was dropped by
  // the filing-status change, fall back to whoever remains.
  const mainPersonId =
    household.mainPersonId && validIds.has(household.mainPersonId)
      ? household.mainPersonId
      : people[0]?.id;

  return {
    ...household,
    filingStatus,
    people,
    accounts,
    incomes,
    mainPersonId,
  };
}

/** Inclusive start/end: omitted bounds mean the source runs the whole plan. */
export function isIncomeActive(
  income: IncomeSource,
  calendarYear: number,
): boolean {
  if (income.startYear != null && calendarYear < income.startYear) return false;
  if (income.endYear != null && calendarYear > income.endYear) return false;
  return true;
}

/**
 * Monthly income in `calendarYear`. The entered amount is what you receive in
 * the start year (or the first projection year if start is omitted); growth
 * only compounds after that, plus any `growthDelayYears`. Inactive years are 0.
 */
export function incomeMonthlyForYear(
  income: IncomeSource,
  calendarYear: number,
  projectionStart: number,
): number {
  if (!isIncomeActive(income, calendarYear)) return 0;
  const rate = Number.isFinite(income.growthRate) ? income.growthRate : 0;
  const delay = income.growthDelayYears ?? 0;
  const growthStart = income.startYear ?? projectionStart;
  const periods = Math.max(0, calendarYear - growthStart - delay);
  return (income.monthlyAmount || 0) * Math.pow(1 + rate, periods);
}

/** Inclusive start/end: omitted bounds mean the expense runs the whole plan. */
export function isExpenseActive(
  expense: Expense,
  calendarYear: number,
): boolean {
  if (expense.startYear != null && calendarYear < expense.startYear) return false;
  if (expense.endYear != null && calendarYear > expense.endYear) return false;
  return true;
}

/**
 * Monthly spend in `calendarYear`. The entered amount is what you spend in
 * the start year (or the first projection year if start is omitted); growth
 * only compounds after that. Inactive years are 0.
 */
export function expenseMonthlyForYear(
  expense: Expense,
  calendarYear: number,
  projectionStart: number,
): number {
  if (!isExpenseActive(expense, calendarYear)) return 0;
  const monthly =
    expense.frequency === "yearly" ? expense.amount / 12 : expense.amount;
  const rate = Number.isFinite(expense.growthRate) ? expense.growthRate : 0;
  const growthStart = expense.startYear ?? projectionStart;
  const periods = Math.max(0, calendarYear - growthStart);
  return monthly * Math.pow(1 + rate, periods);
}

/** Years the expense runs, e.g. "2028 to 2032", "2028 onward", "through 2032". */
export function expenseYearsLabel(expense: Expense): string | undefined {
  if (expense.startYear == null && expense.endYear == null) return undefined;
  if (expense.startYear != null && expense.endYear != null) {
    if (expense.startYear === expense.endYear) return String(expense.startYear);
    return `${expense.startYear} to ${expense.endYear}`;
  }
  if (expense.startYear != null) return `${expense.startYear} onward`;
  return `through ${expense.endYear}`;
}

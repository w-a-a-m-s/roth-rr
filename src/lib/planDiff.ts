import { FILING_STATUS_LABELS } from "@/lib/config/defaults";
import { US_STATE_LABELS } from "@/lib/config/stateTax";
import type {
  Account,
  AccountKind,
  ConversionStrategy,
  DeletedItem,
  Deposit,
  Expense,
  Household,
  IncomeKind,
  IncomeSource,
  Person,
  RealEstate,
  Business,
  RetirementAccountType,
  UsStateCode,
} from "@/lib/domain/types";
import { STRATEGY_LABELS } from "@/lib/optimizer/labels";
import {
  JOINT_OWNER_VALUE,
  DISABILITY_COVERAGE_LABELS,
  GROWTH_START_LABELS,
  isDisabilityCoverage,
  RETIREMENT_ACCOUNT_TYPE_LABELS,
  isGrowthStart,
  isRetirementAccountType,
} from "@/lib/domain/household";
import { depositSummary } from "@/lib/depositSummary";
import { formatCurrency, formatPercent } from "@/lib/format";

/** Editable plan payload stored on each revision. */
export interface PlanSnapshot {
  name: string;
  household: Household;
}

/** One property-level change between consecutive plan snapshots. */
export interface PlanFieldChange {
  section: string;
  property: string;
  before: string;
  after: string;
}

/**
 * Top-level household keys compared when building a revision change list.
 * Nested diffs for history detail are handled by {@link detailPlanSnapshots}.
 */
const HOUSEHOLD_KEYS = [
  "filingStatus",
  "residenceState",
  "people",
  "mainPersonId",
  "accounts",
  "incomes",
  "realEstate",
  "businesses",
  "expenses",
  "deletedPeople",
  "deletedAccounts",
  "deletedIncomes",
  "deletedRealEstate",
  "deletedBusinesses",
  "deletedExpenses",
  "assumptions",
  "optimizer",
  "survivorship",
  "longTermCare",
] as const satisfies readonly (keyof Household)[];

const NOT_SET = "Not set";

const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  retirementTaxable: "Taxable retirement",
  rothTaxFree: "Roth",
  investment: "Investment",
  annuity: "Annuity",
  cd: "CD",
  savings: "Savings",
};

const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  pension: "Pension",
  salary: "Salary",
  business: "Business",
  socialSecurity: "Social Security",
  militaryPension: "Military pension",
  lifeInsurance: "Life insurance",
  disabilityInsurance: "Disability insurance",
  retirementDraw: "Retirement withdrawal",
  rothWithdrawal: "Roth withdrawal",
  afterTaxWithdrawal: "After-tax withdrawal",
  other: "Other",
};

const PROPERTY_LABELS: Record<string, string> = {
  name: "Name",
  filingStatus: "Filing status",
  residenceState: "Residence state",
  mainPersonId: "Main person",
  birthYear: "Birth year",
  retirementYear: "Retirement year",
  label: "Label",
  ownerId: "Owner",
  joint: "Joint",
  kind: "Kind",
  retirementType: "Type",
  balance: "Balance",
  costBasis: "Cost basis",
  deposits: "Deposits",
  growthRate: "Growth rate",
  growthStart: "Growth starts",
  monthlyAmount: "Monthly amount",
  taxability: "Taxability",
  startYear: "Start year",
  endYear: "End year",
  growthDelayYears: "Growth delay years",
  drawsFromAccountId: "Draws from account",
  pensionPayout: "Pension payout",
  disabilityWaitingDays: "Waiting period",
  disabilityCoverage: "Disability coverage",
  purchaseYear: "Purchase year",
  purchasePrice: "Purchase price",
  marketValue: "Market value",
  value: "Value",
  appreciationRate: "Appreciation rate",
  depreciationYears: "Depreciation years",
  monthlyRent: "Monthly rent",
  monthlyOperatingExpenses: "Monthly operating expenses",
  rentGrowthRate: "Rent growth rate",
  mortgageBalance: "Mortgage balance",
  mortgageRate: "Mortgage rate",
  mortgageMonthlyPayment: "Mortgage payment",
  activeParticipation: "Active participation",
  realEstateProfessional: "Real estate professional",
  amount: "Amount",
  frequency: "Frequency",
  expenseGrowth: "Expense growth",
  finalAge: "Final age",
  strategy: "Strategy",
  allowOverConvertible: "Allow over-convertible",
  manualSchedule: "Manual schedule",
  targetBracketRate: "Target bracket",
  convertAmount: "Amount to convert",
  deletedAt: "Deleted at",
  personId: "Person who passes",
  deathAge: "Age at death",
  sex: "Sex",
  who: "Who's in care",
  careType: "Care type",
  inflation: "Care cost inflation",
  periods: "Care periods",
};

const MONEY_KEYS = new Set([
  "balance",
  "costBasis",
  "monthlyAmount",
  "amount",
  "purchasePrice",
  "marketValue",
  "value",
  "monthlyRent",
  "monthlyOperatingExpenses",
  "mortgageBalance",
  "mortgageMonthlyPayment",
  "convertAmount",
]);

const PERCENT_KEYS = new Set([
  "inflation",
  "growthRate",
  "expenseGrowth",
  "appreciationRate",
  "rentGrowthRate",
  "mortgageRate",
  "targetBracketRate",
]);

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function propertyLabel(key: string): string {
  return PROPERTY_LABELS[key] ?? humanizeKey(key);
}

function personName(
  household: Household | null | undefined,
  id: string | undefined,
): string | null {
  if (!id || !household) return null;
  return household.people.find((p) => p.id === id)?.name || null;
}

/** Fold `joint` into Owner so revision history says "Both", not a separate flag. */
function accountFieldsForDiff(account: Account): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...account };
  delete fields.deposits;
  delete fields.joint;
  fields.ownerId = account.joint ? JOINT_OWNER_VALUE : account.ownerId;
  return fields;
}

function accountLabel(
  household: Household | null | undefined,
  id: string | undefined,
): string | null {
  if (!id || !household) return null;
  const acc = household.accounts.find((a) => a.id === id);
  if (!acc) return null;
  return acc.label || ACCOUNT_KIND_LABELS[acc.kind] || acc.id;
}

function formatScalar(
  key: string,
  value: unknown,
  ctx: { previous: Household | null; next: Household },
): string {
  if (value === undefined) return NOT_SET;
  if (value === null) return "Null";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (
    key === "filingStatus" &&
    typeof value === "string" &&
    value in FILING_STATUS_LABELS
  ) {
    return FILING_STATUS_LABELS[value as keyof typeof FILING_STATUS_LABELS];
  }
  if (key === "residenceState" && typeof value === "string") {
    const code = value as UsStateCode;
    return US_STATE_LABELS[code]
      ? `${US_STATE_LABELS[code]} (${code})`
      : value;
  }
  if (key === "mainPersonId" && typeof value === "string") {
    return (
      personName(ctx.next, value) ||
      personName(ctx.previous, value) ||
      value
    );
  }
  if (key === "ownerId" && typeof value === "string") {
    if (value === JOINT_OWNER_VALUE) return "Both";
    return (
      personName(ctx.next, value) ||
      personName(ctx.previous, value) ||
      value
    );
  }
  if (key === "drawsFromAccountId" && typeof value === "string") {
    return (
      accountLabel(ctx.next, value) ||
      accountLabel(ctx.previous, value) ||
      value
    );
  }
  if (key === "kind" && typeof value === "string") {
    if (value in ACCOUNT_KIND_LABELS) {
      return ACCOUNT_KIND_LABELS[value as AccountKind];
    }
    if (value in INCOME_KIND_LABELS) {
      return INCOME_KIND_LABELS[value as IncomeKind];
    }
  }
  if (key === "growthStart" && isGrowthStart(value)) {
    return GROWTH_START_LABELS[value];
  }
  if (key === "retirementType" && isRetirementAccountType(value)) {
    return RETIREMENT_ACCOUNT_TYPE_LABELS[value as RetirementAccountType];
  }
  if (key === "taxability") {
    if (value === "full") return "Fully taxable";
    if (value === "taxFree") return "Tax free";
  }
  if (key === "pensionPayout") {
    if (value === "lifeOnly") return "Life only";
    if (value === "survivor") return "Survivorship";
  }
  if (key === "disabilityWaitingDays" && typeof value === "number") {
    return `${value} days`;
  }
  if (key === "disabilityCoverage" && isDisabilityCoverage(value)) {
    return DISABILITY_COVERAGE_LABELS[value];
  }
  if (key === "frequency") {
    if (value === "monthly") return "Monthly";
    if (value === "yearly") return "Yearly";
  }
  if (key === "strategy") {
    return STRATEGY_LABELS[value as ConversionStrategy] ?? String(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    if (PERCENT_KEYS.has(key)) return formatPercent(value);
    if (MONEY_KEYS.has(key)) return formatCurrency(value);
    return String(value);
  }

  if (typeof value === "string") return value;
  return stableStringify(value);
}

function pushChange(
  out: PlanFieldChange[],
  section: string,
  property: string,
  before: string,
  after: string,
): void {
  if (before === after) return;
  out.push({ section, property, before, after });
}

/**
 * Diff object fields with schema-skew rules:
 * - key missing on old, present on new → Not set → value
 * - key present on old, missing on new → ignore (schema drop)
 */
function diffRecordFields(
  section: string,
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
  out: PlanFieldChange[],
  ctx: { previous: Household | null; next: Household },
  propertyPrefix = "",
  skipKeys: ReadonlySet<string> = new Set(),
): void {
  for (const key of Object.keys(next)) {
    if (skipKeys.has(key)) continue;
    if (key === "id") continue;

    const afterRaw = next[key];
    // Nested plain objects (rare); arrays handled by callers.
    if (
      afterRaw !== null &&
      typeof afterRaw === "object" &&
      !Array.isArray(afterRaw)
    ) {
      const beforeNested =
        previous && hasOwn(previous, key) && previous[key] != null
          ? (previous[key] as Record<string, unknown>)
          : null;
      diffRecordFields(
        section,
        beforeNested,
        afterRaw as Record<string, unknown>,
        out,
        ctx,
        propertyPrefix
          ? `${propertyPrefix} · ${propertyLabel(key)}`
          : propertyLabel(key),
      );
      continue;
    }

    if (Array.isArray(afterRaw)) {
      // Arrays of scalars/objects are handled by dedicated callers.
      continue;
    }

    const prop = propertyPrefix
      ? `${propertyPrefix} · ${propertyLabel(key)}`
      : propertyLabel(key);

    if (!previous || !hasOwn(previous, key)) {
      pushChange(
        out,
        section,
        prop,
        NOT_SET,
        formatScalar(key, afterRaw, ctx),
      );
      continue;
    }

    const beforeRaw = previous[key];
    if (stableStringify(beforeRaw) === stableStringify(afterRaw)) continue;
    pushChange(
      out,
      section,
      prop,
      formatScalar(key, beforeRaw, ctx),
      formatScalar(key, afterRaw, ctx),
    );
  }
}

function entityLabel(
  entity: { id: string; name?: string; label?: string },
  fallback: string,
): string {
  const named = entity.name?.trim() || entity.label?.trim();
  return named || fallback;
}

function scheduleStartYear(household: Household): number | null {
  const years = household.people
    .map((p) => p.retirementYear)
    .filter((y): y is number => y != null && Number.isFinite(y));
  if (years.length === 0) return null;
  return Math.min(...years);
}

function diffManualSchedule(
  previous: number[] | undefined,
  next: number[] | undefined,
  household: Household,
  out: PlanFieldChange[],
): void {
  const section = formatPlanChangeLabel("optimizer");
  const start = scheduleStartYear(household);
  const prev = previous ?? [];
  const nxt = next ?? [];
  const len = Math.max(prev.length, nxt.length);

  for (let i = 0; i < len; i++) {
    const beforeMissing = i >= prev.length;
    const afterMissing = i >= nxt.length;
    // Longer old schedule truncated in new → schema/data shrink; ignore missing-on-new years.
    if (afterMissing) continue;

    const beforeVal = beforeMissing ? undefined : prev[i];
    const afterVal = nxt[i];
    if (!beforeMissing && beforeVal === afterVal) continue;

    const yearLabel =
      start != null && Number.isFinite(start)
        ? `Year ${start + i}`
        : `Year index ${i + 1}`;

    pushChange(
      out,
      section,
      yearLabel,
      beforeMissing ? NOT_SET : formatCurrency(beforeVal!),
      formatCurrency(afterVal),
    );
  }
}

/**
 * Deposits are a nested list inside an account, which `diffRecordFields` skips.
 * Diff them by id and describe each one in a single readable line rather than
 * dumping the raw objects.
 */
function diffAccountDeposits(
  previousAccounts: Account[] | undefined,
  nextAccounts: Account[],
  out: PlanFieldChange[],
): void {
  if (!previousAccounts) return;
  const section = formatPlanChangeLabel("accounts");
  const prevAccountById = new Map(previousAccounts.map((a) => [a.id, a]));

  for (const account of nextAccounts) {
    const prevAccount = prevAccountById.get(account.id);
    // A brand new account already reports as "Added"; no need to itemize it.
    if (!prevAccount) continue;

    const prevDeposits = new Map(
      (prevAccount.deposits ?? []).map((d) => [d.id, d]),
    );
    const nextDeposits = new Map(
      (account.deposits ?? []).map((d) => [d.id, d]),
    );
    const accountName = entityLabel(
      account,
      ACCOUNT_KIND_LABELS[account.kind] || "Account",
    );
    const property = (deposit: Deposit) =>
      `${accountName} · Deposit · ${deposit.label?.trim() || "Deposit"}`;

    for (const [id, deposit] of nextDeposits) {
      const before = prevDeposits.get(id);
      pushChange(
        out,
        section,
        property(deposit),
        before ? depositSummary(before) : NOT_SET,
        depositSummary(deposit),
      );
    }
    for (const [id, deposit] of prevDeposits) {
      if (nextDeposits.has(id)) continue;
      pushChange(
        out,
        section,
        property(deposit),
        depositSummary(deposit),
        "Removed",
      );
    }
  }
}

function diffEntityList<T extends { id: string }>(
  sectionKey: string,
  previousList: T[] | undefined,
  nextList: T[],
  out: PlanFieldChange[],
  ctx: { previous: Household | null; next: Household },
  labelOf: (item: T) => string,
  unwrap?: (row: T) => Record<string, unknown>,
): void {
  const section = formatPlanChangeLabel(sectionKey);
  const prevById = new Map((previousList ?? []).map((item) => [item.id, item]));
  const nextById = new Map(nextList.map((item) => [item.id, item]));

  for (const [id, nextItem] of nextById) {
    const label = labelOf(nextItem);
    const prevItem = prevById.get(id);
    if (!prevItem) {
      pushChange(out, section, label, NOT_SET, "Added");
      continue;
    }
    const prevObj = unwrap
      ? unwrap(prevItem)
      : (prevItem as unknown as Record<string, unknown>);
    const nextObj = unwrap
      ? unwrap(nextItem)
      : (nextItem as unknown as Record<string, unknown>);
    diffRecordFields(section, prevObj, nextObj, out, ctx, label);
  }

  for (const [id, prevItem] of prevById) {
    if (nextById.has(id)) continue;
    pushChange(out, section, labelOf(prevItem), "Present", "Removed");
  }
}

function asDeletedRows<T extends { id: string }>(
  rows: DeletedItem<T>[] | undefined,
): ({ id: string; deletedAt: string } & T)[] {
  return (rows ?? []).map((row) => ({
    ...row.item,
    deletedAt: row.deletedAt,
  }));
}

function diffDeletedEntityList<T extends { id: string }>(
  key: string,
  previousList: DeletedItem<T>[] | undefined,
  nextList: DeletedItem<T>[] | undefined,
  previousHousehold: Record<string, unknown>,
  nextHousehold: Record<string, unknown>,
  out: PlanFieldChange[],
  ctx: { previous: Household | null; next: Household },
  fallbackLabel: string,
): void {
  // Missing deleted* on new → schema ignore (do not treat as clearing the list).
  if (!hasOwn(nextHousehold, key)) return;
  const prevList = hasOwn(previousHousehold, key)
    ? asDeletedRows(previousList)
    : undefined;
  diffEntityList(
    key,
    prevList,
    asDeletedRows(nextList),
    out,
    ctx,
    (item) => entityLabel(item, fallbackLabel),
  );
}

/**
 * Return the names of top-level fields that differ between two plan snapshots.
 * Empty when the snapshots are identical (used to skip empty revision churn).
 */
export function diffPlanSnapshots(
  previous: PlanSnapshot | null | undefined,
  next: PlanSnapshot,
): string[] {
  if (!previous) return ["created"];

  const changes: string[] = [];
  if (previous.name !== next.name) changes.push("name");

  for (const key of HOUSEHOLD_KEYS) {
    const a = previous.household[key];
    const b = next.household[key];
    if (stableStringify(a) !== stableStringify(b)) changes.push(key);
  }

  return changes;
}

/** Whether two snapshots are byte-equal for the fields we version. */
export function planSnapshotsEqual(
  a: PlanSnapshot | null | undefined,
  b: PlanSnapshot,
): boolean {
  if (!a) return false;
  return diffPlanSnapshots(a, b).length === 0;
}

/** Human-readable labels for revision change field names. */
export function formatPlanChangeLabel(field: string): string {
  switch (field) {
    case "created":
      return "Created";
    case "name":
      return "Name";
    case "filingStatus":
      return "Filing status";
    case "residenceState":
      return "Residence state";
    case "people":
      return "People";
    case "mainPersonId":
      return "Main person";
    case "realEstateProfessional":
      return "Real estate professional";
    case "accounts":
      return "Accounts";
    case "incomes":
      return "Income";
    case "realEstate":
      return "Real estate";
    case "businesses":
      return "Business equity";
    case "expenses":
      return "Expenses";
    case "deletedPeople":
      return "Deleted people";
    case "deletedAccounts":
      return "Deleted accounts";
    case "deletedIncomes":
      return "Deleted income";
    case "deletedRealEstate":
      return "Deleted real estate";
    case "deletedBusinesses":
      return "Deleted business equity";
    case "deletedExpenses":
      return "Deleted expenses";
    case "assumptions":
      return "Assumptions";
    case "optimizer":
      return "Conversion strategy";
    case "survivorship":
      return "Survivorship";
    case "longTermCare":
      return "Long-term care";
    default:
      return field;
  }
}

/**
 * Property-level before/after changes between consecutive snapshots.
 * Supports older JSON shapes: keys missing on the old side are reported as
 * "Not set"; keys missing on the new side are ignored (schema drops).
 */
export function detailPlanSnapshots(
  previous: PlanSnapshot | null | undefined,
  next: PlanSnapshot,
): PlanFieldChange[] {
  if (!previous) {
    return [
      {
        section: "Created",
        property: "Plan",
        before: NOT_SET,
        after: next.name,
      },
    ];
  }

  const out: PlanFieldChange[] = [];
  const ctx = { previous: previous.household, next: next.household };

  if (previous.name !== next.name) {
    pushChange(out, "Name", "Name", previous.name, next.name);
  }

  // Household scalars (missing-on-new ignored via Object.keys(next) walk).
  const prevHousehold = previous.household as unknown as Record<string, unknown>;
  const nextHousehold = next.household as unknown as Record<string, unknown>;
  for (const key of [
    "filingStatus",
    "residenceState",
    "mainPersonId",
    "realEstateProfessional",
  ] as const) {
    if (!hasOwn(nextHousehold, key)) continue;
    if (!hasOwn(prevHousehold, key)) {
      pushChange(
        out,
        formatPlanChangeLabel(key),
        propertyLabel(key),
        NOT_SET,
        formatScalar(key, nextHousehold[key], ctx),
      );
      continue;
    }
    if (stableStringify(prevHousehold[key]) === stableStringify(nextHousehold[key])) {
      continue;
    }
    pushChange(
      out,
      formatPlanChangeLabel(key),
      propertyLabel(key),
      formatScalar(key, prevHousehold[key], ctx),
      formatScalar(key, nextHousehold[key], ctx),
    );
  }

  if (hasOwn(nextHousehold, "people")) {
    diffEntityList<Person>(
      "people",
      hasOwn(prevHousehold, "people") ? previous.household.people : undefined,
      next.household.people ?? [],
      out,
      ctx,
      (p) => entityLabel(p, "Person"),
    );
  }

  if (hasOwn(nextHousehold, "accounts")) {
    diffEntityList<Account>(
      "accounts",
      hasOwn(prevHousehold, "accounts")
        ? previous.household.accounts
        : undefined,
      next.household.accounts ?? [],
      out,
      ctx,
      (a) => entityLabel(a, ACCOUNT_KIND_LABELS[a.kind] || "Account"),
      accountFieldsForDiff,
    );
    diffAccountDeposits(
      hasOwn(prevHousehold, "accounts")
        ? previous.household.accounts
        : undefined,
      next.household.accounts ?? [],
      out,
    );
  }

  if (hasOwn(nextHousehold, "incomes")) {
    diffEntityList<IncomeSource>(
      "incomes",
      hasOwn(prevHousehold, "incomes") ? previous.household.incomes : undefined,
      next.household.incomes ?? [],
      out,
      ctx,
      (i) => entityLabel(i, INCOME_KIND_LABELS[i.kind] || "Income"),
    );
  }

  if (hasOwn(nextHousehold, "realEstate")) {
    diffEntityList<RealEstate>(
      "realEstate",
      hasOwn(prevHousehold, "realEstate")
        ? previous.household.realEstate
        : undefined,
      next.household.realEstate ?? [],
      out,
      ctx,
      (r) => entityLabel(r, "Property"),
    );
  }

  if (hasOwn(nextHousehold, "businesses")) {
    diffEntityList<Business>(
      "businesses",
      hasOwn(prevHousehold, "businesses")
        ? previous.household.businesses
        : undefined,
      next.household.businesses ?? [],
      out,
      ctx,
      (b) => entityLabel(b, "Business"),
    );
  }

  if (hasOwn(nextHousehold, "expenses")) {
    diffEntityList<Expense>(
      "expenses",
      hasOwn(prevHousehold, "expenses")
        ? previous.household.expenses
        : undefined,
      next.household.expenses ?? [],
      out,
      ctx,
      (e) => entityLabel(e, "Expense"),
    );
  }

  diffDeletedEntityList(
    "deletedPeople",
    previous.household.deletedPeople,
    next.household.deletedPeople,
    prevHousehold,
    nextHousehold,
    out,
    ctx,
    "Person",
  );
  diffDeletedEntityList(
    "deletedAccounts",
    previous.household.deletedAccounts,
    next.household.deletedAccounts,
    prevHousehold,
    nextHousehold,
    out,
    ctx,
    "Account",
  );
  diffDeletedEntityList(
    "deletedIncomes",
    previous.household.deletedIncomes,
    next.household.deletedIncomes,
    prevHousehold,
    nextHousehold,
    out,
    ctx,
    "Income",
  );
  diffDeletedEntityList(
    "deletedRealEstate",
    previous.household.deletedRealEstate,
    next.household.deletedRealEstate,
    prevHousehold,
    nextHousehold,
    out,
    ctx,
    "Property",
  );
  diffDeletedEntityList(
    "deletedBusinesses",
    previous.household.deletedBusinesses,
    next.household.deletedBusinesses,
    prevHousehold,
    nextHousehold,
    out,
    ctx,
    "Business",
  );
  diffDeletedEntityList(
    "deletedExpenses",
    previous.household.deletedExpenses,
    next.household.deletedExpenses,
    prevHousehold,
    nextHousehold,
    out,
    ctx,
    "Expense",
  );

  if (hasOwn(nextHousehold, "assumptions")) {
    const prevAssumptions =
      hasOwn(prevHousehold, "assumptions") && prevHousehold.assumptions != null
        ? (prevHousehold.assumptions as Record<string, unknown>)
        : null;
    diffRecordFields(
      formatPlanChangeLabel("assumptions"),
      prevAssumptions,
      next.household.assumptions as unknown as Record<string, unknown>,
      out,
      ctx,
    );
  }

  if (hasOwn(nextHousehold, "survivorship") && next.household.survivorship) {
    const prevSurv =
      hasOwn(prevHousehold, "survivorship") && prevHousehold.survivorship != null
        ? (prevHousehold.survivorship as unknown as Record<string, unknown>)
        : null;
    diffRecordFields(
      formatPlanChangeLabel("survivorship"),
      prevSurv,
      next.household.survivorship as unknown as Record<string, unknown>,
      out,
      ctx,
    );
  }

  if (hasOwn(nextHousehold, "longTermCare") && next.household.longTermCare) {
    const prevCare =
      hasOwn(prevHousehold, "longTermCare") && prevHousehold.longTermCare != null
        ? (prevHousehold.longTermCare as unknown as Record<string, unknown>)
        : null;
    diffRecordFields(
      formatPlanChangeLabel("longTermCare"),
      prevCare,
      next.household.longTermCare as unknown as Record<string, unknown>,
      out,
      ctx,
    );
  }

  if (hasOwn(nextHousehold, "optimizer")) {
    const prevOpt =
      hasOwn(prevHousehold, "optimizer") && prevHousehold.optimizer != null
        ? (prevHousehold.optimizer as Record<string, unknown>)
        : null;
    const nextOpt = next.household.optimizer as unknown as Record<
      string,
      unknown
    >;
    diffRecordFields(
      formatPlanChangeLabel("optimizer"),
      prevOpt,
      nextOpt,
      out,
      ctx,
      "",
      new Set(["manualSchedule"]),
    );

    const prevSchedule =
      prevOpt && hasOwn(prevOpt, "manualSchedule")
        ? (prevOpt.manualSchedule as number[] | undefined)
        : undefined;
    const nextHasSchedule = hasOwn(nextOpt, "manualSchedule");
    if (nextHasSchedule) {
      diffManualSchedule(
        prevSchedule,
        nextOpt.manualSchedule as number[] | undefined,
        next.household,
        out,
      );
    }
  }

  return out;
}

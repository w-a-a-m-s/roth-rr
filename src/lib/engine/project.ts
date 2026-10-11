import type {
  Account,
  Business,
  Household,
  IncomeSource,
} from "@/lib/domain/types";
import {
  accountGrowsInYear,
  firstYearGrowthFraction,
  preStartGrowthYears,
  realEstateGrowthStart,
  businessGrowthStart,
  expenseMonthlyForYear,
  incomeMonthlyForYear,
  isIncomeActive,
  isWithdrawalIncome,
} from "@/lib/domain/household";
import {
  careExpenseKey,
  careForYear,
  resolveLongTermCare,
} from "@/lib/domain/longTermCare";
import {
  SURVIVOR_EXPENSE_SHARE,
  effectiveOwner,
  hasPassed,
  incomesStoppedByDeath,
  resolveDeath,
} from "@/lib/domain/survivorship";
import { personRmdAge } from "@/lib/domain/rmd";
import type {
  DeductionBreakdown,
  ProjectionOptions,
  ProjectionRow,
} from "@/lib/engine/types";
import {
  capitalGainsTaxByBracket,
  capitalGainsTaxStacked,
  progressiveTax,
  progressiveTaxByBracket,
} from "@/lib/engine/tax";
import type { FederalTaxYear } from "@/lib/config/federalTax";
import {
  RENTAL_LOSS_ALLOWANCE_MAGI_END,
  RENTAL_LOSS_ALLOWANCE_MAGI_START,
  RENTAL_LOSS_SPECIAL_ALLOWANCE,
  SOCIAL_SECURITY_TAXABLE_PCT,
} from "@/lib/config/federalTax";
import type { StateTaxTable } from "@/lib/config/stateTax";
import { getStateTaxTable } from "@/lib/config/stateTax";
import { forFiling } from "@/lib/config/filingStatus";
import {
  DEFAULT_ACCOUNT_GROWTH,
  DEFAULT_RENT_GROWTH,
  IMPLICIT_ROTH_GROWTH,
} from "@/lib/config/defaults";
import { uniformLifetimeDenominator } from "@/lib/config/rmdTable";
import {
  depositAmountForYear,
  openingBalance,
  preStartDepositPrincipal,
} from "@/lib/engine/deposits";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import type { ReferenceData } from "@/lib/externalData/types";

const AFTER_TAX_KINDS: Account["kind"][] = [
  "investment",
  "annuity",
  "cd",
  "savings",
];

/** Projection start = the earliest retirement year across the household. */
export function projectionStartYear(household: Household): number {
  return Math.min(...household.people.map((p) => p.retirementYear ?? NaN));
}

/**
 * The "main" person, who drives the projection horizon and the RMD-age
 * snapshot. An explicit `household.mainPersonId` wins; otherwise we fall back to
 * the person who retires first (ties broken by list order).
 */
export function primaryPerson(household: Household) {
  if (household.mainPersonId) {
    const explicit = household.people.find(
      (p) => p.id === household.mainPersonId,
    );
    if (explicit) return explicit;
  }
  const start = projectionStartYear(household);
  return (
    household.people.find((p) => p.retirementYear === start) ??
    household.people[0]
  );
}

/** Id of the {@link primaryPerson} (the main person used for calculations). */
export function primaryPersonId(household: Household): string {
  return primaryPerson(household).id;
}

/** Number of projection years (until the primary person reaches finalAge). */
export function projectionYears(household: Household): number {
  const start = projectionStartYear(household);
  const primary = primaryPerson(household);
  const ageAtStart = start - (primary.birthYear ?? NaN);
  return Math.max(1, household.assumptions.finalAge - ageAtStart + 1);
}

function growthRate(account: Account): number {
  // `growthRate` is required, but imported/half-filled plans may omit it. Fall
  // back to the per-kind default so a single bad account can't NaN-poison the
  // entire projection.
  return Number.isFinite(account.growthRate)
    ? account.growthRate
    : DEFAULT_ACCOUNT_GROWTH[account.kind] ?? 0;
}

/**
 * A withdrawal income only counts when it points at a real account balance.
 * Without a valid `drawsFromAccountId` it would be "phantom" money - taxed
 * (`retirementDraw`) or spent (`rothWithdrawal` / `afterTaxWithdrawal`) without
 * ever depleting an account - so the engine treats a sourceless withdrawal as
 * inactive in both the depletion step and the income step.
 */
function withdrawalHasSource(
  income: IncomeSource,
  balances: Record<string, number>,
): boolean {
  const accId = income.drawsFromAccountId;
  return accId != null && balances[accId] != null;
}

/**
 * Amortize a mortgage over 12 monthly payments. Interest accrues on the
 * outstanding balance; the rest of each payment reduces principal. A zero
 * payment behaves as interest-only (balance held flat). Returns the year-end
 * balance plus the interest and principal actually paid (the final payment is
 * trimmed when the loan is paid off mid-year).
 */
function amortizeYear(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
): { endBalance: number; interest: number; principal: number } {
  const monthlyRate = annualRate / 12;
  let bal = balance;
  let interest = 0;
  let principal = 0;
  for (let m = 0; m < 12 && bal > 0; m++) {
    const monthInterest = bal * monthlyRate;
    let monthPrincipal = monthlyPayment - monthInterest;
    if (monthPrincipal < 0) monthPrincipal = 0; // payment under-covers interest
    if (monthPrincipal > bal) monthPrincipal = bal;
    bal -= monthPrincipal;
    interest += monthInterest;
    principal += monthPrincipal;
  }
  return { endBalance: bal, interest, principal };
}

/**
 * A business's value in projection year `yearIndex`. Year 0 is the value on
 * January 1 of the start year: as entered, grown first by `preStartYears`
 * (the years from today to the plan start, for a plan-start business).
 */
export function businessValueForYear(
  business: Business,
  yearIndex: number,
  preStartYears = 0,
): number {
  const value = Number.isFinite(business.value) ? business.value : 0;
  const rate = Number.isFinite(business.growthRate) ? business.growthRate : 0;
  return value * Math.pow(1 + rate, yearIndex + preStartYears);
}

interface RealEstateYear {
  /** Total appreciated market value. */
  value: number;
  /** Remaining mortgage principal across all properties. */
  mortgage: number;
  /** Spendable cash flow (rent - operating expenses - mortgage payment). */
  cashAnnual: number;
  /** Taxable rental income (rent - operating expenses - mortgage interest). */
  taxableAnnual: number;
  /** Per-property monthly cash flow (sums to `cashAnnual / 12`). */
  cashMonthlyById: Record<string, number>;
  /** Per-property equity (value − mortgage); sums to `value - mortgage`. */
  equityById: Record<string, number>;
  /** Per-property rental net before depreciation (rent − opex − interest). */
  taxableBeforeDepById: Record<string, number>;
  /** True when the property collected rent this year. */
  isRentalById: Record<string, boolean>;
}

/**
 * Advance every property by one year: appreciate its value, amortize its
 * mortgage (mutating `mortgageBalances`), and compute the rental cash flow and
 * taxable rental income before depreciation. Passive-loss limits and
 * depreciation are applied later in `applyRentalPassiveLoss`.
 */
function stepRealEstate(
  household: Household,
  yearIndex: number,
  mortgageBalances: Record<string, number>,
  preStartYearsById: Record<string, number>,
): RealEstateYear {
  const a = household.assumptions;
  let value = 0;
  let mortgage = 0;
  let cashAnnual = 0;
  let taxableAnnual = 0;
  const cashMonthlyById: Record<string, number> = {};
  const equityById: Record<string, number> = {};
  const taxableBeforeDepById: Record<string, number> = {};
  const isRentalById: Record<string, boolean> = {};

  for (const re of household.realEstate) {
    // Year 0 is the value on January 1 of the start year: the entered value,
    // grown from today first when the property's growth starts at plan start.
    const propValue =
      re.marketValue *
      Math.pow(
        1 + re.appreciationRate,
        yearIndex + (preStartYearsById[re.id] ?? 0),
      );
    value += propValue;

    const rentGrowth = re.rentGrowthRate ?? DEFAULT_RENT_GROWTH;
    const rentAnnual =
      (re.monthlyRent ?? 0) * 12 * Math.pow(1 + rentGrowth, yearIndex);
    const expenseAnnual =
      (re.monthlyOperatingExpenses ?? 0) *
      12 *
      Math.pow(1 + a.expenseGrowth, yearIndex);

    const bal = mortgageBalances[re.id] ?? 0;
    const am =
      bal > 0
        ? amortizeYear(bal, re.mortgageRate ?? 0, re.mortgageMonthlyPayment ?? 0)
        : { endBalance: 0, interest: 0, principal: 0 };
    mortgageBalances[re.id] = am.endBalance;
    mortgage += am.endBalance;

    const cash = rentAnnual - expenseAnnual - (am.interest + am.principal);
    cashAnnual += cash;
    cashMonthlyById[re.id] = cash / 12;
    equityById[re.id] = propValue - am.endBalance;
    const taxableBeforeDep = rentAnnual - expenseAnnual - am.interest;
    taxableAnnual += taxableBeforeDep;
    taxableBeforeDepById[re.id] = taxableBeforeDep;
    isRentalById[re.id] = rentAnnual > 0;
  }

  return {
    value,
    mortgage,
    cashAnnual,
    taxableAnnual,
    cashMonthlyById,
    equityById,
    taxableBeforeDepById,
    isRentalById,
  };
}

function currentYearDepreciation(
  re: Household["realEstate"][number],
  calendarYear: number,
): number {
  if (!(re.purchasePrice > 0) || !(re.depreciationYears > 0)) return 0;
  const yearsOwned = calendarYear - re.purchaseYear;
  if (yearsOwned < 0) return 0;
  if (yearsOwned >= re.depreciationYears) return 0;
  return re.purchasePrice / re.depreciationYears;
}

/** IRC 469(i) special allowance after the MAGI phase-out. */
function rentalLossSpecialAllowance(magi: number): number {
  if (magi >= RENTAL_LOSS_ALLOWANCE_MAGI_END) return 0;
  if (magi <= RENTAL_LOSS_ALLOWANCE_MAGI_START) {
    return RENTAL_LOSS_SPECIAL_ALLOWANCE;
  }
  return Math.max(
    0,
    RENTAL_LOSS_SPECIAL_ALLOWANCE -
      0.5 * (magi - RENTAL_LOSS_ALLOWANCE_MAGI_START),
  );
}

interface RentalPassiveLossResult {
  /** Signed rental amount after dep and PAL (enters ordinary with dep added back). */
  allowedRentalOrdinary: number;
  /** Depreciation / rental loss that actually reduced income this year. */
  allowedDepreciation: number;
  /** `allowedRentalOrdinary + allowedDepreciation` (pre-dep ordinary presentation). */
  rentalInOrdinary: number;
  suspendedLossById: Record<string, number>;
  suspendedLoss: number;
}

/**
 * Apply federal passive-activity limits to rental results: net gains against
 * losses across properties, then allow leftover loss against other income only
 * for a real-estate professional or via the $25k active-participation
 * allowance (MAGI phase-out $100k–$150k). Disallowed loss carries forward
 * per property.
 */
function applyRentalPassiveLoss(input: {
  household: Household;
  calendarYear: number;
  taxableBeforeDepById: Record<string, number>;
  isRentalById: Record<string, boolean>;
  priorSuspendedById: Record<string, number>;
  nonRentalOrdinary: number;
  capitalGains: number;
}): RentalPassiveLossResult {
  const {
    household,
    calendarYear,
    taxableBeforeDepById,
    isRentalById,
    priorSuspendedById,
    nonRentalOrdinary,
    capitalGains,
  } = input;

  const suspendedLossById: Record<string, number> = {};
  const activities: {
    id: string;
    taxableBeforeDep: number;
    currentDep: number;
    priorSuspended: number;
    result: number;
    active: boolean;
  }[] = [];

  for (const re of household.realEstate) {
    const priorSuspended = Math.max(0, priorSuspendedById[re.id] ?? 0);
    if (!isRentalById[re.id]) {
      suspendedLossById[re.id] = priorSuspended;
      continue;
    }
    const taxableBeforeDep = taxableBeforeDepById[re.id] ?? 0;
    const currentDep = currentYearDepreciation(re, calendarYear);
    activities.push({
      id: re.id,
      taxableBeforeDep,
      currentDep,
      priorSuspended,
      result: taxableBeforeDep - currentDep - priorSuspended,
      active: re.activeParticipation !== false,
    });
  }

  let totalGain = 0;
  let totalLoss = 0;
  for (const activity of activities) {
    if (activity.result > 0) totalGain += activity.result;
    else if (activity.result < 0) totalLoss += -activity.result;
  }
  const absorbRatio = totalLoss > 0 ? Math.min(1, totalGain / totalLoss) : 0;
  const leftoverGain = Math.max(0, totalGain - totalLoss);
  const leftoverLoss = Math.max(0, totalLoss - totalGain);

  const remainingLossById: Record<string, number> = {};
  for (const activity of activities) {
    if (activity.result >= 0) continue;
    remainingLossById[activity.id] = -activity.result * (1 - absorbRatio);
  }

  const magi = nonRentalOrdinary + capitalGains + leftoverGain;
  let allowedAgainstOther = 0;
  const allowIds = new Set<string>();
  if (household.realEstateProfessional) {
    allowedAgainstOther = leftoverLoss;
    for (const activity of activities) {
      if (activity.result < 0) allowIds.add(activity.id);
    }
  } else {
    let activeLeftover = 0;
    for (const activity of activities) {
      if (activity.result >= 0 || !activity.active) continue;
      allowIds.add(activity.id);
      activeLeftover += remainingLossById[activity.id] ?? 0;
    }
    allowedAgainstOther = Math.min(
      activeLeftover,
      rentalLossSpecialAllowance(magi),
    );
  }

  let poolRemaining = 0;
  for (const id of allowIds) poolRemaining += remainingLossById[id] ?? 0;
  const allowRatio =
    poolRemaining > 0 ? Math.min(1, allowedAgainstOther / poolRemaining) : 0;

  for (const activity of activities) {
    if (activity.result >= 0) {
      suspendedLossById[activity.id] = 0;
      continue;
    }
    const remaining = remainingLossById[activity.id] ?? 0;
    suspendedLossById[activity.id] = allowIds.has(activity.id)
      ? remaining * (1 - allowRatio)
      : remaining;
  }

  let rentalEnding = 0;
  let charge = 0;
  for (const activity of activities) {
    charge +=
      activity.currentDep +
      activity.priorSuspended +
      Math.max(0, -activity.taxableBeforeDep);
    rentalEnding += suspendedLossById[activity.id] ?? 0;
  }

  const allowedRentalOrdinary = leftoverGain - allowedAgainstOther;
  const allowedDepreciation = Math.max(0, charge - rentalEnding);
  let suspendedLoss = 0;
  for (const amount of Object.values(suspendedLossById)) {
    suspendedLoss += amount;
  }

  return {
    allowedRentalOrdinary,
    allowedDepreciation,
    rentalInOrdinary: allowedRentalOrdinary + allowedDepreciation,
    suspendedLossById,
    suspendedLoss,
  };
}

function computeDeductions(
  fs: Household["filingStatus"],
  livingIds: string[],
  ages: Record<string, number>,
  grossTaxableIncome: number,
  federal: FederalTaxYear,
  allowedDepreciation: number,
): DeductionBreakdown {
  const standard = forFiling(
    federal.standardDeduction,
    fs,
    "federal standardDeduction",
  );

  let senior = 0;
  if (
    grossTaxableIncome <
    forFiling(
      federal.seniorDeductionPhaseOut,
      fs,
      "federal seniorDeductionPhaseOut",
    )
  ) {
    const eligible = livingIds.filter((id) => ages[id] >= 65).length;
    senior = eligible * federal.seniorDeductionPerPerson;
  }

  const depreciation = Math.max(0, allowedDepreciation);
  return { standard, senior, depreciation, total: standard + senior + depreciation };
}

function stateDeductionTotal(
  state: StateTaxTable,
  filingStatus: Household["filingStatus"],
): number {
  return (
    forFiling(state.standardDeduction, filingStatus, "state standardDeduction") +
    forFiling(state.personalExemption, filingStatus, "state personalExemption")
  );
}

/**
 * Tax capital gains under a state's rules. Ordinary-income states fold gains
 * into the ordinary stack; exempt states return 0; preferential / WA-only use
 * dedicated brackets with ordinary stacking when the state also has income tax.
 */
function stateCapitalGainsTax(
  state: StateTaxTable,
  filingStatus: Household["filingStatus"],
  ordinaryTaxable: number,
  gains: number,
): number {
  if (gains <= 0) return 0;
  if (state.capitalGains === "exempt") return 0;
  if (state.capitalGainsOnly || state.capitalGains === "preferential") {
    const brackets = state.capitalGainsBrackets
      ? forFiling(
          state.capitalGainsBrackets,
          filingStatus,
          "state capitalGainsBrackets",
        )
      : forFiling(state.brackets, filingStatus, "state brackets");
    return capitalGainsTaxStacked(0, gains, brackets);
  }
  if (!state.hasIncomeTax) return 0;
  const brackets = forFiling(
    state.brackets,
    filingStatus,
    "state brackets",
  );
  return capitalGainsTaxStacked(ordinaryTaxable, gains, brackets);
}

/**
 * Project a single scenario year by year.
 *
 * `conversionSchedule[i]` is the desired Roth conversion in projection year `i`;
 * the engine draws it from tax-deferred accounts (in list order, cascading to
 * the next account when one is depleted) and deposits the realized amount into
 * the first Roth account. Pass an all-zero schedule for the no-conversion
 * baseline.
 */
export function projectScenario(
  household: Household,
  conversionSchedule: number[],
  refs: ReferenceData = FALLBACK_REFERENCE_DATA,
  options: ProjectionOptions = {},
): ProjectionRow[] {
  const planFiling = household.filingStatus;
  // Survivorship analysis: one spouse passes at the end of `death.year`.
  const death = resolveDeath(household, options.death);
  // Long-term care analysis: care costs per person and lower regular spending.
  const care = resolveLongTermCare(household, options.longTermCare);
  const federal = refs.federalTax;
  const state = getStateTaxTable(
    refs.stateIncomeTax,
    household.residenceState ?? "FL",
  );
  const start = projectionStartYear(household);
  const years = projectionYears(household);

  // Roth conversions need a tax-free destination. If the plan has no Roth
  // account but a conversion is scheduled, add an implicit empty Roth bucket so
  // converted dollars can never be silently dropped: without it the cascade
  // below would pull money out of the tax-deferred accounts (and tax it) with
  // nowhere to land, deflating every downstream asset/inheritance total.
  const hasConversions = conversionSchedule.some((amount) => amount > 0);
  const conversionTaxPaidFrom = household.optimizer?.conversionTaxPaidFrom ?? "income";
  const existingRoth = household.accounts.find(
    (acc) => acc.kind === "rothTaxFree",
  );
  const implicitRoth: Account | null =
    !existingRoth && hasConversions
      ? {
          id: "__implicit_roth__",
          label: "Roth (implicit)",
          ownerId: primaryPerson(household).id,
          kind: "rothTaxFree",
          balance: 0,
          growthRate: IMPLICIT_ROTH_GROWTH,
        }
      : null;
  const accounts = implicitRoth
    ? [...household.accounts, implicitRoth]
    : household.accounts;

  const retirementAccounts = accounts.filter(
    (acc) => acc.kind === "retirementTaxable",
  );
  const targetRoth = accounts.find((acc) => acc.kind === "rothTaxFree");

  // Balances are entered as of today (`refs.asOfDate`): a plan-start account
  // compounds from then up to the plan start. Deposits dated before the
  // projection starts happen in years we never project, so they can't run
  // through cash flow. They compound into the opening balance instead (see
  // `lib/engine/deposits.ts`).
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    balances[acc.id] = openingBalance(acc, start, refs.asOfDate);
  }

  // Track remaining cost basis for after-tax accounts so withdrawals can
  // realize proportional capital gains. Pre-start deposits into an after-tax
  // account are already-taxed principal, so they add to basis.
  const basisRemaining: Record<string, number> = {};
  for (const acc of accounts) {
    if (!AFTER_TAX_KINDS.includes(acc.kind)) continue;
    const basis =
      Math.max(0, acc.costBasis ?? 0) +
      Math.max(0, preStartDepositPrincipal(acc, start));
    basisRemaining[acc.id] = Math.min(basis, Math.max(0, balances[acc.id]));
  }

  const mortgageBalances: Record<string, number> = {};
  for (const re of household.realEstate)
    mortgageBalances[re.id] = re.mortgageBalance ?? 0;
  // Market values are entered as of today. A plan-start property appreciates
  // from then up to the plan start; a retirement one waits for the plan.
  const realEstatePreStartYears: Record<string, number> = {};
  for (const re of household.realEstate) {
    realEstatePreStartYears[re.id] =
      realEstateGrowthStart(re) === "planStart"
        ? preStartGrowthYears(start, refs.asOfDate)
        : 0;
  }
  const businessPreStartYears: Record<string, number> = {};
  for (const biz of household.businesses ?? []) {
    businessPreStartYears[biz.id] =
      businessGrowthStart(biz) === "planStart"
        ? preStartGrowthYears(start, refs.asOfDate)
        : 0;
  }
  const suspendedLossById: Record<string, number> = {};

  // RMDs divide the balance as of December 31 of the preceding year, so each
  // year's closing balances are kept for the next one. Year 0 seeds it with the
  // plan's starting balances (treated as Jan 1 of the first projection year, so
  // they are also Dec 31 of the year before). Growth during year 0 does not
  // change that year's RMD.
  let priorYearEndBalances: Record<string, number> = { ...balances };
  const firstYearGrowth = firstYearGrowthFraction(start, refs.asOfDate);

  const rows: ProjectionRow[] = [];

  for (let i = 0; i < years; i++) {
    const calendarYear = start + i;
    const ages: Record<string, number> = {};
    for (const p of household.people)
      ages[p.id] = calendarYear - (p.birthYear ?? NaN);
    const livingIds = household.people
      .filter((p) => !hasPassed(death, p.id, calendarYear))
      .map((p) => p.id);
    // A surviving spouse files jointly for the year of death, then single.
    const widowed =
      death != null && calendarYear > death.year && planFiling === "mfj";
    const fs: Household["filingStatus"] = widowed ? "single" : planFiling;
    const stoppedIncomes = incomesStoppedByDeath(
      household,
      death,
      calendarYear,
      start,
    );

    // 1) Grow balances. Starting balances are January 1 of the first projection
    //    year, so year 0 gets a full year of returns before withdrawals, except
    //    accounts set to start at retirement (DROP by default): those wait
    //    until the owner's retirement year. When the
    //    balances are as of a date inside year 0 (`refs.asOfDate`, today in
    //    the app), year 0 compounds only for the rest of that year. All
    //    accounts keep compounding for life, including tax-deferred ones past
    //    the RMD age: the money stays invested while RMDs are taken.
    const yearFraction = i === 0 ? firstYearGrowth : 1;
    for (const acc of accounts) {
      if (!accountGrowsInYear(acc, household.people, calendarYear, start)) {
        continue;
      }
      balances[acc.id] *= Math.pow(1 + growthRate(acc), yearFraction);
    }

    // 2) Account withdrawals reduce their source account and continue for as
    //    long as the income is active - including retirement draws past the
    //    RMD age, which are taken in addition to the forced RMD below.
    //    After-tax withdrawals also realize proportional capital gains vs basis.
    //    Takes are capped at the available balance so accounts never go negative;
    //    income below uses the same capped amount (no phantom cash / tax).
    let capitalGainsIncome = 0;
    const withdrawalTaken: Record<string, number> = {};
    for (const income of household.incomes) {
      if (!isWithdrawalIncome(income.kind)) continue;
      if (!isIncomeActive(income, calendarYear)) continue;
      const accId = income.drawsFromAccountId;
      if (!accId || balances[accId] == null) continue;
      const withdraw = incomeMonthlyForYear(income, calendarYear, start) * 12;
      const balBefore = Math.max(0, balances[accId]);
      const take = Math.min(balBefore, Math.max(0, withdraw));
      if (income.kind === "afterTaxWithdrawal" && take > 0 && balBefore > 0) {
        const basis = basisRemaining[accId] ?? 0;
        const gainFrac = Math.max(0, 1 - basis / balBefore);
        capitalGainsIncome += take * gainFrac;
        basisRemaining[accId] = Math.max(0, basis - take * (basis / balBefore));
      }
      balances[accId] -= take;
      withdrawalTaken[income.id] = take;
    }

    // 3) Roth conversions: cascade out of tax-deferred accounts into Roth.
    let toConvert = conversionSchedule[i] ?? 0;
    let converted = 0;
    for (const acc of retirementAccounts) {
      if (toConvert <= 0) break;
      const ownerId = effectiveOwner(death, acc.ownerId, calendarYear);
      const owner = household.people.find((p) => p.id === ownerId);
      const ownerRmdAge = personRmdAge(owner);
      const ownerAge = ages[ownerId];
      // Missing birth year → still convertible. Known age at/after RMD → skip.
      if (ownerRmdAge != null && ownerAge >= ownerRmdAge) continue;
      const take = Math.min(Math.max(0, balances[acc.id]), toConvert);
      balances[acc.id] -= take;
      toConvert -= take;
      converted += take;
    }
    if (targetRoth) balances[targetRoth.id] += converted;

    // 3b) Deposits into accounts. They land after this year's growth (same as
    //     converted dollars), so the money starts compounding next year. The
    //     cash comes out of the household's own pocket, so it reduces surplus
    //     below like an expense. Tax treatment follows the account kind:
    //     tax-deferred contributions are pre-tax (excluded from ordinary gross),
    //     Roth is post-tax, and after-tax deposits add cost basis so they aren't
    //     taxed again as gains on the way out.
    const depositMonthly: Record<string, number> = {};
    let monthlyDeposits = 0;
    let preTaxDeposits = 0;
    for (const acc of accounts) {
      for (const deposit of acc.deposits ?? []) {
        const annual = depositAmountForYear(deposit, calendarYear);
        if (annual <= 0) continue;
        balances[acc.id] += annual;
        if (AFTER_TAX_KINDS.includes(acc.kind)) {
          basisRemaining[acc.id] = (basisRemaining[acc.id] ?? 0) + annual;
        }
        if (acc.kind === "retirementTaxable") preTaxDeposits += annual;
        depositMonthly[deposit.id] = annual / 12;
        monthlyDeposits += annual / 12;
      }
    }

    // 4) Income for the year.
    let totalMonthlyIncome = 0;
    let federalOrdinaryGross = 0;
    let stateOrdinaryGross = 0;
    const incomeMonthly: Record<string, number> = {};
    for (const income of household.incomes) {
      if (!isIncomeActive(income, calendarYear)) continue;
      if (stoppedIncomes.has(income.id)) continue;
      // A withdrawal income with no valid source account is inactive: it neither
      // depletes an account (step 2) nor produces taxable income / cash flow.
      if (isWithdrawalIncome(income.kind) && !withdrawalHasSource(income, balances))
        continue;
      // Withdrawals contribute only what was actually taken in step 2 (capped at
      // the source balance). A scheduled draw against an empty account is $0.
      const annual = isWithdrawalIncome(income.kind)
        ? (withdrawalTaken[income.id] ?? 0)
        : incomeMonthlyForYear(income, calendarYear, start) * 12;
      if (annual <= 0 && isWithdrawalIncome(income.kind)) continue;
      const monthly = annual / 12;
      totalMonthlyIncome += monthly;
      incomeMonthly[income.id] = monthly;
      // Ordinary taxable portion (capital gains from after-tax withdrawals are
      // handled separately via `capitalGainsIncome`):
      //  - Social Security: federal always SOCIAL_SECURITY_TAXABLE_PCT; state
      //    uses that state's socialSecurityTaxablePct.
      //  - retirementDraw: always fully taxable (pre-tax dollars).
      //  - rothWithdrawal: tax-free cash flow.
      //  - afterTaxWithdrawal: cash flow only here; gains taxed via LTCG path.
      // Everything else uses its own `taxability`.
      if (income.kind === "socialSecurity") {
        federalOrdinaryGross += annual * SOCIAL_SECURITY_TAXABLE_PCT;
        stateOrdinaryGross += annual * state.socialSecurityTaxablePct;
      } else if (
        income.kind === "rothWithdrawal" ||
        income.kind === "afterTaxWithdrawal"
      ) {
        // cash flow only
      } else if (income.kind === "retirementDraw") {
        federalOrdinaryGross += annual;
        stateOrdinaryGross += annual;
      } else if (income.taxability === "full") {
        federalOrdinaryGross += annual;
        stateOrdinaryGross += annual;
      }
    }

    // RMD income once the owner reaches their birth-year RMD age (taxable in
    // full). Per the IRS, the amount is the prior December 31 balance divided by
    // the owner's Uniform Lifetime denominator for their age this year, so
    // growth, scheduled draws and conversions taken during the year don't change
    // what's required. Capped at what's actually left so the account can't go
    // negative, then withdrawn so the account declines. It is taken in addition
    // to any scheduled retirement draw; both show as separate income lines. No
    // birth year → no forced RMD.
    for (const acc of retirementAccounts) {
      const ownerId = effectiveOwner(death, acc.ownerId, calendarYear);
      const owner = household.people.find((p) => p.id === ownerId);
      const ownerRmdAge = personRmdAge(owner);
      if (ownerRmdAge == null || ages[ownerId] < ownerRmdAge) continue;
      const base = Math.max(0, priorYearEndBalances[acc.id] ?? 0);
      const required = base / uniformLifetimeDenominator(ages[ownerId]);
      const bal = Math.max(0, balances[acc.id]);
      const rmdAnnual = Math.min(bal, required);
      if (rmdAnnual <= 0) continue;
      balances[acc.id] = bal - rmdAnnual;
      const rmdMonthly = rmdAnnual / 12;
      totalMonthlyIncome += rmdMonthly;
      incomeMonthly[`rmd:${acc.id}`] = rmdMonthly;
      federalOrdinaryGross += rmdAnnual;
      stateOrdinaryGross += rmdAnnual;
    }

    // Roth conversions are taxable income in the year converted.
    federalOrdinaryGross += converted;
    stateOrdinaryGross += converted;

    // Real estate: appreciation, mortgage amortization, and rental cash flow.
    const realEstate = stepRealEstate(
      household,
      i,
      mortgageBalances,
      realEstatePreStartYears,
    );
    totalMonthlyIncome += realEstate.cashAnnual / 12;
    for (const [id, monthly] of Object.entries(realEstate.cashMonthlyById)) {
      incomeMonthly[`re:${id}`] = monthly;
    }

    // Contributions to tax-deferred accounts come out of pre-tax dollars, so
    // they are excluded from ordinary gross before deductions apply. MAGI for
    // the rental-loss allowance uses this non-rental ordinary amount.
    if (preTaxDeposits > 0) {
      federalOrdinaryGross = Math.max(0, federalOrdinaryGross - preTaxDeposits);
      stateOrdinaryGross = Math.max(0, stateOrdinaryGross - preTaxDeposits);
    }

    const rentalPal = applyRentalPassiveLoss({
      household,
      calendarYear,
      taxableBeforeDepById: realEstate.taxableBeforeDepById,
      isRentalById: realEstate.isRentalById,
      priorSuspendedById: suspendedLossById,
      nonRentalOrdinary: federalOrdinaryGross,
      capitalGains: capitalGainsIncome,
    });
    for (const re of household.realEstate) {
      suspendedLossById[re.id] = rentalPal.suspendedLossById[re.id] ?? 0;
    }
    federalOrdinaryGross += rentalPal.rentalInOrdinary;
    stateOrdinaryGross += rentalPal.rentalInOrdinary;

    // States that only tax capital gains (WA) ignore ordinary income.
    if (state.capitalGainsOnly || !state.hasIncomeTax) {
      stateOrdinaryGross = 0;
    }

    // 5) Deductions, taxable income, federal + state tax (incl. capital gains).
    //    Wrapped so the same math can price the year without its conversion
    //    when the conversion pays its own tax (see 5b).
    const taxForYear = (
      federalOrdinaryGross: number,
      stateOrdinaryGross: number,
    ) => {
      const deductions = computeDeductions(
        fs,
        livingIds,
        ages,
        federalOrdinaryGross,
        federal,
        rentalPal.allowedDepreciation,
      );
      const taxableIncome = Math.max(0, federalOrdinaryGross - deductions.total);
      const federalBrackets = forFiling(
        federal.brackets,
        fs,
        "federal brackets",
      );
      const federalOrdinaryTax = progressiveTax(taxableIncome, federalBrackets);
      const federalTaxByBracket = progressiveTaxByBracket(
        taxableIncome,
        federalBrackets,
      ).map((tax, bi) => ({
        rate: federalBrackets[bi].rate,
        tax,
        floor: federalBrackets[bi].floor,
        ceiling: federalBrackets[bi + 1]?.floor ?? null,
      }));
      const ltcgBrackets = forFiling(
        federal.longTermCapitalGains,
        fs,
        "federal longTermCapitalGains",
      );
      const federalCapitalGainsTax = capitalGainsTaxStacked(
        taxableIncome,
        capitalGainsIncome,
        ltcgBrackets,
      );
      const federalCapitalGainsTaxByBracket = capitalGainsTaxByBracket(
        taxableIncome,
        capitalGainsIncome,
        ltcgBrackets,
      ).map((tax, bi) => ({ rate: ltcgBrackets[bi].rate, tax }));
      const federalAnnualTax = federalOrdinaryTax + federalCapitalGainsTax;

      const stateDeduction = state.hasIncomeTax ? stateDeductionTotal(state, fs) : 0;
      const stateDeductions = state.hasIncomeTax
        ? {
            standard: forFiling(
              state.standardDeduction,
              fs,
              "state standardDeduction",
            ),
            personalExemption: forFiling(
              state.personalExemption,
              fs,
              "state personalExemption",
            ),
            total: stateDeduction,
          }
        : { standard: 0, personalExemption: 0, total: 0 };
      const stateGrossTaxableIncome = stateOrdinaryGross;
      const stateTaxableIncome = state.hasIncomeTax
        ? Math.max(0, stateOrdinaryGross - stateDeduction)
        : 0;
      const stateBrackets = forFiling(state.brackets, fs, "state brackets");
      const stateOrdinaryTax =
        state.hasIncomeTax && !state.capitalGainsOnly
          ? progressiveTax(stateTaxableIncome, stateBrackets)
          : 0;
      const stateTaxByBracket =
        state.hasIncomeTax && !state.capitalGainsOnly
          ? progressiveTaxByBracket(stateTaxableIncome, stateBrackets).map(
              (tax, bi) => ({ rate: stateBrackets[bi].rate, tax }),
            )
          : [];
      const stateGainsTax = stateCapitalGainsTax(
        state,
        fs,
        stateTaxableIncome,
        capitalGainsIncome,
      );
      // When gains are taxed as ordinary, they were stacked in stateGainsTax only
      // (not double-counted in stateOrdinaryTax). Preferential/WA use CG brackets.
      const stateAnnualTax = stateOrdinaryTax + stateGainsTax;
      return {
        deductions,
        taxableIncome,
        federalOrdinaryTax,
        federalTaxByBracket,
        federalCapitalGainsTax,
        federalCapitalGainsTaxByBracket,
        federalAnnualTax,
        stateDeductions,
        stateGrossTaxableIncome,
        stateTaxableIncome,
        stateTaxByBracket,
        stateAnnualTax,
        annualTax: federalAnnualTax + stateAnnualTax,
      };
    };
    const {
      deductions,
      taxableIncome,
      federalOrdinaryTax,
      federalTaxByBracket,
      federalCapitalGainsTax,
      federalCapitalGainsTaxByBracket,
      federalAnnualTax,
      stateDeductions,
      stateGrossTaxableIncome,
      stateTaxableIncome,
      stateTaxByBracket,
      stateAnnualTax,
      annualTax,
    } = taxForYear(federalOrdinaryGross, stateOrdinaryGross);

    // 5b) Conversion tax paid from assets: the tax the conversion adds this
    //     year is withheld from the converted dollars, so the Roth gets the
    //     rest and the household's cash flow doesn't pay it. The full
    //     conversion is still taxable (withholding is part of the
    //     distribution), so the year's tax is unchanged.
    let conversionTaxWithheld = 0;
    if (conversionTaxPaidFrom === "assets" && converted > 0) {
      const withoutConversion = taxForYear(
        Math.max(0, federalOrdinaryGross - converted),
        stateOrdinaryGross > 0 ? Math.max(0, stateOrdinaryGross - converted) : 0,
      );
      conversionTaxWithheld = Math.min(
        converted,
        Math.max(0, annualTax - withoutConversion.annualTax),
      );
      if (targetRoth) balances[targetRoth.id] -= conversionTaxWithheld;
    }

    const monthlyTax = annualTax / 12;
    const federalMonthlyTax = federalAnnualTax / 12;
    const stateMonthlyTax = stateAnnualTax / 12;

    const netMonthlyIncome =
      totalMonthlyIncome - (annualTax - conversionTaxWithheld) / 12;
    const grossTaxableIncome = federalOrdinaryGross;
    // Each expense grows from its start year (or year 0); yearly amounts are
    // spread to monthly. Out-of-range years are 0.
    // Survivorship: after a death the household spends a set share of what
    // the couple did.
    const careYear = careForYear(care, calendarYear, start);
    const expenseShare =
      (death != null && calendarYear > death.year ? SURVIVOR_EXPENSE_SHARE : 1) *
      careYear.expenseShare;
    const expenseMonthly: Record<string, number> = {};
    let monthlyExpenses = 0;
    for (const e of household.expenses) {
      const grown = expenseMonthlyForYear(e, calendarYear, start) * expenseShare;
      expenseMonthly[e.id] = grown;
      monthlyExpenses += grown;
    }
    for (const [personId, cost] of Object.entries(careYear.costMonthlyById)) {
      expenseMonthly[careExpenseKey(personId)] = cost;
      monthlyExpenses += cost;
    }

    // 6) Business equity grows like real estate: year 0 is the January 1
    //    value (grown from today for a plan-start business).
    let businessEquity = 0;
    const businessEquityById: Record<string, number> = {};
    for (const biz of household.businesses ?? []) {
      const value = businessValueForYear(
        biz,
        i,
        businessPreStartYears[biz.id] ?? 0,
      );
      businessEquityById[biz.id] = value;
      businessEquity += value;
    }

    // 7) Account totals snapshot.
    let retirementTotal = 0;
    let rothTotal = 0;
    let afterTaxTotal = 0;
    for (const acc of accounts) {
      if (acc.kind === "retirementTaxable") retirementTotal += balances[acc.id];
      else if (acc.kind === "rothTaxFree") rothTotal += balances[acc.id];
      else if (AFTER_TAX_KINDS.includes(acc.kind))
        afterTaxTotal += balances[acc.id];
    }

    rows.push({
      yearIndex: i,
      calendarYear,
      ages,
      livingIds,
      filingStatus: fs,
      balances: { ...balances },
      retirementTotal,
      rothTotal,
      afterTaxTotal,
      realEstateValue: realEstate.value,
      mortgageBalance: realEstate.mortgage,
      realEstateEquity: realEstate.value - realEstate.mortgage,
      realEstateEquityById: { ...realEstate.equityById },
      businessEquity,
      businessEquityById,
      rentalLossCarryforward: rentalPal.suspendedLoss,
      rentalLossCarryforwardById: { ...rentalPal.suspendedLossById },
      conversion: converted,
      conversionTaxWithheld,
      totalMonthlyIncome,
      incomeMonthly,
      grossTaxableIncome,
      capitalGainsIncome,
      deductions,
      taxableIncome,
      stateGrossTaxableIncome,
      stateDeductions,
      stateTaxableIncome,
      federalOrdinaryTax,
      federalCapitalGainsTax,
      federalAnnualTax,
      federalMonthlyTax,
      federalTaxByBracket,
      federalCapitalGainsTaxByBracket,
      stateAnnualTax,
      stateMonthlyTax,
      stateTaxByBracket,
      annualTax,
      monthlyTax,
      taxByBracket: federalTaxByBracket,
      netMonthlyIncome,
      netAnnualIncome: netMonthlyIncome * 12,
      monthlyExpenses,
      expenseMonthly,
      monthlyDeposits,
      depositMonthly,
      preTaxDeposits,
      surplus: netMonthlyIncome - monthlyExpenses - monthlyDeposits,
    });

    priorYearEndBalances = { ...balances };
  }

  return rows;
}

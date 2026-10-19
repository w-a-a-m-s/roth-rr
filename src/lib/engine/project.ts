import type {
  Account,
  Business,
  Household,
  IncomeSource,
} from "@/lib/domain/types";
import {
  accountGrowsInYear,
  asOfYear,
  firstYearGrowthFraction,
  preStartGrowthYears,
  realEstateGrowthStart,
  businessGrowthStart,
  expenseMonthlyForYear,
  contributionAccounts,
  eventTopUpKey,
  eventWithdrawalKey,
  incomeMonthlyForYear,
  isIncomeActive,
  isJointAccount,
  isWithdrawalIncome,
  propertyLandShare,
  propertyPurchaseMonth,
  returnsBasisFirst,
  AFTER_TAX_ACCOUNT_KINDS,
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
import {
  disabilityBenefitMonths,
  disabilityInsuranceKey,
  disabilityPolicies,
  lifeInsuranceClaims,
  lifeInsuranceKey,
  longTermCareBenefitMonths,
  longTermCareInsuranceKey,
  longTermCarePolicies,
  resolveDisability,
} from "@/lib/domain/insurance";
import {
  LIFE_INSURANCE_PROCEEDS_GROWTH,
  lifeInsurancePayoutRate,
} from "@/lib/config/lifeInsurancePayout";
import {
  allowsRmdYearConversions,
  allowsWorkingYearConversions,
  personRmdAge,
} from "@/lib/domain/rmd";
import {
  DEFAULT_REPAYMENT_YEARS,
  loanExpenseKey,
  propertyLoans,
} from "@/lib/domain/propertyLoans";
import { levelPayment } from "@/lib/engine/amortization";
import { balanceAtStart, loanTerms, type LoanTerms } from "@/lib/engine/loanPaydown";
import {
  CAR_EXPENSE_KEY,
  carCostsByYear,
  includesMedicarePremiums,
  includesOtherExpenses,
  lifePremiumsForYear,
  medicareExpenseKey,
  premiumExpenseKey,
} from "@/lib/engine/otherExpenses";
import {
  MEDICARE_IRMAA_LOOKBACK_YEARS,
  medicarePartBMonthlyPremium,
  paysMedicarePartB,
} from "@/lib/config/medicare";
import { federalTaxForYear } from "@/lib/engine/taxIndexing";
import { accountGrowthForYear } from "@/lib/engine/marketHistory";
import { employmentTax, type EarnedIncome } from "@/lib/engine/employmentTax";
import { taxableSocialSecurity } from "@/lib/engine/socialSecurityTax";
import { netInvestmentIncomeTax } from "@/lib/engine/netInvestmentIncomeTax";
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
  SENIOR_DEDUCTION_PHASE_OUT_RATE,
} from "@/lib/config/federalTax";
import type { StateTaxTable } from "@/lib/config/stateTax";
import { getStateTaxTable } from "@/lib/config/stateTax";
import { forFiling } from "@/lib/config/filingStatus";
import {
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

const AFTER_TAX_KINDS: Account["kind"][] = AFTER_TAX_ACCOUNT_KINDS;

/**
 * The tax-free part of taking `take` from an after-tax account holding
 * `balance` with `basis` left. DPP / MLP distributions return basis first;
 * every other kind splits the take pro rata between basis and gain.
 */
export function basisReturned(
  kind: Account["kind"],
  take: number,
  balance: number,
  basis: number,
): number {
  if (take <= 0 || basis <= 0) return 0;
  if (returnsBasisFirst(kind)) return Math.min(take, basis);
  if (balance <= 0) return 0;
  return take * Math.min(1, basis / balance);
}

/**
 * Tax split of one draw from an after-tax account: `cashOut` paid out of a
 * `take` from the balance (an event's guaranteed income can pay past it).
 * DPP / MLP return of capital is deferred, not tax free: it adds to the
 * account's `recapture` along with the depreciation already taken, and once
 * the basis is gone the gain is ordinary income up to that amount, then
 * long-term gains. Other kinds realize only gains.
 */
export function realizeAfterTaxDraw(
  kind: Account["kind"],
  take: number,
  balance: number,
  basis: number,
  recapture = 0,
  cashOut = take,
): { returned: number; ordinary: number; gains: number; recapture: number } {
  const returned = basisReturned(kind, take, balance, basis);
  if (!returnsBasisFirst(kind)) {
    return { returned, ordinary: 0, gains: cashOut - returned, recapture };
  }
  const pool = recapture + returned;
  const gain = Math.max(0, cashOut - returned);
  const ordinary = Math.min(gain, pool);
  return { returned, ordinary, gains: gain - ordinary, recapture: pool - ordinary };
}

/**
 * First year an analysis projects. Normally the plan start; an analysis whose
 * event (a death, a disability) comes before it starts in the event's year,
 * but never before the year of `asOfDate` (today in the app).
 */
export function analysisStartYear(
  household: Household,
  eventYear: number | null | undefined,
  asOfDate?: string,
): number {
  const planStart = projectionStartYear(household);
  if (eventYear == null || !(eventYear < planStart)) return planStart;
  const today = asOfDate ? Number(asOfDate.slice(0, 4)) : NaN;
  return Number.isFinite(today) ? Math.min(planStart, Math.max(eventYear, today)) : eventYear;
}

/**
 * First calendar year `projectScenario` projects for these options: the plan
 * start, or earlier for a death, disability, or `fromYear` before it.
 */
export function scenarioStartYear(
  household: Household,
  options: ProjectionOptions = {},
  asOfDate?: string,
): number {
  const death = resolveDeath(household, options.death);
  const disability = resolveDisability(household, options.disability);
  const eventYears = [death?.year, disability?.year, options.fromYear].filter(
    (y): y is number => y != null,
  );
  return analysisStartYear(
    household,
    eventYears.length > 0 ? Math.min(...eventYears) : null,
    asOfDate,
  );
}

/** The earliest retirement year across the household (the default start). */
export function retirementStartYear(household: Household): number {
  return Math.min(...household.people.map((p) => p.retirementYear ?? NaN));
}

/**
 * Projection start: the plan's chosen start year, or by default the earliest
 * retirement year across the household.
 */
export function projectionStartYear(household: Household): number {
  const chosen = household.assumptions?.startYear;
  if (chosen != null && Number.isFinite(chosen)) return chosen;
  return retirementStartYear(household);
}

/**
 * First calendar year a conversion strategy may fill: the projection start or
 * the first retirement year, whichever is later. Years before it are manual
 * only (amounts the user typed).
 */
export function strategyStartYear(household: Household): number {
  // With working-year conversions on, strategies fill from the plan start.
  if (allowsWorkingYearConversions(household)) return projectionStartYear(household);
  return Math.max(projectionStartYear(household), retirementStartYear(household));
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
  const start = retirementStartYear(household);
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
  // Never below today's value (years shown before the plan start).
  return value * Math.pow(1 + rate, Math.max(0, yearIndex + preStartYears));
}

interface RealEstateYear {
  /** Total appreciated market value. */
  value: number;
  /** Remaining mortgage principal across all properties. */
  mortgage: number;
  /** Rental cash flow before loan payments (rent - operating expenses). */
  cashAnnual: number;
  /** Taxable rental income (rent - operating expenses - mortgage interest). */
  taxableAnnual: number;
  /** Per-property monthly cash flow (sums to `cashAnnual / 12`). */
  cashMonthlyById: Record<string, number>;
  /**
   * Per investment property: monthly loan payments (interest and principal),
   * paid as an expense. A homestead's loans aren't counted.
   */
  loanPaymentMonthlyById: Record<string, number>;
  /**
   * Per homestead: its monthly loan payments, which count as an expense only
   * when the plan includes other expenses (`includeOtherExpenses`).
   */
  homesteadLoanPaymentMonthlyById: Record<string, number>;
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
  rentYearIndex = yearIndex,
  calendarYear = 0,
  lineOfCreditPayments: Record<string, number> = {},
  terms: Record<string, LoanTerms> = {},
): RealEstateYear {
  const a = household.assumptions;
  let value = 0;
  let mortgage = 0;
  let cashAnnual = 0;
  let taxableAnnual = 0;
  const cashMonthlyById: Record<string, number> = {};
  const loanPaymentMonthlyById: Record<string, number> = {};
  const homesteadLoanPaymentMonthlyById: Record<string, number> = {};
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
        Math.max(0, rentYearIndex + (preStartYearsById[re.id] ?? 0)),
      );
    value += propValue;

    const rentGrowth = re.rentGrowthRate ?? DEFAULT_RENT_GROWTH;
    const rentAnnual =
      (re.monthlyRent ?? 0) * 12 * Math.pow(1 + rentGrowth, rentYearIndex);
    const expenseAnnual =
      (re.monthlyOperatingExpenses ?? 0) *
      12 *
      Math.pow(1 + a.expenseGrowth, rentYearIndex);

    // Each loan: a mortgage pays its set payment; a line of credit pays
    // interest only through its draw period, then a level payment that
    // clears it over the repayment term (worked out the year repayment starts).
    const am = { endBalance: 0, interest: 0, principal: 0 };
    for (const loan of propertyLoans(re)) {
      const bal = mortgageBalances[loan.id] ?? 0;
      if (!(bal > 0)) continue;
      // The Mortgage analysis statement's terms when there is one (extra
      // principal included), else the loan as entered.
      const t = terms[loan.id];
      const rate = t?.rate ?? loan.rate ?? 0;
      let payment = t ? t.monthlyPayment + t.extraPrincipal : (loan.monthlyPayment ?? 0);
      if (loan.kind === "lineOfCredit") {
        const drawing = loan.drawEndYear == null || calendarYear <= loan.drawEndYear;
        if (drawing) {
          payment = bal * (rate / 12);
        } else {
          if (lineOfCreditPayments[loan.id] == null) {
            lineOfCreditPayments[loan.id] = levelPayment(
              bal,
              rate,
              Math.max(1, loan.repaymentYears ?? DEFAULT_REPAYMENT_YEARS) * 12,
            );
          }
          payment = lineOfCreditPayments[loan.id];
        }
      }
      const year = amortizeYear(bal, rate, payment);
      mortgageBalances[loan.id] = year.endBalance;
      am.endBalance += year.endBalance;
      am.interest += year.interest;
      am.principal += year.principal;
    }
    mortgage += am.endBalance;
    equityById[re.id] = propValue - am.endBalance;

    // A homestead's loans pay down and its equity counts, but their payments
    // and interest stay out of income, expenses and taxable rental income.
    // An investment property's payments are an expense, not less rent.
    const loanCost = re.use === "homestead" ? { interest: 0, principal: 0 } : am;
    const cash = rentAnnual - expenseAnnual;
    cashAnnual += cash;
    cashMonthlyById[re.id] = cash / 12;
    const payment = loanCost.interest + loanCost.principal;
    if (payment > 0) loanPaymentMonthlyById[re.id] = payment / 12;
    const homesteadPayment = am.interest + am.principal;
    if (re.use === "homestead" && homesteadPayment > 0) {
      homesteadLoanPaymentMonthlyById[re.id] = homesteadPayment / 12;
    }
    const taxableBeforeDep = rentAnnual - expenseAnnual - loanCost.interest;
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
    loanPaymentMonthlyById,
    homesteadLoanPaymentMonthlyById,
    equityById,
    taxableBeforeDepById,
    isRentalById,
  };
}

/**
 * Straight-line depreciation for `calendarYear` under the mid-month
 * convention (IRS Pub. 527, MACRS): the building (purchase price less the
 * land share, which isn't depreciable) starts depreciating in the middle of
 * the month it was placed in service, and the last year takes what's left,
 * so the total is exactly the building's basis over `depreciationYears`. A
 * homestead isn't depreciated.
 */
export function propertyDepreciation(
  re: Household["realEstate"][number],
  calendarYear: number,
): number {
  if (re.use === "homestead") return 0;
  if (!(re.purchasePrice > 0) || !(re.depreciationYears > 0)) return 0;
  if (calendarYear < re.purchaseYear) return 0;
  const basis = re.purchasePrice * (1 - propertyLandShare(re));
  const perMonth = basis / (re.depreciationYears * 12);
  // Months taken through the end of a year: half of the first month, then
  // every month after it.
  const monthsThrough = (year: number) =>
    year < re.purchaseYear
      ? 0
      : (year - re.purchaseYear) * 12 + (12 - propertyPurchaseMonth(re) + 0.5);
  const taken = (year: number) => Math.min(basis, perMonth * monthsThrough(year));
  return taken(calendarYear) - taken(calendarYear - 1);
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
    const currentDep = propertyDepreciation(re, calendarYear);
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
  magi: number,
  federal: FederalTaxYear,
  allowedDepreciation: number,
  oneTimeDepreciation: number,
): DeductionBreakdown {
  const standard = forFiling(
    federal.standardDeduction,
    fs,
    "federal standardDeduction",
  );
  // Each living person 65 or older adds the extra "aged" standard deduction.
  const age65 = livingIds.filter((id) => ages[id] >= 65).length;
  const additional =
    age65 *
    forFiling(federal.additionalStandardDeduction, fs, "federal additionalStandardDeduction");

  // Senior deduction: each person 65+ gets the full amount, less 6% of MAGI
  // over the phase-out start (gone at $250k joint / $175k single).
  const phaseOutStart = forFiling(
    federal.seniorDeductionPhaseOut,
    fs,
    "federal seniorDeductionPhaseOut",
  );
  const perPerson = Math.max(
    0,
    federal.seniorDeductionPerPerson -
      SENIOR_DEDUCTION_PHASE_OUT_RATE * Math.max(0, magi - phaseOutStart),
  );
  const senior = age65 * perPerson;

  const depreciation = Math.max(0, allowedDepreciation);
  const oneTime = Math.max(0, oneTimeDepreciation);
  return {
    standard,
    additional,
    senior,
    depreciation,
    oneTimeDepreciation: oneTime,
    total: standard + additional + senior + depreciation + oneTime,
  };
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
  // Disability analysis: one person can't work from January 1 of this year.
  const disability = resolveDisability(household, options.disability);
  const disabledPerson = disability
    ? household.people.find((p) => p.id === disability.personId)
    : undefined;
  // Insurance only pays in its own analysis. Survivorship: each in-force life
  // policy on the person who passes becomes invested proceeds paying a fixed
  // lifetime income. Their balance and remaining basis live here.
  const lifeClaims = lifeInsuranceClaims(household, death);
  const lifeBasis: Record<string, number> = {};
  const state = getStateTaxTable(
    refs.stateIncomeTax,
    household.residenceState ?? "FL",
  );
  // The plan starts at the first retirement year. Survivorship and
  // Disability can start earlier: a death or disability before then starts
  // the projection in that year (never before today). Amounts the plan states in start-year dollars
  // (incomes, expenses, rent, care) stay anchored to the plan start, so every
  // year from the plan start on matches what a later death would show.
  const planStart = projectionStartYear(household);
  const start = scenarioStartYear(household, options, refs.asOfDate);
  const offset = planStart - start;
  const years = projectionYears(household) + offset;

  // Roth conversions need a tax-free destination. If the plan has no Roth
  // account but a conversion is scheduled, add an implicit empty Roth bucket so
  // converted dollars can never be silently dropped: without it the cascade
  // below would pull money out of the tax-deferred accounts (and tax it) with
  // nowhere to land, deflating every downstream asset/inheritance total.
  const early = options.earlyConversions ?? [];
  const hasConversions =
    conversionSchedule.some((amount) => amount > 0) ||
    early.some((c) => c.amount > 0);
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
  // Deposits stop once their owner retires.
  const planAccounts = contributionAccounts(household);
  const accounts = implicitRoth ? [...planAccounts, implicitRoth] : planAccounts;

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
  // DPP / MLP depreciation still to be recaptured as ordinary income.
  const recaptureRemaining: Record<string, number> = {};
  for (const acc of accounts) {
    if (!returnsBasisFirst(acc.kind)) continue;
    recaptureRemaining[acc.id] = Math.max(0, acc.depreciationRecapture ?? 0);
  }

  // Loans are owed as of today too: each one is paid down month by month
  // from its next payment up to the projection start, on the Mortgage
  // analysis statement's terms when it has one (see `loanPaydown.ts`).
  const terms = loanTerms(household, refs.asOfDate);
  // Incomes and expenses set to grow from today compound from this year (see
  // `incomeMonthlyForYear` / `expenseMonthlyForYear`).
  const todayYear = asOfYear(refs.asOfDate);
  const otherExpenses = includesOtherExpenses(household);
  const medicarePremiums = includesMedicarePremiums(household);
  const rmdYearConversions = allowsRmdYearConversions(household);
  const carCosts = otherExpenses ? carCostsByYear(household, planStart) : null;
  const mortgageBalances: Record<string, number> = {};
  // A line of credit's repayment, fixed the year its draw period ends.
  const lineOfCreditPayments: Record<string, number> = {};
  for (const re of household.realEstate) {
    for (const loan of propertyLoans(re)) {
      const t = terms[loan.id];
      const opening = balanceAtStart(t, start);
      mortgageBalances[loan.id] = opening.balance;
      if (opening.lineOfCreditPayment != null) {
        lineOfCreditPayments[loan.id] = opening.lineOfCreditPayment;
      }
    }
  }
  // Market values are entered as of today. A plan-start property appreciates
  // from then up to the plan start; a retirement one waits for the plan.
  const realEstatePreStartYears: Record<string, number> = {};
  for (const re of household.realEstate) {
    realEstatePreStartYears[re.id] =
      realEstateGrowthStart(re) === "planStart"
        ? preStartGrowthYears(planStart, refs.asOfDate)
        : 0;
  }
  const businessPreStartYears: Record<string, number> = {};
  for (const biz of household.businesses ?? []) {
    businessPreStartYears[biz.id] =
      businessGrowthStart(biz) === "planStart"
        ? preStartGrowthYears(planStart, refs.asOfDate)
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

  // Survivorship and Long-term care: from the year the event takes effect
  // (the year after a death, the first year of care) every investment and
  // retirement account pays a fixed lifetime income, like the life insurance
  // proceeds: its balance that January times the payout table's rate for the
  // age of the person it pays. What's left grows 8% a year. The income is
  // guaranteed, so it keeps paying if the balance runs out.
  const careStart =
    care && care.stays.length > 0
      ? Math.min(...care.stays.map((stay) => stay.firstYear))
      : null;
  const eventYears = [death ? death.year + 1 : null, careStart].filter(
    (y): y is number => y != null,
  );
  const eventStart = eventYears.length > 0 ? Math.min(...eventYears) : null;
  const incomeAccounts = accounts.filter(
    (acc) =>
      AFTER_TAX_KINDS.includes(acc.kind) ||
      acc.kind === "retirementTaxable" ||
      acc.kind === "rothTaxFree",
  );
  // Yearly income per account, fixed the year the event starts.
  let eventIncome: Record<string, number> | null = null;
  // A year still short after that income takes more from the same accounts:
  // after-tax first, then tax-deferred, then Roth.
  const topUpOrder = [
    ...incomeAccounts.filter((acc) => AFTER_TAX_KINDS.includes(acc.kind)),
    ...incomeAccounts.filter((acc) => acc.kind === "retirementTaxable"),
    ...incomeAccounts.filter((acc) => acc.kind === "rothTaxFree"),
  ];
  /**
   * Take `amount` from the accounts in top-up order, capped at what's there:
   * each account's take, the ordinary income (tax-deferred, and DPP / MLP
   * recapture) and the gains realized (after-tax, against remaining basis).
   */
  const planTopUp = (amount: number) => {
    const takes: Record<string, number> = {};
    let left = amount;
    let total = 0;
    let ordinary = 0;
    let gains = 0;
    for (const acc of topUpOrder) {
      if (left <= 0) break;
      const bal = Math.max(0, balances[acc.id]);
      const take = Math.min(bal, left);
      if (take <= 0) continue;
      takes[acc.id] = take;
      left -= take;
      total += take;
      if (acc.kind === "retirementTaxable") ordinary += take;
      if (basisRemaining[acc.id] != null) {
        const draw = realizeAfterTaxDraw(
          acc.kind,
          take,
          bal,
          basisRemaining[acc.id],
          recaptureRemaining[acc.id],
        );
        ordinary += draw.ordinary;
        gains += draw.gains;
      }
    }
    return { takes, total, ordinary, gains };
  };
  const incomeRecipientAge = (acc: Account, calendarYear: number) => {
    const ids = isJointAccount(acc, planFiling)
      ? household.people
          .filter((p) => !hasPassed(death, p.id, calendarYear))
          .map((p) => p.id)
      : [effectiveOwner(death, acc.ownerId, calendarYear)];
    const ages = ids
      .map((id) => household.people.find((p) => p.id === id)?.birthYear)
      .filter((y): y is number => Number.isFinite(y))
      .map((y) => calendarYear - y);
    // Joint: the younger of the two, as the rider does for joint life.
    return ages.length > 0 ? Math.min(...ages) : NaN;
  };

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
    // This year's federal table: brackets, standard deduction and wage base
    // indexed for inflation from the table's year.
    const federal = federalTaxForYear(household, refs.federalTax, calendarYear);
    const stoppedIncomes = incomesStoppedByDeath(
      household,
      death,
      calendarYear,
      planStart,
      todayYear,
    );
    // A disabled person's salary and business income stop.
    if (disability && calendarYear >= disability.year) {
      for (const income of household.incomes) {
        if (income.ownerId !== disability.personId) continue;
        if (income.kind !== "salary" && income.kind !== "business") continue;
        stoppedIncomes.add(income.id);
      }
    }

    // 1) Grow balances. Starting balances are January 1 of the first projection
    //    year, so year 0 gets a full year of returns before withdrawals, except
    //    accounts set to start at retirement (DROP by default): those wait
    //    until the owner's retirement year. When the
    //    balances are as of a date inside year 0 (`refs.asOfDate`, today in
    //    the app), year 0 compounds only for the rest of that year. All
    //    accounts keep compounding for life, including tax-deferred ones past
    //    the RMD age: the money stays invested while RMDs are taken.
    if (eventIncome == null && eventStart != null && calendarYear >= eventStart) {
      eventIncome = {};
      for (const acc of incomeAccounts) {
        const base = Math.max(0, balances[acc.id]);
        if (!(base > 0)) continue;
        eventIncome[acc.id] = base * lifeInsurancePayoutRate(incomeRecipientAge(acc, calendarYear));
      }
    }
    const yearFraction = i === 0 ? firstYearGrowth : 1;
    for (const acc of accounts) {
      if (eventIncome?.[acc.id] != null) {
        balances[acc.id] *= Math.pow(1 + LIFE_INSURANCE_PROCEEDS_GROWTH, yearFraction);
        continue;
      }
      if (!accountGrowsInYear(acc, household.people, calendarYear, planStart)) {
        continue;
      }
      // Market accounts follow the S&P 500's year in Market history mode.
      balances[acc.id] *= Math.pow(1 + accountGrowthForYear(household, acc, i - offset), yearFraction);
    }

    // 2) Account withdrawals reduce their source account and continue for as
    //    long as the income is active - including retirement draws past the
    //    RMD age, which are taken in addition to the forced RMD below.
    //    After-tax withdrawals also realize proportional capital gains vs basis.
    //    Takes are capped at the available balance so accounts never go negative;
    //    income below uses the same capped amount (no phantom cash / tax).
    let capitalGainsIncome = 0;
    let recaptureIncome = 0;
    // Taxable earnings on life insurance proceeds paid like an annuity
    // (Survivorship), which count as investment income.
    let lifeInsuranceEarnings = 0;
    /** Book one after-tax draw: basis, recapture and the income it realizes. */
    const realizeDraw = (
      acc: Account,
      take: number,
      balBefore: number,
      cashOut = take,
    ) => {
      const draw = realizeAfterTaxDraw(
        acc.kind,
        take,
        balBefore,
        basisRemaining[acc.id] ?? 0,
        recaptureRemaining[acc.id],
        cashOut,
      );
      basisRemaining[acc.id] = Math.max(
        0,
        (basisRemaining[acc.id] ?? 0) - draw.returned,
      );
      if (recaptureRemaining[acc.id] != null) {
        recaptureRemaining[acc.id] = draw.recapture;
      }
      recaptureIncome += draw.ordinary;
      return draw;
    };
    const withdrawalTaken: Record<string, number> = {};
    for (const income of household.incomes) {
      if (!isWithdrawalIncome(income.kind)) continue;
      if (!isIncomeActive(income, calendarYear)) continue;
      const accId = income.drawsFromAccountId;
      if (!accId || balances[accId] == null) continue;
      const withdraw = incomeMonthlyForYear(income, calendarYear, planStart, todayYear) * 12;
      const balBefore = Math.max(0, balances[accId]);
      const take = Math.min(balBefore, Math.max(0, withdraw));
      if (income.kind === "afterTaxWithdrawal" && take > 0 && balBefore > 0) {
        const acc = accounts.find((a) => a.id === accId)!;
        capitalGainsIncome += realizeDraw(acc, take, balBefore).gains;
      }
      balances[accId] -= take;
      withdrawalTaken[income.id] = take;
    }
    // 2b) The event's fixed income out of each account. Past what the balance
    //     holds it's still paid (guaranteed), taxed like the account's money.
    let eventOrdinary = 0;
    for (const [accId, income] of Object.entries(eventIncome ?? {})) {
      const acc = incomeAccounts.find((a) => a.id === accId)!;
      const balBefore = Math.max(0, balances[accId]);
      const take = Math.min(balBefore, income);
      if (acc.kind === "retirementTaxable") eventOrdinary += income;
      if (basisRemaining[accId] != null) {
        capitalGainsIncome += realizeDraw(acc, take, balBefore, income).gains;
      }
      balances[accId] = balBefore - take;
    }

    // 3) Roth conversions: cascade out of tax-deferred accounts into Roth.
    // The schedule is per plan year; years before the plan start convert only
    // the plan's early conversion for that year, if any.
    let toConvert =
      (i >= offset
        ? conversionSchedule[i - offset]
        : early.find((c) => c.year === calendarYear)?.amount) ?? 0;
    // This year's required minimum distribution per account, figured before
    // any conversion: the IRS wants it out first, and it can't be converted.
    // Per the IRS, the amount is the prior December 31 balance divided by the
    // owner's Uniform Lifetime denominator for their age this year, so growth,
    // scheduled draws and conversions taken during the year don't change it.
    const rmdRequired: Record<string, number> = {};
    for (const acc of retirementAccounts) {
      const ownerId = effectiveOwner(death, acc.ownerId, calendarYear);
      const owner = household.people.find((p) => p.id === ownerId);
      const ownerRmdAge = personRmdAge(owner);
      if (ownerRmdAge == null || ages[ownerId] < ownerRmdAge) continue;
      const base = Math.max(0, priorYearEndBalances[acc.id] ?? 0);
      // The event's income from this account counts toward its RMD.
      rmdRequired[acc.id] = Math.max(
        0,
        base / uniformLifetimeDenominator(ages[ownerId]) - (eventIncome?.[acc.id] ?? 0),
      );
    }

    let converted = 0;
    for (const acc of retirementAccounts) {
      if (toConvert <= 0) break;
      // Missing birth year → still convertible. At or past the RMD age, only
      // when the plan allows RMD-year conversions, and only what's left after
      // setting the year's RMD aside, so the RMD is still taken in full.
      const required = rmdRequired[acc.id];
      if (required != null && !rmdYearConversions) continue;
      const available = Math.max(0, balances[acc.id] - (required ?? 0));
      const take = Math.min(available, toConvert);
      if (!(take > 0)) continue;
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
      // Survivorship: nobody pays into the deceased's own accounts. A joint
      // account keeps going while the survivor still works.
      if (hasPassed(death, acc.ownerId, calendarYear)) {
        if (!isJointAccount(acc, planFiling)) continue;
        const survivor = household.people.find((p) => p.id === death?.survivorId);
        if (!(calendarYear < (survivor?.retirementYear ?? -Infinity))) continue;
      }
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
    // Salary and business income per person, for employment tax.
    const earnedByPerson: Record<string, EarnedIncome> = {};
    // Social Security benefits. Their federal taxable part depends on the
    // year's other income, so it's figured with the tax (see `taxForYear`).
    let socialSecurityBenefits = 0;
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
        : incomeMonthlyForYear(income, calendarYear, planStart, todayYear) * 12;
      if (annual <= 0 && isWithdrawalIncome(income.kind)) continue;
      const monthly = annual / 12;
      totalMonthlyIncome += monthly;
      incomeMonthly[income.id] = monthly;
      // Ordinary taxable portion (capital gains from after-tax withdrawals are
      // handled separately via `capitalGainsIncome`):
      //  - Social Security: federal from provisional income once the rest of
      //    the year is known (`taxableSocialSecurity`); state uses that
      //    state's socialSecurityTaxablePct.
      //  - retirementDraw: always fully taxable (pre-tax dollars).
      //  - rothWithdrawal: tax-free cash flow.
      //  - afterTaxWithdrawal: cash flow only here; gains taxed via LTCG path.
      // Everything else uses its own `taxability`.
      if (income.kind === "socialSecurity") {
        socialSecurityBenefits += annual;
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
      if (income.taxability !== "full") continue;
      if (income.kind !== "salary" && income.kind !== "business") continue;
      const earned = (earnedByPerson[income.ownerId] ??= { wages: 0, business: 0 });
      if (income.kind === "salary") earned.wages += annual;
      else earned.business += annual;
    }
    // Social Security and Medicare tax on salary (employee FICA) and business
    // income (self-employment tax). Half the self-employment tax comes off
    // income before deductions, like a pre-tax contribution below.
    const employment = employmentTax(earnedByPerson, fs, federal.socialSecurityWageBase);

    for (const [accId, income] of Object.entries(eventIncome ?? {})) {
      totalMonthlyIncome += income / 12;
      incomeMonthly[eventWithdrawalKey(accId)] = income / 12;
    }
    federalOrdinaryGross += eventOrdinary + recaptureIncome;
    stateOrdinaryGross += eventOrdinary + recaptureIncome;

    // RMD income once the owner reaches their birth-year RMD age (taxable in
    // full). Per the IRS, the amount is the prior December 31 balance divided by
    // the owner's Uniform Lifetime denominator for their age this year, so
    // growth, scheduled draws and conversions taken during the year don't change
    // what's required. Capped at what's actually left so the account can't go
    // negative, then withdrawn so the account declines. It is taken in addition
    // to any scheduled retirement draw; both show as separate income lines. No
    // birth year → no forced RMD.
    for (const acc of retirementAccounts) {
      const required = rmdRequired[acc.id];
      if (required == null) continue;
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

    // Insurance benefits, each only in its own analysis.
    //  - Life (Survivorship): the death benefit lands in the year of death,
    //    then from the next year grows 8% a year and pays a fixed income for life
    //    (guaranteed, so it keeps paying if the balance runs out). Like an
    //    annuity, earnings come out first and are taxed as ordinary income;
    //    the rest is a tax-free return of the death benefit.
    for (const claim of lifeClaims) {
      if (calendarYear < claim.deathYear) continue;
      const key = lifeInsuranceKey(claim.policyId);
      // The death benefit is paid in the year of death and shows in that
      // year's assets; it's invested and starts paying the next year.
      if (calendarYear === claim.deathYear) {
        balances[key] = claim.faceAmount;
        lifeBasis[key] = claim.faceAmount;
        continue;
      }
      if (balances[key] == null) {
        balances[key] = claim.faceAmount;
        lifeBasis[key] = claim.faceAmount;
      }
      balances[key] *= 1 + LIFE_INSURANCE_PROCEEDS_GROWTH;
      const balBefore = Math.max(0, balances[key]);
      const basis = lifeBasis[key] ?? 0;
      const income = claim.annualIncome;
      const taxable =
        basis <= 0 ? income : Math.min(income, Math.max(0, balBefore - basis));
      lifeBasis[key] = Math.max(0, basis - (income - taxable));
      balances[key] = balBefore - Math.min(balBefore, income);
      totalMonthlyIncome += income / 12;
      incomeMonthly[key] = income / 12;
      federalOrdinaryGross += taxable;
      stateOrdinaryGross += taxable;
      lifeInsuranceEarnings += taxable;
    }
    //  - Disability: the disabled person's policies pay after the waiting
    //    period for the benefit period. Tax free unless the policy says
    //    an employer paid the premiums.
    if (disability && disabledPerson && Number.isFinite(disabledPerson.birthYear)) {
      for (const policy of disabilityPolicies(household)) {
        if (policy.insuredId !== disability.personId) continue;
        const months = disabilityBenefitMonths(
          policy,
          disabledPerson.birthYear as number,
          disability.year,
          calendarYear,
        );
        const annual = Math.max(0, policy.monthlyBenefit) * months;
        if (annual <= 0) continue;
        totalMonthlyIncome += annual / 12;
        incomeMonthly[disabilityInsuranceKey(policy.id)] = annual / 12;
        if (!policy.taxable) continue;
        federalOrdinaryGross += annual;
        stateOrdinaryGross += annual;
      }
    }
    //  - Long-term care: a policy on someone in care pays its monthly benefit
    //    (up to that month's care cost) after the waiting period, for its
    //    benefit years or while care lasts. Tax free.
    const careYearCosts = careForYear(care, calendarYear, planStart).costMonthlyById;
    for (const stay of care?.stays ?? []) {
      const cost = careYearCosts[stay.personId] ?? 0;
      if (cost <= 0) continue;
      for (const policy of longTermCarePolicies(household)) {
        if (policy.insuredId !== stay.personId) continue;
        const months = longTermCareBenefitMonths(
          policy,
          stay.firstYear,
          stay.lastYear,
          calendarYear,
        );
        const annual = Math.min(Math.max(0, policy.monthlyBenefit), cost) * months;
        if (annual <= 0) continue;
        totalMonthlyIncome += annual / 12;
        incomeMonthly[longTermCareInsuranceKey(policy.id)] = annual / 12;
      }
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
      i - offset,
      calendarYear,
      lineOfCreditPayments,
      terms,
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
    const seDeduction = employment.selfEmploymentDeduction;
    if (seDeduction > 0) {
      federalOrdinaryGross = Math.max(0, federalOrdinaryGross - seDeduction);
      stateOrdinaryGross = Math.max(0, stateOrdinaryGross - seDeduction);
    }

    const rentalPal = applyRentalPassiveLoss({
      household,
      calendarYear,
      taxableBeforeDepById: realEstate.taxableBeforeDepById,
      isRentalById: realEstate.isRentalById,
      priorSuspendedById: suspendedLossById,
      // The allowance's MAGI leaves out taxable Social Security (469(i)),
      // which isn't in federalOrdinaryGross yet.
      nonRentalOrdinary: federalOrdinaryGross,
      capitalGains: capitalGainsIncome,
    });
    for (const re of household.realEstate) {
      suspendedLossById[re.id] = rentalPal.suspendedLossById[re.id] ?? 0;
    }
    federalOrdinaryGross += rentalPal.rentalInOrdinary;
    stateOrdinaryGross += rentalPal.rentalInOrdinary;

    // One-time 100% depreciation: each entry deducts its full amount in its
    // year from federal and state taxable income (never below zero; any
    // excess is not carried forward).
    const oneTimeDepreciationById: Record<string, number> = {};
    let oneTimeDepreciation = 0;
    for (const entry of household.oneTimeDepreciation ?? []) {
      if (entry.hidden) continue;
      if (entry.year !== calendarYear) continue;
      const amount = Math.max(0, entry.amount);
      if (!(amount > 0)) continue;
      oneTimeDepreciationById[entry.id] = amount;
      oneTimeDepreciation += amount;
    }

    // States that only tax capital gains (WA) ignore ordinary income.
    if (state.capitalGainsOnly || !state.hasIncomeTax) {
      stateOrdinaryGross = 0;
    }

    // 5) Deductions, taxable income, federal + state tax (incl. capital gains).
    //    Wrapped so the same math can price the year without its conversion
    //    when the conversion pays its own tax (see 5b).
    const taxForYear = (
      grossBeforeSocialSecurity: number,
      stateOrdinaryGross: number,
      capitalGainsIncome: number,
    ) => {
      // Social Security's taxable part rides on everything else on the
      // return, gains included (provisional income).
      const socialSecurityTaxable = taxableSocialSecurity(
        socialSecurityBenefits,
        grossBeforeSocialSecurity + capitalGainsIncome,
        fs,
      );
      const federalOrdinaryGross = grossBeforeSocialSecurity + socialSecurityTaxable;
      // MAGI for the senior deduction is AGI: ordinary income plus gains.
      const deductions = computeDeductions(
        fs,
        livingIds,
        ages,
        federalOrdinaryGross + capitalGainsIncome,
        federal,
        rentalPal.allowedDepreciation,
        oneTimeDepreciation,
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
      // Net investment income tax: gains, DPP / MLP recapture, net rental
      // income (not for a real-estate professional) and annuity-like life
      // insurance earnings, against MAGI (AGI here).
      const netInvestmentIncome = Math.max(
        0,
        capitalGainsIncome +
          recaptureIncome +
          lifeInsuranceEarnings +
          (household.realEstateProfessional ? 0 : rentalPal.allowedRentalOrdinary),
      );
      const niit = netInvestmentIncomeTax(
        netInvestmentIncome,
        federalOrdinaryGross + capitalGainsIncome,
        fs,
      );
      const federalAnnualTax =
        federalOrdinaryTax + federalCapitalGainsTax + niit + employment.total;

      const stateDeduction = state.hasIncomeTax
        ? stateDeductionTotal(state, fs) + oneTimeDepreciation
        : 0;
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
            oneTimeDepreciation,
            total: stateDeduction,
          }
        : { standard: 0, personalExemption: 0, oneTimeDepreciation: 0, total: 0 };
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
        grossTaxableIncome: federalOrdinaryGross,
        socialSecurityTaxable,
        deductions,
        taxableIncome,
        federalOrdinaryTax,
        federalTaxByBracket,
        federalCapitalGainsTax,
        federalCapitalGainsTaxByBracket,
        netInvestmentIncome,
        netInvestmentIncomeTax: niit,
        federalAnnualTax,
        stateDeductions,
        stateGrossTaxableIncome,
        stateTaxableIncome,
        stateTaxByBracket,
        stateAnnualTax,
        annualTax: federalAnnualTax + stateAnnualTax,
      };
    };
    // Expenses for the year. Each grows from its start year (or year 0);
    // yearly amounts are spread to monthly. Out-of-range years are 0.
    // Survivorship: after a death the household spends a set share of what
    // the couple did.
    const careYear = careForYear(care, calendarYear, planStart);
    // Spending capacity scales the plan's own expenses (not care or loans).
    const expenseShare =
      (death != null && calendarYear > death.year ? SURVIVOR_EXPENSE_SHARE : 1) *
      careYear.expenseShare *
      (options.spendingScale ?? 1);
    const expenseMonthly: Record<string, number> = {};
    let monthlyExpenses = 0;
    for (const e of household.expenses) {
      const grown = expenseMonthlyForYear(e, calendarYear, planStart, todayYear) * expenseShare;
      expenseMonthly[e.id] = grown;
      monthlyExpenses += grown;
    }
    for (const [personId, cost] of Object.entries(careYear.costMonthlyById)) {
      expenseMonthly[careExpenseKey(personId)] = cost;
      monthlyExpenses += cost;
    }
    // Investment property loan payments (not scaled after a death: the loan
    // is still owed in full).
    for (const [id, payment] of Object.entries(realEstate.loanPaymentMonthlyById)) {
      expenseMonthly[loanExpenseKey(id)] = payment;
      monthlyExpenses += payment;
    }
    // Costs entered on other steps, when the plan counts them (the Expenses
    // step switch): life insurance premiums, homestead loan payments and the
    // Car analysis. Fixed bills, so never scaled.
    if (otherExpenses) {
      for (const [id, annual] of Object.entries(lifePremiumsForYear(household, calendarYear, death))) {
        expenseMonthly[premiumExpenseKey(id)] = annual / 12;
        monthlyExpenses += annual / 12;
      }
      for (const [id, payment] of Object.entries(realEstate.homesteadLoanPaymentMonthlyById)) {
        expenseMonthly[loanExpenseKey(id)] = payment;
        monthlyExpenses += payment;
      }
      const car = carCosts?.byYear[calendarYear] ?? 0;
      if (car > 0) {
        expenseMonthly[CAR_EXPENSE_KEY] = car / 12;
        monthlyExpenses += car / 12;
      }
    }

    // 5b) Conversion tax paid from assets: the tax the conversion adds this
    //     year is withheld from the converted dollars, so the Roth gets the
    //     rest and the household's cash flow doesn't pay it. The full
    //     conversion is still taxable (withholding is part of the
    //     distribution), so the year's tax is unchanged. `priceYear` is the
    //     year's tax with `extraOrdinary` / `extraGains` on top.
    const stateTaxesOrdinary = state.hasIncomeTax && !state.capitalGainsOnly;
    const priceYear = (extraOrdinary: number, extraGains: number) => {
      const fed = federalOrdinaryGross + extraOrdinary;
      const st = stateTaxesOrdinary ? stateOrdinaryGross + extraOrdinary : 0;
      const gains = capitalGainsIncome + extraGains;
      const taxes = taxForYear(fed, st, gains);
      if (conversionTaxPaidFrom !== "assets" || converted <= 0) {
        return { taxes, withheld: 0 };
      }
      const withoutConversion = taxForYear(
        Math.max(0, fed - converted),
        st > 0 ? Math.max(0, st - converted) : 0,
        gains,
      );
      const withheld = Math.min(
        converted,
        Math.max(0, taxes.annualTax - withoutConversion.annualTax),
      );
      return { taxes, withheld };
    };
    let priced = priceYear(0, 0);

    // Medicare Part B premiums as an expense, when the plan counts them (the
    // Expenses step switch): the same premiums the Medicare analysis shows.
    // Each enrolled person pays the tier set by MAGI from two years earlier
    // (`medicareYears`); the first two years use the plan's first year.
    if (medicarePremiums) {
      const lookback = rows[Math.max(0, i - MEDICARE_IRMAA_LOOKBACK_YEARS)];
      const magi = lookback
        ? lookback.grossTaxableIncome + lookback.capitalGainsIncome
        : priced.taxes.grossTaxableIncome + capitalGainsIncome;
      const monthly = medicarePartBMonthlyPremium(magi, fs, refs.medicare);
      for (const person of household.people) {
        if (!livingIds.includes(person.id)) continue;
        if (!paysMedicarePartB(person, calendarYear)) continue;
        expenseMonthly[medicareExpenseKey(person.id)] = monthly;
        monthlyExpenses += monthly;
      }
    }

    // 5c) After an event, a year still short once the lifetime income is in
    //     takes more from the accounts until it's covered (or they're empty),
    //     grossed up for the tax the extra adds. The rental-loss allowance
    //     keeps the MAGI it had before. Spending capacity covers every
    //     short year this way (`coverShortfalls`).
    if (eventIncome != null || options.coverShortfalls) {
      const outflow = (monthlyExpenses + monthlyDeposits) * 12;
      const cashTax = (p: typeof priced) => p.taxes.annualTax - p.withheld;
      const baseTax = cashTax(priced);
      const gap = outflow - (totalMonthlyIncome * 12 - baseTax);
      if (gap > 0.005) {
        let target = gap;
        let plan = planTopUp(target);
        for (let k = 0; k < 50; k++) {
          // Ran out of money to draw: take everything that's left.
          if (plan.total < target - 0.005) break;
          const next = gap + cashTax(priceYear(plan.ordinary, plan.gains)) - baseTax;
          if (Math.abs(next - target) < 0.005) break;
          target = next;
          plan = planTopUp(target);
        }
        for (const [accId, take] of Object.entries(plan.takes)) {
          const balBefore = Math.max(0, balances[accId]);
          if (basisRemaining[accId] != null && balBefore > 0) {
            realizeDraw(accounts.find((a) => a.id === accId)!, take, balBefore);
          }
          balances[accId] = balBefore - take;
          incomeMonthly[eventTopUpKey(accId)] = take / 12;
          totalMonthlyIncome += take / 12;
        }
        federalOrdinaryGross += plan.ordinary;
        if (stateTaxesOrdinary) stateOrdinaryGross += plan.ordinary;
        capitalGainsIncome += plan.gains;
        priced = priceYear(0, 0);
      }
    }

    const {
      grossTaxableIncome,
      socialSecurityTaxable,
      deductions,
      taxableIncome,
      federalOrdinaryTax,
      federalTaxByBracket,
      federalCapitalGainsTax,
      federalCapitalGainsTaxByBracket,
      netInvestmentIncome,
      netInvestmentIncomeTax: niit,
      federalAnnualTax,
      stateDeductions,
      stateGrossTaxableIncome,
      stateTaxableIncome,
      stateTaxByBracket,
      stateAnnualTax,
      annualTax,
    } = priced.taxes;
    const conversionTaxWithheld = priced.withheld;
    if (targetRoth) balances[targetRoth.id] -= conversionTaxWithheld;

    const monthlyTax = annualTax / 12;
    const federalMonthlyTax = federalAnnualTax / 12;
    const stateMonthlyTax = stateAnnualTax / 12;

    const netMonthlyIncome =
      totalMonthlyIncome - (annualTax - conversionTaxWithheld) / 12;

    // 6) Business equity grows like real estate: year 0 is the January 1
    //    value (grown from today for a plan-start business).
    let businessEquity = 0;
    const businessEquityById: Record<string, number> = {};
    for (const biz of household.businesses ?? []) {
      const value = businessValueForYear(
        biz,
        i - offset,
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
    // Life insurance proceeds are after-tax money too.
    for (const claim of lifeClaims) {
      afterTaxTotal += balances[lifeInsuranceKey(claim.policyId)] ?? 0;
    }

    rows.push({
      yearIndex: i,
      calendarYear,
      ages,
      livingIds,
      filingStatus: fs,
      balances: { ...balances },
      costBasisById: { ...basisRemaining },
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
      oneTimeDepreciationById,
      conversion: converted,
      conversionTaxWithheld,
      totalMonthlyIncome,
      incomeMonthly,
      grossTaxableIncome,
      socialSecurityTaxable,
      capitalGainsIncome,
      recaptureIncome,
      deductions,
      taxableIncome,
      stateGrossTaxableIncome,
      stateDeductions,
      stateTaxableIncome,
      federalOrdinaryTax,
      federalCapitalGainsTax,
      netInvestmentIncome,
      netInvestmentIncomeTax: niit,
      employmentTax: employment,
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

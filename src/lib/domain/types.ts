/**
 * Core domain model for the Roth conversion calculator.
 *
 * The model is intentionally generic: a household has any number of people,
 * accounts and income sources. The engine (see `lib/engine`) projects these
 * year by year. Defaults are seeded from the source spreadsheet
 * (`doc/reference/Example - Aligned.xlsx`).
 */

export type FilingStatus = "single" | "mfj" | "hoh";

/** US state / DC of tax residence (2-letter postal code). */
export type UsStateCode =
  | "AL"
  | "AK"
  | "AZ"
  | "AR"
  | "CA"
  | "CO"
  | "CT"
  | "DE"
  | "FL"
  | "GA"
  | "HI"
  | "ID"
  | "IL"
  | "IN"
  | "IA"
  | "KS"
  | "KY"
  | "LA"
  | "ME"
  | "MD"
  | "MA"
  | "MI"
  | "MN"
  | "MS"
  | "MO"
  | "MT"
  | "NE"
  | "NV"
  | "NH"
  | "NJ"
  | "NM"
  | "NY"
  | "NC"
  | "ND"
  | "OH"
  | "OK"
  | "OR"
  | "PA"
  | "RI"
  | "SC"
  | "SD"
  | "TN"
  | "TX"
  | "UT"
  | "VT"
  | "VA"
  | "WA"
  | "WV"
  | "WI"
  | "WY"
  | "DC";

export interface Person {
  id: string;
  name: string;
  /** Year of birth, used to derive age in each projection year. */
  birthYear?: number;
  /** Calendar year the person retires (drives projection start + salary end). */
  retirementYear?: number;
  /** Optional. Sets the default length of long-term care (men 3, women 5 years). */
  sex?: Sex;
}

export type Sex = "male" | "female";

export type AccountKind =
  | "retirementTaxable" // tax-deferred (DROP, 401k, 403b, IRA...) - RMDs apply
  | "rothTaxFree" // Roth IRA / Roth 401k - tax free, receives conversions
  | "investment" // taxable brokerage - has cost basis
  | "annuity" // annuity - has cost basis
  | "cd" // certificates of deposit
  | "savings" // savings & money market
  | "dppMlp"; // DPP / MLP units - has cost basis, distributions return basis first

/** Subtype of a tax-deferred retirement account. DROP delays growth (see engine). */
export type RetirementAccountType =
  | "401k"
  | "403b"
  | "457b"
  | "ira"
  | "tsp"
  | "drop";

/**
 * When an account starts compounding. `planStart` grows from today (the
 * balance's as-of date) on; `retirement` stays flat until the owner's
 * retirement year and first grows in that year. Unset falls back to the
 * account type's default (`retirement` for DROP, `planStart` for everything
 * else).
 */
export type GrowthStart = "planStart" | "retirement";

export type DepositFrequency = "monthly" | "yearly" | "oneTime";

/**
 * Money paid into an account. Deposits may start before the projection does
 * (someone still working who contributes until they retire): those years aren't
 * projected, so the engine compounds them into the account's opening balance
 * instead of running them through cash flow. See `lib/engine/deposits.ts`.
 */
export interface Deposit {
  id: string;
  label: string;
  /** Amount per `frequency` period. For "oneTime", the single lump sum. */
  amount: number;
  frequency: DepositFrequency;
  /** First calendar year money goes in. Required: deposits can predate the plan. */
  startYear: number;
  /** Inclusive last year. Omitted runs to the end. Ignored for one-time. */
  endYear?: number;
}

export interface Account {
  id: string;
  label: string;
  ownerId: string;
  /**
   * After-tax + MFJ only. Both household people own this account. `ownerId`
   * stays as a fallback for filing-status cleanup and deposit defaults.
   */
  joint?: boolean;
  kind: AccountKind;
  /**
   * Tax-deferred subtype. Only used when `kind === "retirementTaxable"`.
   * Older plans omit it; `migrateHousehold` defaults those to `"drop"`.
   */
  retirementType?: RetirementAccountType;
  balance: number;
  /** For investment/annuity/DPP-MLP: basis subtracted when computing inheritance. */
  costBasis?: number;
  /**
   * DPP / MLP only: depreciation already passed through on the K-1s, recaptured
   * as ordinary income once draws run past the basis. Return of capital taken
   * during the plan adds to it (see `realizeAfterTaxDraw`).
   */
  depreciationRecapture?: number;
  /** Annual growth (decimal, e.g. 0.05). Required per account. */
  growthRate: number;
  /** When growth starts. Optional: unset uses `defaultGrowthStart`. */
  growthStart?: GrowthStart;
  /** Money paid into this account. Optional for older plans (defaults to []). */
  deposits?: Deposit[];
}

/**
 * How an income stream is taxed. Social Security is handled separately by the
 * engine (0% to 85% taxable from provisional income, see
 * `taxableSocialSecurity`), so it is not a selectable option here.
 */
export type Taxability = "full" | "taxFree";

export type IncomeKind =
  | "pension" // non-military pension
  | "militaryPension" // military pension
  | "salary"
  | "business"
  | "socialSecurity"
  | "lifeInsurance"
  | "disabilityInsurance" // disability insurance benefit (see `disabilityWaitingDays`, `disabilityCoverage`)
  // Account withdrawals: income tied to a specific account (chosen via
  // `drawsFromAccountId`) whose amount reduces that account's balance.
  | "retirementDraw" // withdraw from a tax-deferred retirement account (taxable; continues past RMD age in addition to RMDs)
  | "rothWithdrawal" // withdraw from a Roth account (tax-free)
  | "afterTaxWithdrawal" // withdraw from an after-tax account (basis tax-free; gains taxed as long-term capital gains)
  | "other";

/**
 * How a pension pays out once its owner passes. `lifeOnly` stops; `survivor`
 * keeps paying the surviving spouse for the rest of their life.
 */
export type PensionPayout = "lifeOnly" | "survivor";

/** Disability insurance elimination period, in days before benefits start. */
export type DisabilityWaitingDays = 30 | 60 | 90 | 180;

/** Full disability pays the whole monthly benefit; partial pays half. */
export type DisabilityCoverage = "full" | "partial";

/** Where an income's yearly growth starts compounding. */
export type IncomeGrowthFrom = "today" | "incomeStart";

export interface IncomeSource {
  id: string;
  label: string;
  ownerId: string;
  kind: IncomeKind;
  /**
   * Nominal monthly amount in the income's start year (or the first
   * projection year when `startYear` is omitted). Growth applies after that.
   */
  monthlyAmount: number;
  /** Annual growth (decimal, e.g. 0.02). Required per income source. */
  growthRate: number;
  taxability: Taxability;
  /** Inclusive first/last calendar year the income is active. */
  startYear?: number;
  endYear?: number;
  /** Years of flat amount before growth kicks in (spreadsheet quirk). */
  growthDelayYears?: number;
  /**
   * When yearly growth starts compounding: `incomeStart` (the default when
   * unset) treats `monthlyAmount` as start-year dollars; `today` treats it as
   * today's dollars (a Social Security statement, say) and grows it from now.
   */
  growthFrom?: IncomeGrowthFrom;
  /**
   * For account-withdrawal kinds (`retirementDraw`, `rothWithdrawal`,
   * `afterTaxWithdrawal`): the account the withdrawal depletes. A retirement
   * draw keeps running past the RMD age, on top of the forced RMD.
   */
  drawsFromAccountId?: string;
  /**
   * Pension kinds only (`pension`, `militaryPension`). Missing means
   * `lifeOnly`, the default for new and older plans.
   */
  pensionPayout?: PensionPayout;
  /**
   * Disability insurance only. Waiting (elimination) period before the first
   * payment, counted from January 1 of the start year. Missing means 90 days.
   */
  disabilityWaitingDays?: DisabilityWaitingDays;
  /** Disability insurance only. Missing means `full`. */
  disabilityCoverage?: DisabilityCoverage;
  /**
   * Business income only: the business (`Household.businesses`) that pays
   * it. Links the income to that business's card; it does not change the math.
   */
  businessId?: string;
}

export type PropertyUse = "investment" | "homestead";

export type PropertyLoanKind = "mortgage" | "lineOfCredit";

/**
 * A loan against a property. A mortgage pays principal and interest every
 * month. A line of credit (HELOC) pays interest only through its draw period,
 * then a level payment that clears it over the repayment term.
 */
export interface PropertyLoan {
  id: string;
  kind: PropertyLoanKind;
  label: string;
  /** Outstanding balance today (for a line of credit, what's drawn). */
  balance: number;
  /** Yearly interest rate (decimal). */
  rate: number;
  /** Mortgage only: monthly principal and interest. */
  monthlyPayment?: number;
  /** Line of credit only: the credit limit, for reference. */
  creditLimit?: number;
  /**
   * Line of credit only: last year of the draw period (interest only through
   * it). Missing means interest only for the whole plan.
   */
  drawEndYear?: number;
  /** Line of credit only: years to repay once the draw period ends. Default 20. */
  repaymentYears?: number;
}

export interface RealEstate {
  id: string;
  label: string;
  purchaseYear: number;
  /**
   * Month (1 to 12) the property was placed in service, for the mid-month
   * depreciation convention. Missing means January.
   */
  purchaseMonth?: number;
  /** Cost basis used for straight-line depreciation (basis / depreciationYears). */
  purchasePrice: number;
  /**
   * Share of the purchase price that's land (decimal). Land isn't
   * depreciable, so only the rest is. Missing means 20%.
   */
  landShare?: number;
  /** Current market value (projection year 0); grows by `appreciationRate`. */
  marketValue: number;
  /** Annual appreciation applied to this property's market value (decimal). */
  appreciationRate: number;
  /**
   * When appreciation starts. `planStart` (the default when unset) grows the
   * market value from today, so a later plan start opens with it grown;
   * `retirement` keeps it at the entered value until the plan starts (the
   * household's first retirement year).
   */
  growthStart?: GrowthStart;
  /**
   * Homestead (your home) or investment property. A homestead takes no
   * depreciation deduction. Missing means investment property.
   */
  use?: PropertyUse;
  /** Useful life in years for straight-line depreciation of this property. */
  depreciationYears: number;
  /** Gross monthly rent (year 0). Omit/0 for a non-rental property. */
  monthlyRent?: number;
  /** Monthly operating expenses (taxes, insurance, upkeep) excluding mortgage. */
  monthlyOperatingExpenses?: number;
  /** Annual rent growth (decimal). Defaults to the income-growth assumption. */
  rentGrowthRate?: number;
  /**
   * Mortgages and lines of credit on this property. When set, it replaces the
   * single-mortgage fields below (older plans; `migrateHousehold` moves them
   * into this list).
   */
  loans?: PropertyLoan[];
  /** Older plans: outstanding mortgage principal at projection year 0. */
  mortgageBalance?: number;
  /** Mortgage annual interest rate (decimal). */
  mortgageRate?: number;
  /** Mortgage monthly payment (principal + interest). */
  mortgageMonthlyPayment?: number;
  /**
   * Active participation in this rental (IRC 469(i)). Needed for the $25,000
   * special allowance against non-passive income. Default / missing is true.
   */
  activeParticipation?: boolean;
}

/**
 * Equity in a privately held business. Like real-estate equity it is not
 * spendable by the projection: it only grows, and counts toward total assets,
 * after-tax assets, and the inheritance.
 */
export interface Business {
  id: string;
  label: string;
  /**
   * What the household paid for its share. For reference (the gain shown on
   * the card); heirs get a stepped-up basis, so the engine does not tax it.
   */
  purchasePrice?: number;
  /** Current value of the household's share (projection year 0). */
  value: number;
  /** Annual appreciation applied to `value` (decimal). */
  growthRate: number;
  /**
   * When appreciation starts. `planStart` (the default when unset) grows the
   * value from today, so a later plan start opens with it grown; `retirement`
   * keeps it at the entered value until the plan starts (the household's
   * first retirement year).
   */
  growthStart?: GrowthStart;
}

export type ExpenseFrequency = "monthly" | "yearly";

export interface Expense {
  id: string;
  /** Free-text name (e.g. "Groceries"). Autocomplete is suggestion-only. */
  label: string;
  /**
   * Amount per `frequency` period in the expense's start year (or the first
   * projection year when `startYear` is omitted). Growth applies after that.
   */
  amount: number;
  frequency: ExpenseFrequency;
  /** Annual growth (decimal, e.g. 0.02). Required per expense. */
  growthRate: number;
  /** Inclusive first/last calendar year the expense is active. */
  startYear?: number;
  endYear?: number;
  /**
   * When yearly growth starts compounding: `expenseStart` (the default when
   * unset) treats `amount` as start-year dollars; `today` treats it as
   * today's dollars and grows it from now.
   */
  growthFrom?: ExpenseGrowthFrom;
}

/** Where an expense's yearly growth starts compounding. */
export type ExpenseGrowthFrom = "today" | "expenseStart";

export interface TaxBracket {
  /** Lower bound (inclusive) of the bracket in taxable dollars. */
  floor: number;
  /** Marginal rate (decimal) applied above the floor. */
  rate: number;
}

/**
 * Plan-wide assumptions. RMDs aren't here: both the starting age (birth year,
 * SECURE / SECURE 2.0) and the amount (IRS Uniform Lifetime Table) are set by
 * law, not by the user.
 */
export interface Assumptions {
  /** Annual growth applied to real-estate operating expenses. */
  expenseGrowth: number;
  /** Final age (of the primary person) the projection runs to. */
  finalAge: number;
  /**
   * First projection year, any year you pick. Missing (the default) means the
   * household's first retirement year. Amounts entered without a start year
   * are in this year's dollars.
   */
  startYear?: number;
  /**
   * Yearly growth of federal tax brackets and the standard deduction from the
   * tax table's year (inflation indexing). Missing means 2%; 0 keeps them flat.
   */
  taxIndexing?: number;
  /**
   * How market-invested accounts (IRAs, Roth, brokerage) grow: `fixed` (the
   * default when unset) uses each account's own growth rate every year;
   * `history` uses the S&P 500's actual yearly returns, starting with
   * `historyStartYear` in the plan's first year.
   */
  returnMode?: ReturnMode;
  /** First S&P 500 year the plan uses in Market history mode (default 1950). */
  historyStartYear?: number;
  /**
   * Let the plan draw from tax-deferred and Roth accounts before 59½, paying
   * the 10% penalty as tax. Off (the default) skips those draws.
   */
  allowEarlyWithdrawals?: boolean;
  /**
   * Where each year's leftover money (net income above expenses) is saved:
   * `sp500` (8% a year) or `moneyMarket` (3.3% a year, interest taxed every
   * year). Missing (the default) leaves it uninvested and out of the totals.
   */
  leftoverInvestment?: LeftoverInvestment;
}

/** Where the plan saves its yearly leftover money (see `Assumptions`). */
export type LeftoverInvestment = "sp500" | "moneyMarket";

/** Fixed growth rates, or the S&P 500's actual yearly returns. */
export type ReturnMode = "fixed" | "history";

/** How the per-year Roth conversion schedule is produced. */
export type ConversionStrategy =
  | "manual"
  | "even"
  | "immediate"
  | "fillBracket"
  | "irmaa"
  | "depleteByRmd"
  | "minTax";

/** Federal ordinary rates the fill-bracket strategy can target. */
export const FILL_BRACKET_RATES = [0.12, 0.22, 0.24] as const;
export type FillBracketRate = (typeof FILL_BRACKET_RATES)[number];

export interface OptimizerConfig {
  strategy: ConversionStrategy;
  /** Explicit per-projection-year conversion amounts (`manual` only). */
  manualSchedule?: number[];
  /**
   * When true, the conversion editor allows scheduling more than the estimated
   * convertible total (no UI clamp). Default / missing is false.
   */
  allowOverConvertible?: boolean;
  /**
   * Convert in years an owner is at or past their RMD age too (the switch
   * next to the conversion strategy). That year's RMD is always taken in
   * full first; only the rest can be converted. Missing means off.
   */
  allowConversionsInRmdYears?: boolean;
  /**
   * Let strategies convert in working years too: from the projection's first
   * year instead of the first retirement year (the switch next to the
   * conversion strategy, which also starts the projection today). Missing
   * means off.
   */
  allowConversionsInWorkingYears?: boolean;
  /**
   * Top ordinary rate to fill when `strategy` is `fillBracket`.
   * Missing defaults to 22%.
   */
  targetBracketRate?: FillBracketRate;
  /**
   * Optional dollar cap for `even` and `immediate`. Missing or 0 means convert
   * the full estimated convertible total.
   */
  convertAmount?: number;
  /**
   * When set, every strategy's yearly conversion is lowered so that year's
   * monthly shortfall (negative Surplus) stays at or under this many dollars.
   * Missing means no cap.
   */
  maxMonthlyShortfall?: number;
  /**
   * Who pays the tax a conversion adds. `income` (the default when missing):
   * the household pays it from that year's cash flow. `assets`: it's withheld
   * from the converted dollars, so less lands in the Roth.
   */
  conversionTaxPaidFrom?: ConversionTaxPaidFrom;
  /**
   * Extra conversions in years before the projection starts (from today,
   * while still working), one entry per year. They sit on top of the
   * strategy: every strategy and its schedule stay exactly as they are, and
   * only the Roth scenario carries them. An entry is ignored once its year is
   * past or the projection already starts in it.
   */
  earlyConversions?: EarlyConversion[];
}

export type ConversionTaxPaidFrom = "income" | "assets";

/** An asset written off in full (100% depreciation) in one year. */
export interface OneTimeDepreciation {
  id: string;
  /** Asset name. */
  label: string;
  amount: number;
  year: number;
  /**
   * Hidden from the plan: the entry is kept but deducts nothing and doesn't
   * show in the results. Missing means shown.
   */
  hidden?: boolean;
}

/** A Roth conversion of `amount` dollars in calendar `year`. */
export interface EarlyConversion {
  year: number;
  amount: number;
}

/**
 * A named, self-contained plan. The whole object is one JSON blob - the unit we
 * persist locally today and will store per-row in a database later.
 */
export interface SavedConfig {
  id: string;
  /**
   * Opaque shareable id for URLs (`/{publicId}`).
   * Omitted for unsaved local drafts (URL falls back to `id`).
   */
  publicId?: string;
  name: string;
  household: Household;
  createdAt: number;
  updatedAt: number;
  /**
   * The signed-in user's role on this plan. Omitted for sample plans and
   * unsaved local drafts (treated as full access until saved).
   */
  role?: "admin" | "editor" | "viewer";
  /** True when the signed-in user created the plan. */
  isOwner?: boolean;
  /**
   * Members + pending invites with access. Used for the Share badge in Actions
   * (shown when greater than 1).
   */
  shareCount?: number;
}

/**
 * Soft-deleted household list item kept for quick restore. `deletedAt` is an
 * ISO-8601 UTC timestamp; the UI formats it in the browser's local timezone.
 */
export interface DeletedItem<T> {
  item: T;
  deletedAt: string;
}

export interface Household {
  filingStatus: FilingStatus;
  /**
   * State (or DC) of tax residence. Drives state income tax and state treatment
   * of capital gains. Defaults to FL (no state income tax) for older plans.
   */
  residenceState: UsStateCode;
  people: Person[];
  /**
   * The "main" person: drives the projection horizon (`finalAge` is measured
   * against this person's age) and the RMD-age snapshot for after-tax assets.
   * When unset, the engine falls back to the earliest retiree (see
   * `primaryPerson`). Defaults to the first person added.
   */
  mainPersonId?: string;
  accounts: Account[];
  incomes: IncomeSource[];
  realEstate: RealEstate[];
  /**
   * When true, rental activities are treated as non-passive (real estate
   * professional who materially participates). Losses can offset other income
   * in full. Default / missing is false.
   */
  realEstateProfessional?: boolean;
  /**
   * Business equity. Optional for older plans; `migrateHousehold` defaults it
   * to `[]` and the engine treats a missing list as empty.
   */
  businesses?: Business[];
  /**
   * One-time 100% (bonus) depreciation: each entry deducts its full amount
   * from that year's federal and state taxable income. Optional; missing
   * means none.
   */
  oneTimeDepreciation?: OneTimeDepreciation[];
  /** Itemized household expenses; each grows by its own rate. */
  expenses: Expense[];
  /**
   * Count costs entered on other steps as expenses too (the Expenses step
   * switch): life insurance premiums, homestead loan payments and the Car
   * analysis. Missing means off.
   */
  includeOtherExpenses?: boolean;
  /**
   * Count Medicare Part B premiums (IRMAA included) as an expense: the
   * Expenses step switch. Missing means off (they only show as a total).
   */
  includeMedicarePremiums?: boolean;
  /**
   * Soft-deleted items kept for quick restore in the plan editor. Not used by
   * the projection engine — only the live lists above are projected. Optional
   * for older saved plans; `migrateHousehold` defaults missing arrays to `[]`.
   * Only items that existed on a previously persisted plan snapshot are added
   * here; never-saved draft items are hard-deleted.
   */
  deletedPeople?: DeletedItem<Person>[];
  deletedAccounts?: DeletedItem<Account>[];
  deletedIncomes?: DeletedItem<IncomeSource>[];
  deletedRealEstate?: DeletedItem<RealEstate>[];
  deletedBusinesses?: DeletedItem<Business>[];
  deletedExpenses?: DeletedItem<Expense>[];
  deletedInsurance?: DeletedItem<InsurancePolicy>[];
  deletedMortgages?: DeletedItem<MortgageStatement>[];
  assumptions: Assumptions;
  optimizer: OptimizerConfig;
  /**
   * Settings for the Survivorship analysis: which spouse passes and at what
   * age. The Retirement analysis ignores it. Optional; the analysis falls back
   * to `defaultDeathEvent` when it's missing.
   */
  survivorship?: DeathEvent;
  /** Settings for the Long-term care analysis. Optional, with defaults. */
  longTermCare?: LongTermCareSettings;
  /**
   * Social Security analysis: other claiming ages to compare with the plan's
   * Social Security income. Doesn't change the projection.
   */
  socialSecurityClaims?: SocialSecurityClaim[];
  /**
   * Car analysis: lease, pay cash or finance one car. Doesn't change the
   * projection. Optional; the analysis falls back to `defaultCarDecision`.
   */
  carDecision?: CarDecision;
  /**
   * Pay off the mortgage or invest: which mortgage and the investment
   * assumptions. Doesn't change the projection. Optional, with defaults.
   */
  mortgagePayoff?: MortgagePayoffSettings;
  /** Spending capacity: what to leave at the end. Optional, with defaults. */
  spendingCapacity?: SpendingCapacitySettings;
  /** Settings for the Disability analysis. Optional, with defaults. */
  disability?: DisabilityEvent;
  /**
   * Life, disability and long-term care policies. They only pay in their own
   * analysis (Survivorship, Disability, Long-term care), never in Retirement.
   * Optional for older plans; `migrateHousehold` defaults it to `[]`.
   */
  insurance?: InsurancePolicy[];
  /**
   * Mortgages entered from a statement for the Mortgage analysis (an
   * amortization table). They don't feed the projection: real estate keeps
   * its own mortgage fields. Optional; `migrateHousehold` defaults it to `[]`.
   */
  mortgages?: MortgageStatement[];
}

/**
 * What a mortgage statement says, enough to build an amortization table. The
 * balance is the unpaid principal right before the next payment.
 */
export interface MortgageStatement {
  id: string;
  label: string;
  /** The property it's on (`Household.realEstate`), for reference. */
  propertyId?: string;
  /**
   * The property mortgage (`RealEstate.loans`) it was filled in from. A
   * property mortgage without a statement shows up in Mortgage analysis on
   * its own; editing it saves a statement with this id.
   */
  loanId?: string;
  /** Unpaid principal balance on the statement (not the payoff amount). */
  principalBalance: number;
  /** Yearly interest rate (decimal). */
  interestRate: number;
  /**
   * Monthly principal and interest, without escrow. 0 or missing means
   * figure it from the balance, rate and maturity date.
   */
  monthlyPayment?: number;
  /** Month (1 to 12) and year of the next payment due: row 1 of the table. */
  nextPaymentMonth: number;
  nextPaymentYear: number;
  /** Month and year of the last scheduled payment, to check the table. */
  maturityMonth?: number;
  maturityYear?: number;
  /** Escrow per month (taxes and insurance). Shown, never amortized. */
  monthlyEscrow?: number;
  /** Extra principal paid every month on top of the payment. */
  extraPrincipal?: number;
  /** For reference: the loan as first written. */
  originalAmount?: number;
  originalTermYears?: number;
}

/** One person becoming disabled at a given age (from January 1 of that year). */
export interface DisabilityEvent {
  personId: string;
  age: number;
}

export type InsuranceKind = "life" | "disability" | "longTermCare";

/** Term covers a set number of years; permanent covers the whole life. */
export type LifePolicyType = "term" | "permanent";

/** Kinds of permanent life insurance. */
export type PermanentLifeType = "vul" | "iul" | "ul" | "whole";

export type PremiumFrequency = "monthly" | "annual";

/** How a disability policy defines "disabled". */
export type DisabilityOccupation = "own" | "modified" | "any";

/**
 * Waiting (elimination) period before a disability or long-term care policy
 * starts paying, in days. 365 is one year, 730 is two.
 */
export type InsuranceWaitingDays = 30 | 60 | 90 | 180 | 365 | 730;

/** How long a disability policy pays: a number of years, or until an age. */
export type DisabilityBenefitPeriod = "2y" | "5y" | "10y" | "age65" | "age67";

export type LongTermCarePolicyType = "traditional" | "hybrid" | "annuity";

/** Years a long-term care policy pays, or for as long as care lasts. */
export type LongTermCareBenefitYears = 2 | 3 | 4 | 5 | 6 | "lifetime";

interface InsuranceBase {
  id: string;
  label: string;
  /** The person the policy covers. */
  insuredId: string;
}

export interface LifeInsurancePolicy extends InsuranceBase {
  kind: "life";
  policyType: LifePolicyType;
  /** Term only: years of coverage, counted from `issueYear`. */
  termYears?: number;
  /** Term only: first year of coverage. Missing means the year it was added. */
  issueYear?: number;
  /** Permanent only. */
  permanentType?: PermanentLifeType;
  /** Death benefit. */
  faceAmount: number;
  /** Cash value today. For reference; it doesn't change the projection. */
  cashValue?: number;
  /** Premium per `premiumFrequency`. For reference; it isn't a plan expense. */
  premium?: number;
  premiumFrequency?: PremiumFrequency;
}

export interface DisabilityInsurancePolicy extends InsuranceBase {
  kind: "disability";
  occupation: DisabilityOccupation;
  monthlyBenefit: number;
  waitingDays: InsuranceWaitingDays;
  benefitPeriod: DisabilityBenefitPeriod;
  /**
   * True when benefits are taxable (an employer paid the premiums). Missing
   * means tax free (you paid the premiums with after-tax dollars).
   */
  taxable?: boolean;
}

export interface LongTermCarePolicy extends InsuranceBase {
  kind: "longTermCare";
  policyType: LongTermCarePolicyType;
  monthlyBenefit: number;
  waitingDays: InsuranceWaitingDays;
  benefitYears: LongTermCareBenefitYears;
}

export type InsurancePolicy =
  | LifeInsurancePolicy
  | DisabilityInsurancePolicy
  | LongTermCarePolicy;

/** Home care or a nursing home, priced per person per month in today's dollars. */
export type CareType = "home" | "nursing";

/** One person's stretch of long-term care. */
export interface CarePeriod {
  personId: string;
  /** Age care starts (the whole year counts). */
  startAge: number;
  /** Years of care, including the first. */
  years: number;
  /** This person's care. Missing uses the settings' `careType`. */
  careType?: CareType;
}

/**
 * Settings for the Long-term care analysis: one spouse or both in care, the
 * kind of care, and how fast its cost grows. The Retirement analysis ignores it.
 */
export interface LongTermCareSettings {
  who: "one" | "both";
  /** Whose care runs when `who` is "one". */
  personId: string;
  /** Care for anyone whose period doesn't set its own (older plans). */
  careType: CareType;
  /** Yearly growth of the care cost (decimal). */
  inflation: number;
  /** Per-person start age and length; anyone missing uses the defaults. */
  periods: CarePeriod[];
}

/** Pay off the mortgage or invest inputs. Rates are decimals. */
export interface MortgagePayoffSettings {
  /** The Mortgage analysis entry to compare. Missing means the first one. */
  mortgageId?: string;
  /** What the money would earn a year if invested. */
  investmentReturn: number;
  /** Tax on that growth each year. */
  taxRate: number;
}

/** Spending capacity inputs. */
export interface SpendingCapacitySettings {
  /** Leave at least this much in the accounts at the final age. */
  endReserve: number;
}

/**
 * Car analysis inputs. Rates are decimals; terms are months. The comparison
 * runs `years` years: the cash and financed car is worth its depreciated value
 * at the end, and a lease shorter than that is renewed on the same terms.
 */
export interface CarDecision {
  /** Negotiated price before sales tax. */
  price: number;
  salesTaxRate: number;
  /** Title, registration and dealer fees paid up front (buying only). */
  fees: number;
  /** How many years the comparison covers. */
  years: number;
  /** Yearly drop in the car's value. */
  depreciationRate: number;
  /** What money kept invested would earn a year. */
  investmentReturn: number;
  /** Finance: cash down, loan rate (APR) and term. */
  downPayment: number;
  loanRate: number;
  loanTermMonths: number;
  /** Lease: monthly payment (tax included), term, due at signing, turn-in fee. */
  leaseMonthly: number;
  leaseTermMonths: number;
  leaseDueAtSigning: number;
  leaseEndFee: number;
  /**
   * Lease mileage: miles the lease allows a year, miles actually driven a
   * year, and the charge per mile over the allowance at turn-in.
   */
  leaseMilesPerYear: number;
  milesDrivenPerYear: number;
  excessMileRate: number;
}

/**
 * A Social Security benefit for claiming at `age`: `monthlyAmount` a month in
 * the claim year, raised each year after by the plan's Social Security COLA.
 */
export interface SocialSecurityClaim {
  id: string;
  personId: string;
  age: number;
  monthlyAmount: number;
}

/** One spouse passing at a given age (end of that year). */
export interface DeathEvent {
  personId: string;
  deathAge: number;
}

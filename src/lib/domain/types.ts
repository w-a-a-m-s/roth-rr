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
  | "savings"; // savings & money market

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
  /** For investment/annuity: basis subtracted when computing inheritance. */
  costBasis?: number;
  /** Annual growth (decimal, e.g. 0.05). Required per account. */
  growthRate: number;
  /** When growth starts. Optional: unset uses `defaultGrowthStart`. */
  growthStart?: GrowthStart;
  /** Money paid into this account. Optional for older plans (defaults to []). */
  deposits?: Deposit[];
}

/**
 * How an income stream is taxed. Social Security is handled separately by the
 * engine (always 85% taxable, see `SOCIAL_SECURITY_TAXABLE_PCT`), so it is not a
 * selectable option here.
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
}

export interface RealEstate {
  id: string;
  label: string;
  purchaseYear: number;
  /** Cost basis used for straight-line depreciation (basis / depreciationYears). */
  purchasePrice: number;
  /** Current market value (projection year 0); grows by `appreciationRate`. */
  marketValue: number;
  /** Annual appreciation applied to this property's market value (decimal). */
  appreciationRate: number;
  /** Useful life in years for straight-line depreciation of this property. */
  depreciationYears: number;
  /** Gross monthly rent (year 0). Omit/0 for a non-rental property. */
  monthlyRent?: number;
  /** Monthly operating expenses (taxes, insurance, upkeep) excluding mortgage. */
  monthlyOperatingExpenses?: number;
  /** Annual rent growth (decimal). Defaults to the income-growth assumption. */
  rentGrowthRate?: number;
  /** Outstanding mortgage principal at projection year 0. */
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
}

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
}

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
  /** Itemized household expenses; each grows by its own rate. */
  expenses: Expense[];
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
  deletedExpenses?: DeletedItem<Expense>[];
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
}

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

/** One spouse passing at a given age (end of that year). */
export interface DeathEvent {
  personId: string;
  deathAge: number;
}

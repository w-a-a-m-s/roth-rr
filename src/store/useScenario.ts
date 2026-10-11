"use client";

import { create } from "zustand";
import type {
  Account,
  Assumptions,
  DeathEvent,
  DeletedItem,
  LongTermCareSettings,
  Business,
  Deposit,
  Expense,
  FilingStatus,
  Household,
  IncomeSource,
  OptimizerConfig,
  Person,
  RealEstate,
  SavedConfig,
  UsStateCode,
} from "@/lib/domain/types";
import { SAMPLE_HOUSEHOLD, createBlankHousehold } from "@/lib/config/sampleData";
import { DEFAULT_PLANS, isDefaultPlanId } from "@/lib/config/defaultPlans";
import {
  DEFAULT_ACCOUNT_GROWTH,
  DEFAULT_DEPRECIATION_YEARS,
  DEFAULT_EXPENSE_GROWTH,
  DEFAULT_REAL_ESTATE_APPRECIATION,
} from "@/lib/config/defaults";
import {
  DEPOSIT_FREQUENCIES,
  WITHDRAWAL_SOURCE_KINDS,
  isDisabilityCoverage,
  isDisabilityWaitingDays,
  isPensionIncome,
  applyFilingStatus,
  healAccountJoint,
  healGrowthStart,
  isGrowthStart,
  healRetirementType,
  maxPeople,
} from "@/lib/domain/household";
import { isUsStateCode } from "@/lib/config/stateTax";
import { isFilingStatus } from "@/lib/config/filingStatus";
import { uid } from "@/lib/id";
import { pickHydrateActiveId, readPlanIdFromWindow } from "@/lib/planUrl";
import { withBasePath } from "@/lib/basePath";
import {
  clearInviteGuestSession,
  hasInviteGuestSession,
} from "@/lib/inviteCookie";
import {
  canDeletePlan,
  canEditPlan,
  canRenamePlan,
} from "@/lib/sharing";
import { useToast } from "@/store/useToast";
import {
  isConversionStrategy,
  resolveBracketRate,
} from "@/lib/optimizer/labels";

/**
 * Plans are now stored server-side (MongoDB) per authenticated user and loaded
 * through `/api/plans`. The browser keeps the active plan in memory only; the
 * sole transient use of `localStorage` is a one-shot hand-off of a plan built
 * while signed out across the sign-in redirect (see `PENDING_KEY`), which is
 * cleared the moment it's claimed.
 */

/** localStorage key for a plan built before sign-in, claimed right after auth. */
export const PENDING_KEY = "roth-pending-plan";

/** Debounce for autosaving edits to a server-backed plan. */
const AUTOSAVE_MS = 800;

export type AuthStatus = "loading" | "anonymous" | "authenticated";

/** Result of trying to persist the active plan via the wizard's save action. */
export type CommitResult = "saved" | "needsAuth";

/** Temporary in-editor view of an older revision (live plan is stashed). */
export interface RevisionPreview {
  planId: string;
  revisionId: string;
  createdAt: number;
  liveName: string;
  liveHousehold: Household;
}

function clone<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T);
}

/** Ids for plans that only exist in memory (not yet saved to the server). */
function localId(): string {
  return uid("local");
}

function isLocalId(id: string): boolean {
  return id.startsWith("local-");
}

/**
 * Bring an imported household up to the current shape. Older exports and
 * hand-built JSON may omit fields that are now required (per-account /
 * per-income `growthRate`, per-property real-estate rates), or still use a
 * single `monthlyExpenses` number. Backfill sane defaults so a partial plan
 * can't NaN-poison the projection. Mutates and returns `household`.
 */
export function migrateHousehold(household: Household): Household {
  const legacy = household as Household & { monthlyExpenses?: number };
  // Older plans had no residence state; default to Florida (no state income tax)
  // so federal-only golden baselines stay comparable until the user picks a state.
  if (!legacy.residenceState || !isUsStateCode(String(legacy.residenceState))) {
    legacy.residenceState = "FL";
  }
  if (!isFilingStatus(legacy.filingStatus)) {
    legacy.filingStatus = "single";
  }
  if (!Array.isArray(legacy.expenses) && typeof legacy.monthlyExpenses === "number") {
    legacy.expenses = [
      {
        id: uid("exp"),
        label: "Living expenses",
        amount: legacy.monthlyExpenses,
        frequency: "monthly",
        growthRate: legacy.assumptions?.expenseGrowth ?? DEFAULT_EXPENSE_GROWTH,
      },
    ];
  }
  if (!Array.isArray(legacy.expenses)) legacy.expenses = [];
  delete legacy.monthlyExpenses;
  const healExpense = (expense: (typeof legacy.expenses)[number]) => {
    if (expense.startYear != null && !Number.isFinite(expense.startYear)) {
      delete expense.startYear;
    }
    if (expense.endYear != null && !Number.isFinite(expense.endYear)) {
      delete expense.endYear;
    }
  };
  for (const expense of legacy.expenses) healExpense(expense);

  legacy.deletedPeople = normalizeDeletedList(legacy.deletedPeople);
  legacy.deletedAccounts = normalizeDeletedList(legacy.deletedAccounts);
  legacy.deletedIncomes = normalizeDeletedList(legacy.deletedIncomes);
  legacy.deletedRealEstate = normalizeDeletedList(legacy.deletedRealEstate);
  legacy.deletedBusinesses = normalizeDeletedList(legacy.deletedBusinesses);
  legacy.deletedExpenses = normalizeDeletedList(legacy.deletedExpenses);
  for (const entry of legacy.deletedExpenses ?? []) healExpense(entry.item);
  for (const entry of legacy.deletedAccounts ?? []) {
    healAccountJoint(entry.item, legacy.filingStatus);
    healRetirementType(entry.item);
    healGrowthStart(entry.item);
  }

  for (const acc of legacy.accounts ?? []) {
    healAccountJoint(acc, legacy.filingStatus);
    healRetirementType(acc);
    healGrowthStart(acc);
    if (!Number.isFinite(acc.growthRate)) {
      acc.growthRate = DEFAULT_ACCOUNT_GROWTH[acc.kind] ?? 0;
    }
    // Deposits are newer than most saved plans. Default to an empty list, and
    // drop entries the engine couldn't place in time or size.
    acc.deposits = Array.isArray(acc.deposits)
      ? acc.deposits.filter(
          (d) =>
            d != null &&
            Number.isFinite(d.amount) &&
            Number.isFinite(d.startYear),
        )
      : [];
    for (const dep of acc.deposits) {
      if (!DEPOSIT_FREQUENCIES.includes(dep.frequency)) {
        dep.frequency = "monthly";
      }
      if (dep.endYear != null && !Number.isFinite(dep.endYear)) {
        delete dep.endYear;
      }
      // Deposit amounts used to escalate yearly; they are flat now.
      delete (dep as { growthRate?: number }).growthRate;
    }
  }
  // A person's sex is optional; anything but male / female is dropped.
  for (const person of legacy.people ?? []) {
    if (person.sex !== "male" && person.sex !== "female") delete person.sex;
  }
  // Long-term care settings get healed when read; drop only a broken shape.
  const care = legacy.longTermCare;
  if (
    care != null &&
    (typeof care !== "object" ||
      (care.who !== "one" && care.who !== "both") ||
      !Array.isArray(care.periods))
  ) {
    delete legacy.longTermCare;
  }
  // The Survivorship setting must name someone in the plan and a real age.
  const survivorship = legacy.survivorship;
  if (
    survivorship != null &&
    (typeof survivorship !== "object" ||
      !(legacy.people ?? []).some((p) => p.id === survivorship.personId) ||
      !Number.isFinite(survivorship.deathAge))
  ) {
    delete legacy.survivorship;
  }
  for (const inc of legacy.incomes ?? []) {
    if (!Number.isFinite(inc.growthRate)) inc.growthRate = 0;
    // Older pensions have no payout option and are life only. Anything other
    // than a valid pension choice is dropped.
    if (
      !isPensionIncome(inc.kind) ||
      (inc.pensionPayout !== "lifeOnly" && inc.pensionPayout !== "survivor")
    ) {
      delete inc.pensionPayout;
    }
    // Disability settings only belong on disability insurance; bad values
    // are dropped so the defaults (90 days, full) apply.
    const isDisability = inc.kind === "disabilityInsurance";
    if (!isDisability || !isDisabilityWaitingDays(inc.disabilityWaitingDays)) {
      delete inc.disabilityWaitingDays;
    }
    if (!isDisability || !isDisabilityCoverage(inc.disabilityCoverage)) {
      delete inc.disabilityCoverage;
    }
    // Heal withdrawal incomes that lost (or never got) a source account: when
    // exactly one account is eligible for the income's kind, link to it so the
    // engine debits a real balance instead of dropping the income as phantom
    // money. Ambiguous cases (zero or multiple eligible accounts) are left for
    // the user to resolve in the editor.
    // Only business income links to a business. An unlinked one in a plan
    // with exactly one business belongs to it.
    if (inc.kind !== "business" || typeof inc.businessId !== "string") {
      delete inc.businessId;
    }
    if (
      inc.kind === "business" &&
      !inc.businessId &&
      Array.isArray(legacy.businesses) &&
      legacy.businesses.length === 1
    ) {
      inc.businessId = legacy.businesses[0].id;
    }
    const sourceKinds = WITHDRAWAL_SOURCE_KINDS[inc.kind];
    if (sourceKinds && !inc.drawsFromAccountId) {
      const eligible = (legacy.accounts ?? []).filter((acc) =>
        sourceKinds.includes(acc.kind),
      );
      if (eligible.length === 1) inc.drawsFromAccountId = eligible[0].id;
    }
  }
  const healRealEstate = (re: (typeof legacy.realEstate)[number]) => {
    if (!Number.isFinite(re.appreciationRate)) {
      re.appreciationRate = DEFAULT_REAL_ESTATE_APPRECIATION;
    }
    if (!Number.isFinite(re.depreciationYears)) {
      re.depreciationYears = DEFAULT_DEPRECIATION_YEARS;
    }
    if (typeof re.activeParticipation !== "boolean") {
      re.activeParticipation = true;
    }
    if (re.growthStart != null && !isGrowthStart(re.growthStart)) {
      delete re.growthStart;
    }
  };
  for (const re of legacy.realEstate ?? []) healRealEstate(re);
  for (const entry of legacy.deletedRealEstate ?? []) {
    healRealEstate(entry.item);
  }
  if (typeof legacy.realEstateProfessional !== "boolean") {
    legacy.realEstateProfessional = false;
  }
  if (!Array.isArray(legacy.businesses)) legacy.businesses = [];
  const healBusiness = (biz: Business) => {
    if (!Number.isFinite(biz.value)) biz.value = 0;
    if (!Number.isFinite(biz.growthRate)) biz.growthRate = 0;
    if (biz.purchasePrice != null && !Number.isFinite(biz.purchasePrice)) {
      delete biz.purchasePrice;
    }
    if (biz.growthStart != null && !isGrowthStart(biz.growthStart)) {
      delete biz.growthStart;
    }
  };
  for (const biz of legacy.businesses) healBusiness(biz);
  for (const entry of legacy.deletedBusinesses ?? []) healBusiness(entry.item);

  // RMD starting age is derived from each person's birth year (SECURE /
  // SECURE 2.0) and the amount from the IRS Uniform Lifetime Table; drop the
  // legacy household-level overrides for both.
  if (legacy.assumptions && "rmdAge" in legacy.assumptions) {
    delete (legacy.assumptions as { rmdAge?: number }).rmdAge;
  }
  if (legacy.assumptions && "rmdRate" in legacy.assumptions) {
    delete (legacy.assumptions as { rmdRate?: number }).rmdRate;
  }

  // Older plans have no over-convertible toggle; default off (UI clamps).
  // Missing or unknown strategy defaults to manual (the conversion-step
  // editor). An empty manual schedule stays manual: the engine spreads the
  // convertible total evenly until the user edits a year.
  if (!legacy.optimizer) {
    legacy.optimizer = { strategy: "manual", allowOverConvertible: false };
  } else {
    if (typeof legacy.optimizer.allowOverConvertible !== "boolean") {
      legacy.optimizer.allowOverConvertible = false;
    }
    if (!isConversionStrategy(legacy.optimizer.strategy)) {
      legacy.optimizer.strategy = "manual";
    }
    if (legacy.optimizer.strategy === "fillBracket") {
      legacy.optimizer.targetBracketRate = resolveBracketRate(
        legacy.optimizer.targetBracketRate,
      );
    }
    // The shortfall cap is optional: anything but a non-negative number is off.
    const cap = legacy.optimizer.maxMonthlyShortfall;
    if (cap != null && !(Number.isFinite(cap) && cap >= 0)) {
      delete legacy.optimizer.maxMonthlyShortfall;
    }
    // Conversion tax is paid from income unless the plan says assets.
    const paidFrom = legacy.optimizer.conversionTaxPaidFrom;
    if (paidFrom != null && paidFrom !== "income" && paidFrom !== "assets") {
      delete legacy.optimizer.conversionTaxPaidFrom;
    }
  }

  return legacy;
}

type ListKey =
  | "people"
  | "accounts"
  | "incomes"
  | "realEstate"
  | "businesses"
  | "expenses";

/** Live list key paired with its soft-delete trash list. */
type SoftDeleteKey = ListKey;

const DELETED_KEY: Record<SoftDeleteKey, keyof Household> = {
  people: "deletedPeople",
  accounts: "deletedAccounts",
  incomes: "deletedIncomes",
  realEstate: "deletedRealEstate",
  businesses: "deletedBusinesses",
  expenses: "deletedExpenses",
};

/**
 * Older plans stored bare items in `deleted*`. Newer shape wraps each as
 * `{ item, deletedAt }`. Coerce either form into the current shape.
 */
function normalizeDeletedList<T extends { id: string }>(
  raw: unknown,
): DeletedItem<T>[] {
  if (!Array.isArray(raw)) return [];
  const out: DeletedItem<T>[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    // Current shape: { item, deletedAt }
    if (rec.item && typeof rec.item === "object" && "id" in (rec.item as object)) {
      out.push({
        item: rec.item as T,
        deletedAt:
          typeof rec.deletedAt === "string" && rec.deletedAt
            ? rec.deletedAt
            : new Date(0).toISOString(),
      });
      continue;
    }
    // Legacy bare item: { id, ... }
    if ("id" in rec && typeof rec.id === "string") {
      out.push({
        item: entry as T,
        deletedAt: new Date(0).toISOString(),
      });
    }
  }
  return out;
}

/** Snapshot of live-list ids that existed on the last persisted plan. */
type SavedListIds = Record<SoftDeleteKey, Set<string>>;

function savedListIdsFromHousehold(household: Household): SavedListIds {
  // Include trash ids so a soft-deleted item stays "previously saved" after
  // the plan autosaves (live lists no longer contain it).
  return {
    people: new Set([
      ...household.people.map((p) => p.id),
      ...(household.deletedPeople ?? []).map((e) => e.item.id),
    ]),
    accounts: new Set([
      ...household.accounts.map((a) => a.id),
      ...(household.deletedAccounts ?? []).map((e) => e.item.id),
    ]),
    incomes: new Set([
      ...household.incomes.map((i) => i.id),
      ...(household.deletedIncomes ?? []).map((e) => e.item.id),
    ]),
    realEstate: new Set([
      ...household.realEstate.map((r) => r.id),
      ...(household.deletedRealEstate ?? []).map((e) => e.item.id),
    ]),
    businesses: new Set([
      ...(household.businesses ?? []).map((b) => b.id),
      ...(household.deletedBusinesses ?? []).map((e) => e.item.id),
    ]),
    expenses: new Set([
      ...household.expenses.map((e) => e.id),
      ...(household.deletedExpenses ?? []).map((e) => e.item.id),
    ]),
  };
}

/** Append previously-saved dropped items to a trash list (UTC deletedAt). */
function appendSoftDeleted<T extends { id: string }>(
  trash: DeletedItem<T>[] | undefined,
  dropped: T[],
  savedIds: Set<string>,
  deletedAt: string,
): DeletedItem<T>[] {
  const existing = trash ?? [];
  const existingIds = new Set(existing.map((e) => e.item.id));
  const additions = dropped
    .filter((item) => savedIds.has(item.id) && !existingIds.has(item.id))
    .map((item) => ({ item, deletedAt }));
  if (additions.length === 0) return existing;
  return [...existing, ...additions];
}

function makeConfig(name: string, household: Household): SavedConfig {
  const now = Date.now();
  return { id: localId(), name, household, createdAt: now, updatedAt: now };
}

function seedHousehold(): Household {
  const household = createBlankHousehold();
  household.people[0].id = "p1"; // stable id for the seeded plan
  return household;
}

function seedConfig(): SavedConfig {
  return {
    id: "local-seed",
    name: "My plan",
    household: seedHousehold(),
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Stable fallback for selectors when the store has no plans yet (pre-auth). */
const EMPTY_CONFIG = seedConfig();

interface ScenarioState {
  configs: SavedConfig[];
  activeId: string;

  // Server/auth state.
  auth: {
    status: AuthStatus;
    userId: string | null;
    /** True while a superAdmin is viewing as another user. */
    impersonating: boolean;
  };
  /** Whether the user's plans have been fetched from the server. */
  loaded: boolean;
  /**
   * When set, the active plan shows a historical snapshot. Autosave and edits
   * are blocked until the user exits or restores.
   */
  revisionPreview: RevisionPreview | null;

  // Auth + persistence lifecycle.
  setAuth: (
    status: AuthStatus,
    userId: string | null,
    opts?: { impersonating?: boolean },
  ) => void;
  /** Load the signed-in user's plans (and claim any pre-login draft). */
  hydrate: () => Promise<void>;
  /**
   * Persist the active plan from the wizard's save/finish action. Returns
   * "needsAuth" when the user must sign in first (the draft is stashed so it
   * can be claimed right after authentication).
   */
  commitActive: (opts?: { source?: "edit" }) => Promise<CommitResult>;

  // Configuration management.
  newConfig: (name?: string) => string;
  /**
   * Remove in-memory plans that were never saved to the server.
   * Pass `keepId` to preserve the plan that cancel should restore to.
   */
  discardLocalDrafts: (keepId?: string | null) => void;
  duplicateConfig: (id?: string, name?: string) => void;
  loadConfig: (id: string) => void;
  deleteConfig: (id: string) => void;
  renameConfig: (id: string, name: string) => void;
  importConfig: (json: string, name?: string) => boolean;
  /** Serialize a config to JSON (defaults to the active config). */
  exportConfig: (id?: string) => string;
  resetActive: () => void;

  /** Load a revision snapshot into the editor without persisting. */
  enterRevisionPreview: (input: {
    planId: string;
    revisionId: string;
    createdAt: number;
    name: string;
    household: Household;
  }) => void;
  /** Discard the preview and put the live plan back. */
  exitRevisionPreview: () => void;
  /** Persist a revision via the restore API; clears preview when active. */
  restoreRevision: (planId: string, revisionId: string) => Promise<boolean>;
  /** Persist the currently previewed revision. */
  restoreRevisionPreview: () => Promise<boolean>;
  /** Update shareCount after the Share dialog changes members. */
  setPlanShareCount: (id: string, shareCount: number) => void;

  // Editing the active household.
  setFilingStatus: (status: FilingStatus) => void;
  setResidenceState: (state: UsStateCode) => void;
  setRealEstateProfessional: (value: boolean) => void;
  addExpense: (expense: Expense) => void;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  removeExpense: (id: string) => void;
  restoreExpense: (id: string) => void;
  discardDeletedExpense: (id: string) => void;
  addPerson: (person: Person) => void;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  removePerson: (id: string) => void;
  restorePerson: (id: string) => void;
  discardDeletedPerson: (id: string) => void;
  setMainPerson: (id: string) => void;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  restoreAccount: (id: string) => void;
  discardDeletedAccount: (id: string) => void;
  addDeposit: (accountId: string, deposit: Deposit) => void;
  updateDeposit: (
    accountId: string,
    depositId: string,
    patch: Partial<Deposit>,
  ) => void;
  removeDeposit: (accountId: string, depositId: string) => void;
  addIncome: (income: IncomeSource) => void;
  updateIncome: (id: string, patch: Partial<IncomeSource>) => void;
  removeIncome: (id: string) => void;
  restoreIncome: (id: string) => void;
  discardDeletedIncome: (id: string) => void;
  addRealEstate: (re: RealEstate) => void;
  updateRealEstate: (id: string, patch: Partial<RealEstate>) => void;
  removeRealEstate: (id: string) => void;
  restoreRealEstate: (id: string) => void;
  discardDeletedRealEstate: (id: string) => void;
  addBusiness: (business: Business) => void;
  updateBusiness: (id: string, patch: Partial<Business>) => void;
  removeBusiness: (id: string) => void;
  restoreBusiness: (id: string) => void;
  discardDeletedBusiness: (id: string) => void;
  setAssumptions: (patch: Partial<Assumptions>) => void;
  setOptimizer: (patch: Partial<OptimizerConfig>) => void;
  /** Survivorship analysis: which spouse passes and at what age. */
  setSurvivorship: (event: DeathEvent) => void;
  /** Long-term care analysis settings. */
  setLongTermCare: (settings: LongTermCareSettings) => void;
}

export const useScenario = create<ScenarioState>()((set, get) => {
  // --- Server sync helpers (in-memory; survive for the store's lifetime). ---
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Per-plan ids that existed on the last successful persist. Soft-delete only
   * keeps items whose id is in this set; never-saved drafts are hard-deleted.
   */
  const savedListIdsByPlan = new Map<string, SavedListIds>();

  const rememberSavedIds = (id: string, household: Household) => {
    savedListIdsByPlan.set(id, savedListIdsFromHousehold(household));
  };

  /** PUT the current state of a server-backed plan. */
  const flushSave = async (id: string, opts?: { source?: "edit" }) => {
    const state = get();
    if (state.revisionPreview) return;
    if (state.auth.status !== "authenticated") return;
    if (isDefaultPlanId(id) || isLocalId(id)) return;
    const config = state.configs.find((c) => c.id === id);
    if (!config) return;
    try {
      const res = await fetch(withBasePath(`/api/plans/${encodeURIComponent(id)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: config.name,
          household: config.household,
          ...(opts?.source === "edit" ? { source: "edit" } : {}),
        }),
      });
      if (!res.ok) return;
      rememberSavedIds(id, config.household);
      useToast.getState().show("Saved", "success");
    } catch {
      // Network errors are swallowed; the next edit will retry the save.
    }
  };

  /** Debounce a save for a plan that just changed. */
  const scheduleSave = (id: string) => {
    if (get().revisionPreview) return;
    if (isDefaultPlanId(id) || isLocalId(id)) return;
    if (get().auth.status !== "authenticated") return;
    const existing = saveTimers.get(id);
    if (existing) clearTimeout(existing);
    saveTimers.set(
      id,
      setTimeout(() => {
        saveTimers.delete(id);
        void flushSave(id);
      }, AUTOSAVE_MS),
    );
  };

  /** POST a local plan to the server and swap its id for the server id. */
  const createOnServer = async (
    config: SavedConfig,
  ): Promise<SavedConfig | null> => {
    try {
      const res = await fetch(withBasePath("/api/plans"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: config.name, household: config.household }),
      });
      if (!res.ok) return null;
      const { plan } = (await res.json()) as { plan: SavedConfig };
      savedListIdsByPlan.delete(config.id);
      rememberSavedIds(plan.id, plan.household);
      set((state) => ({
        configs: state.configs.map((c) => (c.id === config.id ? plan : c)),
        activeId: state.activeId === config.id ? plan.id : state.activeId,
      }));
      useToast.getState().show("Saved", "success");
      return plan;
    } catch {
      return null;
    }
  };

  const configById = (id: string) =>
    get().configs.find((c) => c.id === id);

  /** Sample plans and viewers are read-only; local drafts are always editable. */
  const mayEdit = (id: string): boolean => {
    if (isDefaultPlanId(id)) return false;
    if (isLocalId(id)) return true;
    return canEditPlan(configById(id)?.role);
  };

  /**
   * Apply a recipe to the active household and bump its timestamp. Sample plans
   * and viewer roles are read-only. Server-backed plans autosave. Blocked while
   * previewing a historical revision.
   */
  const editActive = (recipe: (h: Household) => Household) => {
    const { activeId, revisionPreview } = get();
    if (revisionPreview) return;
    if (!mayEdit(activeId)) return;
    set((state) => ({
      configs: state.configs.map((c) =>
        c.id === state.activeId
          ? { ...c, household: recipe(c.household), updatedAt: Date.now() }
          : c,
      ),
    }));
    scheduleSave(activeId);
  };

  const addTo = <K extends ListKey>(
    key: K,
    item: NonNullable<Household[K]>[number],
  ) =>
    editActive((h) => ({
      ...h,
      [key]: [...((h[key] as NonNullable<Household[K]>) ?? []), item],
    }));

  const patchIn = (
    key: ListKey,
    id: string,
    patch: Record<string, unknown>,
  ) =>
    editActive((h) => ({
      ...h,
      [key]: ((h[key] as { id: string }[]) ?? []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));

  /** Rewrite one account's deposit list. */
  const editDeposits = (
    accountId: string,
    recipe: (deposits: Deposit[]) => Deposit[],
  ) =>
    editActive((h) => ({
      ...h,
      accounts: h.accounts.map((account) =>
        account.id === accountId
          ? { ...account, deposits: recipe(account.deposits ?? []) }
          : account,
      ),
    }));

  /**
   * Remove a live item. Previously-persisted items go to restore trash with a
   * UTC `deletedAt`; never-saved drafts are hard-deleted.
   */
  const softDeleteIn = (key: SoftDeleteKey, id: string) =>
    editActive((h) => {
      const live = (h[key] as { id: string }[]) ?? [];
      const item = live.find((x) => x.id === id);
      if (!item) return h;
      const nextLive = live.filter((x) => x.id !== id);
      const savedIds =
        savedListIdsByPlan.get(get().activeId)?.[key] ?? new Set<string>();
      if (!savedIds.has(id)) {
        return { ...h, [key]: nextLive };
      }
      const trashKey = DELETED_KEY[key];
      const trash = (h[trashKey] as DeletedItem<{ id: string }>[]) ?? [];
      return {
        ...h,
        [key]: nextLive,
        [trashKey]: [
          ...trash,
          { item, deletedAt: new Date().toISOString() },
        ],
      };
    });

  /** Move an item from soft-delete trash back onto the live list. */
  const restoreIn = (key: SoftDeleteKey, id: string) =>
    editActive((h) => {
      const trashKey = DELETED_KEY[key];
      const trash = (h[trashKey] as DeletedItem<{ id: string }>[]) ?? [];
      const entry = trash.find((x) => x.item.id === id);
      if (!entry) return h;
      const live = (h[key] as { id: string }[]) ?? [];
      // Avoid duplicates if the id somehow already exists on the live list.
      if (live.some((x) => x.id === id)) {
        return { ...h, [trashKey]: trash.filter((x) => x.item.id !== id) };
      }
      return {
        ...h,
        [trashKey]: trash.filter((x) => x.item.id !== id),
        [key]: [...live, entry.item],
      };
    });

  /** Permanently drop an item from soft-delete trash (no restore). */
  const discardDeletedIn = (key: SoftDeleteKey, id: string) =>
    editActive((h) => {
      const trashKey = DELETED_KEY[key];
      const trash = (h[trashKey] as DeletedItem<{ id: string }>[]) ?? [];
      if (!trash.some((x) => x.item.id === id)) return h;
      return {
        ...h,
        [trashKey]: trash.filter((x) => x.item.id !== id),
      };
    });

  return {
    // Empty until hydrate runs after authentication.
    configs: [],
    activeId: "",
    auth: { status: "loading", userId: null, impersonating: false },
    loaded: false,
    revisionPreview: null,

    setAuth: (status, userId, opts) => {
      const prev = get().auth;
      const impersonating = Boolean(opts?.impersonating);
      set({ auth: { status, userId, impersonating } });
      if (status === "authenticated") {
        clearInviteGuestSession();
        // First load, or switched account (impersonation start/stop).
        if (!get().loaded || (userId && userId !== prev.userId)) {
          set({ loaded: false, revisionPreview: null });
          void get().hydrate();
          return;
        }
      }
      // Signed out: empty store, unless this tab landed via `?invite=`.
      // (Invite cookie alone is not enough; it can linger from an earlier visit.)
      if (status === "anonymous") {
        if (hasInviteGuestSession()) {
          const { configs, loaded } = get();
          const hasLocalDraft = configs.some((c) => isLocalId(c.id));
          if (hasLocalDraft && loaded) {
            set({
              auth: { status, userId: null, impersonating: false },
              revisionPreview: null,
            });
            return;
          }
          const fresh = seedConfig();
          set({
            configs: [fresh],
            activeId: fresh.id,
            loaded: true,
            revisionPreview: null,
            auth: { status, userId: null, impersonating: false },
          });
          return;
        }
        set({
          configs: [],
          activeId: "",
          loaded: false,
          revisionPreview: null,
          auth: { status, userId: null, impersonating: false },
        });
      }
    },

    hydrate: async () => {
      if (get().auth.status !== "authenticated") return;

      // Claim a plan that was built before signing in, if any.
      // Never claim into an impersonated account.
      let pending: { name: string; household: Household } | null = null;
      if (!get().auth.impersonating) {
        try {
          const raw = localStorage.getItem(PENDING_KEY);
          if (raw) pending = JSON.parse(raw);
        } catch {
          pending = null;
        }
      }
      if (pending) {
        let claimed = false;
        try {
          const claimRes = await fetch(withBasePath("/api/plans"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pending),
          });
          claimed = claimRes.ok;
        } catch {
          claimed = false;
        }
        // Keep the draft if claim failed (e.g. access still pending).
        if (claimed) {
          try {
            localStorage.removeItem(PENDING_KEY);
          } catch {
            // ignore
          }
        }
      }

      try {
        const res = await fetch(withBasePath("/api/plans"));
        if (!res.ok) {
          set({ loaded: true });
          return;
        }
        const { plans } = (await res.json()) as { plans: SavedConfig[] };
        if (Array.isArray(plans) && plans.length > 0) {
          // Bring older server-stored plans up to the current shape (e.g. heal
          // withdrawal incomes missing a source account) before they're used.
          const migrated = plans.map((p) => ({
            ...p,
            household: migrateHousehold(clone(p.household)),
          }));
          for (const p of migrated) rememberSavedIds(p.id, p.household);
          const preferred = readPlanIdFromWindow();
          set({
            configs: migrated,
            activeId: pickHydrateActiveId(migrated, preferred),
            loaded: true,
            revisionPreview: null,
          });
          return;
        }
        const fresh = seedConfig();
        set({
          configs: [fresh],
          activeId: fresh.id,
          loaded: true,
          revisionPreview: null,
        });
      } catch {
        set({ loaded: true });
      }
    },

    commitActive: async (opts) => {
      const state = get();
      if (state.revisionPreview) return "saved";
      const active = state.configs.find((c) => c.id === state.activeId);
      if (!active || isDefaultPlanId(active.id)) return "saved";

      if (state.auth.status === "authenticated") {
        if (isLocalId(active.id)) {
          await createOnServer(active);
        } else {
          await flushSave(active.id, opts);
        }
        return "saved";
      }

      // Signed out: stash the draft so it can be claimed right after sign-in.
      try {
        localStorage.setItem(
          PENDING_KEY,
          JSON.stringify({ name: active.name, household: active.household }),
        );
      } catch {
        // ignore
      }
      return "needsAuth";
    },

    newConfig: (name = "") => {
      const config = makeConfig(name.trim(), createBlankHousehold());
      set((state) => ({
        configs: [...state.configs, config],
        activeId: config.id,
      }));
      return config.id;
    },
    discardLocalDrafts: (keepId = null) => {
      const ids = get()
        .configs.filter((c) => isLocalId(c.id) && c.id !== keepId)
        .map((c) => c.id);
      for (const id of ids) {
        get().deleteConfig(id);
      }
    },
    duplicateConfig: (id, name) => {
      const state = get();
      const targetId = id ?? state.activeId;
      const source =
        [...DEFAULT_PLANS, ...state.configs].find((c) => c.id === targetId) ??
        state.configs[0];
      const config = makeConfig(
        name?.trim() || `${source.name} copy`,
        clone(source.household),
      );
      set((s) => ({
        configs: [...s.configs, config],
        activeId: config.id,
      }));
      if (get().auth.status === "authenticated") {
        void createOnServer(config);
      }
    },
    loadConfig: (id) => {
      const preview = get().revisionPreview;
      if (preview) {
        // Leaving a plan while previewing restores its live snapshot first.
        get().exitRevisionPreview();
      }
      set({ activeId: id });
    },
    deleteConfig: (id) => {
      if (isDefaultPlanId(id)) return; // samples can't be deleted
      const state = get();
      const target = state.configs.find((c) => c.id === id);
      if (
        target &&
        !isLocalId(id) &&
        !canDeletePlan(target.role)
      ) {
        return;
      }
      if (state.revisionPreview?.planId === id) {
        set({ revisionPreview: null });
      }
      if (state.auth.status === "authenticated" && !isLocalId(id)) {
        void fetch(withBasePath(`/api/plans/${encodeURIComponent(id)}`), {
          method: "DELETE",
        }).catch(() => {});
      }
      const remaining = state.configs.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = makeConfig("New plan", createBlankHousehold());
        set({ configs: [fresh], activeId: fresh.id, revisionPreview: null });
        if (state.auth.status === "authenticated") void createOnServer(fresh);
        return;
      }
      const activeId = state.activeId === id ? remaining[0].id : state.activeId;
      set({ configs: remaining, activeId });
    },
    renameConfig: (id, name) => {
      if (get().revisionPreview) return;
      if (isDefaultPlanId(id)) return; // samples can't be renamed
      const target = get().configs.find((c) => c.id === id);
      if (target && !isLocalId(id) && !canRenamePlan(target.role)) return;
      set((state) => ({
        configs: state.configs.map((c) =>
          c.id === id ? { ...c, name, updatedAt: Date.now() } : c,
        ),
      }));
      scheduleSave(id);
    },
    setPlanShareCount: (id, shareCount) => {
      set((state) => ({
        configs: state.configs.map((c) =>
          c.id === id ? { ...c, shareCount } : c,
        ),
      }));
    },
    enterRevisionPreview: ({
      planId,
      revisionId,
      createdAt,
      name,
      household,
    }) => {
      const state = get();
      if (isDefaultPlanId(planId) || isLocalId(planId)) return;
      const config = state.configs.find((c) => c.id === planId);
      if (!config) return;

      // Nested preview: keep the original live stash, swap the shown snapshot.
      const liveName = state.revisionPreview?.liveName ?? config.name;
      const liveHousehold =
        state.revisionPreview?.liveHousehold ?? clone(config.household);

      set({
        activeId: planId,
        revisionPreview: {
          planId,
          revisionId,
          createdAt,
          liveName,
          liveHousehold,
        },
        configs: state.configs.map((c) =>
          c.id === planId
            ? {
                ...c,
                name,
                household: migrateHousehold(clone(household)),
              }
            : c,
        ),
      });
    },
    exitRevisionPreview: () => {
      const preview = get().revisionPreview;
      if (!preview) return;
      set((state) => ({
        revisionPreview: null,
        configs: state.configs.map((c) =>
          c.id === preview.planId
            ? {
                ...c,
                name: preview.liveName,
                household: clone(preview.liveHousehold),
              }
            : c,
        ),
      }));
    },
    restoreRevision: async (planId, revisionId) => {
      if (isDefaultPlanId(planId) || isLocalId(planId)) return false;
      try {
        const res = await fetch(
          withBasePath(
            `/api/plans/${encodeURIComponent(planId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
          ),
          { method: "POST" },
        );
        if (!res.ok) return false;
        const { plan } = (await res.json()) as { plan: SavedConfig };
        const migrated = {
          ...plan,
          household: migrateHousehold(clone(plan.household)),
        };
        rememberSavedIds(migrated.id, migrated.household);
        set((state) => ({
          revisionPreview: null,
          activeId: migrated.id,
          configs: state.configs.map((c) =>
            c.id === planId ? migrated : c,
          ),
        }));
        useToast.getState().show("Restored version", "success");
        return true;
      } catch {
        return false;
      }
    },
    restoreRevisionPreview: async () => {
      const preview = get().revisionPreview;
      if (!preview) return false;
      return get().restoreRevision(preview.planId, preview.revisionId);
    },
    importConfig: (json, name) => {
      try {
        const parsed = JSON.parse(json) as Partial<SavedConfig>;
        if (!parsed.household) return false;
        const config = makeConfig(
          name?.trim() || parsed.name || "Imported plan",
          migrateHousehold(clone(parsed.household)),
        );
        set((state) => ({
          configs: [...state.configs, config],
          activeId: config.id,
        }));
        if (get().auth.status === "authenticated") void createOnServer(config);
        return true;
      } catch {
        return false;
      }
    },
    exportConfig: (id) => {
      const state = get();
      const config = resolveConfig(state.configs, id ?? state.activeId);
      return JSON.stringify(config, null, 2);
    },
    resetActive: () => {
      if (get().revisionPreview) return;
      editActive(() => clone(SAMPLE_HOUSEHOLD));
    },

    setResidenceState: (state) =>
      editActive((h) => ({ ...h, residenceState: state })),

    setRealEstateProfessional: (value) =>
      editActive((h) => ({ ...h, realEstateProfessional: value })),

    setFilingStatus: (status) =>
      editActive((h) => {
        const next = applyFilingStatus(h, status);
        // Soft-delete people (and their accounts/incomes) dropped by the
        // filing-status change when they existed on a previously saved plan.
        const saved =
          savedListIdsByPlan.get(get().activeId) ??
          ({
            people: new Set<string>(),
            accounts: new Set<string>(),
            incomes: new Set<string>(),
            realEstate: new Set<string>(),
            businesses: new Set<string>(),
            expenses: new Set<string>(),
          } satisfies SavedListIds);
        const keptPeople = new Set(next.people.map((p) => p.id));
        const keptAccounts = new Set(next.accounts.map((a) => a.id));
        const keptIncomes = new Set(next.incomes.map((i) => i.id));
        const deletedAt = new Date().toISOString();
        return {
          ...next,
          deletedPeople: appendSoftDeleted(
            h.deletedPeople,
            h.people.filter((p) => !keptPeople.has(p.id)),
            saved.people,
            deletedAt,
          ),
          deletedAccounts: appendSoftDeleted(
            h.deletedAccounts,
            h.accounts.filter((a) => !keptAccounts.has(a.id)),
            saved.accounts,
            deletedAt,
          ),
          deletedIncomes: appendSoftDeleted(
            h.deletedIncomes,
            h.incomes.filter((i) => !keptIncomes.has(i.id)),
            saved.incomes,
            deletedAt,
          ),
        };
      }),

    addExpense: (expense) => addTo("expenses", expense),
    updateExpense: (id, patch) => patchIn("expenses", id, patch),
    removeExpense: (id) => softDeleteIn("expenses", id),
    restoreExpense: (id) => restoreIn("expenses", id),
    discardDeletedExpense: (id) => discardDeletedIn("expenses", id),

    addPerson: (person) =>
      editActive((h) =>
        h.people.length >= maxPeople(h.filingStatus)
          ? h
          : { ...h, people: [...h.people, person] },
      ),
    updatePerson: (id, patch) => patchIn("people", id, patch),
    removePerson: (id) =>
      editActive((h) => {
        if (h.people.length <= 1) return h;
        const person = h.people.find((p) => p.id === id);
        if (!person) return h;
        const people = h.people.filter((p) => p.id !== id);
        // Never leave the plan without a main person: when the main person is
        // removed, hand the designation to whoever remains.
        const mainPersonId =
          h.mainPersonId === id ? people[0].id : h.mainPersonId;
        const savedIds =
          savedListIdsByPlan.get(get().activeId)?.people ?? new Set<string>();
        if (!savedIds.has(id)) {
          return { ...h, people, mainPersonId };
        }
        return {
          ...h,
          people,
          mainPersonId,
          deletedPeople: [
            ...(h.deletedPeople ?? []),
            { item: person, deletedAt: new Date().toISOString() },
          ],
        };
      }),
    restorePerson: (id) =>
      editActive((h) => {
        if (h.people.length >= maxPeople(h.filingStatus)) return h;
        const trash = h.deletedPeople ?? [];
        const entry = trash.find((x) => x.item.id === id);
        if (!entry) return h;
        if (h.people.some((p) => p.id === id)) {
          return {
            ...h,
            deletedPeople: trash.filter((x) => x.item.id !== id),
          };
        }
        return {
          ...h,
          deletedPeople: trash.filter((x) => x.item.id !== id),
          people: [...h.people, entry.item],
        };
      }),
    discardDeletedPerson: (id) => discardDeletedIn("people", id),
    setMainPerson: (id) =>
      editActive((h) =>
        h.people.some((p) => p.id === id) ? { ...h, mainPersonId: id } : h,
      ),

    addAccount: (account) => addTo("accounts", account),
    updateAccount: (id, patch) => patchIn("accounts", id, patch),
    removeAccount: (id) => softDeleteIn("accounts", id),
    restoreAccount: (id) => restoreIn("accounts", id),
    discardDeletedAccount: (id) => discardDeletedIn("accounts", id),

    // Deposits live inside their account, so they are edited through the
    // account and hard-deleted (no soft-delete trash of their own).
    addDeposit: (accountId, deposit) =>
      editDeposits(accountId, (deposits) => [...deposits, deposit]),
    updateDeposit: (accountId, depositId, patch) =>
      editDeposits(accountId, (deposits) =>
        deposits.map((d) => (d.id === depositId ? { ...d, ...patch } : d)),
      ),
    removeDeposit: (accountId, depositId) =>
      editDeposits(accountId, (deposits) =>
        deposits.filter((d) => d.id !== depositId),
      ),

    addIncome: (income) => addTo("incomes", income),
    updateIncome: (id, patch) => patchIn("incomes", id, patch),
    removeIncome: (id) => softDeleteIn("incomes", id),
    restoreIncome: (id) => restoreIn("incomes", id),
    discardDeletedIncome: (id) => discardDeletedIn("incomes", id),

    addRealEstate: (re) => addTo("realEstate", re),
    updateRealEstate: (id, patch) => patchIn("realEstate", id, patch),
    removeRealEstate: (id) => softDeleteIn("realEstate", id),
    restoreRealEstate: (id) => restoreIn("realEstate", id),
    discardDeletedRealEstate: (id) => discardDeletedIn("realEstate", id),

    addBusiness: (business) => addTo("businesses", business),
    updateBusiness: (id, patch) => patchIn("businesses", id, patch),
    removeBusiness: (id) => softDeleteIn("businesses", id),
    restoreBusiness: (id) => restoreIn("businesses", id),
    discardDeletedBusiness: (id) => discardDeletedIn("businesses", id),

    setAssumptions: (patch) =>
      editActive((h) => ({
        ...h,
        assumptions: { ...h.assumptions, ...patch },
      })),
    setOptimizer: (patch) =>
      editActive((h) => ({
        ...h,
        optimizer: { ...h.optimizer, ...patch },
      })),
    setSurvivorship: (event) =>
      editActive((h) => ({ ...h, survivorship: { ...event } })),
    setLongTermCare: (settings) =>
      editActive((h) => ({
        ...h,
        longTermCare: {
          ...settings,
          periods: settings.periods.map((p) => ({ ...p })),
        },
      })),
  };
});

/** Resolve a config by id, including any read-only sample plans. */
function resolveConfig(
  configs: SavedConfig[],
  activeId: string,
): SavedConfig {
  return (
    DEFAULT_PLANS.find((c) => c.id === activeId) ??
    configs.find((c) => c.id === activeId) ??
    configs[0] ??
    EMPTY_CONFIG
  );
}

/** The currently active household (what every editor reads and writes). */
export function useHousehold(): Household {
  return useScenario((s) => resolveConfig(s.configs, s.activeId).household);
}

/** The active saved configuration (id, name, timestamps). */
export function useActiveConfig(): SavedConfig {
  return useScenario((s) => resolveConfig(s.configs, s.activeId));
}

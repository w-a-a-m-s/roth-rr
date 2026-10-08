"use client";

import { create } from "zustand";
import { isDefaultPlanId } from "@/lib/config/defaultPlans";
import { isUntouchedHousehold } from "@/lib/domain/household";
import {
  hasInviteGuestSession,
  readInviteCodeFromDocument,
} from "@/lib/inviteCookie";
import { withBasePath } from "@/lib/basePath";
import { useScenario } from "@/store/useScenario";

/** Verify the saved invite code before jumping straight to account creation. */
async function verifyInviteCode(
  code: string,
): Promise<{ usable: boolean; email: string | null } | null> {
  try {
    const res = await fetch(
      `${withBasePath("/api/invite-lookup")}?code=${encodeURIComponent(code)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      usable?: boolean;
      email?: string | null;
    };
    return { usable: Boolean(data.usable), email: data.email ?? null };
  } catch {
    return null;
  }
}

type PlanModalMode = "new" | "edit";

interface PlanModalState {
  open: boolean;
  mode: PlanModalMode;
  /** Step index the modal should open on. */
  stepIndex: number;
}

type NameModalMode = "new" | "firstRun" | "duplicate";

interface NameModalState {
  open: boolean;
  mode: NameModalMode;
  /** Plan being duplicated when mode is "duplicate". */
  sourceId: string | null;
}

/** Which analysis the results show. All of them run from the same plan. */
export type AnalysisKind =
  | "retirement"
  | "survivorship"
  | "disability"
  | "longTermCare";

interface UIState {
  analysis: AnalysisKind;
  setAnalysis: (analysis: AnalysisKind) => void;
  planModal: PlanModalState;
  nameModal: NameModalState;
  /**
   * Auth modal screen: login / register / createAccount, or null when closed.
   */
  authModalKind: "login" | "register" | "createAccount" | null;
  /** Prefill email for auth modal flows. */
  authModalEmail: string | null;
  /** Whether the product feedback form is open. */
  feedbackOpen: boolean;
  /** Mobile Plan details modal (picker, strategies, summary). */
  planDetailsOpen: boolean;
  /** Id of the draft config created in "new" mode (removed if cancelled). */
  draftId: string | null;
  /** Active config to restore if a "new" draft is cancelled. */
  prevActiveId: string | null;

  /** Open the name modal first; the wizard opens after a unique name is chosen. */
  openNewPlan: () => void;
  /** Open the editor in "edit" mode on the active plan at a given step. */
  openEditPlan: (stepIndex?: number) => void;
  /**
   * No-plan mode: forced name prompt on the existing blank plan, then the
   * guided wizard. Cannot be dismissed until the plan is created.
   */
  openFirstRun: () => void;
  /** Name the copy first; duplicate runs only after a unique name is chosen. */
  openDuplicatePlan: (sourceId: string) => void;
  /** After a unique name is chosen: create/rename/duplicate and continue. */
  confirmPlanName: (name: string) => void;
  /** Dismiss the name modal without opening the wizard (no-op in firstRun). */
  cancelNameModal: () => void;
  /** Commit and close. Prompts sign-in first if the plan isn't saved yet. */
  finishPlanModal: () => Promise<void>;
  /** Close leftover wizard/sign-in modals once the user is authenticated. */
  forceCloseModals: () => void;
  /** Close and discard a "new" draft, restoring the previous active plan. */
  cancelPlanModal: () => void;

  openLoginModal: (email?: string | null) => void;
  openRegisterModal: (email?: string | null) => void;
  openCreateAccountModal: (email?: string | null) => void;
  setAuthModalKind: (
    kind: "login" | "register" | "createAccount",
    email?: string | null,
  ) => void;
  /** @deprecated use openLoginModal */
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openFeedback: () => void;
  closeFeedback: () => void;
  openPlanDetails: () => void;
  closePlanDetails: () => void;
}

const CLOSED: PlanModalState = { open: false, mode: "edit", stepIndex: 0 };
const NAME_CLOSED: NameModalState = {
  open: false,
  mode: "new",
  sourceId: null,
};

function openNameModal(mode: NameModalMode, sourceId: string | null = null) {
  return {
    nameModal: { open: true, mode, sourceId },
    planModal: CLOSED,
    planDetailsOpen: false,
    draftId: null,
    prevActiveId: null,
  };
}

/** Discard an in-progress create-plan draft and restore the prior active plan. */
function flushPreviousDraft(get: () => UIState) {
  const { draftId, prevActiveId } = get();
  if (!draftId) return;
  const scenario = useScenario.getState();
  scenario.deleteConfig(draftId);
  if (
    prevActiveId &&
    useScenario.getState().configs.some((c) => c.id === prevActiveId)
  ) {
    useScenario.getState().loadConfig(prevActiveId);
  }
}

export const useUI = create<UIState>((set, get) => ({
  analysis: "retirement",
  setAnalysis: (analysis) => set({ analysis }),
  planModal: CLOSED,
  nameModal: NAME_CLOSED,
  authModalKind: null,
  authModalEmail: null,
  feedbackOpen: false,
  planDetailsOpen: false,
  draftId: null,
  prevActiveId: null,

  openNewPlan: () => {
    // Drop any leftover create-plan draft before starting another.
    flushPreviousDraft(get);
    const scenario = useScenario.getState();
    const active = scenario.configs.find((c) => c.id === scenario.activeId);
    // Reuse the placeholder blank instead of stacking another empty draft.
    if (
      active &&
      !isDefaultPlanId(active.id) &&
      isUntouchedHousehold(active.household)
    ) {
      scenario.discardLocalDrafts(scenario.activeId);
      set(openNameModal("firstRun"));
      return;
    }
    scenario.discardLocalDrafts(scenario.activeId);
    set(openNameModal("new"));
  },

  openEditPlan: (stepIndex = 0) =>
    set({
      planModal: { open: true, mode: "edit", stepIndex },
      nameModal: NAME_CLOSED,
      planDetailsOpen: false,
      draftId: null,
      prevActiveId: null,
    }),

  openFirstRun: () => set(openNameModal("firstRun")),

  openDuplicatePlan: (sourceId) => {
    flushPreviousDraft(get);
    set(openNameModal("duplicate", sourceId));
  },

  confirmPlanName: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { nameModal } = get();
    if (!nameModal.open) return;
    const scenario = useScenario.getState();

    if (nameModal.mode === "duplicate") {
      if (!nameModal.sourceId) return;
      scenario.duplicateConfig(nameModal.sourceId, trimmed);
      set({ nameModal: NAME_CLOSED });
      return;
    }

    if (nameModal.mode === "firstRun") {
      scenario.renameConfig(scenario.activeId, trimmed);
      set({
        nameModal: NAME_CLOSED,
        planModal: { open: true, mode: "new", stepIndex: 0 },
        draftId: null,
        prevActiveId: null,
      });
      return;
    }

    // Flush any prior create draft, then keep only the plan cancel restores to.
    flushPreviousDraft(get);
    const fresh = useScenario.getState();
    const prevActiveId = fresh.activeId;
    fresh.discardLocalDrafts(prevActiveId);
    const draftId = useScenario.getState().newConfig(trimmed);
    set({
      nameModal: NAME_CLOSED,
      planModal: { open: true, mode: "new", stepIndex: 0 },
      draftId,
      prevActiveId,
    });
  },

  cancelNameModal: () => {
    const { nameModal } = get();
    // Forced first-plan flow cannot be dismissed.
    if (nameModal.mode === "firstRun") return;
    set({ nameModal: NAME_CLOSED });
  },

  finishPlanModal: async () => {
    const { planModal } = get();
    const result = await useScenario.getState().commitActive(
      planModal.mode === "edit" ? { source: "edit" } : undefined,
    );
    if (result !== "needsAuth") {
      set({ planModal: CLOSED, draftId: null, prevActiveId: null });
      return;
    }
    // Plan is stashed in PENDING_KEY until the user signs in.
    if (!hasInviteGuestSession()) {
      set({ authModalKind: "login", authModalEmail: null });
      return;
    }
    // Invite-link guest: verify the code and jump straight to account
    // creation instead of a bare login prompt.
    const code = readInviteCodeFromDocument();
    const lookup = code ? await verifyInviteCode(code) : null;
    if (lookup?.usable) {
      set({ authModalKind: "createAccount", authModalEmail: lookup.email });
      return;
    }
    // Code is missing or no longer usable: fall back to the email invite check.
    set({ authModalKind: "register", authModalEmail: null });
  },

  forceCloseModals: () =>
    set({
      planModal: CLOSED,
      nameModal: NAME_CLOSED,
      authModalKind: null,
      authModalEmail: null,
      planDetailsOpen: false,
      draftId: null,
      prevActiveId: null,
    }),

  cancelPlanModal: () => {
    const { draftId, prevActiveId, planModal } = get();
    // Forced first-plan wizard (new mode, no draft) cannot be dismissed.
    if (planModal.mode === "new" && !draftId) return;
    if (draftId) {
      const scenario = useScenario.getState();
      scenario.deleteConfig(draftId);
      if (prevActiveId) scenario.loadConfig(prevActiveId);
    }
    set({ planModal: CLOSED, draftId: null, prevActiveId: null });
  },

  openLoginModal: (email) =>
    set({
      authModalKind: "login",
      authModalEmail: email?.trim() || null,
    }),
  openRegisterModal: (email) =>
    set({
      authModalKind: "register",
      authModalEmail: email?.trim() || null,
    }),
  openCreateAccountModal: (email) =>
    set({
      authModalKind: "createAccount",
      authModalEmail: email?.trim() || null,
    }),
  setAuthModalKind: (kind, email) =>
    set({
      authModalKind: kind,
      ...(email !== undefined
        ? { authModalEmail: email?.trim() || null }
        : {}),
    }),
  openAuthModal: () =>
    set({ authModalKind: "login", authModalEmail: null }),
  closeAuthModal: () =>
    set({
      authModalKind: null,
      authModalEmail: null,
    }),
  openFeedback: () => set({ feedbackOpen: true }),
  closeFeedback: () => set({ feedbackOpen: false }),
  openPlanDetails: () => set({ planDetailsOpen: true }),
  closePlanDetails: () => set({ planDetailsOpen: false }),
}));

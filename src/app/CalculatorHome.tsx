"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, userNeedsName } from "@/lib/auth/client";
import { DeviceNotice } from "@/components/DeviceNotice";
import { TopBar } from "@/components/TopBar";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { MobileActionBar } from "@/components/plan/MobileActionBar";
import { MobileResultsChrome } from "@/components/plan/MobileResultsChrome";
import { RevisionPreviewBanner } from "@/components/plan/RevisionPreviewBanner";
import { PlanSummary } from "@/components/plan/PlanSummary";
import { PlanModal } from "@/components/plan/PlanModal";
import { PlanNameModal } from "@/components/plan/PlanNameModal";
import { AuthModal } from "@/components/auth/AuthModal";
import { ProfileNameModal } from "@/components/auth/ProfileNameModal";
import { InviteCodeCapture } from "@/components/invites/InviteCodeCapture";
import { AuthSync } from "@/components/AuthSync";
import { PlanUrlSync } from "@/components/PlanUrlSync";
import { PlanDocumentTitle } from "@/components/PlanDocumentTitle";
import { ResultsView } from "@/components/results/ResultsView";
import { Footer } from "@/components/Footer";
import { FeedbackFab } from "@/components/FeedbackFab";
import { useLgUp } from "@/lib/useLgUp";
import { useMounted } from "@/lib/useMounted";
import { hasInviteGuestSession } from "@/lib/inviteCookie";
import { useActiveConfig, useHousehold, useScenario } from "@/store/useScenario";
import { isDefaultPlanId } from "@/lib/config/defaultPlans";
import { isUntouchedHousehold } from "@/lib/domain/household";
import { readPlanIdFromWindow } from "@/lib/planUrl";
import { useUI } from "@/store/useUI";
import { LabsLoading, LegalQueryModal } from "@/lib/common/client";

/** Shared calculator shell for `/` and `/[publicId]`. */
export default function CalculatorHome() {
  const mounted = useMounted();
  const { ready: lgReady, lgUp } = useLgUp();
  const { data: session } = useSession();
  const status = useScenario((s) => s.auth.status);
  const loaded = useScenario((s) => s.loaded);
  const household = useHousehold();
  const active = useActiveConfig();
  const revisionPreview = useScenario((s) => s.revisionPreview);
  const nameOpen = useUI((s) => s.nameModal.open);
  const planOpen = useUI((s) => s.planModal.open);
  const openLoginModal = useUI((s) => s.openLoginModal);
  const openRegisterModal = useUI((s) => s.openRegisterModal);
  const prevStatus = useRef(status);
  const [profileNameSaved, setProfileNameSaved] = useState<string | null>(null);
  const [inviteGuest, setInviteGuest] = useState(false);
  const impersonating = Boolean(session?.impersonation?.active);
  const needsProfileName =
    status === "authenticated" &&
    !impersonating &&
    !profileNameSaved &&
    userNeedsName(session?.user?.name, session?.user?.email);
  const invitePlanId =
    mounted && status === "anonymous" ? readPlanIdFromWindow() : null;

  useEffect(() => {
    if (!mounted) return;
    setInviteGuest(hasInviteGuestSession());
  }, [mounted, status, loaded]);

  // Lift leftover wizard/sign-in modals once the user becomes authenticated.
  useEffect(() => {
    if (status === "authenticated" && prevStatus.current !== "authenticated") {
      useUI.getState().forceCloseModals();
    }
    prevStatus.current = status;
  }, [status]);

  // First-plan flow for signed-in users, and for invite guests before auth.
  useEffect(() => {
    if (!mounted) return;
    if (impersonating) return;
    if (needsProfileName) return;
    if (!loaded) return;
    if (isDefaultPlanId(active.id)) return;
    if (!isUntouchedHousehold(household)) return;
    if (nameOpen || planOpen) return;

    const mayStartFirstPlan =
      status === "authenticated" ||
      (status === "anonymous" && inviteGuest);
    if (!mayStartFirstPlan) return;

    useUI.getState().openFirstRun();
  }, [
    mounted,
    status,
    inviteGuest,
    impersonating,
    needsProfileName,
    loaded,
    household,
    active.id,
    nameOpen,
    planOpen,
  ]);

  const showLoading =
    !mounted ||
    !lgReady ||
    status === "loading" ||
    (status === "authenticated" && !loaded) ||
    (status === "anonymous" && inviteGuest && !loaded);

  const showSignedOut =
    mounted &&
    status === "anonymous" &&
    !inviteGuest;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page">
      <InviteCodeCapture />
      <LegalQueryModal />
      <AuthSync />
      <PlanDocumentTitle />
      <PlanUrlSync />
      <ImpersonationBanner />
      <RevisionPreviewBanner />
      <TopBar />

      {showSignedOut ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-4">
            <p className="text-sm text-muted-2">
              {invitePlanId
                ? "Log in or register to open this shared plan."
                : "Log in or register to use the Roth calculator."}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent-hover"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => openRegisterModal()}
                className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-bold text-foreground hover:bg-card"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      ) : showLoading ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <LabsLoading size="lg" />
        </div>
      ) : lgUp ? (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <aside className="w-[328px] min-w-[328px] max-w-[328px] shrink-0 overflow-y-auto border-r border-border bg-white px-5 py-[22px] pb-[60px]">
            <PlanSummary />
          </aside>
          {/* Nearest overflow-y scroller for ProjectionTable usePinToTop - keep as
		      direct ResultsView parent (same structure as before the redesign). */}
          <main className="min-w-0 flex-1 overflow-y-auto bg-page p-4 sm:p-6">
            <ResultsView />
          </main>
        </div>
      ) : (
        <>
          <DeviceNotice />
          {/* Nearest overflow-y scroller for ProjectionTable usePinToTop. */}
          <main
            className={`min-w-0 flex-1 overflow-y-auto bg-page p-4 ${
              revisionPreview
                ? ""
                : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
            }`}
          >
            <div className="flex min-w-0 w-full flex-col gap-4">
              <MobileResultsChrome />
              <ResultsView />
            </div>
          </main>
          {revisionPreview ? null : <MobileActionBar />}
        </>
      )}

      {/* Outside the results scroller so pin-to-top can collapse scroll
	      range and stop at the table (same as pre-redesign). Only after the
	      viewport is known: SSR defaults lgUp false so this is absent during
	      hydrate, then mounts on desktop and stays off below lg. */}
      {lgUp ? <Footer /> : null}
      {needsProfileName ? (
        <ProfileNameModal onSaved={setProfileNameSaved} />
      ) : null}
      <PlanNameModal />
      <PlanModal />
      <AuthModal />
      <FeedbackFab showButton={lgUp} />
    </div>
  );
}

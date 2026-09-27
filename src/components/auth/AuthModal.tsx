"use client";

import {
  AuthModals,
  currentCallbackUrl,
  type AuthModalKind,
} from "@/lib/auth/client";
import {
  LabsLoading,
  LegalDocModal,
  type FooterModalId,
} from "@/lib/common/client";
import { useState } from "react";
import { useUI } from "@/store/useUI";
import { withBasePath } from "@/lib/basePath";

/**
 * Calculator auth modals (login / register / plan-share invite signup).
 * Auth.js HTTP handlers live on this app at `/api/auth`.
 */
export function AuthModal() {
  const kind = useUI((s) => s.authModalKind);
  const seedEmail = useUI((s) => s.authModalEmail);
  const close = useUI((s) => s.closeAuthModal);
  const setKind = useUI((s) => s.setAuthModalKind);
  const [legalId, setLegalId] = useState<FooterModalId | null>(null);

  const modal: AuthModalKind = kind;

  return (
    <>
      <AuthModals
        modal={modal}
        onClose={close}
        toolId="roth"
        callbackUrl={currentCallbackUrl(
          process.env.NEXT_PUBLIC_BASE_PATH || "/",
        )}
        logoSrc={withBasePath("/logo.png")}
        onContinue={close}
        onOpenLegal={(doc) => setLegalId(doc)}
        busyIndicator={<LabsLoading size="md" />}
        accessCheckUrl={withBasePath("/api/access-check")}
        seedEmail={seedEmail}
        entrySurface={kind === "createAccount" ? "plan_share" : "calculator_gate"}
        onKindChange={(next, nextEmail) => {
          if (next === "signIn" || next === "thanks") return;
          if (next === "login" || next === "register" || next === "createAccount") {
            setKind(next, nextEmail);
          }
        }}
      />
      {legalId ? (
        <LegalDocModal id={legalId} onClose={() => setLegalId(null)} />
      ) : null}
    </>
  );
}

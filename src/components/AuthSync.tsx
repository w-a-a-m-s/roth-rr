"use client";

import { signOut, useSession } from "@/lib/auth/client";
import {
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "@/lib/common/legal";
import { useEffect } from "react";
import { useScenario } from "@/store/useScenario";

/**
 * Bridges the Auth.js session into the scenario store and signs out when
 * accepted Terms/Privacy versions are stale.
 */
export function AuthSync() {
  const { data: session, status } = useSession();
  const impersonating = Boolean(session?.impersonation?.active);

  useEffect(() => {
    if (status === "loading") {
      useScenario.getState().setAuth("loading", null, { impersonating: false });
      return;
    }
    if (status === "authenticated") {
      // While impersonating, skip legal enforcement - the admin is viewing
      // another account and must not be signed out for that user's stale ToS.
      if (!impersonating) {
        const legal = session?.user?.legal;
        const stale =
          !legal ||
          legal.termsVersion !== TERMS_VERSION ||
          legal.privacyVersion !== PRIVACY_VERSION;
        if (stale) {
          // Stale legal acceptance: drop the session and prompt sign-in again.
          void signOut({ redirect: false });
          useScenario.getState().setAuth("anonymous", null, {
            impersonating: false,
          });
          return;
        }
      }
      useScenario.getState().setAuth(
        "authenticated",
        session?.user?.id ?? null,
        { impersonating },
      );
      return;
    }
    useScenario.getState().setAuth("anonymous", null, { impersonating: false });
  }, [
    status,
    session?.user?.id,
    session?.user?.legal,
    impersonating,
  ]);

  return null;
}

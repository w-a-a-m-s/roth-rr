"use client";

import { useEffect, type ReactNode } from "react";
import { AuthSessionProvider } from "@/lib/auth/client";
import { ToastHost } from "@/components/ui/ToastHost";
import { startDeployReloadWatcher } from "@/lib/deployReload";
import { ensureExternalDataHydrated } from "@/store/useExternalData";

/**
 * Auth.js lives on this app at `/api/auth`. Keep the session client on that
 * same-origin path.
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureExternalDataHydrated();
  }, []);

  useEffect(() => startDeployReloadWatcher(), []);

  return (
    <AuthSessionProvider authBaseUrl="/api/auth">
      {children}
      <ToastHost />
    </AuthSessionProvider>
  );
}

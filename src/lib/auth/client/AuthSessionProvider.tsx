"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { authApiBaseUrl } from "./urls";

/**
 * Wrap the app so `useSession` / `signIn` / `signOut` work.
 * Auth.js handlers live on this app at `/api/auth`. Pass `authBaseUrl`
 * when the session client should use a different path.
 */
export function AuthSessionProvider({
  children,
  authBaseUrl,
}: {
  children: ReactNode;
  /** Absolute or path base for Auth.js routes. Defaults via `authApiBaseUrl()`. */
  authBaseUrl?: string;
}) {
  const basePath = (authBaseUrl ?? authApiBaseUrl()).replace(/\/$/, "");
  return (
    <SessionProvider basePath={basePath}>{children}</SessionProvider>
  );
}

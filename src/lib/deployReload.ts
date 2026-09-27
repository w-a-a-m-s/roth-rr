/**
 * Detect a newer deploy and reload the tab. Checks only on focus /
 * visibility (no background polling). Skips local/dev and active typing.
 */

import { withBasePath } from "@/lib/basePath";

export type DeployReloadDeps = {
  getClientBuildId: () => string | undefined;
  fetchServerBuildId: () => Promise<string | null>;
  reload: () => void;
  isDevelopment: () => boolean;
  isLocalHost: () => boolean;
  isTypingInEditable: () => boolean;
};

/** True for localhost / loopback so `next start` locally does not loop. */
export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

/** True when focus is in a field the user is likely typing into. */
export function isEditableElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const attr = el.getAttribute("contenteditable");
  if (attr === "" || attr === "true") return true;
  return Boolean(el.closest("[contenteditable='true'], [contenteditable='']"));
}

/**
 * Compare client vs server build id. Returns whether a reload should run.
 * Callers still gate on typing / local / dev before invoking.
 */
export function shouldReloadForBuildIds(
  clientBuildId: string | undefined,
  serverBuildId: string | null,
): boolean {
  if (!clientBuildId || !serverBuildId) return false;
  return clientBuildId !== serverBuildId;
}

export async function checkDeployAndMaybeReload(
  deps: DeployReloadDeps,
): Promise<boolean> {
  if (deps.isDevelopment()) return false;
  if (deps.isLocalHost()) return false;
  if (deps.isTypingInEditable()) return false;

  const clientBuildId = deps.getClientBuildId();
  const serverBuildId = await deps.fetchServerBuildId();
  if (!shouldReloadForBuildIds(clientBuildId, serverBuildId)) return false;

  // Re-check typing in case the user focused an input during the fetch.
  if (deps.isTypingInEditable()) return false;

  deps.reload();
  return true;
}

export function createBrowserDeployReloadDeps(): DeployReloadDeps {
  return {
    getClientBuildId: () => process.env.NEXT_PUBLIC_BUILD_ID,
    fetchServerBuildId: async () => {
      try {
        const res = await fetch(withBasePath("/api/version"), { cache: "no-store" });
        if (!res.ok) return null;
        const data: unknown = await res.json();
        if (
          typeof data !== "object" ||
          data === null ||
          typeof (data as { buildId?: unknown }).buildId !== "string"
        ) {
          return null;
        }
        return (data as { buildId: string }).buildId;
      } catch {
        return null;
      }
    },
    reload: () => {
      window.location.reload();
    },
    isDevelopment: () => process.env.NODE_ENV === "development",
    isLocalHost: () => isLocalHostname(window.location.hostname),
    isTypingInEditable: () => isEditableElement(document.activeElement),
  };
}

/**
 * Subscribe to focus / visibility only (no interval). Returns cleanup.
 */
export function startDeployReloadWatcher(
  deps: DeployReloadDeps = createBrowserDeployReloadDeps(),
): () => void {
  if (deps.isDevelopment() || deps.isLocalHost()) {
    return () => {};
  }

  let inFlight = false;

  const run = () => {
    if (inFlight) return;
    if (document.visibilityState === "hidden") return;
    inFlight = true;
    void checkDeployAndMaybeReload(deps).finally(() => {
      inFlight = false;
    });
  };

  const onVisibility = () => {
    if (document.visibilityState === "visible") run();
  };

  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

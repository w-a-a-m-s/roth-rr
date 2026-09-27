"use client";

import { useEffect, useRef, useState } from "react";
import { useScenario } from "@/store/useScenario";
import {
  hrefWithPlan,
  knownPlanId,
  planUrlId,
  readPlanIdFromWindow,
} from "@/lib/planUrl";

/**
 * Keeps the active plan and `/{publicId}` path in sync so a
 * plan can be shared as a link. Uses `history.replaceState` (not the Next
 * router) so soft navigations do not reset the document title metadata.
 * Legacy `?plan=` bookmarks are still read, then rewritten to the path form.
 */
export function PlanUrlSync() {
  const activeId = useScenario((s) => s.activeId);
  const configs = useScenario((s) => s.configs);
  const loaded = useScenario((s) => s.loaded);
  const status = useScenario((s) => s.auth.status);
  /** Bumps on back/forward so we re-read `window.location`. */
  const [locationEpoch, setLocationEpoch] = useState(0);

  const prevUrlPlan = useRef<string | null>(null);
  const prevActiveId = useRef<string | null>(null);

  const ready = status !== "loading" && (status !== "authenticated" || loaded);

  useEffect(() => {
    const onPopState = () => setLocationEpoch((n) => n + 1);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const fromUrl = readPlanIdFromWindow();

    // Signed-out: leave the URL alone (invite deep links must survive until
    // auth; there is no local plan to sync into the path).
    if (status === "anonymous") {
      prevUrlPlan.current = fromUrl;
      prevActiveId.current = activeId;
      return;
    }

    const active = configs.find((c) => c.id === activeId);
    const activeUrlId = active ? planUrlId(active) : activeId;
    const urlChanged = fromUrl !== prevUrlPlan.current;
    const storeChanged = activeId !== prevActiveId.current;

    // Deep link / back-forward: apply a known plan from the URL.
    if (urlChanged && fromUrl && fromUrl !== activeUrlId) {
      const known = knownPlanId(fromUrl, configs);
      if (known) {
        useScenario.getState().loadConfig(known);
        prevUrlPlan.current = fromUrl;
        prevActiveId.current = known;
        return;
      }
    }

    if (fromUrl === activeUrlId) {
      prevUrlPlan.current = fromUrl;
      prevActiveId.current = activeId;
      return;
    }

    // Keep an unresolved deep link (e.g. a server plan id before sign-in)
    // so hydrate can still prefer it after auth - but only until the user
    // picks a different plan in the UI.
    if (
      fromUrl &&
      !knownPlanId(fromUrl, configs) &&
      !storeChanged &&
      (status !== "authenticated" || !loaded)
    ) {
      prevUrlPlan.current = fromUrl;
      prevActiveId.current = activeId;
      return;
    }

    if (storeChanged || fromUrl !== activeUrlId) {
      const href = hrefWithPlan(
        window.location.pathname,
        new URLSearchParams(window.location.search),
        activeUrlId,
      );
      window.history.replaceState(window.history.state, "", href);
      prevUrlPlan.current = activeUrlId;
      prevActiveId.current = activeId;
    }
  }, [ready, locationEpoch, activeId, configs, status, loaded]);

  return null;
}

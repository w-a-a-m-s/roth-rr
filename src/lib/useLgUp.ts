"use client";

import { useSyncExternalStore } from "react";
import { useMounted } from "@/lib/useMounted";

const LG_QUERY = "(min-width: 1024px)";

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(LG_QUERY).matches;
}

/**
 * Tailwind `lg` (1024px). Until after hydration, `ready` is false and `lgUp`
 * is false so SSR and the first client paint match (no desktop Footer or
 * sidebar in the HTML). Measure the viewport only once `mounted` is true.
 */
export function useLgUp(): { ready: boolean; lgUp: boolean } {
  const mounted = useMounted();
  const lgUp = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return { ready: mounted, lgUp: mounted && lgUp };
}

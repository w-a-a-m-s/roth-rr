"use client";

import { useEffect } from "react";
import { useActiveConfig } from "@/store/useScenario";
import { documentTitleForPlan } from "@/lib/documentTitle";

/** Keeps the browser tab title in sync with the active plan name. */
export function PlanDocumentTitle() {
  const name = useActiveConfig().name;

  useEffect(() => {
    const desired = documentTitleForPlan(name);
    document.title = desired;

    // Next soft navigations can rewrite <title>; put it back if that happens.
    const titleEl = document.querySelector("title");
    if (!titleEl || typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver(() => {
      if (document.title !== desired) document.title = desired;
    });
    observer.observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [name]);

  return null;
}

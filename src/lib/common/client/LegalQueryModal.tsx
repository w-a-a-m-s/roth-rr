"use client";

import { useSyncExternalStore } from "react";
import { LEGAL_QUERY_KEY, legalDocFromQuery } from "../site";
import { LegalDocModal } from "./LegalDocModal";
import type { FooterModalId } from "./footerData";

const listeners = new Set<() => void>();

function readLegalId(): FooterModalId | null {
  if (typeof window === "undefined") return null;
  return legalDocFromQuery(
    new URLSearchParams(window.location.search).get(LEGAL_QUERY_KEY),
  );
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onPop = () => onChange();
  window.addEventListener("popstate", onPop);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onPop);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function clearLegalQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(LEGAL_QUERY_KEY)) return;
  url.searchParams.delete(LEGAL_QUERY_KEY);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
  notify();
}

/**
 * Opens Terms, Privacy, or Disclaimer when the URL has `?legal=`.
 * Works on `/` and on `/{planId}`. Closing the popup removes the query.
 */
export function LegalQueryModal() {
  const id = useSyncExternalStore(subscribe, readLegalId, () => null);
  if (!id) return null;

  return <LegalDocModal id={id} onClose={clearLegalQuery} />;
}

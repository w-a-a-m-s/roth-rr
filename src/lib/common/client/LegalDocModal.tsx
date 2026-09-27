"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { FooterContent } from "./FooterContent";
import { getFooterContent, type FooterModalId } from "./footerData";
import {
  modalBackdropClass,
  modalDialogClass,
  useCloseTransition,
} from "./useModalPresence";

/**
 * Standalone modal for Terms / Privacy / Disclaimer content.
 * Used by auth flows and any surface that needs a legal doc outside the Footer.
 */
export function LegalDocModal({
  id,
  onClose,
}: {
  id: FooterModalId;
  onClose: () => void;
}) {
  const titleId = useId();
  const content = getFooterContent(id);
  const { phase, requestClose, exiting } = useCloseTransition(onClose);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (exiting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose, exiting]);

  if (!content) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="wl-footer-modal fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className={`${modalBackdropClass(phase)} absolute inset-0 cursor-pointer border-0 bg-[rgba(26,25,21,0.22)] backdrop-blur-sm${exiting ? " pointer-events-none" : ""}`}
        onClick={() => {
          if (!exiting) requestClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${modalDialogClass(phase)} relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[color:var(--border,#e7e4dd)] bg-[color:var(--card,#fff)] text-[color:var(--foreground,#1a1915)] shadow-2xl${exiting ? " pointer-events-none" : ""}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--border,#e7e4dd)] px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold">
            {content.title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            disabled={exiting}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--muted-3,#9b968c)] transition hover:bg-black/5 hover:text-[color:var(--foreground,#1a1915)]"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <FooterContent
            id={id}
            className="flex flex-col gap-4 text-left text-[13.5px] leading-[1.65] text-[color:var(--muted-2,#54504a)]"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

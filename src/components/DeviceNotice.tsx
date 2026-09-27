"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const DEVICE_NOTICE_KEY = "rothCalcBestViewedModalSeen";

function DevicesIcon() {
  return (
    <svg viewBox="0 0 88 72" width="72" height="59" fill="none" aria-hidden>
      <rect
        x="4"
        y="6"
        width="52"
        height="36"
        rx="5"
        fill="color-mix(in srgb, var(--accent) 10%, #fff)"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M4 34h52"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M22 50h16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M30 42v8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16 56h28"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect
        x="52"
        y="20"
        width="32"
        height="44"
        rx="6"
        fill="white"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M64 58h8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DeviceNotice() {
  const [visible, setVisible] = useState(
    () => localStorage.getItem(DEVICE_NOTICE_KEY) !== "1"
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(DEVICE_NOTICE_KEY, "1");
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[color:var(--overlay)] px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-notice-title"
    >
      <div className="flex w-full max-w-[340px] flex-col items-center rounded-[22px] border border-border bg-white px-6 py-8 text-center shadow-[0_24px_56px_rgba(26,25,21,0.18)]">
        <div className="mb-6 flex h-[120px] w-[120px] items-center justify-center rounded-full bg-accent-soft text-accent shadow-[0_16px_40px_rgba(37,99,235,0.16)]">
          <DevicesIcon />
        </div>
        <h2
          id="device-notice-title"
          className="m-0 whitespace-nowrap font-serif text-[20px] font-medium leading-snug text-foreground"
        >
          Best experienced on large screens
        </h2>
        <p className="mt-3 mb-0 text-[15px] font-medium leading-relaxed text-muted-2">
          The mobile version is great, but this tool was built for professionals
          working with a large screen.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-7 h-12 w-full rounded-[12px] border-0 bg-accent text-[15px] font-bold text-white hover:bg-accent-hover"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body
  );
}

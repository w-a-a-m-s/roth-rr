"use client";

import { useToast } from "@/store/useToast";

/** Save / status toasts: top-center below `lg`, top-right on desktop. */
export function ToastHost() {
  const toasts = useToast((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2.5 px-4 lg:inset-x-auto lg:top-4 lg:right-4 lg:items-end lg:px-0"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`toast-enter pointer-events-auto flex min-w-[200px] items-center justify-center gap-2.5 rounded-xl border px-5 py-3 text-[15px] font-bold tracking-[-0.01em] shadow-[0_12px_36px_rgba(26,25,21,0.14)] ${
            toast.tone === "success"
              ? "border-[color-mix(in_srgb,var(--success)_28%,#fff)] bg-success-bg text-success"
              : "border-border bg-surface text-foreground"
          }`}
        >
          {toast.tone === "success" ? (
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : null}
          {toast.message}
        </div>
      ))}
    </div>
  );
}

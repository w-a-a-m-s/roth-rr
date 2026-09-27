"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { sendSupport } from "@/lib/sendSupport";
import { useUI } from "@/store/useUI";
import { LabsLoading } from "@/lib/common/client";

export function FeedbackFab({ showButton = true }: { showButton?: boolean }) {
  const { status } = useSession();
  const open = useUI((s) => s.feedbackOpen);
  const openFeedback = useUI((s) => s.openFeedback);
  const closeFeedback = useUI((s) => s.closeFeedback);
  const rootRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  sendingRef.current = sending;

  const close = () => {
    closeFeedback();
    setSent(false);
    setMessage("");
    setError(null);
    setSending(false);
  };

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (sendingRef.current) return;
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (sendingRef.current) return;
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (status !== "authenticated") return null;
  if (!showButton && !open) return null;

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendSupport({ kind: "feedback", message: message.trim() });
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-[59] bg-[color:var(--overlay)] backdrop-blur-sm"
          aria-hidden
        />
      ) : null}
      <div
        ref={rootRef}
        className={
          showButton
            ? "fixed right-4 bottom-5 z-[60] flex flex-col items-end gap-3 lg:right-5"
            : "fixed left-1/2 top-1/2 z-[60] flex w-[min(100vw-2.5rem,340px)] -translate-x-1/2 -translate-y-1/2 flex-col"
        }
      >
        {open ? (
          <div className="w-[min(100vw-2.5rem,340px)] rounded-2xl border border-border bg-white p-4 shadow-[0_16px_40px_rgba(26,25,21,0.2)]">
            {sent ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="m-0 font-serif text-[21px] font-medium text-foreground">
                    Got it, more please!
                  </h3>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-segment text-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p className="m-0 text-[13px] text-muted-2">
                  Every note shapes the roadmap. Send another anytime.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="m-0 font-serif text-[21px] font-medium text-foreground">
                    We love feedback
                  </h3>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-segment text-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p className="m-0 text-[13px] text-muted-2">
                  Bugs, ideas, confusing spots - we read every note.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="What's on your mind?"
                  disabled={sending}
                  className="w-full resize-vertical rounded-[9px] border border-border-2 bg-surface-muted px-3 py-2.5 text-[13px] outline-none focus:border-accent disabled:opacity-60"
                />
                {error ? (
                  <p className="m-0 text-[12.5px] text-danger">{error}</p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {sending ? (
                    <LabsLoading size="sm" className="justify-center" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!message.trim() || sending}
                    className="h-9 rounded-[9px] border-0 bg-accent text-[12.5px] font-bold text-white disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send feedback"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {showButton ? (
        <button
          type="button"
          aria-label="Send feedback"
          onClick={() => {
            if (open) close();
            else {
              openFeedback();
              setSent(false);
              setError(null);
            }
          }}
          className="flex h-11 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(26,25,21,0.28)]"
          style={{ animation: "feedback-breathe 60s ease-in-out infinite" }}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
          Feedback
        </button>
        ) : null}
      </div>
    </>
  );
}

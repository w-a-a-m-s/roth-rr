"use client";

import { useCallback, useEffect, useState } from "react";

/** Keep in sync with `.modal-dialog-enter` duration in app globals.css. */
export const MODAL_ENTER_MS = 200;

/** Keep in sync with `.modal-*-exit` duration in app globals.css. */
export const MODAL_EXIT_MS = 160;

export type ModalMotionPhase = "enter" | "exit";

function exitDelayMs(): number {
  if (typeof window === "undefined") return MODAL_EXIT_MS;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return MODAL_EXIT_MS;
}

/**
 * Keep a controlled modal mounted through its exit animation when `open`
 * flips to false.
 */
export function useModalPresence(open: boolean): {
  mounted: boolean;
  phase: ModalMotionPhase;
} {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<ModalMotionPhase>(open ? "enter" : "exit");

  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase("enter");
      return;
    }
    if (!mounted) return;
    setPhase("exit");
    const t = window.setTimeout(() => setMounted(false), exitDelayMs());
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  return { mounted, phase };
}

/**
 * Play the exit animation, then call `onClose`. Use when the parent unmounts
 * the modal as soon as `onClose` runs.
 */
export function useCloseTransition(onClose: () => void): {
  phase: ModalMotionPhase;
  requestClose: () => void;
  exiting: boolean;
} {
  const [exiting, setExiting] = useState(false);

  const requestClose = useCallback(() => {
    setExiting(true);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(onClose, exitDelayMs());
    return () => window.clearTimeout(t);
  }, [exiting, onClose]);

  return {
    phase: exiting ? "exit" : "enter",
    requestClose,
    exiting,
  };
}

export function modalBackdropClass(phase: ModalMotionPhase): string {
  return phase === "exit" ? "modal-backdrop-exit" : "modal-backdrop-enter";
}

export function modalDialogClass(phase: ModalMotionPhase): string {
  return phase === "exit" ? "modal-dialog-exit" : "modal-dialog-enter";
}

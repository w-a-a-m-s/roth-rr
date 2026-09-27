"use client";

import { create } from "zustand";
import { uid } from "@/lib/id";

export type ToastTone = "success" | "neutral";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: string) => void;
}

const DISMISS_MS = 2200;

/** Transient UI toasts (e.g. "Saved" after a plan persist). */
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = "neutral") => {
    const id = uid("toast");
    // Replace any existing toast with the same message so rapid autosaves
    // refresh one confirmation instead of stacking.
    set((state) => ({
      toasts: [
        ...state.toasts.filter((t) => t.message !== message),
        { id, message, tone },
      ],
    }));
    globalThis.setTimeout(() => {
      get().dismiss(id);
    }, DISMISS_MS);
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

"use client";

import {
  modalBackdropClass,
  modalDialogClass,
  useModalPresence,
} from "@/lib/common/client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-[880px]",
  xl: "max-w-5xl",
};

/** Open modal ids, bottom → top. Each owns backdrop then dialog above prior layers. */
const modalStack: string[] = [];
const stackListeners = new Set<() => void>();

function notifyStack() {
  for (const listener of stackListeners) listener();
}

function useModalStackIndex(mounted: boolean, id: string): number {
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    stackListeners.add(onChange);
    return () => {
      stackListeners.delete(onChange);
    };
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    if (!modalStack.includes(id)) {
      modalStack.push(id);
      notifyStack();
    }
    return () => {
      const idx = modalStack.indexOf(id);
      if (idx >= 0) {
        modalStack.splice(idx, 1);
        notifyStack();
      }
    };
  }, [mounted, id]);

  if (!mounted) return -1;
  const idx = modalStack.indexOf(id);
  // Before layout effect registers, treat as next top layer.
  return idx >= 0 ? idx : modalStack.length;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "lg",
  align = "center",
  fullHeight = false,
  /** Floor height so content changes don't shrink the dialog too much. */
  minHeight = false,
  closeOnBackdrop = true,
  showCloseButton = true,
  headerActions,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Vertical placement of the dialog on the overlay. */
  align?: "center" | "top";
  /** Lock the dialog to the max viewport height instead of sizing to content. */
  fullHeight?: boolean;
  /** Keep at least ~55vh when not using fullHeight (plan wizard). */
  minHeight?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  headerActions?: ReactNode;
}) {
  const reactId = useId();
  const { mounted, phase } = useModalPresence(open);
  const stackIndex = useModalStackIndex(mounted, reactId);
  // Topmost if registered as last, or not registered yet (about to push as top).
  const isTop =
    open &&
    (modalStack[modalStack.length - 1] === reactId ||
      !modalStack.includes(reactId));
  // Preserve a gap between each backdrop and its dialog (banner chrome, etc.).
  const backdropZ = 40 + Math.max(stackIndex, 0) * 20;
  const dialogZ = backdropZ + 10;
  const exiting = phase === "exit";

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !closeOnBackdrop) return;
      // Only the topmost open modal handles Escape.
      if (!isTop) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, onClose, closeOnBackdrop, isTop]);

  if (!mounted) return null;
  if (typeof document === "undefined") return null;

  // Each open modal owns its backdrop + dialog pair so nested stacks read as
  // bg → dialog → bg → dialog (not all backdrops under all dialogs).
  return createPortal(
    <>
      <div
        className={`${modalBackdropClass(phase)} fixed inset-0 bg-[color:var(--overlay)] backdrop-blur-sm${closeOnBackdrop && !exiting ? " cursor-pointer" : ""}${exiting ? " pointer-events-none" : ""}`}
        style={{ zIndex: backdropZ }}
        onClick={() => {
          if (exiting || !closeOnBackdrop) return;
          onClose();
        }}
      />
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 flex h-[100dvh] max-h-[100dvh] justify-center p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${
          align === "top" ? "items-start pt-6 sm:pt-8" : "items-center"
        }`}
        style={{ zIndex: dialogZ }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`${modalDialogClass(phase)} pointer-events-auto relative flex max-h-full w-full ${SIZES[size]} flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[0_30px_70px_rgba(26,25,21,0.3)]${fullHeight ? " h-full" : minHeight ? " min-h-[min(55dvh,100%)]" : ""}${exiting ? " pointer-events-none" : ""}`}
        >
          {title ? (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h2 className="font-serif text-lg font-medium text-foreground">
                {title}
              </h2>
              <div className="flex items-center gap-2">
                {headerActions}
                {showCloseButton ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    disabled={exiting}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-3 transition hover:bg-segment hover:text-muted-2"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      className="h-4 w-4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    >
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <div
            className={`min-h-0 overflow-y-auto px-4 py-3${fullHeight || minHeight ? " flex-1" : ""}`}
          >
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </>,
    document.body,
  );
}

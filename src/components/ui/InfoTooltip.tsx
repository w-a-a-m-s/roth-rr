"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface InfoTooltipProps {
  /** The explanatory content shown in the tooltip. */
  text: ReactNode;
  /** Accessible label for the trigger button. */
  label?: string;
}

const TOOLTIP_WIDTH = 240;

/**
 * A small "?" trigger that reveals a detailed explanation. The popover is
 * rendered in a portal with fixed positioning so it floats above scroll
 * containers (e.g. modals) instead of being clipped by them. Shows on hover and
 * keyboard focus, and can be pinned open with a tap/click (mobile-friendly).
 */
export function InfoTooltip({ text, label = "More information" }: InfoTooltipProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visible = (hovered || pinned) && coords !== null;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const half = TOOLTIP_WIDTH / 2;
    const margin = 8;
    const center = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(center, half + margin),
      window.innerWidth - half - margin,
    );
    setCoords({ left, top: rect.bottom + 6 });
  };

  const show = () => {
    place();
    setHovered(true);
  };

  useEffect(() => {
    if (!pinned) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) setPinned(false);
    };
    const onScrollOrResize = () => {
      setPinned(false);
      setHovered(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [pinned]);

  return (
    <span className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={visible}
        onClick={() => {
          place();
          setPinned((p) => !p);
        }}
        onMouseEnter={show}
        onMouseLeave={() => setHovered(false)}
        onFocus={show}
        onBlur={() => setHovered(false)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-2 text-[10px] font-semibold leading-none text-muted transition hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ?
      </button>
      {visible && coords
        ? createPortal(
            <span
              role="tooltip"
              style={{
                position: "fixed",
                left: coords.left,
                top: coords.top,
                width: TOOLTIP_WIDTH,
                transform: "translateX(-50%)",
              }}
              className="z-[60] rounded-md border border-border bg-surface p-3 text-xs font-normal leading-relaxed text-muted-2 shadow-lg"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

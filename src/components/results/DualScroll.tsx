"use client";

import { useEffect, type ReactNode } from "react";
import { useTopScrollbar } from "@/components/results/useTopScrollbar";

/**
 * A horizontally scrolling box with a scrollbar on top as well as the bottom,
 * kept in sync, so a wide table can be panned from either edge. The top bar
 * only shows while the content is wider than the box.
 */
export function DualScroll({
  children,
  className = "",
  scrollLeft,
}: {
  children: ReactNode;
  className?: string;
  /** Scroll to this many pixels from the left whenever it changes. */
  scrollLeft?: number;
}) {
  const { barRef, scrollRef, contentWidth, overflowing } = useTopScrollbar();
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || scrollLeft == null) return;
    scroller.scrollLeft = scrollLeft;
  }, [scrollLeft, scrollRef]);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        ref={barRef}
        data-top-scrollbar
        aria-hidden
        className={`scrollbar-visible overflow-x-scroll overflow-y-hidden ${
          overflowing ? "" : "hidden"
        }`}
      >
        <div style={{ width: contentWidth, height: 1 }} />
      </div>
      <div ref={scrollRef} className={`scrollbar-visible overflow-x-scroll ${className}`}>
        {children}
      </div>
    </div>
  );
}

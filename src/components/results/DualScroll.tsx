"use client";

import type { ReactNode } from "react";
import { useTopScrollbar } from "@/components/results/useTopScrollbar";

/**
 * A horizontally scrolling box with a scrollbar on top as well as the bottom,
 * kept in sync, so a wide table can be panned from either edge. The top bar
 * only shows while the content is wider than the box.
 */
export function DualScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { barRef, scrollRef, contentWidth, overflowing } = useTopScrollbar();
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

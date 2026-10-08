"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A second horizontal scrollbar above the table, kept in sync with the real
 * one at the bottom, so the user can pan years without scrolling down to it.
 * It only shows while the table is wider than its box.
 */
export function useTopScrollbar() {
  const barRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    const scroller = scrollRef.current;
    if (!bar || !scroller) return;
    const table = scroller.querySelector("table");

    const measure = () => {
      // Match the bar's scroll range to the table's, even when the table
      // also has a vertical scrollbar eating into its width.
      setContentWidth(scroller.scrollWidth - scroller.clientWidth + bar.clientWidth);
      setOverflowing(scroller.scrollWidth > scroller.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    ro.observe(bar);
    if (table) ro.observe(table);

    // Each side copies the other's position; the equality check stops the
    // echo scroll event from bouncing back.
    const fromBar = () => {
      if (scroller.scrollLeft !== bar.scrollLeft) scroller.scrollLeft = bar.scrollLeft;
    };
    const fromTable = () => {
      if (bar.scrollLeft !== scroller.scrollLeft) bar.scrollLeft = scroller.scrollLeft;
    };
    bar.addEventListener("scroll", fromBar, { passive: true });
    scroller.addEventListener("scroll", fromTable, { passive: true });
    return () => {
      ro.disconnect();
      bar.removeEventListener("scroll", fromBar);
      scroller.removeEventListener("scroll", fromTable);
    };
  }, []);

  return { barRef, scrollRef, contentWidth, overflowing };
}

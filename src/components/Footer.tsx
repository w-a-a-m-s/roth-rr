"use client";

import { Footer as SharedFooter } from "@/lib/common/client";

/** Compact chrome footer (links + ©). Stays outside the results scroller so
 *  year-by-year pin-to-top can collapse the scroll range and stop at the table. */
export function Footer() {
  return (
    <SharedFooter
      className="flex shrink-0 flex-col items-center gap-1.5 border-t border-border bg-white px-4 py-3 text-center text-xs text-muted-3"
    />
  );
}

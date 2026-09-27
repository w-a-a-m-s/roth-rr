"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatLocalDateTime } from "@/lib/format";

export type RestoreItem = {
  id: string;
  label: string;
  deletedAt: string;
};

export type RestoreGroup = {
  label: string;
  items: RestoreItem[];
};

/**
 * Compact restore control: history icon + accent count badge.
 */
export function RestoreDeleted({
  items,
  groups,
  onRestore,
  onDiscard,
}: {
  items?: RestoreItem[];
  groups?: RestoreGroup[];
  onRestore: (id: string) => void;
  onDiscard: (id: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const visibleGroups = (groups ?? []).filter((g) => g.items.length > 0);
  const flatItems =
    visibleGroups.length > 0
      ? visibleGroups.flatMap((g) => g.items)
      : (items ?? []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Always show the control so the empty state is reachable in the design.
  // Hide only when there is nothing and we never opened - actually design shows
  // the button always in the section header. Show whenever count > 0 OR keep
  // visible with 0. Handoff shows button always; badge only when count > 0.
  // For cleaner UX keep hidden when empty (matches prior app behavior).
  if (flatItems.length === 0) return null;

  function renderItem(item: RestoreItem) {
    const when = formatLocalDateTime(item.deletedAt);
    return (
      <li key={item.id} className="flex items-center gap-2 px-2 py-[7px]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-foreground">
            {item.label}
          </span>
          {when ? (
            <span className="block text-[10.5px] text-muted-3">Deleted {when}</span>
          ) : null}
        </span>
        <button
          type="button"
          className="h-[26px] shrink-0 rounded-[7px] border-0 bg-[color-mix(in_srgb,var(--accent)_10%,#fff)] px-[9px] text-[11.5px] font-bold text-accent"
          onClick={() => {
            onRestore(item.id);
            setOpen(false);
          }}
        >
          Restore
        </button>
        <button
          type="button"
          aria-label={`Discard ${item.label}`}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center text-[#b5b0a6]"
          onClick={(e) => {
            e.stopPropagation();
            onDiscard(item.id);
          }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </li>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Restore deleted (${flatItems.length})`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-border-2 bg-white px-[9px] text-muted-2"
      >
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 3" />
        </svg>
        <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,#fff)] px-1 text-[10px] font-extrabold text-accent">
          {flatItems.length}
        </span>
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="absolute right-0 z-45 mt-1.5 max-h-72 w-[260px] overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_30px_rgba(30,26,20,0.14)]"
        >
          {visibleGroups.length > 0
            ? visibleGroups.map((group) => (
                <li key={group.label} role="none">
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-3">
                    {group.label}
                  </div>
                  <ul>{group.items.map(renderItem)}</ul>
                </li>
              ))
            : flatItems.map(renderItem)}
        </ul>
      ) : null}
    </div>
  );
}

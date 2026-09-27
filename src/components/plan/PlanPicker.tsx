"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/auth/client";
import { isDefaultPlanId } from "@/lib/config/defaultPlans";
import { formatLocalDateTime, relativeTime } from "@/lib/format";
import { ROLE_LABELS, type PlanRole } from "@/lib/sharing";
import { useActiveConfig, useScenario } from "@/store/useScenario";
import { useUI } from "@/store/useUI";

/** Name ascending (case-insensitive, numeric), then id. Query matches the name only. */
export function plansForPicker<T extends { id: string; name: string }>(
  configs: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  const sorted = [...configs].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "en", {
        sensitivity: "base",
        numeric: true,
      }) || a.id.localeCompare(b.id),
  );
  if (!q) return sorted;
  return sorted.filter((c) => c.name.toLowerCase().includes(q));
}

function planMeta(c: {
  id: string;
  updatedAt: number;
  createdAt: number;
  role?: PlanRole;
}) {
  if (isDefaultPlanId(c.id)) return "Sample plan";
  const role =
    c.role != null
      ? ROLE_LABELS[c.role]
      : c.id.startsWith("local-")
        ? ROLE_LABELS.admin
        : null;
  const updated = relativeTime(c.updatedAt) || formatLocalDateTime(c.updatedAt);
  const edited = updated ? `Edited ${updated}` : "Your plan";
  return role ? `${role} · ${edited}` : edited;
}

export function PlanPicker({
  align = "right",
  buttonClassName,
  menuClassName,
  onOpen,
  closeNonce,
}: {
  align?: "left" | "right";
  buttonClassName?: string;
  menuClassName?: string;
  onOpen?: () => void;
  closeNonce?: number;
}) {
  const configs = useScenario((s) => s.configs);
  const active = useActiveConfig();
  const loadConfig = useScenario((s) => s.loadConfig);
  const { data: session } = useSession();
  const impersonating = Boolean(session?.impersonation?.active);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [seenNonce, setSeenNonce] = useState(closeNonce);
  const rootRef = useRef<HTMLDivElement>(null);
  const plans = useMemo(() => plansForPicker(configs, query), [configs, query]);

  if (!open && query !== "") setQuery("");

  if (closeNonce !== seenNonce) {
    setSeenNonce(closeNonce);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          onOpen?.();
        }}
        className={
          buttonClassName ??
          "flex h-[34px] w-[200px] items-center justify-between gap-2.5 rounded-[9px] border border-border bg-card px-3 sm:w-[260px]"
        }
      >
        <span className="truncate text-[13px] font-semibold text-foreground">
          {active.name}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="#9b968c"
          strokeWidth="2"
          className="shrink-0"
        >
          <path
            d="M6 9l6 6 6-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          className={
            menuClassName ??
            `absolute top-10 z-40 flex max-h-[min(420px,calc(100vh-4.5rem))] w-[300px] max-w-[min(100vw-2rem,300px)] flex-col overflow-hidden rounded-[14px] border border-border bg-white p-2.5 shadow-[0_16px_36px_rgba(30,26,20,0.16)] ${
              align === "left" ? "left-0" : "right-0"
            }`
          }
        >
          <div className="shrink-0 px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[#b5b0a6]">
            {impersonating ? "Their plans" : "Your plans"}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plans"
            aria-label="Search plans"
            autoFocus
            autoComplete="off"
            className="mb-1.5 w-full shrink-0 rounded-[9px] border border-border bg-white px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-[#b5b0a6] focus:border-accent"
          />
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {plans.length === 0 ? (
              <li className="px-2.5 py-3 text-[13px] text-muted-3">
                No plans match
              </li>
            ) : null}
            {plans.map((c) => {
              const selected = c.id === active.id;
              return (
                <li key={c.id} className="mb-0.5 last:mb-0">
                  <button
                    type="button"
                    onClick={() => {
                      const switched = c.id !== active.id;
                      loadConfig(c.id);
                      setOpen(false);
                      if (switched) useUI.getState().closePlanDetails();
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left ${
                      selected ? "bg-card" : "hover:bg-card/80"
                    }`}
                  >
                    <span
                      className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                        selected ? "bg-accent" : "bg-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[13.5px] text-foreground ${
                          selected ? "font-bold" : "font-semibold"
                        }`}
                      >
                        {c.name}
                      </span>
                      <span className="mt-px block whitespace-nowrap text-[11px] text-muted-3">
                        {planMeta(c)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

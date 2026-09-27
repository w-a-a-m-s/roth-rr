"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { submitEditOnEnter } from "./submitEditOnEnter";

/**
 * Entity card with optional read/edit modes matching the redesign handoff.
 * - Read inline: title + badge + summary stats + pencil (people, accounts, income, expenses)
 * - Read stacked: title + pencil on top, stats below (real estate)
 * - Edit: 2px accent border, fields as children, Done/Delete chips bottom-right.
 *   Enter in a text/number field is the same as Done.
 * - Legacy: if neither `summary` nor `editing` is used, children render in a
 *   soft card with optional Delete chip (backward compatible for steps not yet
 *   migrated to read/edit).
 */
export function EntityCard({
  title,
  badge,
  headerAction,
  onRemove,
  onDone,
  summary,
  editing,
  onEdit,
  summaryLayout = "inline",
  children,
}: {
  title?: string;
  badge?: ReactNode;
  headerAction?: ReactNode;
  onRemove?: () => void;
  onDone?: () => void;
  /** When provided with editing=false, shows compact read view. */
  summary?: ReactNode;
  editing?: boolean;
  onEdit?: () => void;
  /** Stacked puts stats under the title (real estate handoff). */
  summaryLayout?: "inline" | "stacked";
  children: ReactNode;
}) {
  const useReadEdit = summary != null && editing != null;

  if (useReadEdit && !editing) {
    if (summaryLayout === "stacked") {
      return (
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full cursor-pointer flex-col gap-2 rounded-[14px] border border-border bg-surface-muted px-4 py-3.5 text-left"
        >
          <span className="flex items-center gap-3 max-lg:border-b max-lg:border-border max-lg:pb-2">
            <span className="flex-1 text-[14.5px] font-bold text-foreground">
              {title}
            </span>
            <PencilIcon />
          </span>
          <span className="flex flex-col max-lg:divide-y max-lg:divide-border lg:flex-row lg:flex-wrap lg:gap-5 [&>*]:max-lg:py-2">
            {summary}
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={onEdit}
        className="flex w-full cursor-pointer flex-col gap-2 rounded-xl border border-border bg-surface-muted px-3.5 py-3 text-left lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-[18px] lg:gap-y-2"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-foreground max-lg:border-b max-lg:border-border max-lg:pb-2 lg:mr-auto">
          <span className="flex min-w-0 items-center gap-2">
            {title}
            {badge}
          </span>
          <span className="ml-auto shrink-0 lg:hidden">
            <PencilIcon />
          </span>
        </span>
        <span className="flex flex-col gap-2 lg:ml-auto lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
          <span className="flex flex-col max-lg:divide-y max-lg:divide-border lg:contents [&>*]:max-lg:py-2">
            {summary}
          </span>
          <span className="hidden lg:block">
            <PencilIcon />
          </span>
        </span>
      </button>
    );
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    submitEditOnEnter(event, onDone);
  };

  if (useReadEdit && editing) {
    return (
      <div
        className="rounded-xl border-2 border-accent bg-white p-3.5"
        onKeyDown={onFormKeyDown}
      >
        {(title || badge || headerAction) && (
          <div className="mb-2.5 flex items-center gap-2">
            {title ? (
              <span className="text-sm font-bold text-foreground">{title}</span>
            ) : null}
            {badge}
            <span className="flex-1" />
            {headerAction}
          </div>
        )}
        {children}
        <div className="mt-2.5 flex justify-end gap-2">
          {onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="h-[22px] rounded-full border border-warning-border bg-warning-bg px-[9px] text-[11px] font-bold text-warning-rmd-text"
            >
              Done
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="h-[22px] rounded-full border border-danger-border bg-danger-bg px-[9px] text-[11px] font-bold text-danger"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Legacy / always-edit card
  const hasHeader = title || badge || headerAction;
  return (
    <div
      className="rounded-xl border border-border bg-surface-muted p-3.5"
      onKeyDown={onDone ? onFormKeyDown : undefined}
    >
      {hasHeader ? (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            {title}
            {badge}
          </span>
          {headerAction ? <div className="flex items-center gap-1">{headerAction}</div> : null}
        </div>
      ) : null}
      {children}
      {onRemove || onDone ? (
        <div className="mt-2.5 flex justify-end gap-2">
          {onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="h-[22px] rounded-full border border-warning-border bg-warning-bg px-[9px] text-[11px] font-bold text-warning-rmd-text"
            >
              Done
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="h-[22px] rounded-full border border-danger-border bg-danger-bg px-[9px] text-[11px] font-bold text-danger"
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddButton({
  label,
  shortLabel,
  onClick,
}: {
  label: string;
  /** Shown below `lg` in place of `label` (e.g. "Add" on a narrow modal). */
  shortLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--accent)_30%,#fff)] bg-[color-mix(in_srgb,var(--accent)_7%,#fff)] px-3 py-[7px] text-xs font-bold text-[color-mix(in_srgb,var(--accent)_60%,#000)]"
    >
      <span className="-mt-px text-sm leading-none">+</span>
      {shortLabel ? (
        <>
          <span className="lg:hidden">{shortLabel}</span>
          <span className="hidden lg:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}

/** Compact label/value for entity read views. */
export function ReadStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 lg:block">
      <div className="text-[10.5px] text-muted-3">{label}</div>
      <div className="text-[12.5px] font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="#b5b0a6"
      strokeWidth="1.8"
      className="shrink-0"
      aria-hidden
    >
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
    </svg>
  );
}

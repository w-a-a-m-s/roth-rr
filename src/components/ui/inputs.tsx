"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  ChangeEvent,
  KeyboardEvent,
  ReactNode,
} from "react";
import { filterComboOptions } from "./comboOptions";
import { SelectMenu } from "./SelectMenu";
import {
  digitsOnly,
  parseYearInput,
  yearBounds,
} from "./yearInput";

const baseInput =
  "w-full rounded-[9px] border border-border-2 bg-surface-muted px-2.5 py-1.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15 placeholder:text-muted-3 md:text-sm";

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      className={`${baseInput} disabled:opacity-60`}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Free-text input with optional autocomplete suggestions.
 * Suggestions open only while typing (not on focus alone) and render below
 * the field. Any value is valid; the list only assists typing.
 */
export function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  id?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = filterComboOptions(options, value);
  const showList = open && suggestions.length > 0;

  useEffect(() => {
    if (!showList) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showList]);

  const pick = (option: string) => {
    onChange(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (!showList) return;
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showList) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) =>
        i <= 0 ? suggestions.length - 1 : i - 1,
      );
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      pick(suggestions[activeIndex]!);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0
            ? `${listId}-opt-${activeIndex}`
            : undefined
        }
        className={baseInput}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-45 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-[0_12px_30px_rgba(30,26,20,0.14)]"
        >
          {suggestions.map((opt, index) => {
            const active = index === activeIndex;
            return (
              <li key={opt} role="option" aria-selected={active}>
                <button
                  id={`${listId}-opt-${index}`}
                  type="button"
                  className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_12%,#fff)] text-foreground"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(opt)}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function NumericInput({
  value,
  onChange,
  prefix,
  suffix,
  step,
  min,
  id,
  placeholder,
  decimals,
  className,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  step?: number;
  min?: number;
  id?: string;
  placeholder?: string;
  /** When set, format to this many decimals on blur. */
  decimals?: number;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (decimals != null) setDraft(raw);
    if (raw === "") return onChange(undefined);
    const num = Number(raw);
    onChange(Number.isNaN(num) ? undefined : num);
  };

  const displayValue =
    decimals != null && focused
      ? draft
      : value == null
        ? ""
        : decimals != null
          ? value.toFixed(decimals)
          : String(value);

  return (
    <div className={`relative flex w-full min-w-0 items-center ${className ?? ""}`}>
      {prefix ? (
        <span className="pointer-events-none absolute left-2.5 z-[1] text-sm text-muted-3">
          {prefix}
        </span>
      ) : null}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        placeholder={placeholder}
        className={`min-w-0 ${baseInput} ${prefix ? "pl-6" : ""} ${suffix ? "pr-7" : ""}`}
        value={displayValue}
        onChange={handle}
        onFocus={() => {
          setFocused(true);
          setDraft(
            value == null
              ? ""
              : decimals != null
                ? value.toFixed(decimals)
                : String(value),
          );
        }}
        onBlur={() => {
          setFocused(false);
          if (decimals == null || value == null) return;
          const rounded =
            Math.round(value * 10 ** decimals) / 10 ** decimals;
          if (rounded !== value) onChange(rounded);
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-2.5 text-sm text-muted-3">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export function MoneyInput({
  value,
  onChange,
  id,
  placeholder,
  step = 1000,
  decimals,
  className,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  id?: string;
  placeholder?: string;
  step?: number;
  decimals?: number;
  className?: string;
}) {
  return (
    <NumericInput
      id={id}
      prefix="$"
      step={step}
      min={0}
      placeholder={placeholder}
      decimals={decimals}
      className={className}
      value={value}
      onChange={(v) => onChange(v ?? 0)}
    />
  );
}

export function NumberField({
  value,
  onChange,
  id,
  step,
  min,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  id?: string;
  step?: number;
  min?: number;
  placeholder?: string;
}) {
  return (
    <NumericInput
      id={id}
      step={step}
      min={min}
      placeholder={placeholder}
      value={value}
      onChange={(v) => onChange(v ?? 0)}
    />
  );
}

/** Number input that yields `undefined` when cleared (for optional fields). */
export function OptionalNumberField({
  value,
  onChange,
  id,
  step,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  id?: string;
  step?: number;
  placeholder?: string;
}) {
  return (
    <NumericInput
      id={id}
      step={step}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

/** Percent input that stores a decimal (UI shows whole percent). */
export function PercentInput({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
}) {
  return (
    <NumericInput
      id={id}
      suffix="%"
      step={0.1}
      min={0}
      value={Math.round(value * 1000) / 10}
      onChange={(v) => onChange((v ?? 0) / 100)}
    />
  );
}

/**
 * Typed calendar year. Digits only; commits a value in [from, to] (the old
 * dropdown range). Yields `undefined` when cleared and `allowEmpty` is on.
 */
export function YearSelect({
  value,
  onChange,
  from,
  to,
  allowEmpty = false,
  placeholder = "Year",
  id,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  from?: number;
  to?: number;
  allowEmpty?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const { min, max } = yearBounds(from, to);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const display =
    focused || error
      ? draft
      : value == null
        ? ""
        : String(value);

  const commit = (raw: string) => {
    const parsed = parseYearInput(raw, min, max, allowEmpty);
    setError(parsed.error);
    if (parsed.error) return;
    onChange(parsed.value);
  };

  return (
    <div className="w-full min-w-0">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        className={`${baseInput} ${
          error
            ? "border-danger-border focus:border-danger focus:ring-danger/15"
            : ""
        }`}
        value={display}
        aria-invalid={error != null}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          const next = digitsOnly(e.target.value);
          setDraft(next);
          if (next === "" && allowEmpty) {
            setError(null);
            onChange(undefined);
            return;
          }
          if (next.length < 4) {
            setError(null);
            return;
          }
          commit(next);
        }}
        onFocus={() => {
          setFocused(true);
          if (error) return;
          setDraft(value == null ? "" : String(value));
        }}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
      />
      {error ? (
        <p
          id={errorId}
          className="mt-1 text-[11px] leading-tight text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  groups,
  id,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options?: { value: T; label: string }[];
  /** Optional grouped options, rendered as labeled sections. */
  groups?: { label: string; options: { value: T; label: string }[] }[];
  id?: string;
  disabled?: boolean;
}) {
  return (
    <SelectMenu
      id={id}
      value={value}
      disabled={disabled}
      onChange={(next) => onChange(next as T)}
      options={options}
      groups={groups}
    />
  );
}

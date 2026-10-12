"use client";

import { useMemo, useRef } from "react";
import { useHousehold, useScenario } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";
import { Field } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/inputs";
import { StepTour } from "@/components/onboarding/StepTour";
import { ConversionEmptyNotice } from "@/components/wizard/steps/ConversionEmptyNotice";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";
import { projectionStartYear } from "@/lib/engine/project";
import { runRothScenario } from "@/lib/engine/runScenario";
import { buildConversionSchedule } from "@/lib/optimizer";
import {
  conversionYears,
  convertibleTotal,
  roundCents,
  spreadConversionEvenly,
  strategyStartIndex,
} from "@/lib/optimizer/util";
import { formatCurrency } from "@/lib/format";
import { CONVERSION_TOUR_STEPS } from "@/lib/onboarding/conversionTour";
import { findPlanModalPrimaryAction } from "@/lib/onboarding/householdTour";

export function ConversionStep() {
  const household = useHousehold();
  const { setOptimizer } = useScenario();
  const refs = useExternalData((s) => s.refs);

  const years = conversionYears(household);
  const start = projectionStartYear(household);
  const convertible = convertibleTotal(household, refs.asOfDate);
  const allowOverConvertible = household.optimizer.allowOverConvertible === true;
  // Years from today up to the plan start. Conversions there sit on top of
  // the strategy and leave its schedule (the years from `start`) untouched.
  const currentYear = new Date().getFullYear();
  const earlyYears = Array.from(
    { length: Math.max(0, start - currentYear) },
    (_, i) => currentYear + i,
  );
  const earlyConversions = household.optimizer.earlyConversions ?? [];
  const earlyAmount = (year: number) =>
    earlyConversions.find((c) => c.year === year)?.amount ?? 0;
  const hasEarly = earlyYears.some((year) => earlyAmount(year) > 0);

  const totalConvertibleRef = useRef<HTMLDivElement>(null);
  const amountToConvertRef = useRef<HTMLDivElement>(null);
  const allowAboveRef = useRef<HTMLDivElement>(null);
  const spreadEvenlyRef = useRef<HTMLButtonElement>(null);
  const yearAmountsRef = useRef<HTMLDivElement>(null);

  const schedule = useMemo(() => {
    const full = buildConversionSchedule(household, refs);
    return Array.from({ length: years }, (_, i) => full[i] ?? 0);
  }, [household, refs, years]);

  const early = useMemo(() => {
    if (!hasEarly) return undefined;
    return runRothScenario(household, [], "Early conversions", refs)
      .earlyConversions;
  }, [household, refs, hasEarly]);

  if (isConversionEmpty(household)) {
    // Tour stays unseen until they return with a convertible amount.
    return <ConversionEmptyNotice household={household} />;
  }

  const scheduledTotal = schedule.reduce((sum, v) => sum + v, 0);
  const remaining = convertible - scheduledTotal;
  const overConvertible = scheduledTotal > convertible + 0.5;

  /** Edit a year before the plan starts. The strategy stays as it is. */
  const setEarlyYear = (year: number, value: number) => {
    const amount = roundCents(Math.max(0, value));
    const others = earlyConversions.filter((c) => c.year !== year);
    const next = amount > 0 ? [...others, { year, amount }] : others;
    next.sort((a, b) => a.year - b.year);
    setOptimizer({ earlyConversions: next.length > 0 ? next : undefined });
  };
  const earlyTax = early ? early.federalTax + early.stateTax : 0;

  /**
   * Spread `total` evenly from the first retirement year. Years before it are
   * manual only: they keep whatever the user typed and count toward the total.
   */
  const first = Math.min(strategyStartIndex(household), years);
  const spreadFromRetirement = (total: number, cap: number) => {
    const typed = schedule.slice(0, first);
    const typedTotal = typed.reduce((sum, v) => sum + v, 0);
    return [
      ...typed,
      ...spreadConversionEvenly(
        Math.max(0, total - typedTotal),
        years - first,
        Math.max(0, cap - typedTotal),
      ),
    ];
  };

  /** Spread this total across the conversion years as a manual schedule. */
  const spreadEvenly = (total: number) => {
    const amount = Math.max(0, total);
    const cap = allowOverConvertible ? amount : convertible;
    setOptimizer({
      strategy: "manual",
      convertAmount: undefined,
      manualSchedule: spreadFromRetirement(amount, cap),
    });
  };

  /** Edit a single year; becomes a custom (manual) schedule. */
  const setYear = (index: number, value: number) => {
    const next = [...schedule];
    if (allowOverConvertible) {
      next[index] = roundCents(Math.max(0, value));
    } else {
      const others = scheduledTotal - next[index];
      const headroom = Math.max(0, convertible - others);
      next[index] = roundCents(Math.min(Math.max(0, value), headroom));
    }
    setOptimizer({ strategy: "manual", manualSchedule: next });
  };

  const setAllowOverConvertible = (allow: boolean) => {
    if (!allow && overConvertible) {
      setOptimizer({
        allowOverConvertible: false,
        strategy: "manual",
        convertAmount: undefined,
        manualSchedule: spreadFromRetirement(
          Math.min(scheduledTotal, convertible),
          convertible,
        ),
      });
      return;
    }
    setOptimizer({ allowOverConvertible: allow });
  };

  return (
    <div className="flex flex-col gap-3">
      <StepTour
        tourId="conversion"
        steps={CONVERSION_TOUR_STEPS}
        targets={{
          "total-convertible": totalConvertibleRef,
          "amount-to-convert": amountToConvertRef,
          "allow-above": allowAboveRef,
          "spread-evenly": spreadEvenlyRef,
          "year-amounts": yearAmountsRef,
          "create-plan": findPlanModalPrimaryAction,
        }}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div ref={amountToConvertRef}>
          <Field
            label="Amount to convert"
            hint="Spread evenly across the conversion years."
          >
            <MoneyInput
              value={scheduledTotal}
              onChange={spreadEvenly}
              step={0.01}
              decimals={2}
            />
          </Field>
        </div>
        <div
          ref={totalConvertibleRef}
          className={`flex flex-col justify-center rounded-[9px] border px-3 py-1.5 ${
            overConvertible && !allowOverConvertible
              ? "border-danger-border bg-danger-bg"
              : overConvertible
                ? "border-warning-border bg-warning-bg"
                : "border-border bg-surface-muted"
          }`}
        >
          <span
            className={`text-[11px] ${
              overConvertible && !allowOverConvertible
                ? "text-danger"
                : overConvertible
                  ? "text-warning"
                  : "text-muted-3"
            }`}
          >
            Total convertible
          </span>
          <span
            className={`text-[14.5px] font-bold tabular-nums ${
              overConvertible && !allowOverConvertible
                ? "text-danger"
                : "text-foreground"
            }`}
          >
            {formatCurrency(convertible, true)}
          </span>
        </div>
      </div>

      <div
        ref={allowAboveRef}
        className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-surface-muted px-3 py-2.5"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-2">
            Allow amounts above the convertible total
          </div>
          <div className="mt-0.5 text-[11px] leading-tight text-muted">
            When off, the schedule is capped so it never exceeds what can be
            converted.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={allowOverConvertible}
          aria-label="Allow amounts above the convertible total"
          onClick={() => setAllowOverConvertible(!allowOverConvertible)}
          className={`relative h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full border-0 transition-colors ${
            allowOverConvertible ? "bg-accent" : "bg-border-2"
          }`}
        >
          <span
            className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              allowOverConvertible ? "translate-x-[18px]" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {allowOverConvertible ? (
        <p className="m-0 rounded-lg border border-warning-border bg-warning-bg px-2.5 py-1.5 text-[11.5px] font-semibold text-warning">
          Conversion amounts are not capped to the estimated convertible total.
          Each year still converts only what is available in pre-RMD
          tax-deferred accounts.
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,#fff)] bg-[color-mix(in_srgb,var(--accent)_4%,#fff)] px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[color-mix(in_srgb,var(--accent)_55%,#000)]">
            Per-year conversion
          </span>
          <button
            ref={spreadEvenlyRef}
            type="button"
            onClick={() => spreadEvenly(scheduledTotal)}
            className="cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-accent"
          >
            Spread evenly
          </button>
        </div>

        <div ref={yearAmountsRef} className="flex w-fit flex-col gap-2">
          {earlyYears.map((year) => (
            <div key={year} className="flex items-center gap-3">
              <label
                htmlFor={`conversion-year-${year}`}
                className="w-12 shrink-0 text-[12.5px] font-bold text-muted-2"
              >
                {year}
              </label>
              <div className="w-[180px] shrink-0 [&_input]:h-[34px] [&_input]:rounded-[7px] [&_input]:py-0 [&_input]:text-[12.5px] [&_input]:font-semibold">
                <MoneyInput
                  id={`conversion-year-${year}`}
                  value={earlyAmount(year) || undefined}
                  placeholder="0.00"
                  step={0.01}
                  decimals={2}
                  onChange={(value) => setEarlyYear(year, value)}
                />
              </div>
            </div>
          ))}
          {earlyYears.length > 0 ? (
            <p className="m-0 max-w-[260px] text-[11px] leading-tight text-muted">
              {early
                ? `Before the plan starts in ${start}: adds about ${formatCurrency(earlyTax, true)} of tax. The years from ${start} stay as they are.`
                : `Optional, before the plan starts in ${start}. The years from ${start} stay as they are.`}
            </p>
          ) : null}
          {schedule.map((amount, i) => (
            <div key={i} className="flex items-center gap-3">
              <label
                htmlFor={`conversion-year-${start + i}`}
                className="w-12 shrink-0 text-[12.5px] font-bold text-muted-2"
              >
                {start + i}
              </label>
              <div className="w-[180px] shrink-0 [&_input]:h-[34px] [&_input]:rounded-[7px] [&_input]:py-0 [&_input]:text-[12.5px] [&_input]:font-semibold">
                <MoneyInput
                  id={`conversion-year-${start + i}`}
                  value={amount || undefined}
                  placeholder="0.00"
                  step={0.01}
                  decimals={2}
                  onChange={(value) => setYear(i, value)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-baseline justify-between border-t border-[color-mix(in_srgb,var(--accent)_20%,#fff)] pt-2">
          <span className="text-[12.5px] text-muted-2">Scheduled total</span>
          <span
            className={`text-[14.5px] font-extrabold tabular-nums ${
              overConvertible && !allowOverConvertible
                ? "text-danger"
                : "text-foreground"
            }`}
          >
            {formatCurrency(scheduledTotal, true)}
          </span>
        </div>
        {overConvertible && !allowOverConvertible ? (
          <p className="m-0 rounded-lg border border-danger-border bg-danger-bg px-2.5 py-1.5 text-[11.5px] font-semibold text-danger">
            Scheduled conversions exceed the {formatCurrency(convertible, true)}{" "}
            available to convert.
          </p>
        ) : overConvertible && allowOverConvertible ? (
          <p className="m-0 rounded-lg border border-warning-border bg-warning-bg px-2.5 py-1.5 text-[11.5px] font-semibold text-warning">
            Scheduled total is{" "}
            {formatCurrency(scheduledTotal - convertible, true)} above the
            estimated convertible total.
          </p>
        ) : remaining <= 0.005 ? (
          <p className="m-0 rounded-lg border border-[color-mix(in_srgb,var(--success)_28%,#fff)] bg-success-bg px-2.5 py-1.5 text-[11.5px] font-semibold text-success">
            All converted
          </p>
        ) : (
          <p className="m-0 rounded-lg border border-[color-mix(in_srgb,var(--success)_28%,#fff)] bg-success-bg px-2.5 py-1.5 text-[11.5px] font-semibold text-success">
            {formatCurrency(remaining, true)} still available to convert.
          </p>
        )}
      </div>
    </div>
  );
}

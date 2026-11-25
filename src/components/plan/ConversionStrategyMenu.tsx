"use client";

import type { ConversionStrategy, FillBracketRate } from "@/lib/domain/types";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";
import { formatSignedCompactCurrency } from "@/lib/format";
import { primaryRmdAge } from "@/lib/domain/rmd";
import { buildConversionSchedule } from "@/lib/optimizer";
import {
  STRATEGY_HELP,
  STRATEGY_LABELS,
  resolveBracketRate,
} from "@/lib/optimizer/labels";
import type { StrategyScore, StrategyScoreId } from "@/lib/optimizer/score";
import { DEFAULT_MAX_MONTHLY_SHORTFALL } from "@/lib/optimizer/shortfall";
import {
  hasManualConversionSchedule,
  isNoConversion,
  noConversionPatch,
} from "@/lib/optimizer/util";
import { useStrategyScores } from "@/components/plan/useStrategyScores";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
  RmdYearConversionsSwitch,
  WorkingYearConversionsSwitch,
} from "@/components/plan/RmdYearConversionsSwitch";
import { useHousehold, useScenario } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";
import { useUI } from "@/store/useUI";

/** Green when the change helps (lower taxes, more assets), red when it hurts. */
function deltaColor(delta: number | undefined, higherIsBetter: boolean): string {
  if (delta == null || !Number.isFinite(delta) || Math.abs(delta) < 1) {
    return "text-muted-3";
  }
  return delta > 0 === higherIsBetter ? "text-success" : "text-danger";
}

const DELTA_CELL = "w-[54px] shrink-0 text-right text-[11px] font-bold tabular-nums";

function scoreFor(
  scores: StrategyScore[],
  id: StrategyScoreId,
): StrategyScore | undefined {
  return scores.find((s) => s.id === id);
}

function stopRowSelect(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function ConversionStrategyMenu({
  readOnly = false,
  className,
}: {
  readOnly?: boolean;
  className?: string;
}) {
  const household = useHousehold();
  const { setOptimizer } = useScenario();
  const refs = useExternalData((s) => s.refs);
  const scores = useStrategyScores();
  const rmdAge = primaryRmdAge(household);
  const rmdLabel = rmdAge != null ? String(rmdAge) : "RMD age";

  if (isConversionEmpty(household)) return null;

  const selected = household.optimizer.strategy;
  const shortfallCap = household.optimizer.maxMonthlyShortfall;
  const capOn = shortfallCap != null;
  const toggleCap = () => {
    if (readOnly) return;
    setOptimizer({
      maxMonthlyShortfall: capOn ? undefined : DEFAULT_MAX_MONTHLY_SHORTFALL,
    });
  };
  const rate = resolveBracketRate(household.optimizer.targetBracketRate);
  const noConversion = isNoConversion(household);
  const clearConversions = () => {
    if (readOnly || noConversion) return;
    useUI.getState().closePlanDetails();
    setOptimizer(noConversionPatch(household));
  };

  const select = (
    strategy: ConversionStrategy,
    targetBracketRate?: FillBracketRate,
  ) => {
    if (readOnly) return;
    useUI.getState().closePlanDetails();
    if (strategy === "fillBracket") {
      setOptimizer({
        strategy,
        targetBracketRate: targetBracketRate ?? rate,
      });
      return;
    }
    if (strategy === "manual" && !hasManualConversionSchedule(household)) {
      setOptimizer({
        strategy: "manual",
        manualSchedule: buildConversionSchedule(household, refs),
      });
      return;
    }
    setOptimizer({ strategy });
  };

  const rows: Array<{
    id: StrategyScoreId;
    strategy: ConversionStrategy;
    label: string;
    rate?: FillBracketRate;
  }> = [
    { id: "manual", strategy: "manual", label: STRATEGY_LABELS.manual },
    { id: "even", strategy: "even", label: STRATEGY_LABELS.even },
    {
      id: "immediate",
      strategy: "immediate",
      label: STRATEGY_LABELS.immediate,
    },
    {
      id: `fillBracket:${rate}`,
      strategy: "fillBracket",
      label: "Fill bracket",
      rate,
    },
    { id: "irmaa", strategy: "irmaa", label: STRATEGY_LABELS.irmaa },
    {
      id: "depleteByRmd",
      strategy: "depleteByRmd",
      label: STRATEGY_LABELS.depleteByRmd,
    },
    { id: "minTax", strategy: "minTax", label: STRATEGY_LABELS.minTax },
  ];

  return (
    <div className={className ?? "mb-5"}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[13.5px] font-bold text-foreground">
            Conversion strategy
          </h3>
          <button
            type="button"
            aria-pressed={noConversion}
            disabled={readOnly}
            onClick={clearConversions}
            title="Remove every conversion: Manual with $0 in every year"
            className={`h-[22px] rounded-[6px] border px-2 text-[11.5px] font-semibold transition-colors ${
              noConversion
                ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,#fff)] text-foreground"
                : "border-border bg-white text-muted-2 hover:text-foreground"
            } ${readOnly || noConversion ? "cursor-default" : "cursor-pointer"}`}
          >
            No conversion
          </button>
        </div>
        <WorkingYearConversionsSwitch readOnly={readOnly} />
        <RmdYearConversionsSwitch readOnly={readOnly} />
        <div className="flex items-center gap-1.5">
          <InfoTooltip
            text="When on, a year that spends more than its income (a negative Surplus) converts nothing, and every other year converts only as much as keeps it from going short. Applies to every strategy."
            label="About no shortfall allowed"
          />
          <span className="text-[11.5px] font-semibold text-muted-2">
            No shortfall allowed
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={capOn}
            aria-label="No shortfall allowed"
            disabled={readOnly}
            onClick={toggleCap}
            className={`relative h-[22px] w-[40px] shrink-0 rounded-full border-0 transition-colors ${
              capOn ? "bg-accent" : "bg-border-2"
            } ${readOnly ? "cursor-default" : "cursor-pointer"}`}
          >
            <span
              className={`absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                capOn ? "translate-x-[18px]" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="flex items-end gap-1.5 px-3 text-[10.5px] font-semibold leading-tight text-muted-3">
        <span className="flex-1">vs. no conversion</span>
        <span className="w-[54px] shrink-0 text-right">Lifetime taxes</span>
        <span className="w-[54px] shrink-0 text-right">Assets at {rmdLabel}</span>
      </div>
      <div
        role="radiogroup"
        aria-label="Conversion strategy"
        className="flex flex-col overflow-hidden rounded-[10px] border border-border"
      >
        {rows.map((row) => {
          const active =
            selected === row.strategy &&
            (row.strategy !== "fillBracket" || row.rate === rate);
          const scored = scoreFor(scores, row.id);
          const labelClass = `text-[12.5px] font-semibold leading-snug ${
            active ? "text-foreground" : "text-muted-2"
          }`;
          return (
            <div
              key={row.id}
              className={`flex items-center gap-1.5 border-b border-border px-3 py-2 last:border-b-0 ${
                active
                  ? "bg-[color-mix(in_srgb,var(--accent)_8%,#fff)]"
                  : "bg-white"
              } ${readOnly ? "" : "cursor-pointer"}`}
              onClick={() => select(row.strategy, row.rate)}
            >
              <span onClick={stopRowSelect} onKeyDown={stopRowSelect}>
                <InfoTooltip
                  text={STRATEGY_HELP[row.strategy]}
                  label={`About ${row.label}`}
                />
              </span>
              {row.strategy === "fillBracket" ? (
                <div
                  role="radio"
                  aria-checked={active}
                  aria-label="Fill bracket"
                  tabIndex={readOnly ? -1 : 0}
                  onClick={() => select("fillBracket", rate)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      select("fillBracket", rate);
                    }
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-1 ${labelClass} ${
                    readOnly ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  Fill
                  <select
                    aria-label="Federal tax bracket"
                    disabled={readOnly}
                    value={rate}
                    onClick={stopRowSelect}
                    onChange={(event) => {
                      select(
                        "fillBracket",
                        Number(event.target.value) as FillBracketRate,
                      );
                    }}
                    className={`h-[22px] rounded-[5px] border border-border bg-white px-1 text-[11px] font-bold ${
                      readOnly ? "cursor-default" : "cursor-pointer"
                    }`}
                  >
                    {FILL_BRACKET_RATES.map((r) => (
                      <option key={r} value={r}>
                        {Math.round(r * 100)}%
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={readOnly}
                  onClick={() => select(row.strategy, row.rate)}
                  className={`min-w-0 flex-1 text-left ${labelClass} ${
                    readOnly ? "cursor-default" : "cursor-pointer"
                  }`}
                >
                  {row.label}
                </button>
              )}
              <span
                className={`${DELTA_CELL} ${deltaColor(scored?.taxesTotal, false)}`}
                title="Lifetime taxes vs. no conversion"
              >
                {scored ? formatSignedCompactCurrency(scored.taxesTotal) : "-"}
              </span>
              <span
                className={`${DELTA_CELL} ${deltaColor(scored?.afterTaxAssetsAtRmd, true)}`}
                title={`After-tax assets at ${rmdLabel} vs. no conversion`}
              >
                {scored ? formatSignedCompactCurrency(scored.afterTaxAssetsAtRmd) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

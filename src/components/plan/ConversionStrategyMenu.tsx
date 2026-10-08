"use client";

import type { ConversionStrategy, FillBracketRate } from "@/lib/domain/types";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";
import { formatSignedCurrency } from "@/lib/format";
import { buildConversionSchedule } from "@/lib/optimizer";
import {
  STRATEGY_HELP,
  STRATEGY_LABELS,
  resolveBracketRate,
} from "@/lib/optimizer/labels";
import type { StrategyScore, StrategyScoreId } from "@/lib/optimizer/score";
import { hasManualConversionSchedule } from "@/lib/optimizer/util";
import { useStrategyScores } from "@/components/plan/useStrategyScores";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useHousehold, useScenario } from "@/store/useScenario";
import { useExternalData } from "@/store/useExternalData";
import { useUI } from "@/store/useUI";

function impactColor(impact: number | undefined): string {
  if (impact == null || !Number.isFinite(impact) || Math.abs(impact) < 1) {
    return "text-muted-3";
  }
  return impact > 0 ? "text-success" : "text-danger";
}

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

  if (isConversionEmpty(household)) return null;

  const selected = household.optimizer.strategy;
  const rate = resolveBracketRate(household.optimizer.targetBracketRate);

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
      <h3 className="mb-2 text-[13.5px] font-bold text-foreground">
        Conversion strategy
      </h3>
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
                  bracket
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
                className={`shrink-0 text-[12.5px] font-bold tabular-nums ${impactColor(scored?.impact)}`}
              >
                {scored ? formatSignedCurrency(scored.impact) : "-"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import type { LeftoverInvestment } from "@/lib/domain/types";
import { LEFTOVER_INVESTMENT_RATE } from "@/lib/config/defaults";
import { formatPercent } from "@/lib/format";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { useHousehold, useScenario } from "@/store/useScenario";

const OPTIONS: { key: LeftoverInvestment | undefined; label: string; help: string }[] = [
  {
    key: undefined,
    label: "Not invested",
    help: "Income left over after expenses isn't saved, so it's not in the assets or the inheritance.",
  },
  {
    key: "sp500",
    label: `S&P 500 · ${formatPercent(LEFTOVER_INVESTMENT_RATE.sp500)}`,
    help: "Each year's leftover money is added to one S&P 500 account growing 8% a year. Its gains aren't taxed: they step up at death.",
  },
  {
    key: "moneyMarket",
    label: `Money market · ${formatPercent(LEFTOVER_INVESTMENT_RATE.moneyMarket)}`,
    help: "Each year's leftover money is added to one money market account paying 3.3% a year. The interest is taxed every year.",
  },
];

/** Where the plan saves each year's leftover money (income above expenses). */
export function LeftoverToggle() {
  const choice = useHousehold().assumptions.leftoverInvestment;
  const setAssumptions = useScenario((s) => s.setAssumptions);
  const { readOnly } = usePlanAccess();
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12.5px] font-semibold text-muted-2">Leftover money</span>
      <div role="group" aria-label="Leftover money" className="inline-flex rounded-[9px] bg-segment p-[3px]">
        {OPTIONS.map(({ key, label, help }) => (
          <button
            key={key ?? "none"}
            type="button"
            title={help}
            disabled={readOnly}
            aria-pressed={choice === key}
            onClick={() => setAssumptions({ leftoverInvestment: key })}
            className={`h-[30px] whitespace-nowrap rounded-[7px] px-3 text-[12.5px] font-bold transition disabled:cursor-not-allowed ${
              choice === key ? "bg-white text-foreground shadow-sm" : "bg-transparent text-muted-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

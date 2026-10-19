"use client";

import { allowsEarlyWithdrawals } from "@/lib/engine/earlyWithdrawal";
import { Field } from "@/components/ui/Field";
import { useHousehold, useScenario } from "@/store/useScenario";

const OPTIONS = [
  { value: false, label: "Not allowed" },
  { value: true, label: "Allowed (10% penalty)" },
] as const;

export const EARLY_WITHDRAWALS_HELP =
  "Before 59½, money taken from an IRA, 401(k) or Roth owes a 10% penalty on top of the tax. Not allowed: the plan never draws from those accounts until the owner is past 59½ (the year they turn 60), so scheduled draws and shortfalls skip them. Allowed: the money is taken and the 10% is added to the federal tax. No penalty from a 457(b), from a 401(k), 403(b), TSP or DROP after leaving work in or after the year you turn 55, after the owner's death, or once the owner is disabled. Roth conversions never owe it.";

/** "Early withdrawals": whether the plan may draw from penalized accounts before 59½. */
export function EarlyWithdrawalsField({ readOnly = false }: { readOnly?: boolean }) {
  const household = useHousehold();
  const { setAssumptions } = useScenario();
  const allowed = allowsEarlyWithdrawals(household);
  return (
    <Field label="Withdrawals before 59½" help={EARLY_WITHDRAWALS_HELP}>
      <div
        role="radiogroup"
        aria-label="Withdrawals before 59½"
        className="flex rounded-[9px] border border-border-2 bg-surface-muted p-0.5"
      >
        {OPTIONS.map((option) => {
          const on = allowed === option.value;
          return (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={readOnly}
              onClick={() => {
                if (readOnly) return;
                setAssumptions({ allowEarlyWithdrawals: option.value ? true : undefined });
              }}
              className={`flex-1 whitespace-nowrap rounded-[7px] px-2 py-1 text-base transition md:text-sm ${
                on ? "bg-white font-semibold text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

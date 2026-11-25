import type { ProjectionRow } from "@/lib/engine/types";
import { EARLY_WITHDRAWAL_PENALTY_RATE } from "@/lib/engine/earlyWithdrawal";
import { formatCurrency } from "@/lib/format";

/**
 * Red alert at the top of the results when the plan pays conversion tax from
 * assets before 59½: the withheld dollars aren't converted, so they're an
 * early distribution and the 10% penalty was paid on them (user's request).
 */
export function EarlyConversionPenaltyAlert({ rows }: { rows: ProjectionRow[] }) {
  const years = rows.filter((r) => r.conversionWithheldEarly > 0);
  if (years.length === 0) return null;
  const penalty = years.reduce(
    (sum, r) => sum + EARLY_WITHDRAWAL_PENALTY_RATE * r.conversionWithheldEarly,
    0,
  );
  const yearList = years.map((r) => r.calendarYear).join(", ");
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-[13px] leading-snug text-danger"
    >
      <p className="m-0 font-bold">
        10% early withdrawal penalty paid before 59½: {formatCurrency(penalty)}
      </p>
      <p className="m-0 mt-1">
        Conversion tax is paid from assets in {yearList}, while the owner is under 59½. The
        withheld tax isn&apos;t converted, so the IRS treats it as an early withdrawal. To avoid
        the penalty, pay the conversion tax from income, or convert from a 457(b) first.
      </p>
    </div>
  );
}

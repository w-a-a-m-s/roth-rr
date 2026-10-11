"use client";

import { Fragment } from "react";
import type { Household } from "@/lib/domain/types";
import { lifeInsuranceSummary, type LifeSummaryTotals } from "@/lib/domain/insurance";
import { formatCurrency, formatPercent } from "@/lib/format";

const TH_BASE = "px-3 py-2 text-[11.5px] font-bold text-white whitespace-nowrap";
const TH = `${TH_BASE} text-right`;
const TH_LEFT = `${TH_BASE} text-left`;
const TD = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";

/** Every life policy on one table, grouped by the person it covers. */
export function LifeInsuranceSummary({ household }: { household: Household }) {
  const year = new Date().getFullYear();
  const { groups, totals } = lifeInsuranceSummary(household, year);
  if (groups.length === 0) return null;
  const policyCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h4 className="m-0 text-[13px] font-bold text-foreground">Life insurance summary</h4>
        <span className="text-[11.5px] text-muted">
          {policyCount} {policyCount === 1 ? "policy" : "policies"} · as of {year}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#1B365D]">
              <th className={TH_LEFT}>Policy</th>
              <th className={TH_LEFT}>Type</th>
              <th className={TH_LEFT}>Coverage</th>
              <th className={TH}>Face amount</th>
              <th className={TH}>Cash value</th>
              <th className={TH}>Premium / yr</th>
              <th className={TH}>Survivor income / yr</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.insuredId}>
                <tr className="bg-[#E8EEF6]">
                  <td colSpan={7} className="px-3 py-1.5 text-[12.5px] font-bold text-[#14243D]">
                    {group.name}
                    {group.age != null ? (
                      <span className="font-normal text-muted">
                        {" "}
                        · age {group.age}
                        {group.payoutRate != null
                          ? ` · payout rate ${formatPercent(group.payoutRate)}`
                          : ""}
                      </span>
                    ) : null}
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <tr
                    key={row.policyId}
                    className={`border-b border-border-subtle ${row.inForce ? "" : "text-muted-3"}`}
                  >
                    <td className="px-3 py-1.5 text-left whitespace-nowrap">{row.label}</td>
                    <td className="px-3 py-1.5 text-left whitespace-nowrap">{row.type}</td>
                    <td className="px-3 py-1.5 text-left whitespace-nowrap">{row.coverage}</td>
                    <td className={TD}>{formatCurrency(row.faceAmount)}</td>
                    <td className={TD}>{row.cashValue > 0 ? formatCurrency(row.cashValue) : "-"}</td>
                    <td className={TD}>{formatCurrency(row.annualPremium)}</td>
                    <td className={TD}>{row.inForce ? formatCurrency(row.annualIncome) : "-"}</td>
                  </tr>
                ))}
                {group.rows.length > 1 || groups.length > 1 ? (
                  <TotalRow label={`Total for ${group.name}`} totals={group.totals} />
                ) : null}
              </Fragment>
            ))}
            {groups.length > 1 ? (
              <TotalRow label="Household total" totals={totals} strong />
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="m-0 px-1 text-[11.5px] leading-relaxed text-muted">
        Totals count only policies still in force. Survivor income is what the Survivorship analysis pays each year if the
        insured passed this year: the face amount times the payout rate for
        their age (5% under 59), for life. Premiums and cash value are for
        reference and don&apos;t change the projection.
      </p>
    </div>
  );
}

function TotalRow({
  label,
  totals,
  strong = false,
}: {
  label: string;
  totals: LifeSummaryTotals;
  strong?: boolean;
}) {
  return (
    <tr
      className={
        strong
          ? "border-t-[3px] border-t-[#1B365D] bg-[#C3D1E4] font-bold text-[#14243D]"
          : "bg-[#F5F0E3] font-semibold text-[#14243D]"
      }
    >
      <td colSpan={3} className="px-3 py-1.5 text-left">
        {label}
      </td>
      <td className={TD}>{formatCurrency(totals.faceAmount)}</td>
      <td className={TD}>{totals.cashValue > 0 ? formatCurrency(totals.cashValue) : "-"}</td>
      <td className={TD}>{formatCurrency(totals.annualPremium)}</td>
      <td className={TD}>{formatCurrency(totals.annualIncome)}</td>
    </tr>
  );
}

"use client";

import { useState } from "react";
import {
  LIFE_INSURANCE_PROCEEDS_GROWTH,
  incomeTableRows,
} from "@/lib/config/lifeInsurancePayout";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatPercent } from "@/lib/format";

const PER = 100_000;

/** The whole income table by age, highlighting the ages the plan uses. */
function IncomeTable({ highlightAges = [] }: { highlightAges?: number[] }) {
  const th = "border-b border-border py-1.5 pr-3 text-right font-semibold";
  const td = "border-b border-border/60 py-1 pr-3 text-right";
  return (
    <div>
      <p className="m-0 mb-3 text-[12.5px] leading-relaxed text-muted-2">
        The yearly payout for each age the income starts, as a share of the
        money it starts from. The rate is fixed for life: it doesn&apos;t grow,
        and it keeps paying the same amount. What&apos;s left stays invested
        and grows {formatPercent(LIFE_INSURANCE_PROCEEDS_GROWTH)} a year. It
        pays account withdrawals set to the income table on the Income step,
        life insurance in Survivorship, and every account&apos;s Additional
        survivorship income and Supplemental LTC income.
        {highlightAges.length > 0 ? " Highlighted rows are the ages this plan uses." : ""}
      </p>
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr className="text-left text-muted-2">
            <th className="border-b border-border py-1.5 pr-3 font-semibold">Age</th>
            <th className={th}>Payout a year</th>
            <th className={th}>Per {formatCurrency(PER)} a year</th>
            <th className={th}>Per {formatCurrency(PER)} a month</th>
          </tr>
        </thead>
        <tbody>
          {incomeTableRows().map((row) => {
            const used = highlightAges.some((age) => age >= row.minAge && age <= row.maxAge);
            return (
              <tr
                key={row.ageLabel}
                className={used ? "bg-[color-mix(in_srgb,var(--accent)_8%,#fff)] font-semibold" : ""}
              >
                <td className="border-b border-border/60 py-1 pr-3">{row.ageLabel}</td>
                <td className={td}>{formatPercent(row.rate)}</td>
                <td className={td}>{formatCurrency(PER * row.rate)}</td>
                <td className={td}>{formatCurrency((PER * row.rate) / 12)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="m-0 mt-3 text-xs text-muted">
        Source: Transamerica Structured Index Advantage Income Annuity, Income
        Advantage with optional Step-Up Benefit, Joint Life (1.55% fee),
        Immediate Payout % (flyer 5182416R1, 10/26). Under 59 we use a flat 5%,
        and past 86 the age 86 rate.
      </p>
    </div>
  );
}

/** "See the income table": opens the whole table by age in a pop-up. */
export function IncomeTableLink({
  highlightAges,
  className = "",
}: {
  highlightAges?: number[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`self-start border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold text-accent underline ${className}`}
      >
        See the income table
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Income table by age" size="md">
        <IncomeTable highlightAges={highlightAges} />
      </Modal>
    </>
  );
}

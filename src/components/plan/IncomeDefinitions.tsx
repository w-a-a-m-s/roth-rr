"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  LIFE_INSURANCE_PAYOUT_UNDER_59,
  LIFE_INSURANCE_PROCEEDS_GROWTH,
  lifeInsurancePayoutRate,
} from "@/lib/config/lifeInsurancePayout";
import { LTC_RIDER_GROWTH, LTC_RIDER_INCOME_MULTIPLIER } from "@/lib/domain/longTermCare";
import { uniformLifetimeDenominator, uniformLifetimeRate } from "@/lib/config/rmdTable";
import { LEFTOVER_INVESTMENT_RATE } from "@/lib/config/defaults";
import { formatPercent } from "@/lib/format";

export const INCOME_DEFINITIONS_TITLE = "Generated income definitions";

const GROWTH = formatPercent(LIFE_INSURANCE_PROCEEDS_GROWTH);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="m-0 mb-2 text-[14px] font-bold text-foreground">{title}</h3>
      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted-2">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left text-muted-2">
            {head.map((h) => (
              <th key={h} className="border-b border-border py-1.5 pr-3 align-bottom font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`border-b border-border/60 py-1.5 pr-3 align-top ${j === 0 ? "font-semibold text-foreground" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every income line the plan adds on its own (event incomes, extra
 * withdrawals, RMDs, income-table withdrawals, insurance, leftover money) and
 * how each is figured. Rates come from the same constants the engine uses.
 */
function IncomeDefinitionsBody() {
  const tableRange = `${formatPercent(LIFE_INSURANCE_PAYOUT_UNDER_59)} under 59, ${formatPercent(
    lifeInsurancePayoutRate(59),
  )} at 59, up to ${formatPercent(lifeInsurancePayoutRate(86))} at 85 and older`;
  return (
    <div>
      <p className="m-0 mb-4 text-[13px] font-semibold leading-relaxed text-foreground">
        The plan adds these income lines to the results on its own: you don&apos;t enter them on
        the Income step. Each heading is the name the line has in the results tables.
      </p>

      <Section title="Supplemental LTC income">
        <p className="m-0">
          In Long-term care, from the first year of care, every investment, tax-deferred and Roth
          account pays a guaranteed lifetime income.
        </p>
        <Bullets
          items={[
            <>
              Amount: the account&apos;s January 1 balance that year times the income table rate
              for the owner&apos;s age ({tableRange}). A joint account uses the younger
              spouse&apos;s age. Fixed for life.
            </>,
            <>What&apos;s left grows {GROWTH} a year, whatever the account&apos;s own rate.</>,
            <>It keeps paying if the balance runs out.</>,
            <>
              Taxed like the account&apos;s money: in full from tax-deferred, tax free from a Roth,
              the gain over basis from an after-tax account.
            </>,
            <>
              LTC rider: while its owner is in care, the account pays {LTC_RIDER_INCOME_MULTIPLIER}x
              the income and grows {formatPercent(LTC_RIDER_GROWTH)}. After care it&apos;s back to
              the normal income and {GROWTH}.
            </>,
          ]}
        />
      </Section>

      <Section title="Additional survivorship income">
        <p className="m-0">
          In Survivorship, from the year after the death, every account pays a guaranteed lifetime
          income the same way: January 1 balance times the income table rate for the age of the
          person it now pays (the survivor), fixed for life, with what&apos;s left growing{" "}
          {GROWTH} a year. The LTC rider doesn&apos;t apply.
        </p>
      </Section>

      <Section title="Extra withdrawal">
        <Bullets
          items={[
            <>
              Covers a short year (spending and deposits above income after tax) in Survivorship,
              Long-term care and Spending capacity. In Retirement only Leftover money is drawn
              this way.
            </>,
            <>Order: after-tax accounts first, then tax-deferred, then Roth.</>,
            <>Grossed up so the draw also pays its own tax (and the 10% penalty before 59½ when that switch is on).</>,
            <>Stops when the accounts are empty.</>,
          ]}
        />
      </Section>

      <Section title="RMD">
        <Bullets
          items={[
            <>Starts at 75 if the owner was born in 1960 or later, 73 for 1951 to 1959, 72 before.</>,
            <>
              Amount: the December 31 balance of the year before divided by the IRS Uniform
              Lifetime factor (at 75: {uniformLifetimeDenominator(75)}, about{" "}
              {formatPercent(uniformLifetimeRate(75))}).
            </>,
            <>
              A scheduled withdrawal or event income from the account counts toward it: the RMD
              line is only what&apos;s still owed. Taxed in full.
            </>,
          ]}
        />
      </Section>

      <Section title="Withdrawals on the income table">
        <p className="m-0">
          An account withdrawal set to the income table on the Income step pays the account&apos;s
          January 1 balance in its first year times the rate for the owner&apos;s age, fixed for
          life. From then on the account grows {GROWTH} a year.
        </p>
      </Section>

      <Section title="Insurance">
        <Table
          head={["Line", "Analysis", "What it pays", "Tax"]}
          rows={[
            [
              "Income from life insurance",
              "Survivorship",
              `The death benefit, invested at ${GROWTH}, pays face amount times the rate for the insured's age at death, fixed for life, from the year after the death.`,
              "Only earnings above the death benefit",
            ],
            [
              "Income from disability insurance",
              "Disability",
              "The monthly benefit after the waiting period, for the benefit period.",
              "Tax free unless the employer paid the premiums",
            ],
            [
              "Long-term care insurance",
              "Long-term care",
              "The monthly benefit, up to the care cost, after the waiting period, for the benefit years or while care lasts.",
              "Tax free",
            ],
          ]}
        />
      </Section>

      <Section title="Leftover money">
        <p className="m-0">
          With the Leftover money switch on (Main tab), each year&apos;s surplus is saved at year
          end: S&amp;P 500 grows {formatPercent(LEFTOVER_INVESTMENT_RATE.sp500)} a year (gains taxed
          only when sold), money market {formatPercent(LEFTOVER_INVESTMENT_RATE.moneyMarket)} (interest
          taxed each year). A short year draws it back as &quot;Extra withdrawal · Leftover
          money&quot;.
        </p>
      </Section>
    </div>
  );
}

/** "Generated income definitions" link that opens the article. */
export function IncomeDefinitionsLink({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`self-start border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold text-accent underline ${className}`}
      >
        {INCOME_DEFINITIONS_TITLE}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={INCOME_DEFINITIONS_TITLE} size="md">
        <IncomeDefinitionsBody />
      </Modal>
    </>
  );
}

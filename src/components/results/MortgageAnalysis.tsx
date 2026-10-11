"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Household, MortgageStatement } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import {
  MoneyInput,
  OptionalNumberField,
  RateInput,
  Select,
  TextInput,
  YearSelect,
} from "@/components/ui/inputs";
import { AddButton } from "@/components/ui/EntityCard";
import { RestoreDeleted } from "@/components/ui/RestoreDeleted";
import { DualScroll } from "@/components/results/DualScroll";
import { amortize, type AmortizationResult } from "@/lib/engine/amortization";
import { formatCurrency, formatPercent } from "@/lib/format";
import { uid } from "@/lib/id";
import { propertyLoans } from "@/lib/domain/propertyLoans";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i + 1), label }));
const NO_PROPERTY = "none";

const monthYear = (month: number, year: number) => `${MONTHS[month - 1] ?? "?"} ${year}`;

/** Next month from today: where a fresh statement's next payment usually lands. */
function nextMonth(): { month: number; year: number } {
  const now = new Date();
  const month = now.getMonth() + 2;
  return month > 12 ? { month: 1, year: now.getFullYear() + 1 } : { month, year: now.getFullYear() };
}

/** A property's first mortgage with a balance, if any. */
function firstMortgage(re: Household["realEstate"][number]) {
  return propertyLoans(re).find((l) => l.kind === "mortgage" && l.balance > 0);
}

function blankMortgage(household: Household): MortgageStatement {
  const next = nextMonth();
  const property = household.realEstate.find((re) => firstMortgage(re) != null);
  const loan = property ? firstMortgage(property) : undefined;
  return {
    id: uid("mtg"),
    label: property?.label ?? "",
    propertyId: property?.id,
    principalBalance: loan?.balance ?? 0,
    interestRate: loan?.rate ?? 0,
    monthlyPayment: loan?.monthlyPayment ?? 0,
    nextPaymentMonth: next.month,
    nextPaymentYear: next.year,
  };
}

/** Mortgage analysis: statement inputs and the amortization table they make. */
export function MortgageAnalysis({ household }: { household: Household }) {
  const { addMortgage, restoreMortgage, discardDeletedMortgage } = useScenario();
  const { readOnly } = usePlanAccess();
  const canEdit = !readOnly;
  const mortgages = household.mortgages ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mortgages.find((m) => m.id === selectedId) ?? mortgages[0];

  const add = () => {
    const mortgage = blankMortgage(household);
    addMortgage(mortgage);
    setSelectedId(mortgage.id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[640px] text-[13px] leading-relaxed text-muted">
            Enter what&apos;s on your mortgage statement to see every payment
            until the loan is paid off: how much goes to interest, how much to
            principal, and what&apos;s left. This doesn&apos;t change the plan&apos;s
            projection.
          </p>
          {canEdit ? (
            <div className="flex items-center gap-2">
              <RestoreDeleted
                items={(household.deletedMortgages ?? []).map((e) => ({
                  id: e.item.id,
                  label: e.item.label || "Mortgage",
                  deletedAt: e.deletedAt,
                }))}
                onRestore={restoreMortgage}
                onDiscard={discardDeletedMortgage}
              />
              <AddButton label="Add mortgage" shortLabel="Add" onClick={add} />
            </div>
          ) : null}
        </div>
        {mortgages.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {mortgages.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
                  m.id === selected?.id
                    ? "border-accent bg-accent-soft text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {m.label || `Mortgage ${i + 1}`}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {selected ? (
        <MortgageDetail key={selected.id} household={household} mortgage={selected} readOnly={!canEdit} />
      ) : (
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
          <p className="font-medium text-foreground">No mortgages yet</p>
          <p className="mt-1">
            Add a mortgage and fill it in from your latest statement to build its amortization table.
          </p>
        </div>
      )}
    </div>
  );
}

function MortgageDetail({
  household,
  mortgage,
  readOnly,
}: {
  household: Household;
  mortgage: MortgageStatement;
  readOnly: boolean;
}) {
  const { updateMortgage, removeMortgage } = useScenario();
  const update = (patch: Partial<MortgageStatement>) => {
    if (readOnly) return;
    updateMortgage(mortgage.id, patch);
  };
  const result = useMemo(() => amortize(mortgage), [mortgage]);

  // Picking a property fills in its mortgage when the statement is still empty.
  const pickProperty = (value: string) => {
    if (value === NO_PROPERTY) return update({ propertyId: undefined });
    const re = household.realEstate.find((r) => r.id === value);
    if (!re) return;
    const empty = !(mortgage.principalBalance > 0);
    update({
      propertyId: re.id,
      label: mortgage.label || re.label,
      ...(empty
        ? {
            principalBalance: firstMortgage(re)?.balance ?? 0,
            interestRate: firstMortgage(re)?.rate ?? 0,
            monthlyPayment: firstMortgage(re)?.monthlyPayment ?? 0,
          }
        : {}),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 rounded-2xl border border-border bg-white px-5 py-4 lg:grid-cols-2">
        <Group title="From your statement">
          <Field layout="row" label="Label">
            <TextInput value={mortgage.label} onChange={(label) => update({ label })} />
          </Field>
          <Field layout="row" label="Property" help="Which property this mortgage is on. Picking one fills in its balance, rate and payment if they're still empty.">
            <Select
              value={mortgage.propertyId ?? NO_PROPERTY}
              onChange={pickProperty}
              options={[
                { value: NO_PROPERTY, label: "Not linked" },
                ...household.realEstate.map((re) => ({ value: re.id, label: re.label || "Property" })),
              ]}
            />
          </Field>
          <Field
            layout="row"
            label="Principal balance"
            help="The unpaid principal balance on the statement, right before the next payment. Not the payoff amount, which adds interest owed."
          >
            <MoneyInput value={mortgage.principalBalance} onChange={(principalBalance) => update({ principalBalance })} />
          </Field>
          <Field layout="row" label="Interest rate" help="The yearly rate on the note (not the APR).">
            <RateInput value={mortgage.interestRate} onChange={(interestRate) => update({ interestRate })} />
          </Field>
          <Field
            layout="row"
            label="Monthly payment (P&I)"
            help="Principal and interest only, without escrow. Leave it at 0 to work it out from the balance, rate and maturity date."
            hint={result.paymentDerived ? `Worked out from the maturity date: ${formatCurrency(result.monthlyPayment, true)}` : undefined}
          >
            <MoneyInput
              step={50}
              decimals={2}
              value={mortgage.monthlyPayment}
              onChange={(monthlyPayment) => update({ monthlyPayment })}
            />
          </Field>
          <Field layout="row" label="Escrow per month" help="Property taxes and insurance collected with the payment. Shown in the table, never amortized.">
            <MoneyInput step={50} decimals={2} value={mortgage.monthlyEscrow} onChange={(monthlyEscrow) => update({ monthlyEscrow })} />
          </Field>
          <Field layout="row" label="Next payment due" help="Row 1 of the table.">
            <MonthYear
              month={mortgage.nextPaymentMonth}
              year={mortgage.nextPaymentYear}
              onChange={(nextPaymentMonth, nextPaymentYear) =>
                update({ nextPaymentMonth, nextPaymentYear: nextPaymentYear ?? mortgage.nextPaymentYear })
              }
            />
          </Field>
          <Field layout="row" label="Maturity date" help="The last scheduled payment, from the statement or the note. Used to check the table and to work out a missing payment.">
            <MonthYear
              month={mortgage.maturityMonth}
              year={mortgage.maturityYear}
              allowEmpty
              onChange={(maturityMonth, maturityYear) =>
                update(
                  maturityYear == null
                    ? { maturityMonth: undefined, maturityYear: undefined }
                    : { maturityMonth, maturityYear },
                )
              }
            />
          </Field>
        </Group>
        <Group title="Optional">
          <Field layout="row" label="Extra principal per month" help="Paid on top of the regular payment, straight to principal. The summary shows the interest and time it saves.">
            <MoneyInput step={50} value={mortgage.extraPrincipal} onChange={(extraPrincipal) => update({ extraPrincipal })} />
          </Field>
          <Field layout="row" label="Original loan amount" help="For reference: shows how much of the loan is paid off.">
            <MoneyInput value={mortgage.originalAmount} onChange={(originalAmount) => update({ originalAmount })} />
          </Field>
          <Field layout="row" label="Original term (years)" help="For reference, e.g. 15 or 30.">
            <OptionalNumberField
              value={mortgage.originalTermYears}
              step={1}
              onChange={(originalTermYears) => update({ originalTermYears })}
            />
          </Field>
          {readOnly ? null : (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => removeMortgage(mortgage.id)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-danger"
              >
                Delete mortgage
              </button>
            </div>
          )}
        </Group>
      </div>

      <Summary mortgage={mortgage} result={result} />
      <ScheduleTable result={result} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="m-0 text-[13.5px] font-bold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function MonthYear({
  month,
  year,
  allowEmpty = false,
  onChange,
}: {
  month: number | undefined;
  year: number | undefined;
  allowEmpty?: boolean;
  onChange: (month: number, year: number | undefined) => void;
}) {
  const m = month ?? 1;
  return (
    <div className="flex gap-2">
      <span className="w-[96px] shrink-0">
        <Select value={String(m)} onChange={(v) => onChange(Number(v), year)} options={MONTH_OPTIONS} />
      </span>
      <YearSelect
        value={year}
        allowEmpty={allowEmpty}
        from={1970}
        to={2100}
        onChange={(y) => onChange(m, y)}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-card px-3 py-2.5">
      <span className="text-[11px] font-semibold text-muted-3">{label}</span>
      <span className="text-[15px] font-bold tabular-nums text-foreground">{value}</span>
      {note ? <span className="text-[11px] text-muted">{note}</span> : null}
    </div>
  );
}

function Summary({ mortgage, result }: { mortgage: MortgageStatement; result: AmortizationResult }) {
  if (!(mortgage.principalBalance > 0)) {
    return (
      <p className="m-0 rounded-2xl border border-border bg-white px-5 py-4 text-[13px] text-muted">
        Enter the principal balance, rate and payment from your statement to build the table.
      </p>
    );
  }
  if (result.negativeAmortization || result.rows.length === 0) {
    return (
      <p className="m-0 rounded-2xl border border-danger-border bg-white px-5 py-4 text-[13px] text-danger">
        The payment doesn&apos;t cover the first month&apos;s interest (
        {formatCurrency(mortgage.principalBalance * (mortgage.interestRate / 12), true)}), so the
        loan never pays down. Check the payment, or enter a maturity date and leave the payment at 0.
      </p>
    );
  }
  const escrow = mortgage.monthlyEscrow ?? 0;
  const original = mortgage.originalAmount ?? 0;
  const gap = result.maturityGap;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          label="Monthly payment"
          value={formatCurrency(result.monthlyPayment + escrow + (mortgage.extraPrincipal ?? 0), true)}
          note={`P&I ${formatCurrency(result.monthlyPayment, true)}${escrow > 0 ? ` + escrow ${formatCurrency(escrow, true)}` : ""}${(mortgage.extraPrincipal ?? 0) > 0 ? ` + extra ${formatCurrency(mortgage.extraPrincipal ?? 0)}` : ""}`}
        />
        <Stat
          label="Payments left"
          value={result.rows.length}
          note={`${Math.floor(result.rows.length / 12)} yrs ${result.rows.length % 12} mos`}
        />
        <Stat label="Paid off" value={result.payoff ? monthYear(result.payoff.month, result.payoff.year) : "-"} />
        <Stat label="Interest left to pay" value={formatCurrency(result.totalInterest)} note={`at ${formatPercent(mortgage.interestRate)}`} />
      </div>
      {original > 0 ? (
        <p className="m-0 text-[13px] text-muted">
          {formatPercent(Math.max(0, 1 - mortgage.principalBalance / original))} of the{" "}
          {formatCurrency(original)} loan is paid off
          {mortgage.originalTermYears ? ` (${mortgage.originalTermYears}-year term)` : ""}.
        </p>
      ) : null}
      {gap != null && !result.paymentDerived ? (
        <p
          className={`m-0 rounded-lg px-3 py-2 text-[13px] ${
            Math.abs(gap) <= 1 ? "bg-accent-soft text-foreground" : "bg-card text-muted"
          }`}
        >
          {Math.abs(gap) <= 1
            ? "Checks out: without extra principal the last payment lands on the maturity date."
            : `Without extra principal the last payment lands ${Math.abs(gap)} months ${gap > 0 ? "after" : "before"} the maturity date. Check the balance, rate and payment against the statement.`}
        </p>
      ) : null}
      {result.extraSavings ? (
        <p className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-foreground">
          <strong>Extra principal:</strong> {formatCurrency(mortgage.extraPrincipal ?? 0)}/mo saves{" "}
          {formatCurrency(result.extraSavings.interest)} of interest and pays the loan off{" "}
          {result.extraSavings.months} months sooner.
        </p>
      ) : null}
    </div>
  );
}

const CELL = "border-b border-border-subtle px-3 py-1.5 text-right tabular-nums";
const HEAD = "sticky top-0 z-10 bg-[#1B365D] px-3 py-2 text-right text-[12px] font-bold text-white";

function ScheduleTable({ result }: { result: AmortizationResult }) {
  const [view, setView] = useState<"yearly" | "monthly">("yearly");
  if (result.rows.length === 0) return null;
  const hasExtra = result.rows.some((r) => r.extra > 0);
  const hasEscrow = result.rows.some((r) => r.escrow > 0);
  const money = (x: number) => formatCurrency(x, true);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">Amortization table</h3>
        <div className="flex gap-1 text-[12.5px] font-semibold">
          {(["yearly", "monthly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 ${view === v ? "bg-accent-soft text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {v === "yearly" ? "By year" : "By month"}
            </button>
          ))}
        </div>
      </div>
      <DualScroll>
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr>
                {view === "monthly" ? <th className={`${HEAD} text-left`}>#</th> : null}
                <th className={`${HEAD} text-left`}>{view === "monthly" ? "Month" : "Year"}</th>
                <th className={HEAD}>{view === "monthly" ? "Payment" : "Payments"}</th>
                <th className={HEAD}>Interest</th>
                <th className={HEAD}>Principal</th>
                {hasExtra ? <th className={HEAD}>Extra</th> : null}
                {hasEscrow ? <th className={HEAD}>Escrow</th> : null}
                <th className={HEAD}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {view === "monthly"
                ? result.rows.map((r) => (
                    <tr key={r.number} className={r.month === 12 ? "bg-card" : undefined}>
                      <td className={`${CELL} text-left text-muted`}>{r.number}</td>
                      <td className={`${CELL} text-left`}>{monthYear(r.month, r.year)}</td>
                      <td className={CELL}>{money(r.payment)}</td>
                      <td className={CELL}>{money(r.interest)}</td>
                      <td className={CELL}>{money(r.principal)}</td>
                      {hasExtra ? <td className={CELL}>{money(r.extra)}</td> : null}
                      {hasEscrow ? <td className={CELL}>{money(r.escrow)}</td> : null}
                      <td className={`${CELL} font-semibold`}>{money(r.endBalance)}</td>
                    </tr>
                  ))
                : result.years.map((y) => (
                    <tr key={y.year}>
                      <td className={`${CELL} text-left font-semibold`}>{y.year}</td>
                      <td className={CELL}>{money(y.payments)}</td>
                      <td className={CELL}>{money(y.interest)}</td>
                      <td className={CELL}>{money(y.principal)}</td>
                      {hasExtra ? <td className={CELL}>{money(y.extra)}</td> : null}
                      {hasEscrow ? <td className={CELL}>{money(y.escrow)}</td> : null}
                      <td className={`${CELL} font-semibold`}>{money(y.endBalance)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </DualScroll>
    </div>
  );
}

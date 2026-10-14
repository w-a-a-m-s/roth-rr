"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Household, SocialSecurityClaim } from "@/lib/domain/types";
import { useScenario } from "@/store/useScenario";
import { usePlanAccess } from "@/components/plan/usePlanAccess";
import { Field } from "@/components/ui/Field";
import { MoneyInput, NumberField, Select } from "@/components/ui/inputs";
import { AddButton } from "@/components/ui/EntityCard";
import { IconButton, iconProps } from "@/components/ui/IconButton";
import { DualScroll } from "@/components/results/DualScroll";
import {
  CHART_CHROME,
  chartTooltipProps,
  formatAxisCurrency,
} from "@/components/results/chartUtils";
import {
  socialSecurityBreakeven,
  socialSecurityPeople,
  type SocialSecurityBreakeven,
} from "@/lib/engine/socialSecurity";
import { formatCurrency, formatPercent } from "@/lib/format";
import { uid } from "@/lib/id";

/** Plan first, then each other claiming age. */
const OPTION_COLORS = ["#2563EB", "#1C8A5B", "#B0552B", "#7C3AED", "#B8791F", "#C0492F"];
const colorOf = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];

/**
 * Social Security analysis: the plan's Social Security against other claiming
 * ages, with the year each one's running total crosses the plan's. It doesn't
 * change the projection.
 */
export function SocialSecurityAnalysis({ household }: { household: Household }) {
  const people = socialSecurityPeople(household);
  const [personId, setPersonId] = useState<string | null>(null);
  const person = people.find((p) => p.id === personId) ?? people[0];
  const result = person ? socialSecurityBreakeven(household, person.id) : null;

  if (!person || !result) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-muted">
        <p className="font-medium text-foreground">No Social Security in the plan</p>
        <p className="mt-1">
          Add a Social Security income (with a birth year for its owner) in the Income step to
          compare claiming ages.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 max-w-[640px] text-[13px] leading-relaxed text-muted">
            Compare the plan&apos;s Social Security with claiming at another age. Enter the
            monthly benefit for each age from the Social Security statement. Each benefit grows by
            the plan&apos;s Social Security COLA ({formatPercent(result.cola)}) after it starts.
            Totals are before tax. This doesn&apos;t change the plan&apos;s projection.
          </p>
          {people.length > 1 ? (
            <span className="w-[180px]">
              <Select
                value={person.id}
                onChange={setPersonId}
                options={people.map((p) => ({ value: p.id, label: p.name || "Person" }))}
              />
            </span>
          ) : null}
        </div>
        <ClaimInputs household={household} personId={person.id} result={result} />
      </div>
      {result.options.length > 1 ? (
        <>
          <CrossoverTable result={result} />
          <CumulativeChart result={result} />
          <BreakevenTable result={result} />
        </>
      ) : (
        <p className="m-0 rounded-2xl border border-border bg-white px-5 py-4 text-[13px] text-muted">
          Add a claiming age and its monthly benefit to see the breakeven against the plan.
        </p>
      )}
    </div>
  );
}

/** The plan's claim, read only, and the other claiming ages to compare. */
function ClaimInputs({
  household,
  personId,
  result,
}: {
  household: Household;
  personId: string;
  result: SocialSecurityBreakeven;
}) {
  const setClaims = useScenario((s) => s.setSocialSecurityClaims);
  const { readOnly } = usePlanAccess();
  const all = household.socialSecurityClaims ?? [];
  const mine = all.filter((c) => c.personId === personId);
  const plan = result.options[0];

  const update = (id: string, patch: Partial<SocialSecurityClaim>) =>
    setClaims(all.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => setClaims(all.filter((c) => c.id !== id));
  const add = () =>
    setClaims([...all, { id: uid("ssc"), personId, age: 70, monthlyAmount: 0 }]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14.5px] font-bold text-foreground">Benefit by claiming age</h3>
        {readOnly ? null : (
          <AddButton label="Add claiming age" shortLabel="Add" onClick={add} />
        )}
      </div>
      <p className="m-0 text-[13px] text-foreground">
        <strong>Plan:</strong> claim at {plan.claimAge} ({plan.claimYear}),{" "}
        {formatCurrency(plan.monthlyAtClaim)}/mo
      </p>
      {mine.map((claim) => (
        <div key={claim.id} className="flex flex-wrap items-end gap-3">
          <span className="w-[110px]">
            <Field label="Claiming age">
              <NumberField
                value={claim.age}
                min={62}
                step={1}
                onChange={(age) => update(claim.id, { age })}
              />
            </Field>
          </span>
          <span className="w-[180px]">
            <Field label="Monthly benefit">
              <MoneyInput
                value={claim.monthlyAmount}
                step={100}
                onChange={(monthlyAmount) => update(claim.id, { monthlyAmount })}
              />
            </Field>
          </span>
          {readOnly ? null : (
            <span className="pb-1">
              <IconButton title="Remove" danger onClick={() => remove(claim.id)}>
                <svg {...iconProps}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </IconButton>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const CELL = "border-b border-border-subtle px-3 py-1.5 text-right tabular-nums";
const HEAD = "bg-[#1B365D] px-3 py-2 text-right text-[12px] font-bold text-white";

/** Each other claim against the plan: when it catches up and where it ends. */
function CrossoverTable({ result }: { result: SocialSecurityBreakeven }) {
  const last = result.years[result.years.length - 1];
  const plan = result.options[0];
  const planTotal = last?.cumulative[0] ?? 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Crossover year</h3>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`}>Option</th>
              <th className={HEAD}>Claim year</th>
              <th className={HEAD}>Monthly at claim</th>
              <th className={HEAD}>Crossover year</th>
              <th className={HEAD}>Crossover age</th>
              <th className={HEAD}>Total by age {last?.age}</th>
              <th className={HEAD}>Vs plan by age {last?.age}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${CELL} text-left font-semibold`} style={{ color: colorOf(0) }}>
                {plan.label}
              </td>
              <td className={CELL}>{plan.claimYear}</td>
              <td className={CELL}>{formatCurrency(plan.monthlyAtClaim)}</td>
              <td className={CELL}>-</td>
              <td className={CELL}>-</td>
              <td className={CELL}>{formatCurrency(planTotal)}</td>
              <td className={CELL}>-</td>
            </tr>
            {result.crossovers.map((c) => {
              const option = result.options[c.option];
              return (
                <tr key={option.key}>
                  <td
                    className={`${CELL} text-left font-semibold`}
                    style={{ color: colorOf(c.option) }}
                  >
                    {option.label}
                  </td>
                  <td className={CELL}>{option.claimYear}</td>
                  <td className={CELL}>{formatCurrency(option.monthlyAtClaim)}</td>
                  <td className={`${CELL} font-bold`}>{c.year ?? "Never"}</td>
                  <td className={`${CELL} font-bold`}>{c.age ?? "-"}</td>
                  <td className={CELL}>{formatCurrency(c.totalAtEnd)}</td>
                  <td
                    className={`${CELL} font-semibold ${
                      c.differenceAtEnd >= 0 ? "text-[#1C8A5B]" : "text-danger"
                    }`}
                  >
                    {c.differenceAtEnd >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(c.differenceAtEnd))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">
        The crossover year is the first year the option&apos;s running total of benefits reaches
        the plan&apos;s. Living past that age favors the option; passing before it favors the
        plan.
      </p>
    </div>
  );
}

/** Running totals per option, with each crossover marked. */
function CumulativeChart({ result }: { result: SocialSecurityBreakeven }) {
  const data = result.years.map((y) => {
    const point: Record<string, number> = { year: y.year };
    y.cumulative.forEach((v, i) => (point[`o${i}`] = v));
    return point;
  });
  return (
    <div className="rounded-2xl border border-border bg-white px-5 py-[18px]">
      <h3 className="mb-2.5 text-[14.5px] font-bold text-foreground">
        Cumulative benefits
      </h3>
      <div className="h-64 w-full sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} />
            <XAxis
              dataKey="year"
              tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CHART_CHROME.axis }}
            />
            <YAxis
              tickFormatter={formatAxisCurrency}
              tick={{ fill: CHART_CHROME.tick, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip {...chartTooltipProps(data.length, { idleLastPoint: false })} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="line" />
            {result.crossovers.map((c) =>
              c.year == null ? null : (
                <ReferenceLine
                  key={c.option}
                  x={c.year}
                  stroke={colorOf(c.option)}
                  strokeDasharray="4 4"
                  label={{
                    value: `Crossover ${c.year} (age ${c.age})`,
                    position: "insideTopLeft",
                    fill: colorOf(c.option),
                    fontSize: 11,
                  }}
                />
              ),
            )}
            {result.options.map((o, i) => (
              <Line
                key={o.key}
                type="monotone"
                dataKey={`o${i}`}
                name={o.label}
                stroke={colorOf(i)}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Year by year: each option's benefit and running total, and the gap to the plan. */
function BreakevenTable({ result }: { result: SocialSecurityBreakeven }) {
  const crossYears = new Set(result.crossovers.map((c) => c.year).filter((y) => y != null));
  const others = result.options.slice(1);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <h3 className="m-0 text-[14.5px] font-bold text-foreground">Breakeven by year</h3>
      <DualScroll>
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={`${HEAD} text-left`} rowSpan={2}>
                Year
              </th>
              <th className={HEAD} rowSpan={2}>
                Age
              </th>
              {result.options.map((o) => (
                <th key={o.key} className={`${HEAD} text-center`} colSpan={2}>
                  {o.label}
                </th>
              ))}
              {others.map((o) => (
                <th key={`d-${o.key}`} className={HEAD} rowSpan={2}>
                  {o.label} vs plan
                </th>
              ))}
            </tr>
            <tr>
              {result.options.map((o) => [
                <th key={`a-${o.key}`} className={HEAD}>
                  Annual
                </th>,
                <th key={`c-${o.key}`} className={HEAD}>
                  Running total
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.year} className={crossYears.has(y.year) ? "bg-[#E7F2EC] font-semibold" : ""}>
                <td className={`${CELL} text-left`}>{y.year}</td>
                <td className={CELL}>{y.age}</td>
                {result.options.map((o, i) => [
                  <td key={`a-${o.key}`} className={CELL}>
                    {formatCurrency(y.annual[i])}
                  </td>,
                  <td key={`c-${o.key}`} className={CELL}>
                    {formatCurrency(y.cumulative[i])}
                  </td>,
                ])}
                {others.map((o, k) => {
                  const diff = y.cumulative[k + 1] - y.cumulative[0];
                  return (
                    <td
                      key={`d-${o.key}`}
                      className={`${CELL} ${diff >= 0 ? "text-[#1C8A5B]" : "text-danger"}`}
                    >
                      {diff >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(diff))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>
      <p className="m-0 text-[12px] text-muted">Crossover years are highlighted.</p>
    </div>
  );
}

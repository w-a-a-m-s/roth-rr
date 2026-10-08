"use client";

import type { ReactNode } from "react";
import type {
  CarePeriod,
  DeathEvent,
  Household,
  LongTermCareSettings,
} from "@/lib/domain/types";
import { PercentInput, Select } from "@/components/ui/inputs";
import {
  CARE_EXPENSE_SHARE,
  CARE_MONTHLY_COST,
  CARE_TYPE_LABELS,
  carePeriodFor,
  peopleInCare,
} from "@/lib/domain/longTermCare";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  SURVIVOR_EXPENSE_SHARE,
  resolveDeath,
  socialSecurityAfterDeath,
} from "@/lib/domain/survivorship";
import { projectionStartYear, projectionYears } from "@/lib/engine/project";
import { useScenario } from "@/store/useScenario";
import { useUI, type AnalysisKind } from "@/store/useUI";

const ANALYSES: { key: AnalysisKind; label: string }[] = [
  { key: "retirement", label: "Retirement" },
  { key: "survivorship", label: "Survivorship" },
  { key: "disability", label: "Disability" },
  { key: "longTermCare", label: "Long-term care" },
];

/** Links that switch the results between analyses of the same plan. */
export function AnalysisTabs() {
  const analysis = useUI((s) => s.analysis);
  const setAnalysis = useUI((s) => s.setAnalysis);
  return (
    <nav aria-label="Analysis" className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {ANALYSES.map(({ key, label }, i) => (
        <span key={key} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="px-1 text-muted-3">
              |
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setAnalysis(key)}
            aria-current={analysis === key ? "page" : undefined}
            className={`rounded px-1 text-[14px] font-semibold underline-offset-4 transition ${
              analysis === key
                ? "text-foreground underline decoration-2"
                : "text-accent hover:underline"
            }`}
          >
            {label}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** Who passes and at what age, for the Survivorship analysis. */
export function SurvivorshipControls({
  household,
  event,
}: {
  household: Household;
  event: DeathEvent;
}) {
  const setSurvivorship = useScenario((s) => s.setSurvivorship);
  const person = household.people.find((p) => p.id === event.personId);
  const survivor = household.people.find((p) => p.id !== event.personId);
  const start = projectionStartYear(household);
  const ageNow = person?.birthYear != null ? start - person.birthYear : 50;
  const ages = Array.from({ length: Math.max(1, 111 - ageNow) }, (_, i) => ageNow + i);
  const death = resolveDeath(household, event);
  const ss = socialSecurityAfterDeath(
    household,
    death,
    start,
    start + projectionYears(household) - 1,
  );
  const name = (p?: { name?: string }) => p?.name?.trim() || "Spouse";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-2">
          <label htmlFor="survivorship-person">Who passes</label>
          <span className="w-[180px]">
            <Select
              id="survivorship-person"
              value={event.personId}
              onChange={(personId) => setSurvivorship({ ...event, personId })}
              options={household.people.map((p) => ({
                value: p.id,
                label: name(p),
              }))}
            />
          </span>
        </div>
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-2">
          <label htmlFor="survivorship-age">At age</label>
          <span className="w-[104px]">
            <Select
              id="survivorship-age"
              value={String(event.deathAge)}
              onChange={(v) => setSurvivorship({ ...event, deathAge: Number(v) })}
              options={ages.map((a) => ({ value: String(a), label: String(a) }))}
            />
          </span>
        </div>
      </div>
      {death ? (
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          {name(person)} passes at the end of {death.year}. From {death.year + 1},{" "}
          {name(survivor)} files single, keeps the larger Social Security
          benefit, and inherits {name(person)}&apos;s accounts.{" "}
          {name(person)}&apos;s life-only pensions and earnings stop;
          survivorship pensions keep paying the same amount. Expenses drop to{" "}
          {Math.round(SURVIVOR_EXPENSE_SHARE * 100)}% of what you spent together.
        </p>
      ) : null}
      {ss ? (
        <p
          className={`m-0 rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
            ss.steppedUp ? "bg-accent-soft text-foreground" : "bg-card text-muted"
          }`}
        >
          {ss.steppedUp ? (
            <>
              <strong>Social Security step-up:</strong> from {ss.year},{" "}
              {name(survivor)} steps up to {name(person)}&apos;s Social Security
              of {formatCurrency(ss.deceasedMonthly)}/mo
              {ss.survivorMonthly > 0
                ? ` instead of their own ${formatCurrency(ss.survivorMonthly)}/mo`
                : ""}
              . {name(survivor)}&apos;s own benefit stops.
            </>
          ) : (
            <>
              No Social Security step-up: {name(survivor)}&apos;s own benefit (
              {formatCurrency(ss.survivorMonthly)}/mo in {ss.year}) is larger than{" "}
              {name(person)}&apos;s ({formatCurrency(ss.deceasedMonthly)}/mo), so{" "}
              {name(survivor)} keeps their own.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

/** Placeholder for analyses we haven't built yet. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-8 text-center">
      <p className="m-0 font-serif text-[21px] font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted">
        This analysis is on its way. It will run from the same plan as Retirement.
      </p>
    </div>
  );
}

/** Who's in long-term care, what kind, when, and for how long. */
export function LongTermCareControls({
  household,
  settings,
}: {
  household: Household;
  settings: LongTermCareSettings;
}) {
  const setLongTermCare = useScenario((s) => s.setLongTermCare);
  const name = (id: string) =>
    household.people.find((p) => p.id === id)?.name?.trim() || "Person";
  const whoValue = settings.who === "both" ? "both" : settings.personId;
  const whoOptions = [
    ...household.people.map((p) => ({ value: p.id, label: `${name(p.id)} only` })),
    ...(household.people.length > 1 ? [{ value: "both", label: "Both spouses" }] : []),
  ];
  const inCare = peopleInCare(household, settings);
  const start = projectionStartYear(household);

  const setPeriod = (period: CarePeriod) =>
    setLongTermCare({
      ...settings,
      periods: [
        ...settings.periods.filter((p) => p.personId !== period.personId),
        period,
      ],
    });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Control id="ltc-who" label="Who's in care" width="w-[180px]">
          <Select
            id="ltc-who"
            value={whoValue}
            onChange={(v) =>
              setLongTermCare(
                v === "both"
                  ? { ...settings, who: "both" }
                  : { ...settings, who: "one", personId: v },
              )
            }
            options={whoOptions}
          />
        </Control>
        <Control id="ltc-type" label="Care" width="w-[220px]">
          <Select
            id="ltc-type"
            value={settings.careType}
            onChange={(careType) => setLongTermCare({ ...settings, careType })}
            options={(["home", "nursing"] as const).map((t) => ({
              value: t,
              label: `${CARE_TYPE_LABELS[t]} (${formatCurrency(CARE_MONTHLY_COST[t])}/mo)`,
            }))}
          />
        </Control>
        <Control id="ltc-inflation" label="Cost grows by" width="w-[110px]">
          <PercentInput
            id="ltc-inflation"
            value={settings.inflation}
            onChange={(inflation) => setLongTermCare({ ...settings, inflation })}
          />
        </Control>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {inCare.map((personId) => {
          const person = household.people.find((p) => p.id === personId);
          const period = carePeriodFor(household, settings, personId);
          const ageNow = person?.birthYear != null ? start - person.birthYear : 50;
          const ages = Array.from({ length: Math.max(1, 111 - ageNow) }, (_, i) => ageNow + i);
          return (
            <div key={personId} className="flex flex-wrap items-end gap-3">
              <Control id={`ltc-age-${personId}`} label={`${name(personId)} starts at age`} width="w-[104px]">
                <Select
                  id={`ltc-age-${personId}`}
                  value={String(period.startAge)}
                  onChange={(v) => setPeriod({ ...period, startAge: Number(v) })}
                  options={ages.map((a) => ({ value: String(a), label: String(a) }))}
                />
              </Control>
              <Control id={`ltc-years-${personId}`} label="For" width="w-[110px]">
                <Select
                  id={`ltc-years-${personId}`}
                  value={String(period.years)}
                  onChange={(v) => setPeriod({ ...period, years: Number(v) })}
                  options={Array.from({ length: 15 }, (_, i) => ({
                    value: String(i + 1),
                    label: `${i + 1} ${i === 0 ? "year" : "years"}`,
                  }))}
                />
              </Control>
            </div>
          );
        })}
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Care costs {formatCurrency(CARE_MONTHLY_COST[settings.careType])}{" "}
        a month
        per person in today&apos;s dollars, growing{" "}
        {formatPercent(settings.inflation)} a year. While one spouse is in care,
        your other expenses drop to {Math.round(CARE_EXPENSE_SHARE * 100)}%; while
        everyone is in care, only the care costs count. After care ends, expenses
        go back to normal. Care length defaults to 3 years for men and 5 for women
        (set in Household).
      </p>
    </div>
  );
}

function Control({
  id,
  label,
  width,
  children,
}: {
  id: string;
  label: string;
  width: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-2">
      <label htmlFor={id}>{label}</label>
      <span className={width}>{children}</span>
    </div>
  );
}

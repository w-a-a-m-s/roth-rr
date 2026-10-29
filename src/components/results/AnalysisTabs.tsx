"use client";

import type { ReactNode } from "react";
import type {
  CarePeriod,
  DeathEvent,
  DisabilityEvent,
  Household,
  LongTermCareSettings,
} from "@/lib/domain/types";
import {
  DISABILITY_BENEFIT_PERIOD_LABELS,
  INSURANCE_WAITING_LABELS,
  disabilityPolicies,
  lifeInsuranceClaims,
  longTermCareBenefitLabel,
  longTermCarePolicies,
  resolveDisability,
} from "@/lib/domain/insurance";
import { PercentInput, Select } from "@/components/ui/inputs";
import {
  CARE_EXPENSE_SHARES,
  INDIVIDUAL_CARE_EXPENSE_SHARES,
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
import { ReturnsArticleLink } from "@/components/plan/ReturnsArticle";
import { BalancedReturnsLink, Sp500ReturnsLink } from "@/components/plan/MarketHistory";
import { IncomeTableLink } from "@/components/plan/IncomeTable";

const ANALYSES: { key: AnalysisKind; label: string }[] = [
  { key: "retirement", label: "Retirement" },
  { key: "survivorship", label: "Survivorship" },
  { key: "disability", label: "Disability" },
  { key: "longTermCare", label: "Long-term care" },
  { key: "mortgage", label: "Mortgage analysis" },
  { key: "mortgagePayoff", label: "Pay off or invest" },
  { key: "socialSecurity", label: "Social Security analysis" },
  { key: "medicare", label: "Medicare analysis" },
  { key: "car", label: "Car analysis" },
  { key: "spendingCapacity", label: "Spending capacity" },
];

/** Links that switch the results between analyses of the same plan. */
export function AnalysisTabs() {
  const analysis = useUI((s) => s.analysis);
  const setAnalysis = useUI((s) => s.setAnalysis);
  return (
    <div className="flex flex-col gap-1.5">
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11.5px] text-muted-2">
        <span className="font-semibold">Articles:</span>
        <ReturnsArticleLink />
        <span aria-hidden className="text-muted-3">·</span>
        <Sp500ReturnsLink />
        <span aria-hidden className="text-muted-3">·</span>
        <BalancedReturnsLink />
        <span aria-hidden className="text-muted-3">·</span>
        <IncomeTableLink />
      </div>
    </div>
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
  // A death can be any year from today on, before retirement too: the
  // projection then starts in the year of death.
  const thisYear = new Date().getFullYear();
  const ageNow = person?.birthYear != null ? thisYear - person.birthYear : 50;
  const ages = Array.from({ length: Math.max(1, 111 - ageNow) }, (_, i) => ageNow + i);
  const death = resolveDeath(household, event);
  const ss = socialSecurityAfterDeath(
    household,
    death,
    start,
    start + projectionYears(household) - 1,
  );
  const name = (p?: { name?: string }) => p?.name?.trim() || "Spouse";
  const claims = lifeInsuranceClaims(household, death);
  const lifeCovered = (household.insurance ?? []).some(
    (p) => p.kind === "life" && p.insuredId === event.personId && p.faceAmount > 0,
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-2">
          <label htmlFor="survivorship-person">Who passes</label>
          <span className="w-[180px]">
            <Select
              id="survivorship-person"
              value={event.personId}
              onChange={(personId) => {
                const next = household.people.find((p) => p.id === personId);
                const nextAgeNow = next?.birthYear != null ? thisYear - next.birthYear : 0;
                setSurvivorship({ personId, deathAge: Math.max(event.deathAge, nextAgeNow) });
              }}
              options={household.people.map((p) => ({
                value: p.id,
                label: name(p),
              }))}
            />
          </span>
        </div>
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-2">
          <label htmlFor="survivorship-age">Passes in</label>
          <span className="w-[150px]">
            <Select
              id="survivorship-age"
              value={String(event.deathAge)}
              onChange={(v) => setSurvivorship({ ...event, deathAge: Number(v) })}
              options={ages.map((a) => ({
                value: String(a),
                label: person?.birthYear != null ? `${person.birthYear + a} · age ${a}` : `Age ${a}`,
              }))}
            />
          </span>
        </div>
      </div>
      {death ? (
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          {death.year < start
            ? `This is before the plan starts in ${start}, so the projection starts in ${death.year}. `
            : ""}
          {name(person)} passes at the end of {death.year}. From {death.year + 1},{" "}
          {name(survivor)} files single, keeps the larger Social Security
          benefit, and inherits {name(person)}&apos;s accounts.{" "}
          {name(person)}&apos;s life-only pensions and earnings stop;
          survivorship pensions keep paying the same amount. Expenses drop to{" "}
          {Math.round(SURVIVOR_EXPENSE_SHARE * 100)}% of what you spent together.
        </p>
      ) : null}
      {claims.length > 0 ? (
        <p className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-foreground">
          <strong>Income from life insurance:</strong>{" "}
          {claims
            .map(
              (c) =>
                `${formatCurrency(c.faceAmount)} death benefit pays ${formatCurrency(c.annualIncome / 12)}/mo (${formatPercent(c.rate)} a year)`,
            )
            .join("; ")}{" "}
          for life from {death?.year != null ? death.year + 1 : ""}. The death
          benefit lands in {death?.year} and shows in that year&apos;s assets. The money is
          invested at 8% a year; the payout rate comes from the age at death
          (5% under 59). Earnings come out first and are taxed as ordinary
          income.
        </p>
      ) : death && lifeCovered ? (
        <p className="m-0 rounded-lg bg-card px-3 py-2 text-[13px] leading-relaxed text-muted">
          {name(person)}&apos;s term life insurance has ended by {death.year}, so
          it doesn&apos;t pay.
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

/** Who becomes disabled and at what age, for the Disability analysis. */
export function DisabilityControls({
  household,
  event,
}: {
  household: Household;
  event: DisabilityEvent;
}) {
  const setDisability = useScenario((s) => s.setDisability);
  const person = household.people.find((p) => p.id === event.personId);
  const start = projectionStartYear(household);
  // A disability can start any year from today on, before retirement too: the
  // projection then starts that year.
  const thisYear = new Date().getFullYear();
  const ageNow = person?.birthYear != null ? thisYear - person.birthYear : 50;
  const ages = Array.from({ length: Math.max(1, 111 - ageNow) }, (_, i) => ageNow + i);
  const disability = resolveDisability(household, event);
  const policies = disabilityPolicies(household).filter((p) => p.insuredId === event.personId);
  const name = (p?: { name?: string }) => p?.name?.trim() || "Person";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <Control id="disability-person" label="Who's disabled" width="w-[180px]">
          <Select
            id="disability-person"
            value={event.personId}
            onChange={(personId) => {
              const next = household.people.find((p) => p.id === personId);
              const age = next?.birthYear != null ? thisYear - next.birthYear : event.age;
              setDisability({ personId, age: Math.max(age, event.age) });
            }}
            options={household.people.map((p) => ({ value: p.id, label: name(p) }))}
          />
        </Control>
        <Control id="disability-age" label="Disabled from" width="w-[150px]">
          <Select
            id="disability-age"
            value={String(event.age)}
            onChange={(v) => setDisability({ ...event, age: Number(v) })}
            options={ages.map((a) => ({
              value: String(a),
              label: person?.birthYear != null ? `${person.birthYear + a} · age ${a}` : `Age ${a}`,
            }))}
          />
        </Control>
      </div>
      {disability ? (
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          {disability.year < start
            ? `This is before the plan starts in ${start}, so the projection starts in ${disability.year}. `
            : ""}
          {name(person)} becomes disabled on January 1, {disability.year}, and
          can&apos;t work from then on: {name(person)}&apos;s salary and business
          income stop. Everything else, including expenses, stays the same.
        </p>
      ) : null}
      {policies.length > 0 ? (
        <p className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-foreground">
          <strong>Income from disability insurance:</strong>{" "}
          {policies
            .map(
              (p) =>
                `${formatCurrency(p.monthlyBenefit)}/mo after a ${INSURANCE_WAITING_LABELS[p.waitingDays]} waiting period, ${DISABILITY_BENEFIT_PERIOD_LABELS[p.benefitPeriod].toLowerCase()}${p.taxable ? " (taxable)" : " (tax free)"}`,
            )
            .join("; ")}
          . It only pays in this analysis.
        </p>
      ) : (
        <p className="m-0 rounded-lg bg-card px-3 py-2 text-[13px] leading-relaxed text-muted">
          {name(person)} has no disability insurance. Add a policy in the
          Insurance step to see its income here.
        </p>
      )}
    </div>
  );
}

/** A care expense share as a whole percent, e.g. 0.75 as "75%". */
const carePct = (share: number) => `${Math.round(share * 100)}%`;

const CARE_OPTIONS = (["home", "nursing"] as const).map((t) => ({
  value: t,
  label: `${CARE_TYPE_LABELS[t]} (${formatCurrency(CARE_MONTHLY_COST[t])}/mo)`,
}));

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

  const policies = longTermCarePolicies(household).filter((p) => inCare.includes(p.insuredId));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white px-5 py-4">
      <p className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-foreground">
        <strong>Note:</strong> while someone is in long-term care, your other
        expenses are adjusted to a share of what you spent before care, on top
        of the care itself:{" "}
        {household.people.length === 1 ? (
          <>
            {carePct(INDIVIDUAL_CARE_EXPENSE_SHARES.home)} in home care and{" "}
            {carePct(INDIVIDUAL_CARE_EXPENSE_SHARES.nursing)} in a nursing home.
          </>
        ) : (
          <>
            {carePct(CARE_EXPENSE_SHARES.home)} with one spouse in home care,{" "}
            {carePct(CARE_EXPENSE_SHARES.nursing)} with one in a nursing home,{" "}
            {carePct(CARE_EXPENSE_SHARES.homeHome)} with both in home care,{" "}
            {carePct(CARE_EXPENSE_SHARES.homeNursing)} with one at home and one
            in a nursing home, and {carePct(CARE_EXPENSE_SHARES.nursingNursing)}{" "}
            with both in a nursing home.
          </>
        )}
      </p>
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
        <Control id="ltc-inflation" label="Cost grows by" width="w-[110px]">
          <PercentInput
            id="ltc-inflation"
            value={settings.inflation}
            onChange={(inflation) => setLongTermCare({ ...settings, inflation })}
          />
        </Control>
      </div>
      <div className="flex flex-col gap-3">
        {inCare.map((personId) => {
          const person = household.people.find((p) => p.id === personId);
          const period = carePeriodFor(household, settings, personId);
          const ageNow = person?.birthYear != null ? start - person.birthYear : 50;
          const ages = Array.from({ length: Math.max(1, 111 - ageNow) }, (_, i) => ageNow + i);
          return (
            <div key={personId} className="flex flex-wrap items-end gap-3">
              <Control id={`ltc-type-${personId}`} label={`${name(personId)}'s care`} width="w-[220px]">
                <Select
                  id={`ltc-type-${personId}`}
                  value={period.careType ?? settings.careType}
                  onChange={(careType) => setPeriod({ ...period, careType })}
                  options={CARE_OPTIONS}
                />
              </Control>
              <Control id={`ltc-age-${personId}`} label="Starts in" width="w-[150px]">
                <Select
                  id={`ltc-age-${personId}`}
                  value={String(period.startAge)}
                  onChange={(v) => setPeriod({ ...period, startAge: Number(v) })}
                  options={ages.map((a) => ({
                    value: String(a),
                    label: person?.birthYear != null ? `${person.birthYear + a} · age ${a}` : `Age ${a}`,
                  }))}
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
        {[
          `Home care costs ${formatCurrency(CARE_MONTHLY_COST.home)} and a nursing home ${formatCurrency(CARE_MONTHLY_COST.nursing)} a month per person in today's dollars, growing ${formatPercent(settings.inflation)} a year.`,
          "After care ends, expenses go back to normal.",
          "Care length defaults to 3 years for men and 5 for women (set in Household).",
        ].join(" ")}
      </p>
      {policies.length > 0 ? (
        <p className="m-0 rounded-lg bg-card px-3 py-2 text-[13px] leading-relaxed text-muted">
          <strong className="text-foreground">Long-term care insurance:</strong>{" "}
          {policies
            .map(
              (p) =>
                `${name(p.insuredId)}'s policy pays up to ${formatCurrency(p.monthlyBenefit)}/mo after ${INSURANCE_WAITING_LABELS[p.waitingDays]} of care, for ${longTermCareBenefitLabel(p.benefitYears).toLowerCase()}`,
            )
            .join("; ")}
          . Benefits never pay more than the care costs, never outlast the care,
          and are tax free. They show as their own income line.
        </p>
      ) : null}
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

"use client";

import type { DeathEvent, Household } from "@/lib/domain/types";
import { Select } from "@/components/ui/inputs";
import { SURVIVOR_EXPENSE_SHARE, resolveDeath } from "@/lib/domain/survivorship";
import { projectionStartYear } from "@/lib/engine/project";
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

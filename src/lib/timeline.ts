import type { Household } from "@/lib/domain/types";
import { rmdStartingAge } from "@/lib/domain/rmd";
import { primaryPerson, projectionStartYear } from "@/lib/engine/project";

const MEDICARE_AGE = 65;

type TimelineEvent = { year: number; label: string };

function personLabel(name: string): string {
  return name.trim() || "Person";
}

function retirementLabel(names: string[]): string {
  const list = names.map(personLabel);
  if (list.length === 1) return `${list[0]} retires`;
  return `${list.join(" & ")} retire`;
}

export function buildTimeline(
  household: Household,
): { year: number; label: string }[] {
  const events: TimelineEvent[] = [];

  const byRetirementYear = new Map<number, string[]>();
  for (const person of household.people) {
    if (person.retirementYear == null || !Number.isFinite(person.retirementYear)) {
      continue;
    }
    const names = byRetirementYear.get(person.retirementYear) ?? [];
    names.push(person.name);
    byRetirementYear.set(person.retirementYear, names);
  }
  for (const [year, names] of byRetirementYear) {
    events.push({ year, label: retirementLabel(names) });
  }

  const startYear = projectionStartYear(household);
  if (Number.isFinite(startYear)) {
    events.push({ year: startYear, label: "Roth conversion window opens" });
  }

  for (const person of household.people) {
    if (person.birthYear == null || !Number.isFinite(person.birthYear)) continue;
    events.push({
      year: person.birthYear + MEDICARE_AGE,
      label: `${personLabel(person.name)} - Medicare enrollment (${MEDICARE_AGE})`,
    });
  }

  const rmdYears: number[] = [];
  for (const person of household.people) {
    if (person.birthYear == null || !Number.isFinite(person.birthYear)) continue;
    const rmdAge = rmdStartingAge(person.birthYear);
    const rmdYear = person.birthYear + rmdAge;
    rmdYears.push(rmdYear);
    events.push({
      year: rmdYear,
      label: `${personLabel(person.name)} reaches RMD age (${rmdAge})`,
    });
  }

  if (rmdYears.length > 0) {
    events.push({
      year: Math.min(...rmdYears) - 1,
      label: "Roth conversion window closes",
    });
  }

  const primary = primaryPerson(household);
  const finalAge = household.assumptions.finalAge;
  if (
    primary.birthYear != null &&
    Number.isFinite(primary.birthYear) &&
    Number.isFinite(finalAge)
  ) {
    events.push({
      year: primary.birthYear + finalAge,
      label: `Projection ends - ${personLabel(primary.name)} turns ${finalAge}`,
    });
  }

  events.sort((a, b) => a.year - b.year);

  const merged: { year: number; label: string }[] = [];
  for (const event of events) {
    const last = merged[merged.length - 1];
    if (last && last.year === event.year) {
      last.label = `${last.label} · ${event.label}`;
    } else {
      merged.push({ ...event });
    }
  }

  return merged;
}

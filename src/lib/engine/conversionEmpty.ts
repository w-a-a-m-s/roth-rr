import type { Household, Person } from "@/lib/domain/types";
import { personRmdAge } from "@/lib/domain/rmd";
import {
  conversionYears,
  convertibleTotal,
} from "@/lib/engine/convertible";
import { projectionStartYear } from "@/lib/engine/project";
import { formatCurrency } from "@/lib/format";

export interface ConversionEmptyFact {
  /** Short label, e.g. person name or "Accounts". */
  label: string;
  /** Concrete numbers for this fact. */
  detail: string;
}

export interface ConversionEmptyDiagnostic {
  years: number;
  convertible: number;
  /** True when the conversion UI should show the empty notice. */
  empty: boolean;
  facts: ConversionEmptyFact[];
}

function personLabel(person: Person): string {
  const name = person.name.trim();
  return name.length > 0 ? name : "Person";
}

function personWindowFact(person: Person): ConversionEmptyFact {
  const label = personLabel(person);
  const birth = person.birthYear;
  const retirement = person.retirementYear;
  const rmdAge = personRmdAge(person);

  if (birth == null || !Number.isFinite(birth)) {
    return {
      label,
      detail: "Birth year is missing. Set it in Household.",
    };
  }
  if (retirement == null || !Number.isFinite(retirement)) {
    return {
      label,
      detail: "Retirement year is missing. Set it in Household.",
    };
  }
  if (rmdAge == null) {
    return {
      label,
      detail: "Birth year is needed to find RMD age.",
    };
  }

  const rmdYear = birth + rmdAge;
  const windowYears = Math.max(0, rmdYear - retirement);
  if (windowYears < 1) {
    return {
      label,
      detail: `Retires in ${retirement}, RMD starts in ${rmdYear} (age ${rmdAge}). No years between retirement and RMD.`,
    };
  }
  return {
    label,
      detail: `Retires in ${retirement}, RMD starts in ${rmdYear} (age ${rmdAge}). Can convert ${retirement} to ${rmdYear - 1} (${windowYears} year${windowYears === 1 ? "" : "s"}).`,
  };
}

function accountsFact(household: Household): ConversionEmptyFact {
  const retirement = household.accounts.filter(
    (a) => a.kind === "retirementTaxable",
  );
  if (retirement.length === 0) {
    return {
      label: "Accounts",
      detail: "No taxable retirement accounts (401(k), IRA, etc.). Add one in Accounts.",
    };
  }
  const parts = retirement.map((a) => {
    const name = a.label.trim() || "Retirement account";
    return `${name} ${formatCurrency(Math.max(0, a.balance), true)}`;
  });
  const total = retirement.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  return {
    label: "Accounts",
    detail: `${parts.join("; ")}. Taxable retirement total ${formatCurrency(total, true)}.`,
  };
}

/**
 * Whether the conversion step has nothing useful to schedule: no pre-RMD
 * window and/or nothing convertible from tax-deferred balances.
 */
export function isConversionEmpty(household: Household): boolean {
  const years = conversionYears(household);
  if (years < 1) return true;
  return convertibleTotal(household) <= 0;
}

/** Facts explaining why conversion is empty, with real plan numbers. */
export function diagnoseConversionEmpty(
  household: Household,
  asOfDate?: string,
): ConversionEmptyDiagnostic {
  const years = conversionYears(household);
  const convertible = convertibleTotal(household, asOfDate);
  const empty = years < 1 || convertible <= 0;
  const facts: ConversionEmptyFact[] = [];

  const start = projectionStartYear(household);
  if (!Number.isFinite(start)) {
    facts.push({
      label: "Household",
      detail: "Set each person's birth year and retirement year.",
    });
  }

  for (const person of household.people) {
    facts.push(personWindowFact(person));
  }

  facts.push(accountsFact(household));

  if (Number.isFinite(start) && years >= 1) {
    facts.push({
      label: "Convertible",
      detail: `Estimated convertible total ${formatCurrency(convertible, true)} over ${years} conversion year${years === 1 ? "" : "s"} starting ${start}.`,
    });
  } else if (Number.isFinite(start)) {
    facts.push({
      label: "Convertible",
      detail: `No conversion years from retirement (${start}) up to RMD. The calculator only schedules conversions in that window.`,
    });
  }

  return { years, convertible, empty, facts };
}

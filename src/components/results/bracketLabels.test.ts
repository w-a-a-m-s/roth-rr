import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { projectScenario, projectionYears } from "@/lib/engine/project";
import { FALLBACK_REFERENCE_DATA as refs } from "@/lib/externalData/fallback";
import {
  federalBracketLabel,
  federalBracketsTitle,
} from "@/components/results/bracketLabels";
import singleFiler from "@/lib/engine/golden/cases/single-filer.json";

const household = singleFiler.household as unknown as Household;
const rows = projectScenario(
  household,
  Array.from({ length: projectionYears(household) }, () => 0),
  refs,
);

describe("federal bracket labels", () => {
  it("show the bracket's range for the plan's filing status", () => {
    const single = refs.federalTax.brackets.single;
    const i = single.findIndex((b) => b.rate === 0.24);
    expect(federalBracketLabel(rows, i)).toBe(
      "Tax @ 24% ($105,700 to $201,775)",
    );
    expect(federalBracketLabel(rows, single.length - 1)).toBe(
      "Tax @ 37% ($640,600 and up)",
    );
    expect(federalBracketsTitle(rows)).toBe("Federal tax brackets (Single)");
  });

  it("use the joint ranges for a married plan", () => {
    const joint = rows.map((r) => ({
      ...r,
      filingStatus: "mfj" as const,
      federalTaxByBracket: refs.federalTax.brackets.mfj.map((b, i, all) => ({
        rate: b.rate,
        tax: 0,
        floor: b.floor,
        ceiling: all[i + 1]?.floor ?? null,
      })),
    }));
    expect(federalBracketLabel(joint, 3)).toBe("Tax @ 24% ($211,400 to $403,550)");
    expect(federalBracketsTitle(joint)).toBe(
      "Federal tax brackets (Married filing jointly)",
    );
  });

  it("name each status's range when a survivor switches to single", () => {
    const mfj = refs.federalTax.brackets.mfj;
    const mixed = [
      {
        filingStatus: "mfj" as const,
        federalTaxByBracket: mfj.map((b, i) => ({
          rate: b.rate,
          tax: 0,
          floor: b.floor,
          ceiling: mfj[i + 1]?.floor ?? null,
        })),
      },
      ...rows,
    ];
    expect(federalBracketLabel(mixed, 3)).toBe(
      "Tax @ 24% (Joint $211,400 to $403,550; Single $105,700 to $201,775)",
    );
    expect(federalBracketsTitle(mixed)).toBe(
      "Federal tax brackets (Married filing jointly, then Single)",
    );
  });
});

import type { ExternalDataKey, ExternalDataMeta } from "@/lib/externalData/types";

/** Default provenance for each dataset (kept in sync with docs/external-data.md). */
export const DATASET_META: Record<ExternalDataKey, ExternalDataMeta> = {
  "federal-tax": {
    source: "IRS Rev. Proc. 2025-32",
    sourceUrl:
      "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
    updateMethod:
      "npm run external-data:apply -- --dataset=federal-tax --from=<candidate.json>",
    format: "FederalTaxYear JSON",
    processor:
      "human or Claude cowork builds candidate JSON, apply script validates then admin PUT",
    notes:
      "Annual inflation adjustments (typically fall). Weekly check detects year lag only.",
  },
  medicare: {
    source: "CMS Medicare Parts A & B Premiums and Deductibles fact sheet",
    sourceUrl:
      "https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles",
    updateMethod:
      "npm run external-data:apply -- --dataset=medicare --from=<candidate.json>",
    format: "MedicarePartBYear JSON",
    processor:
      "human or Claude cowork: read CMS fact sheet (HTML/PDF), build candidate JSON, apply validates then admin PUT",
    notes:
      "Annual (typically mid-November for the next calendar year). Weekly check detects year lag.",
  },
  rmd: {
    source: "IRS Uniform Lifetime Table (Pub. 590-B, Appendix B, Table III)",
    updateMethod: "edit src/lib/config/rmdTable.ts (not an external dataset)",
    format: "n/a: committed constant, not stored in external_data",
    processor: "human, when the IRS reissues the life expectancy tables",
    notes:
      "Deferred by design. The table has no annual cadence (current one effective 2022), so it ships as a committed constant and this key stays unimplemented. Starting age comes from birth year (SECURE / SECURE 2.0).",
  },
  "state-income-tax": {
    source: "Tax Foundation state income tax rates and brackets (cross-check state DOR)",
    sourceUrl:
      "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
    updateMethod:
      "npm run external-data:apply -- --dataset=state-income-tax --from=<candidate.json>",
    format: "StateIncomeTaxYear JSON (51 jurisdictions)",
    processor:
      "human or Claude cowork builds candidate JSON from Tax Foundation / state DOR, apply validates then admin PUT",
    notes:
      "Re-review at least every 90 days. Weekly check fails on year lag, missing states, reviewedAt age > 90 days, or live≠fallback drift. Bump reviewedAt after each Tax Foundation / DOR review even if rates are unchanged.",
  },
};

import { FALLBACK_FEDERAL_TAX } from "@/lib/config/federalTax";
import { FALLBACK_MEDICARE_PART_B } from "@/lib/config/medicare";
import { FALLBACK_STATE_INCOME_TAX } from "@/lib/config/stateTax";
import type { ReferenceData } from "@/lib/externalData/types";

/** Default refs for tests, offline, and calculate() when no hydrate yet. */
export const FALLBACK_REFERENCE_DATA: ReferenceData = {
  federalTax: FALLBACK_FEDERAL_TAX,
  medicare: FALLBACK_MEDICARE_PART_B,
  stateIncomeTax: FALLBACK_STATE_INCOME_TAX,
};

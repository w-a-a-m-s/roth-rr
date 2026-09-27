/**
 * Unit tests for external-data validation (federal-tax, medicare, state-income-tax).
 */
import { describe, it, expect } from "vitest";
import { FALLBACK_FEDERAL_TAX } from "@/lib/config/federalTax";
import { FALLBACK_MEDICARE_PART_B } from "@/lib/config/medicare";
import { FALLBACK_STATE_INCOME_TAX, ALL_STATE_CODES } from "@/lib/config/stateTax";
import {
  validateFederalTaxYear,
  validateMedicarePartBYear,
  validateStateIncomeTaxYear,
  validateDatasetData,
  validateMeta,
} from "@/lib/externalData/validate";
import { DATASET_META } from "@/lib/externalData/meta";

describe("validateFederalTaxYear", () => {
  it("accepts the committed fallback", () => {
    const result = validateFederalTaxYear(FALLBACK_FEDERAL_TAX);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.year).toBe(2026);
  });

  it("rejects non-ascending floors", () => {
    const bad = structuredClone(FALLBACK_FEDERAL_TAX);
    bad.brackets.mfj[2].floor = bad.brackets.mfj[1].floor;
    const result = validateFederalTaxYear(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects unexpected rates unless allowRateChange", () => {
    const bad = structuredClone(FALLBACK_FEDERAL_TAX);
    bad.brackets.mfj[0].rate = 0.11;
    expect(validateFederalTaxYear(bad).ok).toBe(false);
    expect(validateFederalTaxYear(bad, { allowRateChange: true }).ok).toBe(true);
  });

  it("rejects missing filing status deduction", () => {
    const bad = {
      ...FALLBACK_FEDERAL_TAX,
      standardDeduction: { mfj: 1 },
    };
    expect(validateFederalTaxYear(bad).ok).toBe(false);
  });

  it("rejects federal data missing hoh", () => {
    const bad = structuredClone(FALLBACK_FEDERAL_TAX);
    delete (bad.standardDeduction as { hoh?: number }).hoh;
    expect(validateFederalTaxYear(bad).ok).toBe(false);
  });
});

describe("validateMedicarePartBYear", () => {
  it("accepts the committed fallback", () => {
    const result = validateMedicarePartBYear(FALLBACK_MEDICARE_PART_B);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.year).toBe(2026);
  });

  it("rejects non-ascending magi floors", () => {
    const bad = structuredClone(FALLBACK_MEDICARE_PART_B);
    bad.tiers.single[2].magiFloor = bad.tiers.single[1].magiFloor;
    expect(validateMedicarePartBYear(bad).ok).toBe(false);
  });

  it("rejects wrong tier count unless allowRateChange", () => {
    const bad = structuredClone(FALLBACK_MEDICARE_PART_B);
    bad.tiers.single = bad.tiers.single.slice(0, 3);
    expect(validateMedicarePartBYear(bad).ok).toBe(false);
    expect(
      validateMedicarePartBYear(bad, { allowRateChange: true }).ok,
    ).toBe(true);
  });
});

describe("validateStateIncomeTaxYear", () => {
  it("accepts the committed fallback with all 51 jurisdictions", () => {
    const result = validateStateIncomeTaxYear(FALLBACK_STATE_INCOME_TAX);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.year).toBe(2026);
      expect(result.value.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Object.keys(result.value.states)).toHaveLength(ALL_STATE_CODES.length);
    }
  });

  it("accepts a state table without hoh (aliases to single)", () => {
    const ok = structuredClone(FALLBACK_STATE_INCOME_TAX);
    delete (ok.states.FL.brackets as { hoh?: unknown }).hoh;
    delete (ok.states.FL.standardDeduction as { hoh?: unknown }).hoh;
    expect(validateStateIncomeTaxYear(ok).ok).toBe(true);
  });

  it("rejects a missing state", () => {
    const bad = structuredClone(FALLBACK_STATE_INCOME_TAX);
    delete (bad.states as Record<string, unknown>).CA;
    expect(validateStateIncomeTaxYear(bad).ok).toBe(false);
  });

  it("rejects missing or malformed reviewedAt", () => {
    const missing = structuredClone(FALLBACK_STATE_INCOME_TAX);
    delete (missing as { reviewedAt?: string }).reviewedAt;
    expect(validateStateIncomeTaxYear(missing).ok).toBe(false);

    const bad = structuredClone(FALLBACK_STATE_INCOME_TAX);
    bad.reviewedAt = "2026/07/09";
    expect(validateStateIncomeTaxYear(bad).ok).toBe(false);
  });
});

describe("validateDatasetData", () => {
  it("routes federal-tax, medicare, and state-income-tax", () => {
    expect(validateDatasetData("federal-tax", FALLBACK_FEDERAL_TAX).ok).toBe(
      true,
    );
    expect(validateDatasetData("medicare", FALLBACK_MEDICARE_PART_B).ok).toBe(
      true,
    );
    expect(
      validateDatasetData("state-income-tax", FALLBACK_STATE_INCOME_TAX).ok,
    ).toBe(true);
  });

  it("rejects unimplemented datasets", () => {
    const result = validateDatasetData("rmd", { year: 2026 });
    expect(result.ok).toBe(false);
  });
});

describe("validateMeta", () => {
  it("accepts dataset meta defaults", () => {
    expect(validateMeta(DATASET_META["federal-tax"]).ok).toBe(true);
    expect(validateMeta(DATASET_META.medicare).ok).toBe(true);
  });

  it("rejects empty source", () => {
    expect(
      validateMeta({
        source: "",
        updateMethod: "x",
        format: "y",
        processor: "z",
      }).ok,
    ).toBe(false);
  });
});

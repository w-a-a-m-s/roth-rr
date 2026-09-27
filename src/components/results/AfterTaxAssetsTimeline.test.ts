import { describe, expect, it } from "vitest";
import { SAMPLE_HOUSEHOLD } from "@/lib/config/sampleData";
import { calculate } from "@/lib/calculate";
import { primaryRmdAge } from "@/lib/domain/rmd";
import { primaryPersonId } from "@/lib/engine/project";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";
import { buildAfterTaxAssetsTimelinePoints } from "./AfterTaxAssetsTimeline";

describe("buildAfterTaxAssetsTimelinePoints", () => {
  it("pairs with-conversion, no-conversion, and delta for each year", () => {
    const household = SAMPLE_HOUSEHOLD;
    const comparison = calculate(household);
    const primaryId = primaryPersonId(household);
    const rmdAge = primaryRmdAge(household);
    const points = buildAfterTaxAssetsTimelinePoints(
      household,
      comparison.roth.rows,
      comparison.baseline.rows,
      FALLBACK_REFERENCE_DATA,
      primaryId,
    );

    expect(points.length).toBe(comparison.roth.rows.length);
    for (const point of points) {
      expect(point.delta).toBeCloseTo(
        point.withConversion - point.noConversion,
        6,
      );
    }

    const rmdPoint = points.find((point) => point.isRmd);
    expect(rmdPoint).toBeDefined();
    expect(rmdPoint!.age).toBe(rmdAge);
    expect(rmdPoint!.withConversion).toBeCloseTo(
      comparison.roth.totals.afterTaxAssetsAtRmd,
      6,
    );
    expect(rmdPoint!.noConversion).toBeCloseTo(
      comparison.baseline.totals.afterTaxAssetsAtRmd,
      6,
    );
    expect(rmdPoint!.delta).toBeCloseTo(
      comparison.deltas.afterTaxAssetsAtRmd,
      6,
    );
  });
});

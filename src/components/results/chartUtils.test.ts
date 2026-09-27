import { describe, expect, it } from "vitest";
import {
  chartTooltipProps,
  formatAxisCurrency,
  formatSignedAxisCurrency,
} from "./chartUtils";

describe("formatSignedAxisCurrency", () => {
  it("adds a plus for gains and keeps a minus for losses", () => {
    expect(formatSignedAxisCurrency(1_200_000)).toBe("+$1.2M");
    expect(formatSignedAxisCurrency(-450_000)).toBe("-$450k");
    expect(formatSignedAxisCurrency(12_000)).toBe("+$12k");
  });

  it("shows $0 for a near-zero delta", () => {
    expect(formatSignedAxisCurrency(0)).toBe("$0");
    expect(formatSignedAxisCurrency(0.2)).toBe("$0");
    expect(formatAxisCurrency(0)).toBe("$0");
  });
});

describe("chartTooltipProps", () => {
  it("keeps the last year open when idle last point is on", () => {
    const props = chartTooltipProps(10);
    expect(props.defaultIndex).toBe(9);
    expect(props.active).toBe(true);
  });

  it("does not auto-open a point when idle last point is off", () => {
    const props = chartTooltipProps(10, { idleLastPoint: false });
    expect(props).not.toHaveProperty("defaultIndex");
    expect(props).not.toHaveProperty("active");
  });
});

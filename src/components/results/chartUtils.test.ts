import { describe, expect, it } from "vitest";
import {
  chartTooltipProps,
  formatAxisCurrency,
  formatSignedAxisCurrency,
  surplusLabel,
  tooltipCurrencyFormatter,
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

describe("surplusLabel", () => {
  it("says Surplus when no year is negative", () => {
    expect(surplusLabel([0, 120, 5])).toBe("Surplus");
    expect(surplusLabel([])).toBe("Surplus");
  });

  it("says Shortfall when every year is negative", () => {
    expect(surplusLabel([-1, -500])).toBe("Shortfall");
  });

  it("says both when the years are mixed", () => {
    expect(surplusLabel([200, -50])).toBe("Surplus / shortfall");
  });

  it("names a tooltip point by its own sign", () => {
    expect(tooltipCurrencyFormatter(-1200, "Surplus / shortfall")[1]).toBe("Shortfall");
    expect(tooltipCurrencyFormatter(300, "Surplus / shortfall")[1]).toBe("Surplus");
    expect(tooltipCurrencyFormatter(300, "Net income")[1]).toBe("Net income");
  });
});

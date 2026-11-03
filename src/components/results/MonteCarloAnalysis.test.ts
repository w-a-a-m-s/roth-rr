// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MonteCarloAnalysis } from "@/components/results/MonteCarloAnalysis";
import { SAMPLE_HOUSEHOLD } from "@/lib/config/sampleData";
import { FALLBACK_REFERENCE_DATA } from "@/lib/externalData/fallback";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("Monte Carlo analysis", () => {
  it("runs every market, then shows the success rates and outcomes", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(createElement(MonteCarloAnalysis, { household: SAMPLE_HOUSEHOLD, refs: FALLBACK_REFERENCE_DATA })),
    );
    expect(host.textContent).toContain("Running markets");
    for (let i = 0; i < 400 && host.textContent?.includes("Running markets"); i++) {
      await act(async () => new Promise((r) => setTimeout(r, 10)));
    }
    const text = host.textContent ?? "";
    expect(text).toContain("No conversion: money lasts to age");
    expect(text).toContain("Converting leaves the bigger inheritance");
    expect(text).toContain("Outcomes across 1,000 markets");
    expect(text).toContain("Inheritance, bad markets");
    expect(text).toContain("Accounts left each year");
    await act(async () => root.unmount());
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import { shouldRunStepTour } from "@/lib/onboarding/stepTourGate";

describe("shouldRunStepTour", () => {
  it("runs an unseen tour on desktop", () => {
    expect(shouldRunStepTour(true, true)).toBe(true);
  });

  it("skips every tour below lg, including first-run stages", () => {
    expect(shouldRunStepTour(true, false)).toBe(false);
  });

  it("skips a tour the user already finished", () => {
    expect(shouldRunStepTour(false, true)).toBe(false);
    expect(shouldRunStepTour(false, false)).toBe(false);
  });
});

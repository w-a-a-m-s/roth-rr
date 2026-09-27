// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearStepTourSeen,
  hasSeenStepTour,
  markStepTourSeen,
} from "@/lib/onboarding/stepTourStorage";

afterEach(() => {
  clearStepTourSeen();
});

describe("stepTourStorage", () => {
  it("starts unseen", () => {
    expect(hasSeenStepTour("household")).toBe(false);
  });

  it("marks a tour as seen", () => {
    markStepTourSeen("household");
    expect(hasSeenStepTour("household")).toBe(true);
    expect(hasSeenStepTour("accounts")).toBe(false);
  });

  it("persists across reads", () => {
    markStepTourSeen("household");
    markStepTourSeen("accounts");
    expect(hasSeenStepTour("household")).toBe(true);
    expect(hasSeenStepTour("accounts")).toBe(true);
  });

  it("tracks the post-create strategy panel tour separately", () => {
    markStepTourSeen("conversion");
    expect(hasSeenStepTour("strategyPanel")).toBe(false);
    markStepTourSeen("strategyPanel");
    expect(hasSeenStepTour("strategyPanel")).toBe(true);
  });
});

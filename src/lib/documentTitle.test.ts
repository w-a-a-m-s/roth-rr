import { describe, it, expect } from "vitest";
import { APP_TITLE, documentTitleForPlan } from "@/lib/documentTitle";

describe("documentTitleForPlan", () => {
  it("returns the app title when the plan name is empty", () => {
    expect(documentTitleForPlan(null)).toBe(APP_TITLE);
    expect(documentTitleForPlan(undefined)).toBe(APP_TITLE);
    expect(documentTitleForPlan("")).toBe(APP_TITLE);
    expect(documentTitleForPlan("   ")).toBe(APP_TITLE);
  });

  it("prefixes the plan name", () => {
    expect(documentTitleForPlan("My plan")).toBe(`My plan | ${APP_TITLE}`);
  });
});

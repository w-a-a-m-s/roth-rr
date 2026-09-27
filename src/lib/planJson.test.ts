import { describe, expect, it } from "vitest";
import { isRealSuperAdmin, planJsonFilename } from "./planJson";

describe("isRealSuperAdmin", () => {
  it("is true for the real superAdmin session flag", () => {
    expect(isRealSuperAdmin({ user: { superAdmin: true } })).toBe(true);
  });

  it("is true while impersonating, even though superAdmin is stripped", () => {
    expect(
      isRealSuperAdmin({
        user: { superAdmin: false },
        impersonation: { active: true },
      }),
    ).toBe(true);
  });

  it("is false for a normal signed-in user", () => {
    expect(
      isRealSuperAdmin({
        user: { superAdmin: false },
        impersonation: null,
      }),
    ).toBe(false);
    expect(isRealSuperAdmin(null)).toBe(false);
  });
});

describe("planJsonFilename", () => {
  it("slugifies the plan name and adds .json", () => {
    expect(planJsonFilename("Omri & Dana")).toBe("Omri-Dana.json");
    expect(planJsonFilename("  My plan  ")).toBe("My-plan.json");
  });

  it("falls back when the name has no safe characters", () => {
    expect(planJsonFilename("   ")).toBe("plan.json");
    expect(planJsonFilename("***")).toBe("plan.json");
  });
});

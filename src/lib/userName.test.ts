import { describe, expect, it } from "vitest";
import {
  parseDisplayName,
  userNeedsName,
} from "@/lib/auth/shared/userName";

describe("userNeedsName", () => {
  it("is true when name is missing", () => {
    expect(userNeedsName(null, "a@b.com")).toBe(true);
    expect(userNeedsName("", "a@b.com")).toBe(true);
    expect(userNeedsName("   ", "a@b.com")).toBe(true);
  });

  it("is true when name equals email", () => {
    expect(userNeedsName("a@b.com", "a@b.com")).toBe(true);
    expect(userNeedsName("A@B.com", "a@b.com")).toBe(true);
  });

  it("is false for a real name", () => {
    expect(userNeedsName("Alex Garcia", "a@b.com")).toBe(false);
  });
});

describe("parseDisplayName", () => {
  it("accepts a trimmed name", () => {
    expect(parseDisplayName("  Alex  ", "a@b.com")).toEqual({
      ok: true,
      name: "Alex",
    });
  });

  it("rejects empty or email-as-name", () => {
    expect(parseDisplayName("", "a@b.com").ok).toBe(false);
    expect(parseDisplayName("a@b.com", "a@b.com").ok).toBe(false);
  });
});

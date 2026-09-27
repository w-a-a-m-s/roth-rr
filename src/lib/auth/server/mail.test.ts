import { describe, expect, it } from "vitest";
import { parseRegistrationNotifyTo } from "./mail";

describe("parseRegistrationNotifyTo", () => {
  it("returns empty when unset", () => {
    expect(parseRegistrationNotifyTo(undefined)).toEqual([]);
    expect(parseRegistrationNotifyTo("")).toEqual([]);
    expect(parseRegistrationNotifyTo("   ")).toEqual([]);
  });

  it("keeps a single address", () => {
    expect(parseRegistrationNotifyTo("you@example.com")).toEqual([
      "you@example.com",
    ]);
  });

  it("splits a comma-separated list and trims", () => {
    expect(
      parseRegistrationNotifyTo("you@example.com, other@example.com ,"),
    ).toEqual(["you@example.com", "other@example.com"]);
  });
});

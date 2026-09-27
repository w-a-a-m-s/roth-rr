import { afterEach, describe, it, expect, vi } from "vitest";
import {
  hrefWithPlan,
  knownPlanId,
  pickHydrateActiveId,
  planUrlId,
  PLAN_QUERY_KEY,
  readPlanIdFromWindow,
} from "@/lib/planUrl";

describe("planUrlId", () => {
  it("prefers publicId when present", () => {
    expect(planUrlId({ id: "mongo", publicId: "Jg7YL6N5bOs" })).toBe(
      "Jg7YL6N5bOs",
    );
  });

  it("falls back to id for local drafts", () => {
    expect(planUrlId({ id: "local-seed" })).toBe("local-seed");
  });
});

describe("knownPlanId", () => {
  it("resolves by publicId to the store id", () => {
    expect(
      knownPlanId("Jg7YL6N5bOs", [
        { id: "507f1f77bcf86cd799439011", publicId: "Jg7YL6N5bOs" },
      ]),
    ).toBe("507f1f77bcf86cd799439011");
  });

  it("resolves legacy ObjectId urls", () => {
    expect(
      knownPlanId("507f1f77bcf86cd799439011", [
        { id: "507f1f77bcf86cd799439011", publicId: "Jg7YL6N5bOs" },
      ]),
    ).toBe("507f1f77bcf86cd799439011");
  });

  it("rejects unknown ids", () => {
    expect(knownPlanId("missing", [{ id: "abc" }])).toBeNull();
    expect(knownPlanId("", [{ id: "abc" }])).toBeNull();
    expect(knownPlanId("sample-married", [])).toBeNull();
  });
});

describe("hrefWithPlan", () => {
  it("builds a path segment at the site root", () => {
    expect(hrefWithPlan("/", new URLSearchParams(), "Jg7YL6N5bOs")).toBe(
      "/Jg7YL6N5bOs",
    );
  });

  it("preserves other query params and strips legacy plan=", () => {
    const params = new URLSearchParams(`foo=1&${PLAN_QUERY_KEY}=old`);
    expect(hrefWithPlan("/", params, "p1")).toBe("/p1?foo=1");
  });
});

describe("pickHydrateActiveId", () => {
  const plans = [
    { id: "first", publicId: "aaaaaaaaaaa" },
    { id: "second", publicId: "bbbbbbbbbbb" },
  ];

  it("prefers a known URL publicId", () => {
    expect(pickHydrateActiveId(plans, "bbbbbbbbbbb")).toBe("second");
  });

  it("prefers a legacy store id from the URL", () => {
    expect(pickHydrateActiveId(plans, "second")).toBe("second");
  });

  it("falls back to the first plan when the URL id is unknown", () => {
    expect(pickHydrateActiveId(plans, "missing")).toBe("first");
  });

  it("falls back when no preferred id is given", () => {
    expect(pickHydrateActiveId(plans, null)).toBe("first");
  });

  it("ignores unknown sample ids when not in the server list", () => {
    expect(pickHydrateActiveId(plans, "sample-married")).toBe("first");
  });
});

describe("readPlanIdFromWindow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the path segment after the base path", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/Jg7YL6N5bOs",
        search: "",
      },
    });
    expect(readPlanIdFromWindow()).toBe("Jg7YL6N5bOs");
  });

  it("falls back to legacy ?plan= on the app root", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: `?${PLAN_QUERY_KEY}=legacyId`,
      },
    });
    expect(readPlanIdFromWindow()).toBe("legacyId");
  });

  it("ignores the disclaimer path for plan ids", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/disclaimer",
        search: "",
      },
    });
    expect(readPlanIdFromWindow()).toBeNull();
  });
});

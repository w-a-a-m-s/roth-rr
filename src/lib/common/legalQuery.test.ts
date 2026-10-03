import { describe, expect, it } from "vitest";
import { getFooterContent } from "./client/footerData";
import {
  DISCLAIMER_HREF,
  PRIVACY_HREF,
  TERMS_HREF,
  legalDocFromQuery,
} from "./site";

describe("legal deep links", () => {
  it("parses the popup query", () => {
    expect(legalDocFromQuery("terms")).toBe("terms");
    expect(legalDocFromQuery("privacy")).toBe("privacy");
    expect(legalDocFromQuery("disclaimer")).toBe("disclaimer");
    expect(legalDocFromQuery(null)).toBeNull();
    expect(legalDocFromQuery("")).toBeNull();
    expect(legalDocFromQuery("Terms")).toBeNull();
  });

  it("builds homepage links that open the popup", () => {
    expect(TERMS_HREF).toBe("/?legal=terms");
    expect(PRIVACY_HREF).toBe("/?legal=privacy");
    expect(DISCLAIMER_HREF).toBe("/?legal=disclaimer");
  });

  it("fills the terms and privacy popups", () => {
    const terms = getFooterContent("terms");
    const privacy = getFooterContent("privacy");
    expect(terms.sections.length).toBeGreaterThan(5);
    expect(privacy.sections.length).toBeGreaterThan(5);
    expect(terms.sections.some((section) => section.body.includes("Roth RR"))).toBe(
      true,
    );
    expect(
      privacy.sections.some((section) =>
        section.body.includes("support@thewealthlab.ai"),
      ),
    ).toBe(true);
  });
});

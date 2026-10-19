// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ReturnsArticleLink, RETURNS_ARTICLE_TITLE } from "@/components/plan/ReturnsArticle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Rate of returns for IRAs versus Roth IRAs", () => {
  it("opens the article with its references from the link", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(ReturnsArticleLink)));
    const link = host.querySelector("button")!;
    expect(link.textContent).toBe(RETURNS_ARTICLE_TITLE);
    await act(async () => link.click());
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Sequence-of-returns risk");
    expect(text).toContain("Kitces");
    expect(text).toContain("Bengen");
    expect(text).toContain("Trinity");
    expect(text).toContain("Rising Equity Glide Path");
    expect(text).toContain("Keep in mind");
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "https://www.kitces.com/blog/understanding-sequence-of-return-risk-safe-withdrawal-rates-bear-market-crashes-and-bad-decades/",
      "https://www.aaii.com/journal/article/retirement-savings-choosing-a-withdrawal-rate-that-is-sustainable",
      "https://www.financialplanningassociation.org/article/journal/JAN14-reducing-retirement-risk-rising-equity-glide-path",
    ]);
    // No long dashes in the copy.
    expect(text).not.toContain("—");
    await act(async () => root.unmount());
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findPlanModalPrimaryAction } from "@/lib/onboarding/householdTour";

describe("findPlanModalPrimaryAction", () => {
  it("returns the Next button inside the plan wizard dialog", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `
      <button type="button">1. Household</button>
      <button type="button">Done</button>
      <button type="button">Back</button>
      <button type="button">Next</button>
    `;
    document.body.appendChild(dialog);

    const btn = findPlanModalPrimaryAction();
    expect(btn?.textContent?.trim()).toBe("Next");

    dialog.remove();
  });

  it("prefers Create plan over Done or Next", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `
      <button type="button">1. Household</button>
      <button type="button">Done</button>
      <button type="button">Create plan</button>
    `;
    document.body.appendChild(dialog);

    expect(findPlanModalPrimaryAction()?.textContent?.trim()).toBe(
      "Create plan",
    );
    dialog.remove();
  });

  it("ignores dialogs that are not the plan wizard", () => {
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    other.innerHTML = `<button type="button">Next</button>`;
    document.body.appendChild(other);

    expect(findPlanModalPrimaryAction()).toBeNull();
    other.remove();
  });
});

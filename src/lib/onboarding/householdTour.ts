import type { TourStepContent } from "@/lib/onboarding/tourTypes";

/** Copy and placement for the Household step walkthrough. */
export const HOUSEHOLD_TOUR_STEPS: TourStepContent[] = [
  {
    id: "filing",
    title: "Select your filing status",
    body: "Choose Single, Married filing jointly, or Head of household.",
    // Beside the field: below-left looks disconnected when the modal is tall
    // (browser zoomed out / min-height), with the tip floating over People.
    placement: "right-center",
  },
  {
    id: "state",
    title: "Choose your state",
    body: "State tax rules affect the Roth conversion analysis.",
    placement: "right-center",
  },
  {
    id: "people",
    title: "Add household members",
    body: "Fill in name, birth year, and retirement year for all household members.",
    placement: "bottom-left",
  },
  {
    id: "next",
    title: "You're ready",
    body: "Click Next to move on to Accounts.",
    placement: "top-right",
  },
];

/**
 * Resolve the plan modal primary footer action without touching PlanModal.
 * Matches the dialog that hosts the wizard stage tabs.
 */
export function findPlanModalPrimaryAction(): HTMLElement | null {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  for (let i = dialogs.length - 1; i >= 0; i--) {
    const dialog = dialogs[i];
    // Stage tabs render as "1. Household", "2. Accounts", ...
    if (!dialog.textContent?.includes("1. Household")) continue;
    const buttons = [...dialog.querySelectorAll("button")];
    const create = buttons.find(
      (btn) => btn.textContent?.trim() === "Create plan",
    );
    if (create) return create;
    const next = buttons.find((btn) => btn.textContent?.trim() === "Next");
    if (next) return next;
    // Footer Done is last; person-card Done chips (if any) come earlier.
    const dones = buttons.filter((btn) => btn.textContent?.trim() === "Done");
    if (dones.length > 0) return dones[dones.length - 1] ?? null;
  }
  return null;
}

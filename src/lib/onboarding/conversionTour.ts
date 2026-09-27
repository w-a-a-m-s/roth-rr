import type { TourStepContent } from "@/lib/onboarding/tourTypes";

/** Copy for the Conversion step walkthrough (only when convertible > 0). */
export const CONVERSION_TOUR_STEPS: TourStepContent[] = [
  {
    id: "total-convertible",
    title: "Total convertible",
    body: "This is how much you can convert from tax-deferred accounts before RMD age.",
    placement: "bottom-left",
  },
  {
    id: "amount-to-convert",
    title: "Amount to convert",
    body: "Enter how much you want to convert overall. We'll spread it across the conversion years.",
    placement: "bottom-left",
  },
  {
    id: "allow-above",
    title: "Allow amounts above",
    body: "Turn this on only if you want to schedule more than the estimated convertible total.",
    placement: "bottom-left",
  },
  {
    id: "year-amounts",
    title: "Change amounts if needed",
    body: "Edit any year to customize the schedule.",
    placement: "right-center",
  },
  {
    id: "spread-evenly",
    title: "Spread evenly",
    body: "Click this to divide the amount evenly across every conversion year.",
    placement: "bottom-left",
  },
  {
    id: "create-plan",
    title: "Create your plan",
    body: "Click Create plan when you're ready.",
    placement: "top-right",
  },
];

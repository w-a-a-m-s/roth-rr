import type { ComponentType } from "react";
import type { Household } from "@/lib/domain/types";
import { isHouseholdReady } from "@/lib/domain/household";
import { isConversionEmpty } from "@/lib/engine/conversionEmpty";
import { HouseholdStep } from "@/components/wizard/steps/HouseholdStep";
import { AccountsStep } from "@/components/wizard/steps/AccountsStep";
import { IncomeStep } from "@/components/wizard/steps/IncomeStep";
import { RealEstateStep } from "@/components/wizard/steps/RealEstateStep";
import { ExpensesStep } from "@/components/wizard/steps/ExpensesStep";
import { ConversionStep } from "@/components/wizard/steps/ConversionStep";

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  Component: ComponentType;
  /** Whether this step has the data needed to advance in "new" mode. */
  isComplete: (household: Household) => boolean;
}

const always = () => true;

export const PLAN_STEPS: PlanStep[] = [
  {
    id: "household",
    title: "Household",
    description: "Who is in the plan and when they retire.",
    Component: HouseholdStep,
    isComplete: isHouseholdReady,
  },
  {
    id: "accounts",
    title: "Accounts",
    description: "Retirement, Roth, and after-tax balances.",
    Component: AccountsStep,
    isComplete: (household) => household.accounts.length > 0,
  },
  {
    id: "income",
    title: "Income",
    description: "Pensions, salaries, Social Security and more.",
    Component: IncomeStep,
    isComplete: always,
  },
  {
    id: "realEstate",
    title: "Real estate & business",
    description: "Property value, rent, mortgages, and business equity.",
    Component: RealEstateStep,
    isComplete: always,
  },
  {
    id: "expenses",
    title: "Expenses",
    description: "Spending and inflation.",
    Component: ExpensesStep,
    isComplete: always,
  },
  {
    id: "conversion",
    title: "Conversion",
    description: "Review and set the yearly conversion amounts.",
    Component: ConversionStep,
    isComplete: (household) => !isConversionEmpty(household),
  },
];

export const STEP_INDEX: Record<string, number> = Object.fromEntries(
  PLAN_STEPS.map((s, i) => [s.id, i]),
);

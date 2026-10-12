import type {
  Household,
  MortgageStatement,
  PropertyLoan,
  PropertyLoanKind,
  RealEstate,
} from "@/lib/domain/types";

export const PROPERTY_LOAN_LABELS: Record<PropertyLoanKind, string> = {
  mortgage: "Mortgage",
  lineOfCredit: "Line of credit",
};

/** Default years to repay a line of credit once its draw period ends. */
export const DEFAULT_REPAYMENT_YEARS = 20;

/**
 * A property's loans: its `loans` list, or for an older plan its single
 * mortgage (balance, rate, payment) as one mortgage.
 */
export function propertyLoans(re: RealEstate): PropertyLoan[] {
  if (Array.isArray(re.loans)) return re.loans;
  if (!((re.mortgageBalance ?? 0) > 0)) return [];
  return [
    {
      id: `${re.id}:mortgage`,
      kind: "mortgage",
      label: "Mortgage",
      balance: re.mortgageBalance ?? 0,
      rate: re.mortgageRate ?? 0,
      monthlyPayment: re.mortgageMonthlyPayment ?? 0,
    },
  ];
}

/** Total owed today across a property's loans. */
export function propertyLoanBalance(re: RealEstate): number {
  return propertyLoans(re).reduce((sum, loan) => sum + Math.max(0, loan.balance || 0), 0);
}

/**
 * What a loan costs a month today: the mortgage payment, or a line of
 * credit's interest-only payment during its draw period.
 */
export function loanMonthlyPaymentToday(loan: PropertyLoan): number {
  if (loan.kind === "mortgage") return Math.max(0, loan.monthlyPayment ?? 0);
  return Math.max(0, loan.balance || 0) * (Math.max(0, loan.rate || 0) / 12);
}

export function isPropertyLoanKind(value: unknown): value is PropertyLoanKind {
  return value === "mortgage" || value === "lineOfCredit";
}

/**
 * Mortgage analysis statements for the mortgages entered on properties that
 * don't have one yet (saved or deleted), filled in from the property loan.
 * `nextPayment` is the first row of the table (the app passes next month).
 */
export function propertyMortgageStatements(
  household: Household,
  nextPayment: { month: number; year: number },
): MortgageStatement[] {
  const linked = new Set(
    [
      ...(household.mortgages ?? []),
      ...(household.deletedMortgages ?? []).map((e) => e.item),
    ]
      .map((m) => m.loanId)
      .filter((id): id is string => id != null),
  );
  const out: MortgageStatement[] = [];
  for (const re of household.realEstate) {
    for (const loan of propertyLoans(re)) {
      if (loan.kind !== "mortgage") continue;
      if (!(loan.balance > 0)) continue;
      if (linked.has(loan.id)) continue;
      const property = re.label || "Property";
      const name = loan.label?.trim() || PROPERTY_LOAN_LABELS.mortgage;
      out.push({
        id: `mtg-${loan.id}`,
        label: `${property} · ${name}`,
        propertyId: re.id,
        loanId: loan.id,
        principalBalance: loan.balance,
        interestRate: loan.rate,
        monthlyPayment: loan.monthlyPayment ?? 0,
        nextPaymentMonth: nextPayment.month,
        nextPaymentYear: nextPayment.year,
      });
    }
  }
  return out;
}

/** Expense key for an investment property's loan payments in a projection row. */
export function loanExpenseKey(propertyId: string): string {
  return `loan:${propertyId}`;
}

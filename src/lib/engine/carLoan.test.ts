import { describe, expect, it } from "vitest";
import type { Household } from "@/lib/domain/types";
import { amortize } from "@/lib/engine/amortization";
import { carLoanFor, defaultCarLoan } from "@/lib/engine/carLoan";
import { defaultCarDecision, loanPayment } from "@/lib/engine/carDecision";

const household = { oneTimeDepreciation: [] } as unknown as Household;

describe("car loan", () => {
  it("starts from the Car analysis's finance option", () => {
    const d = defaultCarDecision(household);
    const loan = defaultCarLoan(household, { month: 12, year: 2026 });
    expect(loan.principalBalance).toBe(d.price - d.downPayment);
    expect(loan.interestRate).toBe(d.loanRate);
    // 60 payments from December 2026 end in November 2031.
    expect(loan).toMatchObject({ nextPaymentMonth: 12, nextPaymentYear: 2026, maturityMonth: 11, maturityYear: 2031 });
    const result = amortize(loan);
    expect(result.paymentDerived).toBe(true);
    expect(result.monthlyPayment).toBeCloseTo(loanPayment(loan.principalBalance, d.loanRate, 60), 2);
    expect(result.rows).toHaveLength(60);
  });

  it("uses the saved loan once there is one", () => {
    const saved = { ...defaultCarLoan(household, { month: 1, year: 2027 }), principalBalance: 12_345 };
    expect(carLoanFor({ ...household, carLoan: saved }, { month: 5, year: 2030 })).toBe(saved);
  });

  it("pays off sooner with more every month or a lump sum", () => {
    const loan = defaultCarLoan(household, { month: 1, year: 2027 });
    const r = amortize({ ...loan, extraPrincipal: 300, lumpSum: 10_000, lumpSumMonth: 1, lumpSumYear: 2028 });
    const keys = r.choices.map((c) => c.key);
    expect(keys).toEqual(["none", "extra", "lump", "both"]);
    for (const c of r.choices.slice(1)) {
      expect(c.monthsSaved).toBeGreaterThan(0);
      expect(c.interestSaved).toBeGreaterThan(0);
    }
  });
});

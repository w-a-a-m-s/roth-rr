import type { TaxBracket } from "@/lib/domain/types";

/**
 * Standard progressive income tax: each bracket's marginal rate is applied to
 * the portion of taxable income that falls within it. Brackets must be sorted
 * ascending by floor.
 */
export function progressiveTax(
  taxableIncome: number,
  brackets: TaxBracket[],
): number {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const floor = brackets[i].floor;
    if (taxableIncome <= floor) break;
    const ceiling =
      i + 1 < brackets.length ? brackets[i + 1].floor : Number.POSITIVE_INFINITY;
    const upper = Math.min(taxableIncome, ceiling);
    tax += (upper - floor) * brackets[i].rate;
  }
  return tax;
}

/**
 * Per-bracket breakdown of {@link progressiveTax}: returns the tax incurred
 * within each bracket (same length/order as `brackets`). The sum equals
 * `progressiveTax(taxableIncome, brackets)`. Brackets not reached are 0.
 */
export function progressiveTaxByBracket(
  taxableIncome: number,
  brackets: TaxBracket[],
): number[] {
  const byBracket = brackets.map(() => 0);
  if (taxableIncome <= 0 || brackets.length === 0) return byBracket;
  for (let i = 0; i < brackets.length; i++) {
    const floor = brackets[i].floor;
    if (taxableIncome <= floor) break;
    const ceiling =
      i + 1 < brackets.length ? brackets[i + 1].floor : Number.POSITIVE_INFINITY;
    const upper = Math.min(taxableIncome, ceiling);
    byBracket[i] = (upper - floor) * brackets[i].rate;
  }
  return byBracket;
}

/**
 * Federal (or preferential) long-term capital gains tax with ordinary income
 * stacking: ordinary taxable income fills the lower preferential brackets first,
 * then gains are taxed in the remaining room at 0% / 15% / 20% (or state rates).
 */
export function capitalGainsTaxStacked(
  ordinaryTaxableIncome: number,
  capitalGains: number,
  brackets: TaxBracket[],
): number {
  if (capitalGains <= 0 || brackets.length === 0) return 0;
  const ordinary = Math.max(0, ordinaryTaxableIncome);
  return (
    progressiveTax(ordinary + capitalGains, brackets) -
    progressiveTax(ordinary, brackets)
  );
}

/**
 * Per-bracket breakdown of {@link capitalGainsTaxStacked}: tax on gains in each
 * preferential bracket after ordinary income has filled the lower ones. The sum
 * equals `capitalGainsTaxStacked(ordinary, gains, brackets)`.
 */
export function capitalGainsTaxByBracket(
  ordinaryTaxableIncome: number,
  capitalGains: number,
  brackets: TaxBracket[],
): number[] {
  if (brackets.length === 0) return [];
  if (capitalGains <= 0) return brackets.map(() => 0);
  const ordinary = Math.max(0, ordinaryTaxableIncome);
  const withGains = progressiveTaxByBracket(ordinary + capitalGains, brackets);
  const ordinaryOnly = progressiveTaxByBracket(ordinary, brackets);
  return withGains.map((tax, i) => tax - ordinaryOnly[i]);
}

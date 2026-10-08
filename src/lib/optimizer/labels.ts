import type {
  ConversionStrategy,
  FillBracketRate,
} from "@/lib/domain/types";
import { FILL_BRACKET_RATES } from "@/lib/domain/types";

export { FILL_BRACKET_RATES, type FillBracketRate };

/** User-facing names for conversion strategies. */
export const STRATEGY_LABELS: Record<ConversionStrategy, string> = {
  even: "Spread evenly",
  immediate: "Immediately",
  fillBracket: "Fill a federal bracket",
  irmaa: "Stay under IRMAA tier",
  depleteByRmd: "Empty by RMD",
  minTax: "Minimum taxes",
  manual: "Manual",
};

export function fillBracketLabel(rate: FillBracketRate): string {
  return `Fill the ${Math.round(rate * 100)}% bracket`;
}

/** Short tooltip copy for each strategy in the menu. */
export const STRATEGY_HELP: Record<ConversionStrategy, string> = {
  manual:
    "This is the conversion schedule you configured yourself, year by year.",
  even: "Spread the amount evenly across every year before RMDs start.",
  immediate:
    "Convert the full amount in the first year. Later years convert nothing.",
  fillBracket:
    "Each year, convert only enough to fill the selected federal tax bracket. Choose 12%, 22%, or 24%.",
  irmaa:
    "Each year, convert up to just under the next Medicare IRMAA income cliff so premiums stay in the current tier.",
  depleteByRmd:
    "Convert a share of what's left each year so tax-deferred accounts are empty by RMD age. This accounts for growth along the way.",
  minTax:
    "Searches for the yearly conversions that pay the least federal and state income tax over your whole retirement. It looks only at taxes, not Medicare or the inheritance.",
};

export function isFillBracketRate(value: unknown): value is FillBracketRate {
  return (
    typeof value === "number" &&
    (FILL_BRACKET_RATES as readonly number[]).includes(value)
  );
}

export function resolveBracketRate(
  value: unknown,
): FillBracketRate {
  return isFillBracketRate(value) ? value : 0.22;
}

/** Year grid is editable for these strategies; others are a computed preview. */
export function strategyUsesYearEditor(
  strategy: ConversionStrategy,
): boolean {
  return (
    strategy === "manual" ||
    strategy === "even" ||
    strategy === "immediate"
  );
}

export const CONVERSION_STRATEGIES: readonly ConversionStrategy[] = [
  "manual",
  "even",
  "immediate",
  "fillBracket",
  "irmaa",
  "depleteByRmd",
  "minTax",
];

export function isConversionStrategy(
  value: unknown,
): value is ConversionStrategy {
  return (
    typeof value === "string" &&
    (CONVERSION_STRATEGIES as readonly string[]).includes(value)
  );
}

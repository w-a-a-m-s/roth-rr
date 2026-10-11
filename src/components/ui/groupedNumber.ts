/**
 * Helpers for money fields that show thousands separators while you type
 * ("1,000" instead of "1000"). Kept pure so they're easy to test.
 */

/**
 * Clean what was typed into a grouped number: drop everything but digits and
 * the first dot, keep at most `decimals` places, and add commas to the whole
 * part. Returns the text to show and the number it means (undefined when empty).
 */
export function groupTyped(
  raw: string,
  decimals = 0,
): { text: string; value: number | undefined } {
  let cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot >= 0) {
    cleaned =
      cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  }
  let [whole, fraction] = cleaned.split(".");
  whole = whole.replace(/^0+(?=\d)/, "");
  const hasDot = decimals > 0 && dot >= 0;
  fraction = hasDot ? (fraction ?? "").slice(0, decimals) : "";
  const text = `${groupDigits(whole)}${hasDot ? `.${fraction}` : ""}`;
  if (whole === "" && fraction === "") return { text: hasDot ? text : "", value: undefined };
  return { text, value: Number(`${whole || "0"}.${fraction || "0"}`) };
}

/** "1234567" -> "1,234,567". */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A stored number as grouped text, e.g. 1500 -> "1,500" (or "1,500.00"). */
export function formatGrouped(value: number | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "";
  const fixed = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  const [whole, fraction] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const grouped = groupDigits(whole.replace("-", ""));
  return `${sign}${grouped}${fraction != null ? `.${fraction}` : ""}`;
}

/**
 * Where the caret goes after regrouping: just after the same count of digits
 * (and dot) that sat before it in the typed text, so adding a comma doesn't
 * push the caret around.
 */
export function caretAfterGrouping(typed: string, caret: number, grouped: string): number {
  const significant = typed.slice(0, caret).replace(/[^\d.]/g, "").length;
  if (significant === 0) return 0;
  let seen = 0;
  for (let i = 0; i < grouped.length; i++) {
    if (/[\d.]/.test(grouped[i])) seen += 1;
    if (seen === significant) return i + 1;
  }
  return grouped.length;
}

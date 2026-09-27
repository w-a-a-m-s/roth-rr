/** Where a sign-in or registration started. Stored on signup attempts. */

export type EntrySurface =
  | "website_home"
  | "roth_landing"
  | "calculator_gate"
  | "plan_share";

export const ENTRY_SURFACES: readonly EntrySurface[] = [
  "website_home",
  "roth_landing",
  "calculator_gate",
  "plan_share",
];

export function parseEntrySurface(
  raw: string | null | undefined,
): EntrySurface | null {
  if (!raw) return null;
  return (ENTRY_SURFACES as readonly string[]).includes(raw)
    ? (raw as EntrySurface)
    : null;
}

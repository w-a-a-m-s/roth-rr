/** Calendar-year helpers for the typed year field (was a dropdown). */

export function yearBounds(
  from?: number,
  to?: number,
  now = new Date().getFullYear(),
): { min: number; max: number } {
  return { min: from ?? now - 70, max: to ?? now + 60 };
}

/** Keep digits only; years in this app are four digits. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 4);
}

export function yearOutOfRangeMessage(min: number, max: number): string {
  return `Enter a year between ${min} and ${max}`;
}

export function parseYearInput(
  raw: string,
  min: number,
  max: number,
  allowEmpty: boolean,
): { value: number | undefined; error: string | null } {
  const digits = digitsOnly(raw);
  if (digits === "") {
    return allowEmpty
      ? { value: undefined, error: null }
      : { value: undefined, error: yearOutOfRangeMessage(min, max) };
  }
  const year = Number(digits);
  if (year < min || year > max) {
    return { value: undefined, error: yearOutOfRangeMessage(min, max) };
  }
  return { value: year, error: null };
}

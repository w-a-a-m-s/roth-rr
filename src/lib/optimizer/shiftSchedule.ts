/**
 * Re-index a per-projection-year schedule when the projection start moves, so
 * each amount stays on the same calendar year. An earlier start adds empty
 * years in front; a later start drops the years that are no longer projected.
 */
export function shiftSchedule(
  schedule: number[],
  fromStart: number,
  toStart: number,
): number[] {
  const shift = fromStart - toStart;
  if (shift === 0) return [...schedule];
  if (shift > 0) return [...new Array(shift).fill(0), ...schedule];
  return schedule.slice(-shift);
}

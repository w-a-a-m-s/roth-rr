/**
 * Every step tour is desktop (lg+) only. This is the only viewport gate:
 * StepTour calls it, and no tour id has its own mobile exception.
 */
export function shouldRunStepTour(unseen: boolean, lgUp: boolean): boolean {
  return unseen && lgUp;
}

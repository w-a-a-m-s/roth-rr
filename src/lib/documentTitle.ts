/** App name used in the browser tab title. */
export const APP_TITLE = "Advanced Roth Calculator";

/** Build the document title for the active plan (or the bare app name). */
export function documentTitleForPlan(planName: string | null | undefined): string {
  const name = planName?.trim();
  if (!name) return APP_TITLE;
  return `${name} | ${APP_TITLE}`;
}

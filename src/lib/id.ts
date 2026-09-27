/** Short unique id for newly created people/accounts/incomes in the UI. */
export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

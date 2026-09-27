/** Normalize a plan name for comparison (trim + case-fold). */
export function normalizePlanName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Whether another plan already uses this name (case-insensitive, trimmed).
 * Pass `excludeId` when renaming so the plan can keep its current name.
 */
export function isPlanNameTaken(
  configs: ReadonlyArray<{ id: string; name: string }>,
  name: string,
  excludeId?: string,
): boolean {
  const normalized = normalizePlanName(name);
  if (!normalized) return false;
  return configs.some(
    (c) =>
      c.id !== excludeId && normalizePlanName(c.name) === normalized,
  );
}

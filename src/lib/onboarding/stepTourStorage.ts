/** Browser-local record of which plan-wizard step tours the user has finished. */

const STORAGE_KEY = "roth:step-tour-seen";

export type StepTourId =
  | "household"
  | "accounts"
  | "income"
  | "realEstate"
  | "expenses"
  | "conversion"
  | "strategyPanel";

type SeenMap = Partial<Record<StepTourId, boolean>>;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Subscribe to seen-flag changes (for `useSyncExternalStore`). */
export function subscribeStepTourSeen(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function readSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as SeenMap;
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  emit();
}

export function hasSeenStepTour(id: StepTourId): boolean {
  return Boolean(readSeen()[id]);
}

export function markStepTourSeen(id: StepTourId) {
  const next = { ...readSeen(), [id]: true };
  writeSeen(next);
}

/** Test helper: clear all seen flags. */
export function clearStepTourSeen() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  emit();
}

import { getBasePath } from "@/lib/basePath";
import { DEFAULT_PLANS } from "@/lib/config/defaultPlans";

/** Legacy query param; still read for old bookmarks, never written. */
export const PLAN_QUERY_KEY = "plan";

type PlanRef = { id: string; publicId?: string };

/** Id used in the shareable path (`publicId` when present, else `id`). */
export function planUrlId(plan: PlanRef): string {
  return plan.publicId || plan.id;
}

/**
 * Resolve a URL segment / legacy query value to the store plan `id`, or null
 * when it does not match a known sample or user plan.
 */
export function knownPlanId(
  urlId: string,
  configs: ReadonlyArray<PlanRef>,
): string | null {
  if (!urlId) return null;
  if (DEFAULT_PLANS.some((p) => p.id === urlId)) return urlId;
  const match = configs.find((c) => c.publicId === urlId || c.id === urlId);
  return match?.id ?? null;
}

/** Pathname relative to `basePath` (e.g. `/`, `/Jg7YL6N5bOs`, `/disclaimer`). */
function pathAfterBase(pathname: string): string {
  const base = getBasePath();
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    const rest = pathname.slice(base.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

/**
 * Read the plan id from the current browser location (client-only).
 * Prefers `/{publicId}`; falls back to legacy `?plan=`.
 */
export function readPlanIdFromWindow(): string | null {
  if (typeof window === "undefined") return null;
  const rest = pathAfterBase(window.location.pathname);
  const segment = rest.replace(/^\//, "").split("/")[0] ?? "";
  if (segment && segment !== "disclaimer") {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
  return new URLSearchParams(window.location.search).get(PLAN_QUERY_KEY);
}

/**
 * Build an href for the active plan: `/{publicId}` (plus any
 * non-legacy query params). Strips legacy `?plan=`.
 */
export function hrefWithPlan(
  _pathname: string,
  searchParams: { toString(): string },
  planUrlSegment: string,
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete(PLAN_QUERY_KEY);
  const qs = params.toString();
  const base = getBasePath();
  const path = planUrlSegment
    ? `${base}/${encodeURIComponent(planUrlSegment)}`
    : base || "/";
  return qs ? `${path}?${qs}` : path;
}

/**
 * Pick which plan should be active after a server hydrate: prefer a valid
 * plan from the URL, otherwise the first loaded plan.
 */
export function pickHydrateActiveId(
  plans: ReadonlyArray<PlanRef>,
  preferredUrlId: string | null,
): string {
  if (plans.length === 0) {
    return knownPlanId(preferredUrlId ?? "", []) ?? "";
  }
  const known = preferredUrlId ? knownPlanId(preferredUrlId, plans) : null;
  return known ?? plans[0]!.id;
}

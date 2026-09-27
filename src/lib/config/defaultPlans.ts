import type { SavedConfig } from "@/lib/domain/types";

/**
 * Built-in sample plans for testing and demos. They are NOT persisted and are
 * read-only: the store refuses to edit, rename, or delete them. To experiment,
 * duplicate one into an editable plan. Ids are prefixed `sample-`.
 *
 * Currently empty: no sample plans are shipped in the UI. Keep the helpers so
 * legacy `sample-*` ids (bookmarks, old URLs) stay read-only if encountered.
 */

const PREFIX = "sample-";

export function isDefaultPlanId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export const DEFAULT_PLANS: SavedConfig[] = [];

/** Cookie holding an invite code across the OAuth / magic-link round-trip. */
export const AUTH_INVITE_COOKIE = "wl-invite-code";

/** Query param on the calculator URL: `?invite=<code>`. */
export const INVITE_QUERY_KEY = "invite";

/**
 * Every invite lifecycle status. Ordered the way we want them to read in
 * admin UIs. This is the single source of truth: never hardcode these
 * strings or their labels anywhere else, derive from here.
 *
 * - `invited`            pending (plan share or leftover admin invite)
 * - `requesting_access`  leftover request-to-join row (no longer created)
 * - `approved`           leftover approved request (no account yet)
 * - `rejected`           leftover rejected request
 * - `registered`         the invite was claimed by a real account
 */
export const INVITE_STATUSES = [
  "invited",
  "requesting_access",
  "approved",
  "rejected",
  "registered",
] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Human label + a bit of grouping metadata for each invite status. */
export const INVITE_STATUS_CONFIG: Record<
  InviteStatus,
  {
    /** Friendly label shown in admin UIs (filters, table cells, badges). */
    label: string;
    /** True once the invitee has a real account. */
    isRegistered: boolean;
  }
> = {
  invited: { label: "Invite (admin invited)", isRegistered: false },
  requesting_access: {
    label: "Requesting access: pending",
    isRegistered: false,
  },
  approved: { label: "Requesting access: approved", isRegistered: false },
  rejected: { label: "Requesting access: rejected", isRegistered: false },
  registered: { label: "Registered", isRegistered: true },
};

/** Friendly label for an invite status (falls back to the raw value). */
export function inviteStatusLabel(status: InviteStatus): string {
  return INVITE_STATUS_CONFIG[status]?.label ?? status;
}

export const INVITE_SOURCES = [
  "admin",
  "plan_share",
  "manual_enrollment",
] as const;

export type InviteSource = (typeof INVITE_SOURCES)[number];

export const SYSTEM_CAMPAIGN_SLUGS = {
  plan_share: "plan_share",
  manual_enrollment: "manual_enrollment",
} as const;

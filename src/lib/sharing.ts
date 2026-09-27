/**
 * Plan sharing primitives shared by the server (data-access + API routes) and
 * the client (Share dialog). Kept free of `server-only` and any DB types so the
 * browser bundle can import them.
 *
 * A plan is owned by one user but can be shared with others. Each member has a
 * role that gates edit, share, delete, and history restore.
 */

export type PlanRole = "admin" | "editor" | "viewer";

export const PLAN_ROLES: PlanRole[] = ["admin", "editor", "viewer"];

export const ROLE_LABELS: Record<PlanRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export function isPlanRole(value: unknown): value is PlanRole {
  return value === "admin" || value === "editor" || value === "viewer";
}

/** True when the role can change plan content (household). */
export function canEditPlan(role: PlanRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

/** True when the role can rename the plan. */
export function canRenamePlan(role: PlanRole | null | undefined): boolean {
  return role === "admin";
}

/** True when the role can soft-delete the plan. */
export function canDeletePlan(role: PlanRole | null | undefined): boolean {
  return role === "admin";
}

/** True when the role can manage members / invites. */
export function canSharePlan(role: PlanRole | null | undefined): boolean {
  return role === "admin";
}

/** True when the role can duplicate the plan. */
export function canDuplicatePlan(role: PlanRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

/** True when the role can open plan history. */
export function canViewHistory(role: PlanRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

/** True when the role can restore a historical revision. */
export function canRestoreHistory(role: PlanRole | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

/**
 * A single row in the Share dialog. Resolved members carry a `userId` and their
 * account's email/name; pending invites (people who haven't signed in yet) have
 * `pending: true` and are keyed by `email` only.
 */
export interface PlanMemberView {
  /** Mongo user id, or null for a pending email invite. */
  userId: string | null;
  email: string | null;
  name: string | null;
  role: PlanRole;
  /** The plan creator; can't be removed. */
  isOwner: boolean;
  /** True when this row is an invite for an email with no account yet. */
  pending: boolean;
  /** True when this row is the requesting user. */
  isSelf: boolean;
}

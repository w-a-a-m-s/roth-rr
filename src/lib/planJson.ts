/** True when the real signed-in user is a superAdmin, including impersonation. */
export function isRealSuperAdmin(session: {
  user?: { superAdmin?: boolean } | null;
  impersonation?: { active?: boolean } | null;
} | null | undefined): boolean {
  if (!session) return false;
  return (
    Boolean(session.user?.superAdmin) || Boolean(session.impersonation?.active)
  );
}

/** Safe download name for a plan JSON file. */
export function planJsonFilename(name: string): string {
  const safe = name
    .trim()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "plan"}.json`;
}

/** Trigger a browser download of the given JSON text. */
export function downloadPlanJson(json: string, name: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = planJsonFilename(name);
  anchor.click();
  URL.revokeObjectURL(url);
}

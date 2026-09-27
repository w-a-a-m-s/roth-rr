import { describe, expect, it } from "vitest";
import {
  ROLE_LABELS,
  canDeletePlan,
  canDuplicatePlan,
  canEditPlan,
  canRenamePlan,
  canRestoreHistory,
  canSharePlan,
  canViewHistory,
  isPlanRole,
} from "./sharing";

describe("plan roles", () => {
  it("labels Admin / Editor / Viewer", () => {
    expect(ROLE_LABELS.admin).toBe("Admin");
    expect(ROLE_LABELS.editor).toBe("Editor");
    expect(ROLE_LABELS.viewer).toBe("Viewer");
  });

  it("recognizes valid roles", () => {
    expect(isPlanRole("admin")).toBe(true);
    expect(isPlanRole("editor")).toBe(true);
    expect(isPlanRole("viewer")).toBe(true);
    expect(isPlanRole("owner")).toBe(false);
  });

  it("gates admin-only actions", () => {
    expect(canSharePlan("admin")).toBe(true);
    expect(canSharePlan("editor")).toBe(false);
    expect(canSharePlan("viewer")).toBe(false);
    expect(canDeletePlan("admin")).toBe(true);
    expect(canDeletePlan("editor")).toBe(false);
    expect(canRenamePlan("admin")).toBe(true);
    expect(canRenamePlan("editor")).toBe(false);
  });

  it("allows editors to edit, duplicate, and restore history", () => {
    for (const role of ["admin", "editor"] as const) {
      expect(canEditPlan(role)).toBe(true);
      expect(canDuplicatePlan(role)).toBe(true);
      expect(canViewHistory(role)).toBe(true);
      expect(canRestoreHistory(role)).toBe(true);
    }
  });

  it("keeps viewers read-only", () => {
    expect(canEditPlan("viewer")).toBe(false);
    expect(canDuplicatePlan("viewer")).toBe(false);
    expect(canViewHistory("viewer")).toBe(false);
    expect(canRestoreHistory("viewer")).toBe(false);
    expect(canSharePlan("viewer")).toBe(false);
    expect(canDeletePlan("viewer")).toBe(false);
    expect(canRenamePlan("viewer")).toBe(false);
  });

  it("treats missing role as no permission", () => {
    expect(canEditPlan(undefined)).toBe(false);
    expect(canSharePlan(null)).toBe(false);
  });
});

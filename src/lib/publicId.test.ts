import { describe, it, expect } from "vitest";
import {
  generatePublicId,
  isPublicIdFormat,
  PUBLIC_ID_LENGTH,
} from "@/lib/publicId";

describe("generatePublicId", () => {
  it("returns 11-char alphanumeric ids", () => {
    for (let i = 0; i < 20; i++) {
      const id = generatePublicId();
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
      expect(isPublicIdFormat(id)).toBe(true);
    }
  });

  it("produces distinct values across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generatePublicId()));
    expect(ids.size).toBe(50);
  });
});

describe("isPublicIdFormat", () => {
  it("accepts a typical alphanumeric id", () => {
    expect(isPublicIdFormat("Jg7YL6N5bOs")).toBe(true);
  });

  it("rejects dashes, underscores, ObjectIds, and short paths", () => {
    expect(isPublicIdFormat("Jg7YL6N5bO-")).toBe(false);
    expect(isPublicIdFormat("Jg7YL6N5bO_")).toBe(false);
    expect(isPublicIdFormat("507f1f77bcf86cd799439011")).toBe(false);
    expect(isPublicIdFormat("local-seed")).toBe(false);
    expect(isPublicIdFormat("disclaimer")).toBe(false);
    expect(isPublicIdFormat("")).toBe(false);
  });
});

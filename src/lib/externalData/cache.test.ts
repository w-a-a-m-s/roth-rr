/**
 * Client cache TTL helper tests (pure logic mirrored from the store).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const CACHE_KEY = "roth-external-data-test";
const TTL_MS = 24 * 60 * 60 * 1000;

function isFresh(fetchedAt: number, now: number): boolean {
  return now - fetchedAt < TTL_MS;
}

describe("external data cache TTL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats cache under 24h as fresh", () => {
    const fetchedAt = Date.now();
    vi.setSystemTime(fetchedAt + TTL_MS - 1);
    expect(isFresh(fetchedAt, Date.now())).toBe(true);
  });

  it("treats cache at/after 24h as stale", () => {
    const fetchedAt = Date.now();
    vi.setSystemTime(fetchedAt + TTL_MS);
    expect(isFresh(fetchedAt, Date.now())).toBe(false);
  });

  it("uses a stable cache key constant", () => {
    expect(CACHE_KEY).toContain("external-data");
  });
});

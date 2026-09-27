import "server-only";

import { cookies } from "next/headers";
import {
  getToolRegistration,
  setToolTimestampOnce,
} from "@/lib/auth/server";

const TOOL = "roth";
const SESSION_COOKIE = "wl-analytics-session-started";
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_WINDOW_MS = 14 * DAY_MS;
const FIRST_PLAN_GAP_MS = DAY_MS;

function asTime(value: Date | string | number | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Browser-session start, used for the 24h gap after first plan. */
export async function analyticsSessionStartedAt(): Promise<number> {
  const now = Date.now();
  try {
    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE)?.value;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    jar.set(SESSION_COOKIE, String(now), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
    return now;
  } catch {
    return now;
  }
}

export async function markFirstPlanGenerated(userId: string): Promise<void> {
  await setToolTimestampOnce(userId, TOOL, "firstPlanGeneratedAt", new Date());
}

export async function maybeActivatePlanner(
  userId: string,
  opts?: { impersonating?: boolean },
): Promise<void> {
  if (opts?.impersonating) return;
  const tool = await getToolRegistration(userId, TOOL);
  if (!tool || asTime(tool.activatedAt)) return;
  const registeredAt = asTime(tool.registeredAt);
  const firstPlanAt = asTime(tool.firstPlanGeneratedAt);
  if (registeredAt == null || firstPlanAt == null) return;

  const now = Date.now();
  if (now - registeredAt > ACTIVATION_WINDOW_MS) return;
  const sessionStarted = await analyticsSessionStartedAt();
  if (sessionStarted < firstPlanAt + FIRST_PLAN_GAP_MS) return;

  const activatedAt = new Date();
  const wrote = await setToolTimestampOnce(
    userId,
    TOOL,
    "activatedAt",
    activatedAt,
  );
  if (!wrote) return;
}

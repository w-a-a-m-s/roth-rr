import fs from "node:fs";
import path from "node:path";
import type { ExternalDataKey } from "../../src/lib/externalData/types";

/**
 * Load repo `.env` then `.env.local` into `process.env` (same idea as Next.js).
 * Existing process.env keys win; `.env.local` overrides `.env`.
 * Safe to call multiple times.
 */
function loadEnvFiles(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
        continue;
      }
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnvFiles();

/** Repo-relative fallback file for each implemented dataset. */
export const FALLBACK_PATHS: Partial<Record<ExternalDataKey, string>> = {
  "federal-tax": "src/lib/config/data/federalTax.json",
  medicare: "src/lib/config/data/medicare.json",
  "state-income-tax": "src/lib/config/data/stateIncomeTax.json",
};

export function fallbackAbsolute(key: ExternalDataKey): string | null {
  const rel = FALLBACK_PATHS[key];
  if (!rel) return null;
  return path.resolve(process.cwd(), rel);
}

const DEFAULT_API_URL = "http://localhost:3000";

/**
 * Origin for `GET`/`PUT /api/external-data`.
 * Accepts an origin or a full URL. A path is ignored so a stale
 * `/tool/roth-calculator` value still hits this app.
 */
export function apiBaseUrl(): string {
  const raw = (process.env.EXTERNAL_DATA_API_URL ?? DEFAULT_API_URL).trim();
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

export function adminToken(): string {
  const token = process.env.EXTERNAL_DATA_ADMIN_TOKEN;
  if (!token) {
    throw new Error(
      "EXTERNAL_DATA_ADMIN_TOKEN is not set (add it to .env or export it)",
    );
  }
  return token;
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

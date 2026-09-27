/**
 * Development-only safety net for keys in the project `.env`
 * (`MONGODB_DB`, `EXTERNAL_DATA_*`).
 *
 * Next loads that file on its own. If a key is still missing, read the file
 * directly and warn. Deployed environments get these from real env vars, so
 * this is a no-op outside development.
 *
 * No `server-only` import: the invalidate-sessions script reaches this
 * through the Mongo client outside Next.js.
 */

import fs from "fs";
import path from "path";

declare global {
  var _rothPackageEnvLoaded: boolean | undefined;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const raw of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Apply any missing keys from the project `.env` in dev. Idempotent per process. */
export function ensureRothPackageEnv(): void {
  if (process.env.NODE_ENV !== "development") return;
  if (globalThis._rothPackageEnvLoaded) return;
  globalThis._rothPackageEnvLoaded = true;

  const file = path.join(process.cwd(), ".env");
  const parsed = parseEnvFile(file);
  const filled: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key]) continue;
    process.env[key] = value;
    filled.push(key);
  }
  if (filled.length > 0) {
    console.warn(
      `[env] read ${filled.join(", ")} straight from .env: Next did not load them`,
    );
  }
}

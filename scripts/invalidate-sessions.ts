/**
 * Delete all Auth.js sessions so every user must sign in
 * again (and accept current Terms / Privacy versions).
 *
 * Run after bumping TERMS_VERSION or PRIVACY_VERSION:
 *   npm run invalidate-sessions
 */
import { config } from "dotenv";
import { resolve } from "path";
import { invalidateAllSessions } from "../src/lib/auth/server/users";

config({ path: resolve(__dirname, "../.env") });
config({ path: resolve(__dirname, "../.env.local") });

async function main() {
  const deleted = await invalidateAllSessions();
  console.log(`Invalidated ${deleted} session(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

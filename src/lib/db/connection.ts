/**
 * Shared Mongo client for the Roth database (`MONGODB_DB`).
 * Plans, external data, and Auth.js collections (users, sessions, accounts,
 * invites, and so on) all live in this one database.
 *
 * No `server-only` import: `scripts/invalidate-sessions.ts` loads this through
 * `users.ts` outside the Next.js bundler, where that package throws. App code
 * should import `@/lib/db/mongo`, which re-exports this module behind the
 * server-only guard.
 *
 * In development the connection is cached on `globalThis` so Next.js HMR
 * doesn't open a new pool on every reload. In production a single
 * module-level promise is reused. Connecting is deferred (not done at import
 * time) so `next build` succeeds even before the environment variables are
 * filled in.
 *
 * `MONGODB_DB` lives in the project `.env`. Next loads it.
 * `ensureRothPackageEnv()` is a dev-only safety net if that load missed.
 */

import { MongoClient, type Db } from "mongodb";
import { ensureRothPackageEnv } from "@/lib/db/loadPackageEnv";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoClientCacheKey: string | undefined;
}

/** Resolve the DB name per call; a module-scope const freezes it across HMR. */
export function resolveRothDbName(): string {
  ensureRothPackageEnv();
  const dbName = process.env["MONGODB_DB"]?.trim();
  if (!dbName) {
    throw new Error(
      "MONGODB_DB is not set. Add it to .env (see .env.example).",
    );
  }
  return dbName;
}

function resolveUri(): string {
  ensureRothPackageEnv();
  const uri = process.env["MONGODB_URI"];
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy the root .env.example to .env.",
    );
  }
  return uri;
}

function cacheKey(uri: string, dbName: string): string {
  return `${uri}\0${dbName}`;
}

function connect(uri: string): Promise<MongoClient> {
  return new MongoClient(uri).connect();
}

/** Lazily resolve the shared connected client for the Roth DB. */
export function getClientPromise(): Promise<MongoClient> {
  const uri = resolveUri();
  const dbName = resolveRothDbName();
  const key = cacheKey(uri, dbName);

  if (process.env.NODE_ENV === "development") {
    if (globalThis._mongoClientCacheKey !== key) {
      const previous = globalThis._mongoClientPromise;
      globalThis._mongoClientCacheKey = key;
      globalThis._mongoClientPromise = connect(uri);
      if (previous) {
        void previous.then((client) => client.close()).catch(() => undefined);
      }
    }
    return globalThis._mongoClientPromise!;
  }

  if (!clientPromise || clientCacheKey !== key) {
    clientCacheKey = key;
    clientPromise = connect(uri);
  }
  return clientPromise;
}

let clientPromise: Promise<MongoClient> | undefined;
let clientCacheKey: string | undefined;

/** Resolve the Roth application database handle. */
export async function getDb(): Promise<Db> {
  const dbName = resolveRothDbName();
  const client = await getClientPromise();
  return client.db(dbName);
}

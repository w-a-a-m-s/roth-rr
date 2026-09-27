/**
 * Server entry for the Roth Mongo database. See `./connection` for the client.
 * Import this from Next.js server code so a client bundle cannot pull in Mongo.
 */
import "server-only";

export { getClientPromise, getDb, resolveRothDbName } from "./connection";

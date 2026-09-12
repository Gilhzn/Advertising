import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

let cached: Db | undefined;

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 10, prepare: false });
  return drizzle(client, { schema });
}

/**
 * Shared client. Created lazily on first *use* (not on first call), so modules may hold a `getDb()`
 * reference at import time - e.g. during `next build` page-data collection - without a DATABASE_URL.
 */
export function getDb(): Db {
  if (cached) return cached;
  if (process.env.DATABASE_URL) {
    cached = createDb();
    return cached;
  }
  return new Proxy({} as Db, {
    get(_target, prop) {
      if (!cached) cached = createDb();
      const value = (cached as unknown as Record<PropertyKey, unknown>)[prop];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(cached) : value;
    },
  });
}

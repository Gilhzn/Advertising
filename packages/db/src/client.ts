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

export function getDb(): Db {
  if (!cached) cached = createDb();
  return cached;
}

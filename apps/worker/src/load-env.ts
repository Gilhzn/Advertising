import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/**
 * Loads the repo root `.env` in dev (Railway / GitHub Actions set real env vars directly). Called from
 * the module body of both entry points (`main.ts`, `tick.ts`) before anything reads the environment.
 *
 * Safe even though ESM hoists the entry point's other imports above this call: `@adv/db` and `@adv/jobs`
 * both read `process.env.DATABASE_URL` lazily inside function calls, never at module-evaluation time, so
 * import hoisting cannot race it.
 */
export function loadWorkerEnv(): void {
  if (process.env.NODE_ENV === "production") return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(here, "../../../.env") });
}

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env so `pnpm test` / `pnpm eval` find DATABASE_URL without turbo. */
export function loadEnv(): void {
  // keep the eval output readable; set LOG_LEVEL=info to see every run
  if (!process.env.LOG_LEVEL && process.env.NODE_ENV !== "test") process.env.LOG_LEVEL = "warn";
  if (process.env.DATABASE_URL) return;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      if (process.env.DATABASE_URL) return;
    }
    dir = dirname(dir);
  }
  process.env.DATABASE_URL ??= "postgres://adv:adv@localhost:5432/adv";
}

loadEnv();

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env so `pnpm -F @adv/worker test` finds DATABASE_URL without turbo/dotenv. */
function loadEnv(): void {
  if (process.env.DATABASE_URL && process.env.TOKEN_ENCRYPTION_KEY) return;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
    dir = dirname(dir);
  }
  process.env.DATABASE_URL ??= "postgres://adv:adv@localhost:5432/adv";
  process.env.TOKEN_ENCRYPTION_KEY ??= "6f1d2c3b4a5968778695a4b3c2d1e0f0123456789abcdef0123456789abcdef0";
  process.env.APP_URL ??= "http://localhost:3000";
}

loadEnv();

import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3200";
const baseURL = `http://localhost:${PORT}`;

const fallbackChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(fallbackChromium) ? fallbackChromium : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // `next dev`, not build+start: the dev-login Credentials provider (used by the e2e
    // smoke tests) is only registered when NODE_ENV !== "production" AND ENABLE_DEV_LOGIN=1.
    command: `pnpm exec next dev -p ${PORT}`,
    url: baseURL,
    env: {
      ENABLE_DEV_LOGIN: "1",
      // Owner-password login, exercised by e2e/owner-login.spec.ts.
      OWNER_EMAIL: "owner@example.com",
      OWNER_PASSWORD: "correct-horse-battery-staple",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

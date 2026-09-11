import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/test-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Every test file shares the same local Postgres + pg-boss schema; run them one at a time.
    fileParallelism: false,
  },
});

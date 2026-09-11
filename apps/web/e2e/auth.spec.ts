import { expect, test } from "@playwright/test";
import { loginAsDevUser } from "./helpers";

test("redirects to /login when signed out, and dev login reaches the overview", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(/\/login/);

  await loginAsDevUser(page, `e2e-auth-${Date.now()}@example.com`);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

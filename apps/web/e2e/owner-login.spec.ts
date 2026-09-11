import { expect, test } from "@playwright/test";
import { loginAsOwner } from "./helpers";

// OWNER_EMAIL / OWNER_PASSWORD are set in the Playwright webServer env (playwright.config.ts).
const OWNER_EMAIL = "owner@example.com";
const OWNER_PASSWORD = "correct-horse-battery-staple";

test("owner-password login reaches the overview page", async ({ page }) => {
  await loginAsOwner(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("wrong password shows an error and does not sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

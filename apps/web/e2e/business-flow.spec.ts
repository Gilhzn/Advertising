import { expect, test } from "@playwright/test";
import { loginAsDevUser } from "./helpers";

test("create a business and open its strategy, setup and content pages", async ({ page }) => {
  await loginAsDevUser(page, `e2e-business-${Date.now()}@example.com`);

  await page.goto("/businesses/new");
  const name = `E2E Test Business ${Date.now()}`;
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Description")
    .fill("A smoke-test business created by the Playwright e2e suite to exercise the onboarding flow.");
  await page.getByRole("button", { name: "Create business" }).click();

  await page.waitForURL(/\/b\/.+\/strategy/);
  await expect(page.getByRole("heading", { name: "Strategy" })).toBeVisible();

  // Brand assets card: shown even before the strategist has produced a brand kit, as its own
  // empty state (plan item 11 - avatar/banner download assets).
  await expect(page.getByRole("heading", { name: "Brand assets" })).toBeVisible();
  await expect(page.getByText("No brand assets yet")).toBeVisible();

  const slugMatch = page.url().match(/\/b\/([^/]+)\/strategy/);
  const slug = slugMatch?.[1];
  expect(slug).toBeTruthy();

  await page.goto(`/b/${slug}/setup`);
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();

  await page.goto(`/b/${slug}/content`);
  await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();

  await page.goto(`/b/${slug}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await page.goto(`/b/${slug}/platforms`);
  await expect(page.getByRole("heading", { name: "Platforms" })).toBeVisible();

  await page.goto(`/b/${slug}/insights`);
  await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();

  await page.goto(`/b/${slug}/settings`);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name })).toBeVisible();
});

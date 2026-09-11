import { expect, test } from "@playwright/test";
import { loginAsDevUser } from "./helpers";

test("mail, product and analytics pages show their empty states for a fresh business", async ({ page }) => {
  await loginAsDevUser(page, `e2e-mpa-${Date.now()}@example.com`);

  await page.goto("/businesses/new");
  const name = `E2E MPA Business ${Date.now()}`;
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Description").fill("A smoke-test business for the mail/product/analytics pages.");
  await page.getByRole("button", { name: "Create business" }).click();
  await page.waitForURL(/\/b\/.+\/strategy/);

  const slugMatch = page.url().match(/\/b\/([^/]+)\/strategy/);
  const slug = slugMatch?.[1];
  expect(slug).toBeTruthy();

  // Mail: no domain configured yet -> setup card asks for a domain.
  await page.goto(`/b/${slug}/mail`);
  await expect(page.getByRole("heading", { name: "Mail", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create a mailbox" })).toBeVisible();
  await expect(page.getByText(/set a domain for this business in settings/i)).toBeVisible();

  // Product: no PostHog project linked yet -> setup card.
  await page.goto(`/b/${slug}/product`);
  await expect(page.getByRole("heading", { name: "Product" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect PostHog" })).toBeVisible();

  // Analytics: no metric_snapshots yet -> empty state.
  await page.goto(`/b/${slug}/analytics`);
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByText("No data yet")).toBeVisible();
});

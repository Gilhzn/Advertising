import type { Page } from "@playwright/test";

/** Signs in via the dev-only Credentials provider. Only available when NODE_ENV !== "production". */
export async function loginAsDevUser(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email (dev login)").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

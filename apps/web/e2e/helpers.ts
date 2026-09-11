import type { Page } from "@playwright/test";

/** Signs in via the dev-only Credentials provider. Only available when NODE_ENV !== "production". */
export async function loginAsDevUser(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email (dev login)").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("/");
}

/** Signs in via the owner-password Credentials provider (OWNER_EMAIL / OWNER_PASSWORD). */
export async function loginAsOwner(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

import "../test-setup.js";

import { registerConnector } from "@adv/connectors";
import { auditLog, eq, getDb, oauthTokens } from "@adv/db";
import { decryptSecret } from "@adv/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAccount, createTestBusiness, fakeJob, makeFakeConnector } from "../test-helpers.js";
import { handleRefreshTokens } from "./refresh_tokens.js";

describe("refresh_tokens", () => {
  // Fresh business per test: `platform_accounts` enforces one owned account per (business, platform).
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    biz = await createTestBusiness();
  });

  afterEach(async () => {
    await biz.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("refreshes and persists tokens for a connected account expiring within 24h", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "fresh-access-token",
      refreshToken: "fresh-refresh-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }));
    registerConnector(makeFakeConnector({ refresh }));

    // createTestAccount's token already expires in 1h, well inside the 24h refresh window.
    const account = await createTestAccount(biz.businessId);

    await handleRefreshTokens([fakeJob({})]);

    expect(refresh).toHaveBeenCalledTimes(1);
    const db = getDb();
    const [tokenRow] = await db.select().from(oauthTokens).where(eq(oauthTokens.accountId, account.id));
    expect(tokenRow && decryptSecret(tokenRow.accessTokenEnc)).toBe("fresh-access-token");

    const auditRows = await db.select().from(auditLog).where(eq(auditLog.businessId, biz.businessId));
    expect(auditRows.some((r) => r.action === "refresh_tokens.refreshed")).toBe(true);
  });

  it("skips accounts whose connector has neither refresh nor refreshForAccount", async () => {
    registerConnector(makeFakeConnector({ refresh: undefined, refreshForAccount: undefined }));
    await createTestAccount(biz.businessId, { handle: "no-refresh" });

    await expect(handleRefreshTokens([fakeJob({})])).resolves.not.toThrow();
  });

  it("still refreshes accounts on a privateUntilReview (pre-audit) platform", async () => {
    const refresh = vi.fn(async () => ({
      accessToken: "fresh-access-token-2",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }));
    registerConnector(
      makeFakeConnector({
        refresh,
        capabilities: {
          text: true,
          image: true,
          video: true,
          carousel: false,
          nativeSchedule: false,
          insights: true,
          privateUntilReview: true,
          maxChars: 300,
          maxMedia: 4,
          imageAspects: ["1:1"],
        },
      }),
    );
    await createTestAccount(biz.businessId, { handle: "pre-audit-account" });

    await handleRefreshTokens([fakeJob({})]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

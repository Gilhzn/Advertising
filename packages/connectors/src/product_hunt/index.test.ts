import { PLATFORMS } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { MANUAL_EXTERNAL_ID_PREFIX } from "../assisted.js";
import { makeAccount, makePost } from "../testing.js";
import { productHuntConnector } from "./index.js";

const PLATFORM = "product_hunt" as const;
const account = makeAccount(PLATFORM, {
  config: { profileUrl: "https://www.producthunt.com/products/acme-robotics", manual: true },
  tokens: null,
});

describe("Product Hunt connector", () => {
  it("is an assisted, manual-publish connector with no insights", () => {
    expect(productHuntConnector.id).toBe(PLATFORM);
    expect(productHuntConnector.authKind).toBe("assisted");
    expect(productHuntConnector.capabilities.manualPublish).toBe(true);
    expect(productHuntConnector.capabilities.insights).toBe(false);
    expect(productHuntConnector.capabilities.nativeSchedule).toBe(false);
    expect(productHuntConnector.capabilities.maxChars).toBe(PLATFORMS[PLATFORM].maxChars);
    expect(productHuntConnector.authUrl).toBeUndefined();
    expect(productHuntConnector.exchangeCode).toBeUndefined();
  });

  it("explains the manual flow in the wizard", () => {
    const steps = productHuntConnector.wizard(null, {
      businessName: "Acme Robotics",
      websiteUrl: "https://acme.test",
    });
    expect(steps.map((s) => s.kind)).toEqual([
      "create_account",
      "configure",
      "connect_token",
      "info",
      "verify",
    ]);
    const info = steps.find((s) => s.kind === "info");
    expect(info?.instructions).toMatch(/no posting API/i);
    expect(info?.url).toBe("https://www.producthunt.com/posts/new");
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.map((i) => i.name)).toEqual(["profileUrl"]);
    expect(JSON.stringify(steps)).toContain("tagline");
    expect(JSON.stringify(steps)).toMatch(/1270x760/);
    expect(JSON.stringify(steps)).toMatch(/00:01 Pacific/);
  });

  it("stores the pasted profile url and rejects a malformed one", async () => {
    const ok = await productHuntConnector.connectWithInputs?.({
      profileUrl: "https://www.producthunt.com/products/acme-robotics",
    });
    expect(ok?.account.config).toMatchObject({
      profileUrl: "https://www.producthunt.com/products/acme-robotics",
      manual: true,
    });
    expect(ok?.tokens).toBeUndefined();

    const empty = await productHuntConnector.connectWithInputs?.({});
    expect(empty?.account.config).toMatchObject({ profileUrl: null });

    await expect(productHuntConnector.connectWithInputs?.({ profileUrl: "not a url" })).rejects.toMatchObject(
      {
        name: "ConnectorError",
        code: "not_configured",
      },
    );
  });

  it("prepares the post for manual publishing without any network call", async () => {
    const result = await productHuntConnector.publish(account, makePost(PLATFORM));
    expect(result.externalId).toBe(`${MANUAL_EXTERNAL_ID_PREFIX}post_1`);
    expect(result.url).toBeUndefined();
    expect(result.visibility).toBe("public");
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await productHuntConnector.publish(
      account,
      makePost(PLATFORM, { externalId: "manual:post_1" }),
    );
    expect(result.externalId).toBe("manual:post_1");
  });

  it("verifies ok with a manual-publish warning and returns no insights", async () => {
    const verified = await productHuntConnector.verify(account);
    expect(verified.ok).toBe(true);
    expect(verified.profileUrl).toBe("https://www.producthunt.com/products/acme-robotics");
    expect(verified.warning).toMatch(/no posting API/i);
    await expect(
      productHuntConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", []),
    ).resolves.toEqual([]);
  });
});

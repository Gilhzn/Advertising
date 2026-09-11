import { PLATFORMS } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { MANUAL_EXTERNAL_ID_PREFIX } from "../assisted.js";
import { makeAccount, makePost } from "../testing.js";
import { steamConnector } from "./index.js";

const PLATFORM = "steam" as const;
const account = makeAccount(PLATFORM, {
  config: { profileUrl: "https://store.steampowered.com/app/1234567/Tiny_Bots/", manual: true },
  tokens: null,
});

describe("Steam connector", () => {
  it("is an assisted, manual-publish connector with no insights", () => {
    expect(steamConnector.id).toBe(PLATFORM);
    expect(steamConnector.authKind).toBe("assisted");
    expect(steamConnector.capabilities.manualPublish).toBe(true);
    expect(steamConnector.capabilities.insights).toBe(false);
    expect(steamConnector.capabilities.nativeSchedule).toBe(false);
    expect(steamConnector.capabilities.maxChars).toBe(PLATFORMS[PLATFORM].maxChars);
    expect(steamConnector.authUrl).toBeUndefined();
    expect(steamConnector.exchangeCode).toBeUndefined();
  });

  it("explains the manual flow in the wizard", () => {
    const steps = steamConnector.wizard(null, {
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
    expect(info?.url).toBe("https://partner.steamgames.com/");
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.map((i) => i.name)).toEqual(["profileUrl"]);
    expect(JSON.stringify(steps)).toContain("BBCode");
    expect(JSON.stringify(steps)).toMatch(/\$100/);
    expect(JSON.stringify(steps)).toMatch(/Next Fest/);
  });

  it("stores the pasted profile url and rejects a malformed one", async () => {
    const ok = await steamConnector.connectWithInputs?.({
      profileUrl: "https://store.steampowered.com/app/1234567/Tiny_Bots/",
    });
    expect(ok?.account.config).toMatchObject({
      profileUrl: "https://store.steampowered.com/app/1234567/Tiny_Bots/",
      manual: true,
    });
    expect(ok?.tokens).toBeUndefined();

    const empty = await steamConnector.connectWithInputs?.({});
    expect(empty?.account.config).toMatchObject({ profileUrl: null });

    await expect(steamConnector.connectWithInputs?.({ profileUrl: "not a url" })).rejects.toMatchObject({
      name: "ConnectorError",
      code: "not_configured",
    });
  });

  it("prepares the post for manual publishing without any network call", async () => {
    const result = await steamConnector.publish(account, makePost(PLATFORM));
    expect(result.externalId).toBe(`${MANUAL_EXTERNAL_ID_PREFIX}post_1`);
    expect(result.url).toBeUndefined();
    expect(result.visibility).toBe("public");
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await steamConnector.publish(account, makePost(PLATFORM, { externalId: "manual:post_1" }));
    expect(result.externalId).toBe("manual:post_1");
  });

  it("verifies ok with a manual-publish warning and returns no insights", async () => {
    const verified = await steamConnector.verify(account);
    expect(verified.ok).toBe(true);
    expect(verified.profileUrl).toBe("https://store.steampowered.com/app/1234567/Tiny_Bots/");
    expect(verified.warning).toMatch(/no posting API/i);
    await expect(steamConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual([]);
  });
});

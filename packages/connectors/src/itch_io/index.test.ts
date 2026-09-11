import { PLATFORMS } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { MANUAL_EXTERNAL_ID_PREFIX } from "../assisted.js";
import { makeAccount, makePost } from "../testing.js";
import { itchIoConnector } from "./index.js";

const PLATFORM = "itch_io" as const;
const account = makeAccount(PLATFORM, {
  config: { profileUrl: "https://acmerobotics.itch.io/tiny-bots", manual: true },
  tokens: null,
});

describe("itch.io connector", () => {
  it("is an assisted, manual-publish connector with no insights", () => {
    expect(itchIoConnector.id).toBe(PLATFORM);
    expect(itchIoConnector.authKind).toBe("assisted");
    expect(itchIoConnector.capabilities.manualPublish).toBe(true);
    expect(itchIoConnector.capabilities.insights).toBe(false);
    expect(itchIoConnector.capabilities.nativeSchedule).toBe(false);
    expect(itchIoConnector.capabilities.maxChars).toBe(PLATFORMS[PLATFORM].maxChars);
    expect(itchIoConnector.authUrl).toBeUndefined();
    expect(itchIoConnector.exchangeCode).toBeUndefined();
  });

  it("explains the manual flow in the wizard", () => {
    const steps = itchIoConnector.wizard(null, {
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
    expect(info?.url).toBe("https://itch.io/dashboard");
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.map((i) => i.name)).toEqual(["profileUrl"]);
    expect(JSON.stringify(steps)).toContain("devlog");
    expect(JSON.stringify(steps)).toMatch(/butler/);
    expect(JSON.stringify(steps)).toMatch(/Release Announcements/);
  });

  it("stores the pasted profile url and rejects a malformed one", async () => {
    const ok = await itchIoConnector.connectWithInputs?.({
      profileUrl: "https://acmerobotics.itch.io/tiny-bots",
    });
    expect(ok?.account.config).toMatchObject({
      profileUrl: "https://acmerobotics.itch.io/tiny-bots",
      manual: true,
    });
    expect(ok?.tokens).toBeUndefined();

    const empty = await itchIoConnector.connectWithInputs?.({});
    expect(empty?.account.config).toMatchObject({ profileUrl: null });

    await expect(itchIoConnector.connectWithInputs?.({ profileUrl: "not a url" })).rejects.toMatchObject({
      name: "ConnectorError",
      code: "not_configured",
    });
  });

  it("prepares the post for manual publishing without any network call", async () => {
    const result = await itchIoConnector.publish(account, makePost(PLATFORM));
    expect(result.externalId).toBe(`${MANUAL_EXTERNAL_ID_PREFIX}post_1`);
    expect(result.url).toBeUndefined();
    expect(result.visibility).toBe("public");
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await itchIoConnector.publish(
      account,
      makePost(PLATFORM, { externalId: "manual:post_1" }),
    );
    expect(result.externalId).toBe("manual:post_1");
  });

  it("verifies ok with a manual-publish warning and returns no insights", async () => {
    const verified = await itchIoConnector.verify(account);
    expect(verified.ok).toBe(true);
    expect(verified.profileUrl).toBe("https://acmerobotics.itch.io/tiny-bots");
    expect(verified.warning).toMatch(/no posting API/i);
    await expect(itchIoConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual([]);
  });
});

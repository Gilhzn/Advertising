import { PLATFORMS } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { MANUAL_EXTERNAL_ID_PREFIX } from "../assisted.js";
import { makeAccount, makePost } from "../testing.js";
import { hackerNewsConnector } from "./index.js";

const PLATFORM = "hacker_news" as const;
const account = makeAccount(PLATFORM, {
  config: { profileUrl: "https://news.ycombinator.com/user?id=acme", manual: true },
  tokens: null,
});

describe("Hacker News (Show HN) connector", () => {
  it("is an assisted, manual-publish connector with no insights", () => {
    expect(hackerNewsConnector.id).toBe(PLATFORM);
    expect(hackerNewsConnector.authKind).toBe("assisted");
    expect(hackerNewsConnector.capabilities.manualPublish).toBe(true);
    expect(hackerNewsConnector.capabilities.insights).toBe(false);
    expect(hackerNewsConnector.capabilities.nativeSchedule).toBe(false);
    expect(hackerNewsConnector.capabilities.maxChars).toBe(PLATFORMS[PLATFORM].maxChars);
    expect(hackerNewsConnector.authUrl).toBeUndefined();
    expect(hackerNewsConnector.exchangeCode).toBeUndefined();
  });

  it("explains the manual flow in the wizard", () => {
    const steps = hackerNewsConnector.wizard(null, {
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
    expect(info?.url).toBe("https://news.ycombinator.com/submit");
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.map((i) => i.name)).toEqual(["profileUrl"]);
    expect(JSON.stringify(steps)).toContain("Show HN");
    expect(JSON.stringify(steps)).toMatch(/80 characters/);
    expect(JSON.stringify(steps)).toMatch(/second-chance/);
  });

  it("stores the pasted profile url and rejects a malformed one", async () => {
    const ok = await hackerNewsConnector.connectWithInputs?.({
      profileUrl: "https://news.ycombinator.com/user?id=acme",
    });
    expect(ok?.account.config).toMatchObject({
      profileUrl: "https://news.ycombinator.com/user?id=acme",
      manual: true,
    });
    expect(ok?.tokens).toBeUndefined();

    const empty = await hackerNewsConnector.connectWithInputs?.({});
    expect(empty?.account.config).toMatchObject({ profileUrl: null });

    await expect(hackerNewsConnector.connectWithInputs?.({ profileUrl: "not a url" })).rejects.toMatchObject({
      name: "ConnectorError",
      code: "not_configured",
    });
  });

  it("prepares the post for manual publishing without any network call", async () => {
    const result = await hackerNewsConnector.publish(account, makePost(PLATFORM));
    expect(result.externalId).toBe(`${MANUAL_EXTERNAL_ID_PREFIX}post_1`);
    expect(result.url).toBeUndefined();
    expect(result.visibility).toBe("public");
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await hackerNewsConnector.publish(
      account,
      makePost(PLATFORM, { externalId: "manual:post_1" }),
    );
    expect(result.externalId).toBe("manual:post_1");
  });

  it("verifies ok with a manual-publish warning and returns no insights", async () => {
    const verified = await hackerNewsConnector.verify(account);
    expect(verified.ok).toBe(true);
    expect(verified.profileUrl).toBe("https://news.ycombinator.com/user?id=acme");
    expect(verified.warning).toMatch(/no posting API/i);
    await expect(hackerNewsConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual(
      [],
    );
  });
});

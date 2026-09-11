import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import error400 from "./__fixtures__/error-400.json";
import error401 from "./__fixtures__/error-401.json";
import error429 from "./__fixtures__/error-429.json";
import executeWebhookFixture from "./__fixtures__/executeWebhook.json";
import getWebhookFixture from "./__fixtures__/getWebhook.json";
import { discordConnector, parseWebhookUrl } from "./index.js";

const WEBHOOK_ID = "223704706495545344";
const WEBHOOK_TOKEN = "3d89bb7572e0fb30d8128367b3b1b44fecd1726de135cbe28a41f8b2f777c372";
const WEBHOOK_URL = `https://discord.com/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`;

const server = setupServer();

const account = makeAccount("discord", {
  externalId: WEBHOOK_ID,
  handle: "Acme Robotics Announcements",
  config: {
    webhookId: WEBHOOK_ID,
    channelId: getWebhookFixture.channel_id,
    guildId: getWebhookFixture.guild_id,
  },
  tokens: { accessToken: WEBHOOK_URL, tokenType: "webhook" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("parseWebhookUrl", () => {
  it("accepts the documented shapes", () => {
    expect(parseWebhookUrl(WEBHOOK_URL)).toEqual({ id: WEBHOOK_ID, token: WEBHOOK_TOKEN });
    expect(parseWebhookUrl(`https://discord.com/api/v10/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`).id).toBe(
      WEBHOOK_ID,
    );
    expect(parseWebhookUrl(`https://discordapp.com/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`).id).toBe(
      WEBHOOK_ID,
    );
  });

  it("rejects anything else with not_configured", () => {
    for (const bad of [
      "https://example.com/api/webhooks/1/abc",
      "http://discord.com/api/webhooks/223704706495545344/tokentokentokentoken",
      "https://discord.com/api/webhooks/abc/def",
      "nonsense",
    ]) {
      expect(() => parseWebhookUrl(bad)).toThrowError(/webhook URL/i);
    }
  });
});

describe("wizard", () => {
  it("walks server -> webhook -> paste -> verify", () => {
    const steps = discordConnector.wizard(null, { businessName: "Acme Robotics" });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_token", "verify"]);
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.[0]).toMatchObject({ name: "webhookUrl", secret: true });
    expect(steps[1]?.caveat).toBeTruthy();
    for (const step of steps) expect(step.title).toBeTruthy();
  });
});

describe("connectWithInputs", () => {
  it("fetches the webhook and stores ids, keeping the URL in tokens", async () => {
    server.use(http.get(WEBHOOK_URL, () => HttpResponse.json(getWebhookFixture)));
    const result = await discordConnector.connectWithInputs?.({ webhookUrl: WEBHOOK_URL });
    expect(result?.tokens?.accessToken).toBe(WEBHOOK_URL);
    expect(result?.account.config).toEqual({
      webhookId: WEBHOOK_ID,
      channelId: "199737254929760256",
      guildId: "199737254929760257",
      webhookName: "Acme Robotics Announcements",
    });
  });

  it("maps a revoked webhook token to auth_expired", async () => {
    server.use(http.get(WEBHOOK_URL, () => HttpResponse.json(error401, { status: 401 })));
    await expect(discordConnector.connectWithInputs?.({ webhookUrl: WEBHOOK_URL })).rejects.toMatchObject({
      code: "auth_expired",
      platform: "discord",
    });
  });
});

describe("publish", () => {
  it("executes the webhook with content, an image embed and muted mentions", async () => {
    let body: Record<string, unknown> | undefined;
    let wait: string | null = null;
    server.use(
      http.post(WEBHOOK_URL, async ({ request }) => {
        wait = new URL(request.url).searchParams.get("wait");
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(executeWebhookFixture, {
          headers: {
            "x-ratelimit-limit": "5",
            "x-ratelimit-remaining": "4",
            "x-ratelimit-reset-after": "1.5",
            "x-ratelimit-bucket": "abcd1234",
          },
        });
      }),
    );

    const result = await discordConnector.publish(
      account,
      makePost("discord", { title: "Launch day", media: [{ ...IMAGE_MEDIA }] }),
    );

    expect(wait).toBe("true");
    expect(body?.allowed_mentions).toEqual({ parse: [] });
    expect(String(body?.content)).toContain("https://acme.test/launch");
    // hashtags are dropped on Discord by convention
    expect(String(body?.content)).not.toContain("#robots");
    const embeds = body?.embeds as Array<Record<string, unknown>>;
    expect(embeds).toHaveLength(1);
    expect(embeds[0]).toMatchObject({ title: "Launch day", image: { url: IMAGE_MEDIA.url } });

    expect(result.externalId).toBe(executeWebhookFixture.id);
    expect(result.url).toBe(
      `https://discord.com/channels/199737254929760257/199737254929760256/${executeWebhookFixture.id}`,
    );
  });

  it("retries after a 429 using the fractional retry_after and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(WEBHOOK_URL, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(error429, {
            status: 429,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset-after": "0.75",
              "x-ratelimit-scope": "user",
            },
          });
        }
        return HttpResponse.json(executeWebhookFixture);
      }),
    );
    const result = await discordConnector.publish(account, makePost("discord"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe(executeWebhookFixture.id);
  });

  it("maps a 400 to rejected without retrying", async () => {
    let calls = 0;
    server.use(
      http.post(WEBHOOK_URL, () => {
        calls += 1;
        return HttpResponse.json(error400, { status: 400 });
      }),
    );
    await expect(discordConnector.publish(account, makePost("discord"))).rejects.toMatchObject({
      code: "rejected",
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("appends a video URL to the content instead of uploading it", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(WEBHOOK_URL, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(executeWebhookFixture);
      }),
    );
    await discordConnector.publish(
      account,
      makePost("discord", { media: [{ kind: "video", url: "https://media.acme.test/clip.mp4" }] }),
    );
    expect(String(body?.content)).toContain("https://media.acme.test/clip.mp4");
    expect(body?.embeds).toBeUndefined();
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await discordConnector.publish(account, makePost("discord", { externalId: "999" }));
    expect(result.externalId).toBe("999");
    expect(result.url).toContain("/999");
  });

  it("fails with not_configured when no webhook URL is stored", async () => {
    const broken = makeAccount("discord", { tokens: null, config: {} });
    await expect(discordConnector.publish(broken, makePost("discord"))).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("fetchInsights", () => {
  it("returns nothing - webhooks are write-only", async () => {
    await expect(discordConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual(
      [],
    );
  });
});

describe("verify", () => {
  it("returns the channel link", async () => {
    server.use(http.get(WEBHOOK_URL, () => HttpResponse.json(getWebhookFixture)));
    await expect(discordConnector.verify(account)).resolves.toMatchObject({
      ok: true,
      profileUrl: "https://discord.com/channels/199737254929760257/199737254929760256",
    });
  });

  it("returns ok:false when the webhook was deleted", async () => {
    server.use(
      http.get(WEBHOOK_URL, () => HttpResponse.json({ message: "Unknown Webhook" }, { status: 404 })),
    );
    const result = await discordConnector.verify(account);
    expect(result.ok).toBe(false);
  });
});

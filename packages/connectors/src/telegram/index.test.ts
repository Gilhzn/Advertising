import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_MEDIA, makeAccount, makePost } from "../testing.js";
import error429 from "./__fixtures__/error-429.json";
import errorChatNotFound from "./__fixtures__/error-chat-not-found.json";
import errorUnauthorized from "./__fixtures__/error-unauthorized.json";
import getChatFixture from "./__fixtures__/getChat.json";
import getChatMemberAdmin from "./__fixtures__/getChatMember-admin.json";
import getChatMemberMember from "./__fixtures__/getChatMember-member.json";
import getMeFixture from "./__fixtures__/getMe.json";
import sendMediaGroupFixture from "./__fixtures__/sendMediaGroup.json";
import sendMessageFixture from "./__fixtures__/sendMessage.json";
import sendPhotoFixture from "./__fixtures__/sendPhoto.json";
import { escapeHtml, normalizeChannel, telegramConnector } from "./index.js";

const TOKEN = "7654321:TEST-TOKEN";
const api = (method: string) => `https://api.telegram.org/bot${TOKEN}/${method}`;
const server = setupServer();

const account = makeAccount("telegram", {
  externalId: "-1001234567890",
  handle: "@acmerobotics",
  config: { chatId: -1001234567890, username: "acmerobotics", title: "Acme Robotics" },
  tokens: null,
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "advertising_engine_bot");
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("helpers", () => {
  it("escapes only the three HTML-special characters", () => {
    expect(escapeHtml('5 < 7 & "quotes" stay')).toBe('5 &lt; 7 &amp; "quotes" stay');
    expect(escapeHtml("<b>not a tag</b>")).toBe("&lt;b&gt;not a tag&lt;/b&gt;");
  });

  it("normalises every channel spelling", () => {
    expect(normalizeChannel("acmerobotics")).toBe("@acmerobotics");
    expect(normalizeChannel("@acmerobotics")).toBe("@acmerobotics");
    expect(normalizeChannel("https://t.me/acmerobotics")).toBe("@acmerobotics");
    expect(normalizeChannel("-1001234567890")).toBe("-1001234567890");
  });
});

describe("wizard", () => {
  it("walks create -> add bot -> paste channel -> verify", () => {
    const steps = telegramConnector.wizard(null, { businessName: "Acme Robotics" });
    expect(steps.map((s) => s.kind)).toEqual(["create_account", "configure", "connect_token", "verify"]);
    expect(steps[1]?.title).toContain("advertising_engine_bot");
    expect(steps[1]?.prefill).toContainEqual({ label: "Required permission", value: "Post Messages" });
    const connect = steps.find((s) => s.kind === "connect_token");
    expect(connect?.inputs?.[0]?.name).toBe("channel");
    for (const step of steps) expect(step.instructions.length).toBeGreaterThan(10);
  });
});

describe("connectWithInputs", () => {
  it("confirms the bot is an admin that can post", async () => {
    server.use(
      http.post(api("getChat"), () => HttpResponse.json(getChatFixture)),
      http.post(api("getMe"), () => HttpResponse.json(getMeFixture)),
      http.post(api("getChatMember"), () => HttpResponse.json(getChatMemberAdmin)),
    );
    const result = await telegramConnector.connectWithInputs?.({ channel: "https://t.me/acmerobotics" });
    expect(result?.account.externalId).toBe("-1001234567890");
    expect(result?.account.handle).toBe("@acmerobotics");
    expect(result?.account.config).toMatchObject({ chatId: -1001234567890, username: "acmerobotics" });
    expect(result?.tokens).toBeUndefined();
  });

  it("fails with not_configured when the bot is only a member", async () => {
    server.use(
      http.post(api("getChat"), () => HttpResponse.json(getChatFixture)),
      http.post(api("getMe"), () => HttpResponse.json(getMeFixture)),
      http.post(api("getChatMember"), () => HttpResponse.json(getChatMemberMember)),
    );
    await expect(telegramConnector.connectWithInputs?.({ channel: "@acmerobotics" })).rejects.toMatchObject({
      code: "not_configured",
      platform: "telegram",
    });
  });

  it("maps chat not found to not_configured", async () => {
    server.use(http.post(api("getChat"), () => HttpResponse.json(errorChatNotFound, { status: 400 })));
    await expect(telegramConnector.connectWithInputs?.({ channel: "@nope" })).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("maps a bad bot token to auth_expired", async () => {
    server.use(http.post(api("getChat"), () => HttpResponse.json(errorUnauthorized, { status: 401 })));
    await expect(telegramConnector.connectWithInputs?.({ channel: "@acmerobotics" })).rejects.toMatchObject({
      code: "auth_expired",
    });
  });

  it("raises not_configured when the bot token env var is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    await expect(telegramConnector.connectWithInputs?.({ channel: "@acmerobotics" })).rejects.toMatchObject({
      code: "not_configured",
    });
  });
});

describe("publish", () => {
  it("sends an escaped HTML message and returns the t.me url", async () => {
    let payload: Record<string, unknown> | undefined;
    server.use(
      http.post(api("sendMessage"), async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(sendMessageFixture);
      }),
    );

    const result = await telegramConnector.publish(
      account,
      makePost("telegram", { title: "Launch <day>", body: "Robots & desks" }),
    );

    expect(payload?.parse_mode).toBe("HTML");
    expect(payload?.chat_id).toBe(-1001234567890);
    expect(payload?.text).toContain("<b>Launch &lt;day&gt;</b>");
    expect(payload?.text).toContain("Robots &amp; desks");
    expect(result.externalId).toBe("4711");
    expect(result.url).toBe("https://t.me/acmerobotics/4711");
  });

  it("sends a single image with sendPhoto", async () => {
    let payload: Record<string, unknown> | undefined;
    server.use(
      http.post(api("sendPhoto"), async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(sendPhotoFixture);
      }),
    );
    const result = await telegramConnector.publish(
      account,
      makePost("telegram", { media: [{ ...IMAGE_MEDIA }] }),
    );
    expect(payload?.photo).toBe(IMAGE_MEDIA.url);
    expect(payload?.caption).toContain("Tiny robots");
    expect(result.externalId).toBe("4712");
  });

  it("sends 2+ images as a media group with the caption on the first item", async () => {
    let payload: { media?: Array<Record<string, unknown>> } | undefined;
    server.use(
      http.post(api("sendMediaGroup"), async ({ request }) => {
        payload = (await request.json()) as { media: Array<Record<string, unknown>> };
        return HttpResponse.json(sendMediaGroupFixture);
      }),
    );
    const result = await telegramConnector.publish(
      account,
      makePost("telegram", {
        media: [{ ...IMAGE_MEDIA }, { ...IMAGE_MEDIA, url: "https://media.acme.test/two.jpg" }],
      }),
    );
    expect(payload?.media).toHaveLength(2);
    expect(payload?.media?.[0]).toMatchObject({ type: "photo", parse_mode: "HTML" });
    expect(payload?.media?.[1]?.caption).toBeUndefined();
    expect(result.externalId).toBe("4713");
  });

  it("retries after a 429 using parameters.retry_after and then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(api("sendMessage"), () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(error429, { status: 429 });
        return HttpResponse.json(sendMessageFixture);
      }),
    );
    const result = await telegramConnector.publish(account, makePost("telegram"));
    expect(calls).toBe(2);
    expect(result.externalId).toBe("4711");
  });

  it("maps missing admin rights to rejected", async () => {
    server.use(
      http.post(api("sendMessage"), () =>
        HttpResponse.json(
          {
            ok: false,
            error_code: 400,
            description: "Bad Request: not enough rights to send text messages to the chat",
          },
          { status: 400 },
        ),
      ),
    );
    await expect(telegramConnector.publish(account, makePost("telegram"))).rejects.toMatchObject({
      code: "rejected",
      retryable: false,
    });
  });

  it("is idempotent when the post already has an externalId", async () => {
    const result = await telegramConnector.publish(account, makePost("telegram", { externalId: "4711" }));
    expect(result).toEqual({ externalId: "4711", url: "https://t.me/acmerobotics/4711" });
  });
});

describe("fetchInsights", () => {
  it("returns nothing - the Bot API exposes no channel stats", async () => {
    await expect(telegramConnector.fetchInsights(account, "2026-09-01T00:00:00.000Z", [])).resolves.toEqual(
      [],
    );
    expect(telegramConnector.capabilities.insights).toBe(false);
  });
});

describe("verify", () => {
  it("returns ok for an admin bot", async () => {
    server.use(
      http.post(api("getChat"), () => HttpResponse.json(getChatFixture)),
      http.post(api("getMe"), () => HttpResponse.json(getMeFixture)),
      http.post(api("getChatMember"), () => HttpResponse.json(getChatMemberAdmin)),
    );
    await expect(telegramConnector.verify(account)).resolves.toMatchObject({
      ok: true,
      handle: "@acmerobotics",
      profileUrl: "https://t.me/acmerobotics",
    });
  });
});

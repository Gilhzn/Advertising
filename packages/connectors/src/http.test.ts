import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorError } from "./connector.js";
import {
  downloadMedia,
  fetchJson,
  MAX_MEDIA_BYTES,
  parseRetryAfter,
  postForm,
  redactSecrets,
  redactUrl,
  uploadMultipart,
} from "./http.js";

const server = setupServer();
const BASE = "https://api.example.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("CONNECTOR_RETRY_TIME_SCALE", "0");
});

describe("redactUrl", () => {
  it("masks secret query params", () => {
    expect(redactUrl(`${BASE}/me?access_token=EAAsecret&fields=id`)).toBe(
      `${BASE}/me?access_token=***&fields=id`,
    );
    expect(redactUrl(`${BASE}/t?client_secret=s&code=c&refresh_token=r`)).toBe(
      `${BASE}/t?client_secret=***&code=***&refresh_token=***`,
    );
  });

  it("masks the Telegram bot token in the path", () => {
    expect(redactUrl("https://api.telegram.org/bot12345:AAH-secret/sendMessage")).toBe(
      "https://api.telegram.org/bot***/sendMessage",
    );
  });

  it("masks the Discord webhook token in the path", () => {
    expect(redactUrl("https://discord.com/api/webhooks/223704706495545344/tok3nvalue")).toBe(
      "https://discord.com/api/webhooks/223704706495545344/***",
    );
  });

  it("never throws on a malformed url", () => {
    expect(redactUrl("not a url")).toBe("<invalid-url>");
  });
});

describe("redactSecrets", () => {
  it("scrubs tokens out of strings destined for logs and error messages", () => {
    expect(redactSecrets('{"access_token":"EAAabc123","id":"7"}')).toContain('"access_token":"***"');
    expect(redactSecrets("Authorization: Bearer eyJhbGciOi.J9.sig")).toBe("Authorization: Bearer ***");
    expect(redactSecrets('{"accessJwt":"aaa.bbb.ccc"}')).toContain('"accessJwt":"***"');
  });
});

describe("parseRetryAfter", () => {
  it("handles delta-seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("nonsense")).toBeUndefined();
    const inTwoSec = new Date(Date.now() + 2000).toUTCString();
    expect(parseRetryAfter(inTwoSec)).toBeGreaterThan(0);
  });
});

describe("fetchJson", () => {
  it("returns data, status and headers", async () => {
    server.use(
      http.get(`${BASE}/ok`, () => HttpResponse.json({ hello: "world" }, { headers: { "x-a": "b" } })),
    );
    const res = await fetchJson<{ hello: string }>(`${BASE}/ok`, {}, { platform: "bluesky" });
    expect(res.data).toEqual({ hello: "world" });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-a")).toBe("b");
  });

  it("retries a 429 honouring Retry-After, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/limited`, () => {
        calls += 1;
        if (calls < 3)
          return HttpResponse.json({ m: "slow down" }, { status: 429, headers: { "retry-after": "1" } });
        return HttpResponse.json({ ok: true });
      }),
    );
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/limited`, {}, { platform: "discord" });
    expect(calls).toBe(3);
    expect(res.data.ok).toBe(true);
  });

  it("gives up after `retries` and throws a rate_limited ConnectorError", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/always429`, () => {
        calls += 1;
        return HttpResponse.json({ m: "no" }, { status: 429, headers: { "retry-after": "1" } });
      }),
    );
    const err = await fetchJson(`${BASE}/always429`, {}, { platform: "discord", retries: 1 }).catch(
      (e) => e as ConnectorError,
    );
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("rate_limited");
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(1000);
    expect(calls).toBe(2);
  });

  it("does not sleep inline when Retry-After exceeds maxRetryWaitMs", async () => {
    server.use(
      http.get(`${BASE}/longwait`, () =>
        HttpResponse.json({}, { status: 429, headers: { "retry-after": "3600" } }),
      ),
    );
    const err = await fetchJson(`${BASE}/longwait`, {}, { platform: "discord", maxRetryWaitMs: 1000 }).catch(
      (e) => e as ConnectorError,
    );
    expect(err.code).toBe("rate_limited");
    expect(err.retryAfterMs).toBe(3_600_000);
  });

  it("retries 5xx and network failures", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/flaky`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({}, { status: 503 });
        if (calls === 2) return HttpResponse.error();
        return HttpResponse.json({ ok: true });
      }),
    );
    const res = await fetchJson<{ ok: boolean }>(`${BASE}/flaky`, {}, { platform: "facebook" });
    expect(calls).toBe(3);
    expect(res.data.ok).toBe(true);
  });

  it("maps statuses to ConnectorError codes and does not retry the fatal ones", async () => {
    const cases: Array<[number, string]> = [
      [401, "auth_expired"],
      [403, "auth_expired"],
      [404, "not_configured"],
      [413, "invalid_media"],
      [400, "rejected"],
    ];
    for (const [status, code] of cases) {
      let calls = 0;
      server.use(
        http.get(`${BASE}/s${status}`, () => {
          calls += 1;
          return HttpResponse.json({ message: "nope" }, { status });
        }),
      );
      const err = await fetchJson(`${BASE}/s${status}`, {}, { platform: "linkedin" }).catch(
        (e) => e as ConnectorError,
      );
      expect(err.code).toBe(code);
      expect(err.retryable).toBe(false);
      expect(calls).toBe(1);
    }
  });

  it("aborts on timeout and reports a retryable network error", async () => {
    server.use(
      http.get(`${BASE}/slow`, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return HttpResponse.json({});
      }),
    );
    const err = await fetchJson(`${BASE}/slow`, {}, { platform: "bluesky", timeoutMs: 20, retries: 0 }).catch(
      (e) => e as ConnectorError,
    );
    expect(err.code).toBe("network");
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/timed out/);
  });

  it("uses retryAfterFrom when the delay is in the body", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/bodydelay`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ parameters: { retry_after: 1 } }, { status: 429 });
        return HttpResponse.json({ ok: true });
      }),
    );
    await fetchJson(
      `${BASE}/bodydelay`,
      {},
      {
        platform: "telegram",
        retryAfterFrom: (b) => (b as { parameters?: { retry_after?: number } })?.parameters?.retry_after,
      },
    );
    expect(calls).toBe(2);
  });

  it("never leaks the Authorization header into the error message", async () => {
    server.use(
      http.get(`${BASE}/leak`, () => HttpResponse.json({ message: "Bearer sekrit.tok.en" }, { status: 400 })),
    );
    const err = await fetchJson(
      `${BASE}/leak?access_token=EAAsecret`,
      { headers: { authorization: "Bearer sekrit.tok.en" } },
      { platform: "facebook" },
    ).catch((e) => e as ConnectorError);
    expect(err.message).not.toContain("sekrit.tok.en");
    expect(err.message).toContain("***");
  });

  it("lets checkBody reject a 200 response", async () => {
    server.use(http.get(`${BASE}/okfalse`, () => HttpResponse.json({ ok: false, description: "nope" })));
    const err = await fetchJson(
      `${BASE}/okfalse`,
      {},
      {
        platform: "telegram",
        checkBody: (body) =>
          (body as { ok?: boolean }).ok === false
            ? new ConnectorError("body said no", "telegram", "rejected", false)
            : undefined,
      },
    ).catch((e) => e as ConnectorError);
    expect(err.code).toBe("rejected");
  });
});

describe("postForm", () => {
  it("url-encodes fields and drops null/undefined", async () => {
    let body = "";
    let contentType: string | null = null;
    server.use(
      http.post(`${BASE}/form`, async ({ request }) => {
        contentType = request.headers.get("content-type");
        body = await request.text();
        return HttpResponse.json({ ok: true });
      }),
    );
    await postForm(
      `${BASE}/form`,
      { a: "1", b: 2, c: true, d: undefined, e: null },
      { platform: "facebook" },
    );
    expect(contentType).toContain("application/x-www-form-urlencoded");
    expect(new URLSearchParams(body)).toEqual(new URLSearchParams("a=1&b=2&c=true"));
  });
});

describe("uploadMultipart", () => {
  it("sends a multipart body with the file part and scalar fields", async () => {
    let contentType: string | null = null;
    let fieldValue: unknown;
    let fileName: string | undefined;
    server.use(
      http.post(`${BASE}/upload`, async ({ request }) => {
        contentType = request.headers.get("content-type");
        const form = await request.formData();
        fieldValue = form.get("caption");
        const file = form.get("photo");
        fileName = file instanceof File ? file.name : undefined;
        return HttpResponse.json({ ok: true });
      }),
    );
    await uploadMultipart(
      `${BASE}/upload`,
      { caption: "hi", skip: undefined },
      { field: "photo", filename: "hero.jpg", contentType: "image/jpeg", data: new Uint8Array([1, 2, 3]) },
      { platform: "telegram" },
    );
    expect(contentType).toContain("multipart/form-data");
    expect(fieldValue).toBe("hi");
    expect(fileName).toBe("hero.jpg");
  });
});

describe("downloadMedia", () => {
  it("returns the bytes and the mime type", async () => {
    server.use(
      http.get(`${BASE}/hero.jpg`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4, 5]).buffer, {
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    );
    const media = await downloadMedia(`${BASE}/hero.jpg`, { platform: "bluesky" });
    expect(media.mimeType).toBe("image/jpeg");
    expect(media.buffer.byteLength).toBe(5);
  });

  it("guesses the mime type from the extension when the server does not say", async () => {
    server.use(
      http.get(`${BASE}/clip.mp4`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, { headers: {} }),
      ),
    );
    const media = await downloadMedia(`${BASE}/clip.mp4`, { platform: "telegram" });
    expect(media.mimeType).toBe("video/mp4");
  });

  it("refuses an oversized asset from content-length alone", async () => {
    server.use(
      http.get(`${BASE}/huge.jpg`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
          headers: { "content-type": "image/jpeg", "content-length": String(MAX_MEDIA_BYTES + 1) },
        }),
      ),
    );
    await expect(downloadMedia(`${BASE}/huge.jpg`, { platform: "bluesky" })).rejects.toMatchObject({
      code: "invalid_media",
    });
  });

  it("refuses an asset that exceeds the cap while streaming", async () => {
    server.use(
      http.get(`${BASE}/streamy.jpg`, () =>
        HttpResponse.arrayBuffer(new Uint8Array(64).buffer, { headers: { "content-type": "image/jpeg" } }),
      ),
    );
    await expect(
      downloadMedia(`${BASE}/streamy.jpg`, { platform: "bluesky", maxBytes: 8 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("maps a 404 to invalid_media and a 500 to a retryable network error", async () => {
    server.use(
      http.get(`${BASE}/missing.jpg`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${BASE}/broken.jpg`, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(downloadMedia(`${BASE}/missing.jpg`, { platform: "bluesky" })).rejects.toMatchObject({
      code: "invalid_media",
      retryable: false,
    });
    await expect(downloadMedia(`${BASE}/broken.jpg`, { platform: "bluesky" })).rejects.toMatchObject({
      code: "network",
      retryable: true,
    });
  });
});

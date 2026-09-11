import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ASPECT_SIZES } from "../types.js";
import { OpenAiImageProvider } from "./openai.js";
import { ImageGenError } from "./types.js";

const ENDPOINT = "https://api.openai.com/v1/images/generations";
const API_KEY = "sk-test-secret-abc123";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** A tiny valid PNG, generated at test time so we never hand-encode bytes. */
async function tinyPngBase64(width = 64, height = 64): Promise<string> {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("OpenAiImageProvider", () => {
  it("sends the mapped size and crops the response to the exact ASPECT_SIZES", async () => {
    let sentBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: [{ b64_json: await tinyPngBase64() }] });
      }),
    );

    const provider = new OpenAiImageProvider(API_KEY);
    const out = await provider.generate({ prompt: "a friendly mascot", aspect: "9:16" });

    expect(sentBody).toMatchObject({
      model: "gpt-image-1",
      prompt: "a friendly mascot",
      size: "1024x1536",
      n: 1,
    });
    expect(out.mimeType).toBe("image/png");
    expect(out.buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(out.width).toBe(ASPECT_SIZES["9:16"].width);
    expect(out.height).toBe(ASPECT_SIZES["9:16"].height);
  });

  it("maps 1:1 and 16:9 to the documented sizes", async () => {
    const sizes: string[] = [];
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        const body = (await request.json()) as { size: string };
        sizes.push(body.size);
        return HttpResponse.json({ data: [{ b64_json: await tinyPngBase64() }] });
      }),
    );
    const provider = new OpenAiImageProvider(API_KEY);
    await provider.generate({ prompt: "p", aspect: "1:1" });
    await provider.generate({ prompt: "p", aspect: "16:9" });
    expect(sizes).toEqual(["1024x1024", "1536x1024"]);
  });

  it("throws a non-retryable auth ImageGenError on 401 without leaking the key", async () => {
    server.use(
      http.post(ENDPOINT, () =>
        HttpResponse.json({ error: { message: `bad key ${API_KEY}` } }, { status: 401 }),
      ),
    );
    const provider = new OpenAiImageProvider(API_KEY);
    const err = await provider.generate({ prompt: "p", aspect: "1:1" }).catch((e) => e as ImageGenError);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.provider).toBe("openai");
    expect(err.code).toBe("auth");
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain(API_KEY);
    expect(err.message).toContain("***");
  });

  it("throws a retryable rate_limited ImageGenError on 429", async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ error: "slow down" }, { status: 429 })));
    const provider = new OpenAiImageProvider(API_KEY);
    const err = await provider.generate({ prompt: "p", aspect: "1:1" }).catch((e) => e as ImageGenError);
    expect(err.code).toBe("rate_limited");
    expect(err.retryable).toBe(true);
  });

  it("throws when the response carries no b64_json", async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ data: [{}] })));
    const provider = new OpenAiImageProvider(API_KEY);
    const err = await provider.generate({ prompt: "p", aspect: "1:1" }).catch((e) => e as ImageGenError);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.code).toBe("unknown");
  });
});

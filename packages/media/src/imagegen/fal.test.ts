import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ASPECT_SIZES } from "../types.js";
import { FalImageProvider } from "./fal.js";
import { ImageGenError } from "./types.js";

const ENDPOINT = "https://fal.run/fal-ai/flux/schnell";
const IMAGE_URL = "https://cdn.fal.example.test/generated.png";
const API_KEY = "fal-test-secret-xyz789";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function tinyPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .png()
    .toBuffer();
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("FalImageProvider", () => {
  it("requests the exact ASPECT_SIZES and downloads the returned image", async () => {
    let sentBody: Record<string, unknown> | undefined;
    let sentAuth: string | null = null;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        sentAuth = request.headers.get("authorization");
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ images: [{ url: IMAGE_URL }] });
      }),
      http.get(IMAGE_URL, async () => {
        const buf = await tinyPng(ASPECT_SIZES["4:5"].width, ASPECT_SIZES["4:5"].height);
        return new HttpResponse(buf, { headers: { "content-type": "image/png" } });
      }),
    );

    const provider = new FalImageProvider(API_KEY);
    const out = await provider.generate({ prompt: "a cozy reading nook", aspect: "4:5" });

    expect(sentAuth).toBe(`Key ${API_KEY}`);
    expect(sentBody).toMatchObject({
      prompt: "a cozy reading nook",
      image_size: { width: ASPECT_SIZES["4:5"].width, height: ASPECT_SIZES["4:5"].height },
      num_images: 1,
    });
    expect(out.buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(out.width).toBe(ASPECT_SIZES["4:5"].width);
    expect(out.height).toBe(ASPECT_SIZES["4:5"].height);
    expect(out.mimeType).toBe("image/png");
  });

  it("forwards an optional seed", async () => {
    let sentBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        sentBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ images: [{ url: IMAGE_URL }] });
      }),
      http.get(IMAGE_URL, async () => new HttpResponse(await tinyPng(64, 64))),
    );
    const provider = new FalImageProvider(API_KEY);
    await provider.generate({ prompt: "p", aspect: "1:1", seed: 42 });
    expect(sentBody?.seed).toBe(42);
  });

  it("throws a non-retryable invalid_request ImageGenError over the download size cap", async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({ images: [{ url: IMAGE_URL }] })),
      http.get(
        IMAGE_URL,
        () => new HttpResponse(null, { headers: { "content-length": String(20 * 1024 * 1024) } }),
      ),
    );
    const provider = new FalImageProvider(API_KEY);
    const err = await provider.generate({ prompt: "p", aspect: "1:1" }).catch((e) => e as ImageGenError);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.code).toBe("invalid_request");
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/over the/);
  });

  it("throws an auth ImageGenError on 401 without leaking the key", async () => {
    server.use(
      http.post(ENDPOINT, () => HttpResponse.json({ error: `unauthorized ${API_KEY}` }, { status: 401 })),
    );
    const provider = new FalImageProvider(API_KEY);
    const err = await provider.generate({ prompt: "p", aspect: "1:1" }).catch((e) => e as ImageGenError);
    expect(err.provider).toBe("fal");
    expect(err.code).toBe("auth");
    expect(err.message).not.toContain(API_KEY);
  });

  it("throws when the response carries no images[0].url", async () => {
    server.use(http.post(ENDPOINT, () => HttpResponse.json({ images: [] })));
    const provider = new FalImageProvider(API_KEY);
    const err = await provider.generate({ prompt: "p", aspect: "1:1" }).catch((e) => e as ImageGenError);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.code).toBe("unknown");
  });
});

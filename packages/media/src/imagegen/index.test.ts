import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ASPECT_SIZES } from "../types.js";
import { FalImageProvider } from "./fal.js";
import { generateAndUpload, getImageGenProvider, isImageGenEnabled } from "./index.js";
import { OpenAiImageProvider } from "./openai.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

describe("getImageGenProvider / isImageGenEnabled", () => {
  it("is disabled by default (no env set)", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "");
    vi.stubEnv("IMAGE_GEN_API_KEY", "");
    expect(getImageGenProvider()).toBeNull();
    expect(isImageGenEnabled()).toBe(false);
  });

  it("is disabled for IMAGE_GEN_PROVIDER=none even with a key set", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "none");
    vi.stubEnv("IMAGE_GEN_API_KEY", "some-key");
    expect(getImageGenProvider()).toBeNull();
  });

  it("is disabled when the key is missing, even for a known provider", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "openai");
    vi.stubEnv("IMAGE_GEN_API_KEY", "");
    expect(getImageGenProvider()).toBeNull();
  });

  it("is disabled for an unknown provider id", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "midjourney");
    vi.stubEnv("IMAGE_GEN_API_KEY", "some-key");
    expect(getImageGenProvider()).toBeNull();
  });

  it("builds the openai provider", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "openai");
    vi.stubEnv("IMAGE_GEN_API_KEY", "sk-test");
    const provider = getImageGenProvider();
    expect(provider).toBeInstanceOf(OpenAiImageProvider);
    expect(provider?.id).toBe("openai");
    expect(isImageGenEnabled()).toBe(true);
  });

  it("builds the fal provider", () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "fal");
    vi.stubEnv("IMAGE_GEN_API_KEY", "fal-test");
    const provider = getImageGenProvider();
    expect(provider).toBeInstanceOf(FalImageProvider);
    expect(provider?.id).toBe("fal");
  });
});

describe("generateAndUpload", () => {
  let localDir: string;

  beforeAll(() => {
    localDir = mkdtempSync(join(tmpdir(), "adv-media-imagegen-"));
  });
  afterAll(() => rmSync(localDir, { recursive: true, force: true }));

  it("throws when image generation is not enabled", async () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "none");
    await expect(generateAndUpload({ businessId: "biz-1", prompt: "p", aspect: "1:1" })).rejects.toThrow(
      /not enabled/,
    );
  });

  it("generates through the configured provider and uploads the result", async () => {
    vi.stubEnv("IMAGE_GEN_PROVIDER", "openai");
    vi.stubEnv("IMAGE_GEN_API_KEY", "sk-test");
    vi.stubEnv("MEDIA_LOCAL_DIR", localDir);
    vi.stubEnv("APP_URL", "http://localhost:3000");
    // no R2_* env vars set -> uploadMediaImpl falls back to local disk, no network call for the upload

    server.use(
      http.post("https://api.openai.com/v1/images/generations", async () => {
        const png = await sharp({
          create: { width: 8, height: 8, channels: 3, background: { r: 5, g: 5, b: 5 } },
        })
          .png()
          .toBuffer();
        return HttpResponse.json({ data: [{ b64_json: png.toString("base64") }] });
      }),
    );

    const out = await generateAndUpload({
      businessId: "biz-1",
      prompt: "a bright hero illustration",
      aspect: "1:1",
      key: "post-1-hero",
    });

    expect(out.width).toBe(ASPECT_SIZES["1:1"].width);
    expect(out.height).toBe(ASPECT_SIZES["1:1"].height);
    expect(out.url).toBe("http://localhost:3000/uploads/businesses/biz-1/post-1-hero.png");
    const written = readFileSync(join(localDir, "businesses", "biz-1", "post-1-hero.png"));
    expect(written.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});

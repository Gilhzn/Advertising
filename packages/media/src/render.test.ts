import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderTemplate } from "./index.js";
import type { BrandStyle, RenderInput, TemplateId } from "./types.js";
import { ASPECT_SIZES } from "./types.js";
import { uploadMediaImpl } from "./upload.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const brand: BrandStyle = {
  primary: "#4f46e5",
  secondary: "#0ea5e9",
  accent: "#f59e0b",
  background: "#0b1020",
  text: "#f8fafc",
};

const brandRtl: BrandStyle = { ...brand, direction: "rtl" };

const TEMPLATES: TemplateId[] = ["announcement", "quote", "feature", "before_after", "stat", "plain_photo"];

function baseInput(template: TemplateId, overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    template,
    aspect: "1:1",
    headline: "Launching this week",
    subheadline: "5-minute roguelike runs",
    body: "Free with cosmetic-only purchases. Out now on iOS and Android.",
    cta: "Play now",
    stat: "4.9 ★",
    brand,
    businessName: "Pixel Dungeon Run",
    ...overrides,
  };
}

describe("renderTemplate", () => {
  for (const template of TEMPLATES) {
    it(`renders "${template}" at 1:1 and 9:16 as a valid PNG at the declared size`, async () => {
      for (const aspect of ["1:1", "9:16"] as const) {
        const result = await renderTemplate(baseInput(template, { aspect }));
        expect(result.mimeType).toBe("image/png");
        expect(result.buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
        expect(result.width).toBe(ASPECT_SIZES[aspect].width);
        expect(result.height).toBe(ASPECT_SIZES[aspect].height);
      }
    }, 30_000);
  }

  it("renders RTL (Hebrew) input without throwing", async () => {
    const result = await renderTemplate(
      baseInput("announcement", {
        headline: "השקה השבוע",
        subheadline: "ריצות של 5 דקות",
        brand: brandRtl,
      }),
    );
    expect(result.buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  }, 30_000);

  it("renders plain_photo without a product image by falling back to a solid layout", async () => {
    const result = await renderTemplate(baseInput("plain_photo", { brand: { ...brand, imageUrl: null } }));
    expect(result.buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  }, 30_000);
});

describe("uploadMedia (local fallback)", () => {
  let dir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adv-media-test-"));
    process.env.MEDIA_LOCAL_DIR = dir;
    process.env.APP_URL = "http://localhost:3000";
    process.env.R2_ACCOUNT_ID = "";
    process.env.R2_ACCESS_KEY_ID = "";
    process.env.R2_SECRET_ACCESS_KEY = "";
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("writes the file to disk and returns an APP_URL-based url", async () => {
    const buffer = Buffer.from("fake-png-bytes");
    const result = await uploadMediaImpl({
      businessId: "biz-1",
      buffer,
      contentType: "image/png",
      ext: "png",
      key: "announcement-1",
    });

    expect(result.key).toBe("businesses/biz-1/announcement-1.png");
    expect(result.url).toBe("http://localhost:3000/uploads/businesses/biz-1/announcement-1.png");
    expect(readFileSync(join(dir, result.key))).toEqual(buffer);
  });

  it("is idempotent when a key is given (re-upload overwrites the same path)", async () => {
    const first = await uploadMediaImpl({
      businessId: "biz-1",
      buffer: Buffer.from("v1"),
      contentType: "image/png",
      ext: "png",
      key: "same-key",
    });
    const second = await uploadMediaImpl({
      businessId: "biz-1",
      buffer: Buffer.from("v2"),
      contentType: "image/png",
      ext: "png",
      key: "same-key",
    });
    expect(first.key).toBe(second.key);
    expect(readFileSync(join(dir, second.key)).toString()).toBe("v2");
  });
});

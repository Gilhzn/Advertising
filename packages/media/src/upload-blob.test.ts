import { afterEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn(async (pathname: string) => ({
  url: `https://x.public.blob.vercel-storage.com/${pathname}`,
  downloadUrl: `https://x.public.blob.vercel-storage.com/${pathname}?download=1`,
  pathname,
  contentType: "image/png",
  contentDisposition: "inline",
}));
vi.mock("@vercel/blob", () => ({ put: putMock }));

const { activeUploadBackend, uploadMediaImpl } = await import("./upload.js");

describe("vercel blob backend", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    putMock.mockClear();
  });

  it("is selected when BLOB_READ_WRITE_TOKEN is set and R2 is not", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test_token");
    vi.stubEnv("R2_ACCOUNT_ID", "");
    expect(activeUploadBackend()).toBe("vercel_blob");
    const out = await uploadMediaImpl({
      businessId: "b1",
      buffer: Buffer.from("png"),
      contentType: "image/png",
      ext: "png",
      key: "brand/avatar",
    });
    expect(out.key).toBe("businesses/b1/brand/avatar.png");
    expect(out.url).toContain("blob.vercel-storage.com/businesses/b1/brand/avatar.png");
    expect(putMock).toHaveBeenCalledWith(
      "businesses/b1/brand/avatar.png",
      expect.any(Buffer),
      expect.objectContaining({ access: "public", contentType: "image/png", addRandomSuffix: false }),
    );
  });

  it("fails clearly on Vercel without any backend", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("VERCEL", "1");
    await expect(
      uploadMediaImpl({ businessId: "b1", buffer: Buffer.from("x"), contentType: "image/png", ext: "png" }),
    ).rejects.toThrow(/storage backend/);
    expect(putMock).not.toHaveBeenCalled();
  });
});

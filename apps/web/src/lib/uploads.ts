import { uploadMedia } from "@adv/media";

/**
 * Validation + storage for user-supplied images (business logo/screenshot in the intake form).
 *
 * Lives outside the `"use server"` action module because that file may only export async functions.
 */

/**
 * Accepted upload types. The extension is taken from this table (never from `file.name`, which the
 * browser controls), and the magic bytes must agree with the declared MIME type - a `.png` that is
 * really an HTML or SVG document would otherwise be served from our own origin.
 */
const ALLOWED_IMAGE_TYPES = [
  {
    mime: "image/png",
    ext: "png",
    matches: (b: Buffer) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    ext: "jpg",
    matches: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/webp",
    ext: "webp",
    matches: (b: Buffer) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    mime: "image/gif",
    ext: "gif",
    matches: (b: Buffer) => {
      const head = b.subarray(0, 6).toString("ascii");
      return head === "GIF87a" || head === "GIF89a";
    },
  },
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Thrown for a rejected upload; the message is safe to show to the user. */
export class UploadRejectedError extends Error {
  readonly name = "UploadRejectedError";
}

/**
 * Validates and stores one image, returning its public URL.
 *
 * Storage goes through `@adv/media`'s `uploadMedia`: Cloudflare R2 when `R2_*` is configured,
 * otherwise a local directory (`MEDIA_LOCAL_DIR`, default `apps/web/public/uploads`, resolved
 * inside that package rather than from `process.cwd()`) served as `${APP_URL}/uploads/<key>`.
 */
export async function saveImageUpload(file: File, businessId: string): Promise<string | undefined> {
  if (!file || file.size === 0) return undefined;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError("Images must be 5 MB or smaller.");
  }

  const declared = ALLOWED_IMAGE_TYPES.find((t) => t.mime === file.type.toLowerCase());
  if (!declared) {
    throw new UploadRejectedError("Only PNG, JPEG, WebP or GIF images are accepted.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadRejectedError("Images must be 5 MB or smaller.");
  }
  if (!declared.matches(buffer)) {
    throw new UploadRejectedError("That file's contents do not match its image type.");
  }

  const { url } = await uploadMedia({
    businessId,
    buffer,
    contentType: declared.mime,
    ext: declared.ext,
  });
  return url;
}

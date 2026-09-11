import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { UploadInput, UploadOutput } from "./types.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** `apps/web/public/uploads`, resolved relative to this package so it works from any cwd. */
const DEFAULT_LOCAL_DIR = resolve(PACKAGE_ROOT, "../../apps/web/public/uploads");

function keyFor(input: UploadInput): string {
  const stem = input.key ?? createHash("sha1").update(input.buffer).digest("hex");
  return `businesses/${input.businessId}/${stem}.${input.ext}`;
}

let cachedClient: S3Client | null | undefined;

/** Lazily builds (and caches) the R2 client, or `null` when `R2_*` env vars are not configured. */
function r2Client(): S3Client | null {
  if (cachedClient !== undefined) return cachedClient;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    cachedClient = null;
    return cachedClient;
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return cachedClient;
}

async function uploadToR2(client: S3Client, input: UploadInput, key: string): Promise<UploadOutput> {
  const bucket = process.env.R2_BUCKET ?? "adv-media";
  const publicBase = process.env.R2_PUBLIC_BASE_URL;
  if (!publicBase) {
    throw new Error(
      "R2_PUBLIC_BASE_URL must be set when R2_* env vars are configured for @adv/media uploads",
    );
  }
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: input.buffer, ContentType: input.contentType }),
  );
  return { url: `${publicBase}/${key}`, key };
}

async function uploadToLocalDisk(input: UploadInput, key: string): Promise<UploadOutput> {
  const localDir = process.env.MEDIA_LOCAL_DIR ?? DEFAULT_LOCAL_DIR;
  const filePath = resolve(localDir, key);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, input.buffer);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return { url: `${appUrl}/uploads/${key}`, key };
}

export async function uploadMediaImpl(input: UploadInput): Promise<UploadOutput> {
  const key = keyFor(input);
  const client = r2Client();
  return client ? uploadToR2(client, input, key) : uploadToLocalDisk(input, key);
}

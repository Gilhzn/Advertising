const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB cap per the media contract

function mimeFromUrl(url: string): string {
  const ext = url.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

/**
 * Resolves `brand.imageUrl` (or any other product image URL) to a data URI satori can embed directly,
 * enforcing a 10 MB cap. Already-a-data-URI input passes through unchanged. Returns `null` (never
 * throws) when the URL is missing, unreachable, over the cap, or not an image - callers fall back to a
 * template without the product image rather than failing the whole render.
 */
export async function toEmbeddableImage(
  url: string | null | undefined,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (declaredLength > maxBytes) return null;

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) return null;

    const mimeType = contentType?.startsWith("image/") ? contentType : mimeFromUrl(url);
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

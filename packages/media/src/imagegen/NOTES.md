# Image-gen provider notes

## Verification status: UNVERIFIED

Both provider docs sites were fetched via `WebFetch` while writing this plugin and both were blocked
by the sandbox's network egress proxy (`EGRESS_BLOCKED` for `platform.openai.com` and `fal.ai`). The
request/response shapes below are implemented exactly per the task spec, not confirmed against the
live APIs. Re-verify (via `WebFetch` from an environment with open egress, or a real API call in a
throwaway account) before relying on this in production, and update this file once confirmed.

## OpenAI (`gpt-image-1`) - `openai.ts`

- `POST https://api.openai.com/v1/images/generations`
- Headers: `Authorization: Bearer <IMAGE_GEN_API_KEY>`, `Content-Type: application/json`
- Body: `{ model: "gpt-image-1", prompt, size, n: 1 }`
- `size` is one of `1024x1024` | `1024x1536` | `1536x1024`, chosen from the requested `Aspect`:
  - `1:1` -> `1024x1024`
  - `4:5`, `9:16` -> `1024x1536`
  - `16:9`, `1.91:1` -> `1536x1024`
  - anything else (e.g. a future aspect the media package adds) -> `1024x1024`
- Response: `{ data: [{ b64_json }] }`. The decoded PNG is then resized/cropped with `sharp`
  (`fit: "cover", position: "attention"`) to the package's exact `ASPECT_SIZES[aspect]`, since none of
  the three fixed API sizes match most of our target aspect ratios pixel-for-pixel.

## fal.ai (`fal-ai/flux/schnell`) - `fal.ts`

- `POST https://fal.run/fal-ai/flux/schnell`
- Headers: `Authorization: Key <IMAGE_GEN_API_KEY>`, `Content-Type: application/json`
- Body: `{ prompt, image_size: { width, height }, num_images: 1 }` (`width`/`height` are the exact
  `ASPECT_SIZES[aspect]` values, so no post-crop should be needed if the API honours them)
- Response: `{ images: [{ url }] }`. The URL is downloaded with a 15 MB cap (`downloadCapped` in
  `util.ts`); `sharp(...).metadata()` reads back the actual width/height/format in case the provider
  does not return exactly the requested size.

## Shared behaviour

- Both providers: 60s request timeout (`AbortSignal.timeout`), typed `ImageGenError { provider, code,
  retryable }`, and the API key is redacted out of every log line and error message (`util.ts`
  `redactKey`) - never logged or embedded in a thrown message.
- `getImageGenProvider()` fails closed: `IMAGE_GEN_PROVIDER=none` (default), an unrecognised value, or
  a missing `IMAGE_GEN_API_KEY` all return `null`, so `isImageGenEnabled()` is `false` and the
  `generate_image` engine tool is not registered at all.

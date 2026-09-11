# Decisions (append-only)

## 2026-09-11 - Foundation
- Greenfield TypeScript monorepo (pnpm + Turborepo). Rationale: one language across dashboard, agents and connectors; Agent SDK TS-only features.
- pg-boss instead of Redis/BullMQ: ACID scheduling in Postgres, one less service on Railway.
- No automated account creation (ToS bans). Wizard + OAuth. Auto-creation only for things we own (Telegram bot channel setup, Discord webhook, Bluesky via app password).
- Community posts require human approval (Reddit 90/10, HN/PH norms). Enforced in code (hook + tool), not only in prompts.
- Email: Cloudflare DNS API + Migadu mailbox (real IMAP) or Cloudflare Email Routing + Resend (free). Consumer Gmail cannot be created programmatically.
- Product analytics: PostHog (heatmaps, session replay, HogQL API, Unity/mobile SDKs). Clarity rejected (export API too limited).
- Images: Claude does not generate images. Uploaded image + satori/sharp templates; external image-gen behind `IMAGE_GEN_PROVIDER`.
- Model policy: Opus 5 for decisions/strategy/analysis, Sonnet 5 for content, Haiku 4.5 for tagging. See `.claude/skills/model-policy`.

## 2026-09-11 - Hardening
- Late aggregator is never registered in the platform registry; `resolveConnector(platform, account)` routes only accounts with `config.via = "late"` when `LATE_API_KEY` is set.
- Assisted platforms (Product Hunt, HN, itch.io, Steam) publish as "prepared for manual posting" (`externalId = manual:<postId>`).
- SSRF: two guards on purpose - `packages/agents/src/tools/safe-fetch.ts` (model-facing, DNS-pinned) and `packages/connectors/src/net-guard.ts` (media/PDS URLs). Unifying into `@adv/shared` is a follow-up.
- Security review findings and statuses live in `docs/security-review.md`.

## 2026-09-11 - Optional image-gen plugin
- External image-gen provider is an opt-in plugin behind `IMAGE_GEN_PROVIDER` (`none` default | `openai` gpt-image-1 | `fal` flux/schnell), implemented in `packages/media/src/imagegen/`. `none` (or a missing `IMAGE_GEN_API_KEY`) disables it completely: no network calls, and the agents package never registers the `generate_image` engine tool (`isImageGenEnabled()` gates `buildEngineTools`).
- `render_image` (satori/sharp branded templates) stays the default for text-heavy cards - headline, stat, quote, before/after. `generate_image` is only for photographic/illustrative hero visuals with no on-image text; the visual-director prompt tells it to prefer `generate_image` for hero visuals of core platforms when one is available, with a fixed prompt template (subject/scene + palette mood + visual style + "no text or lettering, no logos or trademarks, no real or recognisable people"), and to never mention the tool at all when it is not configured.
- Both providers are typed (`ImageGenError { provider, code, retryable }`), redact the API key from every log line and error message, enforce a request timeout, and (fal) cap the downloaded image at 15 MB. OpenAI's three fixed output sizes (1024x1024 / 1024x1536 / 1536x1024) are cropped to the package's exact `ASPECT_SIZES` with `sharp`; fal is asked for the exact size directly.
- Request/response shapes for both providers were written from public docs but could not be checked live - `platform.openai.com` and `fal.ai` are both blocked by this environment's network egress proxy. Documented as unverified in `packages/media/src/imagegen/NOTES.md`; re-verify before depending on this in production.

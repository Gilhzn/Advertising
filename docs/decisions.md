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

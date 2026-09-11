import type { PlatformId } from "@adv/shared";
import { blueskyConnector } from "./bluesky/index.js";
import type { ConnectedAccount, Connector } from "./connector.js";
import { discordConnector } from "./discord/index.js";
import { facebookConnector } from "./facebook/index.js";
import { googleBusinessConnector } from "./google_business/index.js";
import { hackerNewsConnector } from "./hacker_news/index.js";
import { instagramConnector } from "./instagram/index.js";
import { itchIoConnector } from "./itch_io/index.js";
import { createLateConnector, isLateEnabled, LATE_ROUTABLE_PLATFORMS } from "./late/index.js";
import { linkedinConnector } from "./linkedin/index.js";
import { pinterestConnector } from "./pinterest/index.js";
import { productHuntConnector } from "./product_hunt/index.js";
import { redditConnector } from "./reddit/index.js";
import { getConnector, registerConnector } from "./registry.js";
import { steamConnector } from "./steam/index.js";
import { telegramConnector } from "./telegram/index.js";
import { threadsConnector } from "./threads/index.js";
import { tiktokConnector } from "./tiktok/index.js";
import { xConnector } from "./x/index.js";
import { youtubeConnector } from "./youtube/index.js";

/** Wave 1: everything that works for the owner's own account without an app review. */
export const WAVE_1_CONNECTORS: Connector[] = [
  blueskyConnector,
  telegramConnector,
  discordConnector,
  facebookConnector,
  instagramConnector,
  threadsConnector,
  linkedinConnector,
];

/** Wave 2: real APIs behind an app review, an audit, a quota grant or a per-post fee. */
export const WAVE_2_CONNECTORS: Connector[] = [
  xConnector,
  redditConnector,
  tiktokConnector,
  youtubeConnector,
  pinterestConnector,
  googleBusinessConnector,
];

/** Assisted: no publishing API at all - we prepare the post, a human submits it. */
export const ASSISTED_CONNECTORS: Connector[] = [
  productHuntConnector,
  hackerNewsConnector,
  itchIoConnector,
  steamConnector,
];

export const ALL_CONNECTORS: Connector[] = [
  ...WAVE_1_CONNECTORS,
  ...WAVE_2_CONNECTORS,
  ...ASSISTED_CONNECTORS,
];

/**
 * Registers every connector in the shared registry. Safe to call more than once
 * - the registry is keyed by platform id.
 *
 * Late connectors are deliberately **not** registered here: the registry has one
 * slot per platform, and registering Late would replace the first-party
 * connector for every business on the deployment. Late is opt-in per account -
 * see {@link resolveConnector}.
 */
export function registerAllConnectors(): Connector[] {
  for (const connector of ALL_CONNECTORS) registerConnector(connector);
  return ALL_CONNECTORS;
}

/** Wave-1-only registration, for tests and for a staged rollout. */
export function registerWave1Connectors(): Connector[] {
  for (const connector of WAVE_1_CONNECTORS) registerConnector(connector);
  return WAVE_1_CONNECTORS;
}

/**
 * The connector to use for one account. Identical to `getConnector(platform)`
 * except when the account opted into the Late aggregator
 * (`config.via === "late"`) **and** `LATE_API_KEY` is set on this deployment.
 */
export function resolveConnector(platform: PlatformId, account?: ConnectedAccount | null): Connector {
  if (
    account?.config?.via === "late" &&
    isLateEnabled() &&
    (LATE_ROUTABLE_PLATFORMS as PlatformId[]).includes(platform)
  ) {
    return createLateConnector(platform);
  }
  return getConnector(platform);
}

export * from "./assisted.js";
export * from "./late/index.js";
export {
  blueskyConnector,
  discordConnector,
  facebookConnector,
  googleBusinessConnector,
  hackerNewsConnector,
  instagramConnector,
  itchIoConnector,
  linkedinConnector,
  pinterestConnector,
  productHuntConnector,
  redditConnector,
  steamConnector,
  telegramConnector,
  threadsConnector,
  tiktokConnector,
  xConnector,
  youtubeConnector,
};

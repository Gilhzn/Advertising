import { blueskyConnector } from "./bluesky/index.js";
import type { Connector } from "./connector.js";
import { discordConnector } from "./discord/index.js";
import { facebookConnector } from "./facebook/index.js";
import { instagramConnector } from "./instagram/index.js";
import { linkedinConnector } from "./linkedin/index.js";
import { registerConnector } from "./registry.js";
import { telegramConnector } from "./telegram/index.js";
import { threadsConnector } from "./threads/index.js";

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

/**
 * Registers every wave-1 connector in the shared registry. Safe to call more
 * than once - the registry is keyed by platform id.
 */
export function registerAllConnectors(): Connector[] {
  for (const connector of WAVE_1_CONNECTORS) registerConnector(connector);
  return WAVE_1_CONNECTORS;
}

export {
  blueskyConnector,
  discordConnector,
  facebookConnector,
  instagramConnector,
  linkedinConnector,
  telegramConnector,
  threadsConnector,
};

import type { PlatformId } from "@adv/shared";
import type { ConnectedAccount, PublishablePost } from "./connector.js";

/**
 * Fixture builders shared by the connector tests (and usable from
 * `apps/worker` tests). Not used at runtime.
 */
export function makeAccount(platform: PlatformId, overrides: Partial<ConnectedAccount> = {}) {
  return {
    id: "acc_1",
    businessId: "biz_1",
    platform,
    ownership: "owned",
    externalId: "ext_1",
    handle: "acme",
    config: {},
    tokens: { accessToken: "tok_access", refreshToken: "tok_refresh" },
    ...overrides,
  } satisfies ConnectedAccount;
}

export function makePost(platform: PlatformId, overrides: Partial<PublishablePost> = {}) {
  return {
    id: "post_1",
    platform,
    language: "en",
    body: "Tiny robots that tidy your desk. Ships next week.",
    hashtags: ["#robots", "#launch"],
    linkUrl: "https://acme.test/launch",
    media: [],
    ...overrides,
  } satisfies PublishablePost;
}

export const IMAGE_MEDIA = {
  kind: "image",
  url: "https://media.acme.test/hero.jpg",
  altText: "A tiny robot on a desk",
  mimeType: "image/jpeg",
  width: 1200,
  height: 630,
} as const;

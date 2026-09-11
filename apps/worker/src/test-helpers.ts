import "./test-setup.js";

import { randomUUID } from "node:crypto";
import type { Connector, ConnectorCapabilities } from "@adv/connectors";
import { businesses, communities, eq, getDb, oauthTokens, platformAccounts, posts, users } from "@adv/db";
import { encryptSecret } from "@adv/shared";
import type { Job } from "pg-boss";

/** A throwaway business + owning user for one test. Call `cleanup()` (or use `withTestBusiness`) after. */
export interface TestBusiness {
  businessId: string;
  userId: string;
  cleanup: () => Promise<void>;
}

export async function createTestBusiness(): Promise<TestBusiness> {
  const db = getDb();
  const [user] = await db
    .insert(users)
    .values({ email: `worker-test-${randomUUID()}@example.test` })
    .returning();
  if (!user) throw new Error("failed to insert test user");
  const [business] = await db
    .insert(businesses)
    .values({
      userId: user.id,
      name: "Worker Test Business",
      slug: `worker-test-${randomUUID()}`,
      description: "A throwaway business created by apps/worker's vitest suite.",
    })
    .returning();
  if (!business) throw new Error("failed to insert test business");

  return {
    businessId: business.id,
    userId: user.id,
    cleanup: async () => {
      // cascades to platform_accounts, posts, communities, oauth_tokens, metric_snapshots, audit_log
      await db.delete(businesses).where(eq(businesses.id, business.id));
      await db.delete(users).where(eq(users.id, user.id));
    },
  };
}

export const TEST_PLATFORM = "bluesky" as const;

export async function createTestAccount(
  businessId: string,
  overrides: Partial<typeof platformAccounts.$inferInsert> = {},
) {
  const db = getDb();
  const [account] = await db
    .insert(platformAccounts)
    .values({
      businessId,
      platform: TEST_PLATFORM,
      ownership: "owned",
      status: "connected",
      handle: "worker-test.bsky.social",
      ...overrides,
    })
    .returning();
  if (!account) throw new Error("failed to insert test account");
  await db.insert(oauthTokens).values({
    accountId: account.id,
    accessTokenEnc: encryptSecret("fake-access-token"),
    refreshTokenEnc: null,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return account;
}

export async function createTestPost(
  businessId: string,
  accountId: string | null,
  overrides: Partial<typeof posts.$inferInsert> = {},
) {
  const db = getDb();
  const [post] = await db
    .insert(posts)
    .values({
      businessId,
      accountId,
      platform: TEST_PLATFORM,
      body: "Test post body from apps/worker's vitest suite.",
      status: "draft",
      ...overrides,
    })
    .returning();
  if (!post) throw new Error("failed to insert test post");
  return post;
}

export async function createTestCommunity(
  businessId: string,
  overrides: Partial<typeof communities.$inferInsert> = {},
) {
  const db = getDb();
  const [community] = await db
    .insert(communities)
    .values({
      businessId,
      platform: TEST_PLATFORM,
      name: `test-community-${randomUUID()}`,
      ...overrides,
    })
    .returning();
  if (!community) throw new Error("failed to insert test community");
  return community;
}

const DEFAULT_CAPABILITIES: ConnectorCapabilities = {
  text: true,
  image: true,
  video: false,
  carousel: false,
  nativeSchedule: false,
  insights: true,
  maxChars: 300,
  maxMedia: 4,
  imageAspects: ["1:1"],
};

/** A minimal fake `Connector` for `registerConnector` in tests - see `@adv/connectors`'s `Connector`. */
export function makeFakeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    id: TEST_PLATFORM,
    capabilities: DEFAULT_CAPABILITIES,
    authKind: "oauth",
    rateLimit: { limit: 100, windowMs: 60_000 },
    wizard: () => [],
    verify: async () => ({ ok: true }),
    publish: async (_account, post) => ({
      externalId: `fake-ext-${post.id}`,
      url: `https://fake.test/posts/${post.id}`,
    }),
    fetchInsights: async () => [],
    ...overrides,
  };
}

/** Minimal fake pg-boss `Job` - handlers only read `id` and `data`. */
export function fakeJob<T extends object>(data: T, id = randomUUID()): Job<T> {
  return {
    id,
    name: "test-job",
    data,
    expireInSeconds: 60,
    heartbeatSeconds: null,
    signal: new AbortController().signal,
  };
}

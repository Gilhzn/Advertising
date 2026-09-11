import {
  BUSINESS_CATEGORIES,
  CONTENT_LANGUAGES,
  METRIC_NAMES,
  PLATFORM_IDS,
  POST_STATUSES,
} from "@adv/shared";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const platformEnum = pgEnum("platform", PLATFORM_IDS);
export const categoryEnum = pgEnum("business_category", BUSINESS_CATEGORIES);
export const languageEnum = pgEnum("content_language", CONTENT_LANGUAGES);
export const postStatusEnum = pgEnum("post_status", POST_STATUSES);
export const ownershipEnum = pgEnum("account_ownership", ["owned", "community"]);
export const accountStatusEnum = pgEnum("account_status", ["pending", "connected", "error", "disconnected"]);
export const metricEnum = pgEnum("metric_name", METRIC_NAMES);
export const recommendationTypeEnum = pgEnum("recommendation_type", ["marketing", "product"]);
export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "open",
  "accepted",
  "dismissed",
  "implemented",
]);
export const mailboxStatusEnum = pgEnum("mailbox_status", ["pending_dns", "provisioning", "active", "error"]);
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "running",
  "succeeded",
  "failed",
  "budget_exceeded",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  ...timestamps,
});

/** Auth.js magic-link verification tokens (standard shape). */
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("verification_tokens_identifier_token").on(t.identifier, t.token)],
);

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull(),
    category: categoryEnum("category").notNull().default("other"),
    languages: jsonb("languages").$type<string[]>().notNull().default(sql`'["en"]'::jsonb`),
    primaryLanguage: languageEnum("primary_language").notNull().default("en"),
    websiteUrl: text("website_url"),
    links: jsonb("links").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    imageUrl: text("image_url"),
    domain: text("domain"),
    targetRegion: text("target_region"),
    timezone: text("timezone").notNull().default("UTC"),
    /** learned weights from the analyst: { platforms, pillars, hours, languages } */
    weights: jsonb("weights").$type<Record<string, Record<string, number>>>(),
    aiMonthlyBudgetUsd: numeric("ai_monthly_budget_usd", { precision: 10, scale: 2 }).notNull().default("50"),
    posthogProjectId: text("posthog_project_id"),
    posthogProjectToken: text("posthog_project_token"),
    appRepoUrl: text("app_repo_url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("businesses_user_slug").on(t.userId, t.slug)],
);

export const brandKits = pgTable("brand_kits", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  data: jsonb("data").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
});

export const channelPlans = pgTable("channel_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  data: jsonb("data").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
});

export const platformAccounts = pgTable(
  "platform_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    ownership: ownershipEnum("ownership").notNull().default("owned"),
    externalId: text("external_id"),
    handle: text("handle"),
    displayName: text("display_name"),
    profileUrl: text("profile_url"),
    status: accountStatusEnum("status").notNull().default("pending"),
    wizardStep: integer("wizard_step").notNull().default(0),
    /** connector-specific config: page id, channel id, webhook url, ig user id, privacy level... */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("platform_accounts_business").on(t.businessId, t.platform),
    uniqueIndex("platform_accounts_one_owned_per_platform")
      .on(t.businessId, t.platform)
      .where(sql`ownership = 'owned'`),
  ],
);

export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => platformAccounts.id, { onDelete: "cascade" })
    .unique(),
  /** AES-256-GCM encrypted */
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  tokenType: text("token_type"),
  scopes: jsonb("scopes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
});

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  /** The signed-in user who started the flow; the callback refuses a state belonging to anyone else. */
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  codeVerifier: text("code_verifier"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    audienceFit: text("audience_fit"),
    rulesSummary: text("rules_summary"),
    approvalRequired: boolean("approval_required").notNull().default(true),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("communities_business_platform_name").on(t.businessId, t.platform, t.name)],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => platformAccounts.id, { onDelete: "set null" }),
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
    platform: platformEnum("platform").notNull(),
    language: languageEnum("language").notNull().default("en"),
    pillarId: text("pillar_id"),
    title: text("title"),
    body: text("body").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    linkUrl: text("link_url"),
    media: jsonb("media").$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
    status: postStatusEnum("status").notNull().default("draft"),
    variantGroup: text("variant_group"),
    variantLabel: text("variant_label"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** who approved the post (required before publishing to a community) */
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    rationale: text("rationale"),
    compliance: jsonb("compliance"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    generatedByRunId: uuid("generated_by_run_id"),
    ...timestamps,
  },
  (t) => [
    index("posts_business_status").on(t.businessId, t.status),
    index("posts_due").on(t.status, t.scheduledAt),
  ],
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => platformAccounts.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    metric: metricEnum("metric").notNull(),
    value: numeric("value", { precision: 18, scale: 4 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("metric_snapshots_business_time").on(t.businessId, t.capturedAt),
    index("metric_snapshots_post").on(t.postId, t.metric),
  ],
);

export const productAnalyticsSnapshots = pgTable(
  "product_analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // top_screens | funnel | retention | rage_clicks | heatmap_ref | overview
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("product_analytics_business_kind").on(t.businessId, t.kind, t.periodEnd)],
);

export const insights = pgTable("insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  data: jsonb("data").notNull(),
  runId: uuid("run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  type: recommendationTypeEnum("type").notNull(),
  priority: integer("priority").notNull().default(3),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  evidence: text("evidence"),
  effort: text("effort"),
  expectedImpact: text("expected_impact"),
  status: recommendationStatusEnum("status").notNull().default("open"),
  prUrl: text("pr_url"),
  runId: uuid("run_id"),
  ...timestamps,
});

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  provider: text("provider").notNull(), // migadu | cloudflare_routing
  forwardTo: text("forward_to"),
  status: mailboxStatusEnum("status").notNull().default("pending_dns"),
  dnsRecords: jsonb("dns_records").$type<Array<Record<string, unknown>>>(),
  /** encrypted mailbox password (migadu) */
  passwordEnc: text("password_enc"),
  lastError: text("last_error"),
  ...timestamps,
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    jobName: text("job_name").notNull(),
    agent: text("agent").notNull(),
    model: text("model").notNull(),
    status: agentRunStatusEnum("status").notNull().default("running"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    decisionLog: jsonb("decision_log")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    result: jsonb("result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("agent_runs_business_time").on(t.businessId, t.startedAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(), // user:<id> | agent:<name> | system
    action: text("action").notNull(),
    target: text("target"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_log_business_time").on(t.businessId, t.createdAt)],
);

// ---- relations ----
export const businessesRelations = relations(businesses, ({ one, many }) => ({
  user: one(users, { fields: [businesses.userId], references: [users.id] }),
  brandKits: many(brandKits),
  channelPlans: many(channelPlans),
  accounts: many(platformAccounts),
  posts: many(posts),
  communities: many(communities),
  mailboxes: many(mailboxes),
}));
export const platformAccountsRelations = relations(platformAccounts, ({ one, many }) => ({
  business: one(businesses, { fields: [platformAccounts.businessId], references: [businesses.id] }),
  token: one(oauthTokens, { fields: [platformAccounts.id], references: [oauthTokens.accountId] }),
  posts: many(posts),
}));
export const postsRelations = relations(posts, ({ one, many }) => ({
  business: one(businesses, { fields: [posts.businessId], references: [businesses.id] }),
  account: one(platformAccounts, { fields: [posts.accountId], references: [platformAccounts.id] }),
  community: one(communities, { fields: [posts.communityId], references: [communities.id] }),
  metrics: many(metricSnapshots),
}));
export const metricSnapshotsRelations = relations(metricSnapshots, ({ one }) => ({
  post: one(posts, { fields: [metricSnapshots.postId], references: [posts.id] }),
}));

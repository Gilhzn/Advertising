import { randomUUID } from "node:crypto";
import {
  businesses,
  type Db,
  eq,
  getDb,
  metricSnapshots,
  platformAccounts,
  productAnalyticsSnapshots,
  sql,
  users,
} from "@adv/db";
import type { RenderInput, RenderOutput, UploadInput, UploadOutput } from "@adv/media";
import {
  type BrandKit,
  type BusinessCategory,
  type ChannelPlan,
  type ContentLanguage,
  PLATFORM_IDS,
  type PlatformId,
} from "@adv/shared";
import { screenHardRules, verdictFor } from "../src/compliance-rules.js";
import type { ComplianceCheckInput, ComplianceCheckResult } from "../src/direct.js";

export const TEST_EMAIL_DOMAIN = "adv-eval.test";

export interface TestBusinessInput {
  name: string;
  description: string;
  category: BusinessCategory;
  languages: ContentLanguage[];
  primaryLanguage: ContentLanguage;
  websiteUrl?: string;
  targetRegion?: string;
  /** owned accounts to pre-connect */
  connected?: PlatformId[];
  /** a community-ownership account, to exercise the approval path without a community row */
  communityAccounts?: PlatformId[];
  aiMonthlyBudgetUsd?: string;
  posthogProjectId?: string;
}

export interface TestBusiness {
  userId: string;
  businessId: string;
  slug: string;
}

/** Creates an isolated user + business (+ accounts) for one eval case or test. */
export async function createTestBusiness(input: TestBusinessInput, db: Db = getDb()): Promise<TestBusiness> {
  const slug = `eval-${randomUUID().slice(0, 8)}`;
  const [user] = await db
    .insert(users)
    .values({ email: `${slug}@${TEST_EMAIL_DOMAIN}`, name: "Eval" })
    .returning({ id: users.id });
  if (!user) throw new Error("could not create eval user");
  const [biz] = await db
    .insert(businesses)
    .values({
      userId: user.id,
      name: input.name,
      slug,
      description: input.description,
      category: input.category,
      languages: input.languages,
      primaryLanguage: input.primaryLanguage,
      websiteUrl: input.websiteUrl ?? null,
      targetRegion: input.targetRegion ?? null,
      aiMonthlyBudgetUsd: input.aiMonthlyBudgetUsd ?? "50",
      posthogProjectId: input.posthogProjectId ?? null,
    })
    .returning({ id: businesses.id });
  if (!biz) throw new Error("could not create eval business");

  for (const p of input.connected ?? []) {
    await db.insert(platformAccounts).values({
      businessId: biz.id,
      platform: p,
      ownership: "owned",
      status: "connected",
      handle: `@${slug}`,
    });
  }
  for (const p of input.communityAccounts ?? []) {
    await db.insert(platformAccounts).values({
      businessId: biz.id,
      platform: p,
      ownership: "community",
      status: "connected",
      handle: `community-${slug}`,
    });
  }
  return { userId: user.id, businessId: biz.id, slug };
}

/** Deletes the user, which cascades to the business and everything under it. */
export async function deleteTestBusiness(userId: string, db: Db = getDb()): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/** Removes every row left behind by a previous eval run (users cascade to everything else). */
export async function cleanupEvalData(db: Db = getDb()): Promise<number> {
  const rows = await db
    .delete(users)
    .where(sql`${users.email} like ${`%@${TEST_EMAIL_DOMAIN}`}`)
    .returning({ id: users.id });
  return rows.length;
}

export async function seedMetrics(businessId: string, platform: PlatformId, db: Db = getDb()): Promise<void> {
  const now = Date.now();
  const rows = [
    { metric: "impressions" as const, value: "1200" },
    { metric: "likes" as const, value: "84" },
    { metric: "clicks" as const, value: "31" },
    { metric: "comments" as const, value: "7" },
  ];
  for (const [i, r] of rows.entries()) {
    await db.insert(metricSnapshots).values({
      businessId,
      platform,
      metric: r.metric,
      value: r.value,
      capturedAt: new Date(now - (i + 1) * 3600_000),
    });
  }
}

export async function seedProductAnalytics(businessId: string, db: Db = getDb()): Promise<void> {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 3600_000);
  await db.insert(productAnalyticsSnapshots).values([
    {
      businessId,
      kind: "funnel",
      periodStart: start,
      periodEnd: end,
      payload: {
        steps: [
          { name: "install", users: 1000 },
          { name: "signup", users: 410 },
          { name: "first_session", users: 260 },
          { name: "day2_return", users: 92 },
        ],
      },
    },
    {
      businessId,
      kind: "rage_clicks",
      periodStart: start,
      periodEnd: end,
      payload: { screens: [{ screen: "/onboarding/step-2", rageClicks: 214, users: 390 }] },
    },
  ]);
}

// ---------------------------------------------------------------------------
// payload fixtures
// ---------------------------------------------------------------------------

/** BrandKitSchema needs a bio for every platform id, so build the full map. */
function allBios(name: string): BrandKit["bios"] {
  const out = {} as BrandKit["bios"];
  for (const p of PLATFORM_IDS) {
    out[p] = { short: `${name} - short bio for ${p}`.slice(0, 140), long: `${name} longer bio for ${p}` };
  }
  return out;
}

export function brandKitFixture(name: string, handle: string): BrandKit {
  return {
    positioning: `${name} is the fastest way for its audience to get the job done.`,
    uniqueSellingPoints: ["Works in minutes", "No setup", "Transparent pricing"],
    targetAudiences: [
      {
        name: "Core users",
        description: "People who already have the problem and are searching for a fix.",
        painPoints: ["Existing tools are slow", "Too much setup"],
        whereTheyHangOut: ["Reddit", "Discord", "LinkedIn"],
      },
    ],
    toneOfVoice: {
      adjectives: ["direct", "warm", "concrete"],
      dos: ["Lead with the outcome", "Use plain words"],
      donts: ["No hype", "No fake urgency"],
    },
    handleSuggestions: [handle, `${handle}_app`, `get.${handle}`.slice(0, 30)],
    tagline: `${name}: get it done`.slice(0, 120),
    bios: allBios(name),
    palette: {
      primary: "#1f6feb",
      secondary: "#0d1117",
      accent: "#f778ba",
      background: "#ffffff",
      text: "#111827",
    },
    visualStyle: "High-contrast flat cards, one accent colour, generous whitespace.",
    keywords: ["productivity", "fast", "simple"],
    hashtags: ["#buildinpublic", "#indiedev"],
  };
}

export interface ChannelPlanFixtureOptions {
  platforms: Array<{ platform: PlatformId; priority: "core" | "secondary" | "experimental" }>;
  communities?: Array<{ platform: PlatformId; name: string }>;
}

export function channelPlanFixture(opts: ChannelPlanFixtureOptions): ChannelPlan {
  return {
    platforms: opts.platforms.map((p) => ({
      platform: p.platform,
      priority: p.priority,
      rationale: `Audience is present on ${p.platform} and publishing works without an app review.`,
      postsPerWeek: p.priority === "core" ? 3 : 1,
      bestTimesLocal: ["09:00", "13:00", "18:00"],
      formats: ["text", "image"],
    })),
    communities: (opts.communities ?? []).map((c) => ({
      platform: c.platform,
      name: c.name,
      url: `https://example.com/${c.name.replace(/[^a-z0-9]/gi, "-")}`,
      audienceFit: "Members actively discuss this exact problem.",
      rulesSummary: "Self-promotion allowed in the weekly thread only; no links in titles.",
      approvalRequired: true as const,
    })),
    pillars: [
      {
        id: "product-proof",
        name: "Product proof",
        description: "Show the thing working.",
        share: 0.5,
        exampleAngles: ["A 20-second demo", "Before/after"],
      },
      {
        id: "behind-the-scenes",
        name: "Behind the scenes",
        description: "How it is built and why.",
        share: 0.5,
        exampleAngles: ["What we cut", "A bug we fixed"],
      },
    ],
    weeklyCadence: 6,
    launchPlan: [
      { day: 0, action: "Finish profiles and bios" },
      { day: 3, action: "Soft launch post", platform: opts.platforms[0]?.platform },
      { day: 14, action: "Community launch in the weekly thread" },
      { day: 30, action: "Review metrics and replan" },
    ],
    kpis: [
      { name: "Signups", target: "100 in 30 days", why: "First evidence of demand." },
      { name: "Engagement rate", target: ">2%", why: "Tells us the message lands." },
    ],
  };
}

// ---------------------------------------------------------------------------
// stubs for injectable dependencies
// ---------------------------------------------------------------------------

/**
 * Compliance stub for mock mode: runs the REAL deterministic hard-rule screen and skips the model
 * call, so the banned-pattern assertions exercise production logic without spending money.
 */
export const stubCompliance = async (input: ComplianceCheckInput): Promise<ComplianceCheckResult> => {
  const issues = screenHardRules({
    platform: input.platform,
    title: input.title ?? null,
    body: input.body,
    hashtags: input.hashtags ?? [],
    evidenceText: input.evidenceText ?? "",
    isCommunityTarget: input.isCommunityTarget ?? false,
  });
  return { verdict: verdictFor(issues), issues, costUsd: 0, runId: null, screenedLocally: true };
};

/** Media stub: @adv/media is implemented separately; the eval only needs a deterministic asset. */
export const stubMedia = {
  renderTemplate: async (input: RenderInput): Promise<RenderOutput> => ({
    buffer: Buffer.from(`png:${input.template}:${input.headline}`),
    width: 1080,
    height: 1080,
    mimeType: "image/png" as const,
  }),
  uploadMedia: async (input: UploadInput): Promise<UploadOutput> => ({
    url: `https://cdn.example.test/${input.businessId}/${input.key ?? randomUUID()}.${input.ext}`,
    key: input.key ?? randomUUID(),
  }),
};

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./env.js";
import {
  agentRuns,
  auditLog,
  brandKits,
  businesses,
  channelPlans,
  eq,
  getDb,
  platformAccounts,
  posts,
  sql,
} from "@adv/db";
import {
  BrandKitSchema,
  ChannelPlanSchema,
  type ContentLanguage,
  PLATFORMS,
  type PlatformId,
  type PostDraft,
} from "@adv/shared";
import type { JobDeps } from "../src/jobs.js";
import { runAnalyst, runContentBatch, runDiscovery, runProductAdvisor } from "../src/jobs.js";
import { postLength } from "../src/tools/engine.js";
import {
  brandKitFixture,
  channelPlanFixture,
  cleanupEvalData,
  createTestBusiness,
  deleteTestBusiness,
  seedMetrics,
  seedProductAnalytics,
  stubCompliance,
  stubMedia,
  type TestBusiness,
} from "./fixtures.js";
import { type MockApi, makeMockQuery } from "./mock-query.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = process.env.EVAL_LIVE === "1";
const LIVE_CASE_LIMIT = Number(process.env.EVAL_LIVE_CASES ?? "1");

interface EvalCase {
  id: string;
  name: string;
  description: string;
  category: "game" | "saas" | "mobile_app" | "local_business" | "other";
  languages: ContentLanguage[];
  primaryLanguage: ContentLanguage;
  websiteUrl?: string;
  targetRegion?: string;
  connected?: PlatformId[];
  communityAccounts?: PlatformId[];
  plan: {
    platforms: Array<{ platform: PlatformId; priority: "core" | "secondary" | "experimental" }>;
    communities?: Array<{ platform: PlatformId; name: string }>;
  };
  batch: { days: number };
  seedMetricsFor: PlatformId;
  productAnalytics: boolean;
}

function loadCases(): EvalCase[] {
  const dir = join(HERE, "cases");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase);
}

// ---------------------------------------------------------------------------
// assertions
// ---------------------------------------------------------------------------

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
  skipped?: boolean;
}

class Checks {
  readonly items: Check[] = [];
  constructor(readonly caseId: string) {}
  expect(name: string, ok: boolean, detail?: string): void {
    this.items.push({ name, ok, ...(detail ? { detail } : {}) });
  }
  skip(name: string, why: string): void {
    this.items.push({ name, ok: true, skipped: true, detail: why });
  }
  get failed(): Check[] {
    return this.items.filter((c) => !c.ok);
  }
}

// ---------------------------------------------------------------------------
// scripted "model" plans (mock mode)
// ---------------------------------------------------------------------------

const BODY: Record<ContentLanguage, string[]> = {
  en: [
    "Saved three hours this week by letting the queue pick what to read next. Here is the one setting that did it.",
    "We rebuilt the slowest screen and cut it from 2.4s to 300ms. Short write-up of what was actually wrong.",
    "A reader asked how the offline mode works. Answer: everything syncs on wifi, nothing waits on a server.",
  ],
  he: [
    "חסכנו שלוש שעות השבוע כשנתנו לתור לבחור מה קוראים אחר כך. ההגדרה אחת ששינתה הכול.",
    "בנינו מחדש את המסך האיטי וקיצרנו אותו מ-2.4 שניות ל-300 אלפיות. סיכום קצר של מה באמת היה תקוע.",
    "שאלו אותנו איך עובד המצב הלא מקוון. התשובה: הסנכרון קורה בוויפיי, שום דבר לא מחכה לשרת.",
  ],
};

function draftFor(opts: {
  platform: PlatformId;
  language: ContentLanguage;
  pillarId: string;
  name: string;
  idx: number;
  variantGroup?: string;
  variantLabel?: string;
}): PostDraft {
  const meta = PLATFORMS[opts.platform];
  const hashtags = opts.platform === "hacker_news" ? [] : ["#buildinpublic"];
  const title =
    opts.platform === "hacker_news"
      ? `Show HN: ${opts.name}`.slice(0, 60)
      : opts.platform === "itch_io" || opts.platform === "steam"
        ? `${opts.name} update`
        : undefined;
  const pool = BODY[opts.language];
  const base = `${pool[opts.idx % pool.length]}`;
  const budget = meta.maxChars - (title?.length ?? 0) - hashtags.join(" ").length - 1;
  const body = base.slice(0, Math.max(1, budget));
  return {
    platform: opts.platform,
    language: opts.language,
    pillarId: opts.pillarId,
    ...(title ? { title } : {}),
    body,
    hashtags,
    media: [],
    ...(opts.variantGroup ? { variantGroup: opts.variantGroup } : {}),
    ...(opts.variantLabel ? { variantLabel: opts.variantLabel } : {}),
    rationale: `${opts.pillarId} angle for ${opts.platform} (${opts.language})`,
  };
}

/** A draft that must be blocked: solicits upvotes. */
function bannedVoteDraft(platform: PlatformId, language: ContentLanguage): PostDraft {
  return {
    platform,
    language,
    pillarId: "product-proof",
    body: "We are live today. Please upvote us on the launch thread and we will return the favour.",
    hashtags: [],
    media: [],
    rationale: "intentional violation fixture",
  };
}

/** A draft that must be blocked: claims an award that is nowhere in the business description. */
function bannedAwardDraft(platform: PlatformId, language: ContentLanguage): PostDraft {
  return {
    platform,
    language,
    pillarId: "product-proof",
    body: "Our award-winning app was voted the best in its category this year. Download it now.",
    hashtags: [],
    media: [],
    rationale: "intentional violation fixture",
  };
}

function scheduleAt(dayOffset: number, hour: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function discoveryPlan(c: EvalCase) {
  return async (api: MockApi): Promise<string> => {
    await api.call("get_business", {});
    await api.call("list_playbooks", {});
    await api.call("read_playbook", { kind: "category", id: c.category });
    await api.call("read_playbook", { kind: "rules" });
    const kit = await api.call("save_brand_kit", {
      brandKit: brandKitFixture(c.name, c.id.replace(/[^a-z0-9_.]/g, "_").slice(0, 20)),
    });
    const plan = await api.call("save_channel_plan", {
      channelPlan: channelPlanFixture({
        platforms: c.plan.platforms,
        ...(c.plan.communities ? { communities: c.plan.communities } : {}),
      }),
    });
    await api.call("get_business", {});
    return [
      `brand kit ${String(kit.data.brandKitId)} v${String(kit.data.version)}`,
      `channel plan ${String(plan.data.channelPlanId)} v${String(plan.data.version)}`,
      `communities ${JSON.stringify(plan.data.communityIds)}`,
    ].join("\n");
  };
}

interface BatchOutcome {
  perPlatform: Record<string, string[]>;
  communityPostIds: string[];
  blockedPostIds: string[];
  bypassDenied: boolean;
}

function contentBatchPlan(c: EvalCase, out: BatchOutcome) {
  return async (api: MockApi): Promise<string> => {
    await api.call("get_business", {});
    const found = await api.call("search_communities", {});
    const known = (found.data.known ?? []) as Array<{ id: string; platform: PlatformId; name: string }>;

    let idx = 0;
    for (const p of c.plan.platforms) {
      const meta = PLATFORMS[p.platform];
      const variants = p.priority === "core" ? ["a", "b"] : [undefined];
      for (const language of c.languages) {
        for (const variantLabel of variants) {
          const pillarId = idx % 2 === 0 ? "product-proof" : "behind-the-scenes";
          const draft = draftFor({
            platform: p.platform,
            language,
            pillarId,
            name: c.name,
            idx,
            ...(variantLabel ? { variantGroup: `${pillarId}-${p.platform}-w1`, variantLabel } : {}),
          });
          idx++;
          const created = await api.call("create_post_draft", { post: draft });
          if (created.isError) {
            throw new Error(`create_post_draft failed for ${p.platform}: ${created.text}`);
          }
          const postId = String(created.data.postId);
          out.perPlatform[p.platform] = [...(out.perPlatform[p.platform] ?? []), postId];

          const compliance = await api.call("check_compliance", { postId });
          if (compliance.data.verdict === "block") {
            out.blockedPostIds.push(postId);
            continue;
          }
          if (meta.supports.image) {
            await api.call("render_image", {
              postId,
              template: pillarId === "product-proof" ? "feature" : "announcement",
              aspect: p.platform === "instagram" || p.platform === "threads" ? "4:5" : "16:9",
              headline: `${c.name} in ${language === "he" ? "עברית" : "one screen"}`.slice(0, 60),
              altText: `A branded card for ${c.name} showing the ${pillarId} message.`,
            });
          }
          await api.call("schedule_post", {
            postId,
            scheduledAt: scheduleAt((idx % 6) + 1, 9 + (idx % 8)),
          });
        }
      }
    }

    // community target: must end up awaiting_approval
    const community = known[0];
    if (community) {
      const draft = draftFor({
        platform: community.platform,
        language: c.primaryLanguage,
        pillarId: "behind-the-scenes",
        name: c.name,
        idx: 99,
      });
      const created = await api.call("create_post_draft", { post: draft, communityId: community.id });
      if (!created.isError) {
        const postId = String(created.data.postId);
        out.communityPostIds.push(postId);
        out.perPlatform[community.platform] = [...(out.perPlatform[community.platform] ?? []), postId];
        await api.call("check_compliance", { postId });
        if (PLATFORMS[community.platform].supports.image) {
          await api.call("render_image", {
            postId,
            template: "announcement",
            aspect: "1:1",
            headline: `${c.name}`.slice(0, 60),
            altText: `A branded card for ${c.name}.`,
          });
        }
        await api.call("schedule_post", { postId, scheduledAt: scheduleAt(8, 12) });
      }
    }

    // two drafts that must be blocked by the hard rules
    const violationPlatform = c.plan.platforms[0]?.platform ?? "bluesky";
    for (const bad of [
      bannedVoteDraft(violationPlatform, c.primaryLanguage),
      bannedAwardDraft(violationPlatform, c.primaryLanguage),
    ]) {
      const created = await api.call("create_post_draft", { post: bad });
      if (created.isError) continue;
      const postId = String(created.data.postId);
      out.perPlatform[violationPlatform] = [...(out.perPlatform[violationPlatform] ?? []), postId];
      const verdict = await api.call("check_compliance", { postId });
      if (verdict.data.verdict === "block") out.blockedPostIds.push(postId);
      // a blocked post must not be schedulable
      await api.call("schedule_post", { postId, scheduledAt: scheduleAt(2, 10) });
    }

    // attempt to bypass the community approval rule - the PreToolUse hook must deny it
    const target = out.communityPostIds[0] ?? Object.values(out.perPlatform).flat()[0];
    if (target) {
      const denied = await api.call("schedule_post", {
        postId: target,
        scheduledAt: scheduleAt(3, 10),
        force: true,
        status: "approved",
      });
      out.bypassDenied = denied.denied;
    }

    return `created ${Object.values(out.perPlatform).flat().length} drafts`;
  };
}

function analystPlan() {
  return async (api: MockApi): Promise<string> => {
    await api.call("get_business", {});
    const metrics = await api.call("get_metrics", { days: 30 });
    const end = new Date().toISOString();
    const start = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const saved = await api.call("save_insight", {
      periodStart: start,
      periodEnd: end,
      insight: {
        summary: "Engagement concentrates on the core platform; the rest is noise at this volume.",
        findings: [
          {
            title: "Core platform carries the batch",
            evidence: `byPlatform totals: ${JSON.stringify(metrics.data.byPlatform).slice(0, 300)}`,
            confidence: "medium",
          },
          {
            title: "Sample is too small to judge pillars",
            evidence: `snapshotCount=${String(metrics.data.snapshotCount)}`,
            confidence: "low",
          },
        ],
        weights: {
          platforms: { bluesky: 1.2, instagram: 1.1 },
          pillars: { "product-proof": 1.2, "behind-the-scenes": 0.9 },
          hours: { "09": 1.1, "18": 1.2 },
          languages: { en: 1, he: 1 },
        },
      },
    });
    await api.call("save_recommendation", {
      recommendation: {
        type: "marketing",
        priority: 2,
        title: "Move the evening slot to 18:00 UTC",
        detail: "The 18:00 bucket outperforms 09:00 on the core platform.",
        evidence: "byHour totals from get_metrics over 30 days.",
        effort: "low",
        expectedImpact: "medium",
      },
    });
    return `insight ${String(saved.data.insightId)}`;
  };
}

function productAdvisorPlan(hasAnalytics: boolean) {
  return async (api: MockApi): Promise<string> => {
    await api.call("get_business", {});
    const snap = await api.call("get_product_analytics", {});
    const kinds = (snap.data.availableKinds ?? []) as string[];
    if (!hasAnalytics || kinds.length === 0) return "no product analytics connected; no recommendations";
    await api.call("save_recommendation", {
      recommendation: {
        type: "product",
        priority: 1,
        title: "Fix onboarding step 2",
        detail: "Split the step in two and remove the blocking permission prompt.",
        evidence: "rage_clicks: 214 on /onboarding/step-2 across 390 users; funnel drops 1000 -> 410.",
        effort: "medium",
        expectedImpact: "high",
      },
    });
    await api.call("save_recommendation", {
      recommendation: {
        type: "product",
        priority: 2,
        title: "Shorten the first session",
        detail: "Only 260 of 410 signups reach a first session; cut the setup to one screen.",
        evidence: "funnel: signup 410 -> first_session 260.",
        effort: "low",
        expectedImpact: "medium",
      },
    });
    await api.call("save_recommendation", {
      recommendation: {
        type: "marketing",
        priority: 3,
        title: "Lead with the first-session outcome",
        detail: "The funnel says the promise has to be visible before setup, so say it in the post.",
        evidence: "day2_return 92 of 1000 installs.",
        effort: "low",
        expectedImpact: "medium",
      },
    });
    return "3 recommendations";
  };
}

// ---------------------------------------------------------------------------
// per-case run
// ---------------------------------------------------------------------------

interface CaseResult {
  caseId: string;
  checks: Checks;
  costUsd: number;
  durationMs: number;
  error?: string;
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  const db = getDb();
  const checks = new Checks(c.id);
  const startedAt = Date.now();
  let biz: TestBusiness | undefined;
  let costUsd = 0;

  try {
    biz = await createTestBusiness({
      name: c.name,
      description: c.description,
      category: c.category,
      languages: c.languages,
      primaryLanguage: c.primaryLanguage,
      ...(c.websiteUrl ? { websiteUrl: c.websiteUrl } : {}),
      ...(c.targetRegion ? { targetRegion: c.targetRegion } : {}),
      ...(c.connected ? { connected: c.connected } : {}),
      ...(c.communityAccounts ? { communityAccounts: c.communityAccounts } : {}),
      ...(c.productAnalytics ? { posthogProjectId: `ph_${c.id}` } : {}),
    });

    const engine: JobDeps["engine"] = LIVE ? undefined : { complianceFn: stubCompliance, media: stubMedia };

    // ---- discovery ----
    const discoveryDeps: JobDeps = {
      ...(engine ? { engine } : {}),
      ...(LIVE ? {} : { query: makeMockQuery(discoveryPlan(c)) }),
    };
    const discovery = await runDiscovery(biz.businessId, "initial", discoveryDeps);
    costUsd += discovery.costUsd;
    checks.expect("discovery run succeeded", discovery.status === "succeeded", discovery.error ?? undefined);
    checks.expect("discovery recorded a cost", discovery.costUsd > 0, `costUsd=${discovery.costUsd}`);

    const [kitRow] = await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.businessId, biz.businessId))
      .limit(1);
    const kitParse = BrandKitSchema.safeParse(kitRow?.data);
    checks.expect(
      "brand kit persisted and validates against BrandKitSchema",
      kitParse.success,
      kitParse.success ? undefined : JSON.stringify(kitParse.error.issues.slice(0, 3)),
    );

    const [planRow] = await db
      .select()
      .from(channelPlans)
      .where(eq(channelPlans.businessId, biz.businessId))
      .limit(1);
    const planParse = ChannelPlanSchema.safeParse(planRow?.data);
    checks.expect(
      "channel plan persisted and validates against ChannelPlanSchema",
      planParse.success,
      planParse.success ? undefined : JSON.stringify(planParse.error.issues.slice(0, 3)),
    );
    if (planParse.success) {
      checks.expect(
        "every community in the plan is approvalRequired",
        planParse.data.communities.every((x) => x.approvalRequired === true),
      );
    }

    // ---- content batch ----
    const outcome: BatchOutcome = {
      perPlatform: {},
      communityPostIds: [],
      blockedPostIds: [],
      bypassDenied: false,
    };
    const batchDeps: JobDeps = {
      ...(engine ? { engine } : {}),
      ...(LIVE ? {} : { query: makeMockQuery(contentBatchPlan(c, outcome)) }),
    };
    const batch = await runContentBatch(biz.businessId, { days: c.batch.days }, batchDeps);
    costUsd += batch.costUsd;
    checks.expect("content batch run succeeded", batch.status === "succeeded", batch.error ?? undefined);

    const postRows = await db.select().from(posts).where(eq(posts.businessId, biz.businessId));
    checks.expect("content batch created posts", postRows.length > 0, `${postRows.length} posts`);

    const plannedPlatforms = c.plan.platforms.map((p) => p.platform);
    const withPosts = new Set(postRows.map((p) => p.platform));
    const missing = plannedPlatforms.filter((p) => !withPosts.has(p));
    if (LIVE) {
      checks.skip("every planned platform has posts", "model-dependent in live mode");
    } else {
      checks.expect(
        "every planned platform has posts",
        missing.length === 0,
        missing.length ? `missing: ${missing.join(", ")}` : undefined,
      );
    }

    const overLimit = postRows
      .map((p) => ({
        id: p.id,
        platform: p.platform,
        length: postLength({ title: p.title, body: p.body, hashtags: p.hashtags }),
        max: PLATFORMS[p.platform].maxChars,
      }))
      .filter((p) => p.length > p.max);
    checks.expect(
      "no post exceeds the platform maxChars",
      overLimit.length === 0,
      overLimit.length ? JSON.stringify(overLimit.slice(0, 3)) : undefined,
    );

    const communityAccountIds = new Set(
      (
        await db
          .select({ id: platformAccounts.id })
          .from(platformAccounts)
          .where(
            sql`${platformAccounts.businessId} = ${biz.businessId} and ${platformAccounts.ownership} = 'community'`,
          )
      ).map((a) => a.id),
    );
    const communityPosts = postRows.filter(
      (p) => p.communityId !== null || (p.accountId !== null && communityAccountIds.has(p.accountId)),
    );
    const scheduledCommunity = communityPosts.filter((p) => p.scheduledAt !== null);
    checks.expect(
      "community-targeted posts exist in this case",
      communityPosts.length > 0,
      `${communityPosts.length} community posts`,
    );
    checks.expect(
      "every scheduled community post is awaiting_approval",
      scheduledCommunity.every((p) => p.status === "awaiting_approval"),
      JSON.stringify(scheduledCommunity.map((p) => [p.platform, p.status])),
    );
    checks.expect(
      "no community post was approved or published",
      communityPosts.every((p) => p.status !== "approved" && p.status !== "published"),
    );

    const blocked = postRows.filter(
      (p) => (p.compliance as { verdict?: string } | null)?.verdict === "block",
    );
    checks.expect(
      "compliance blocked the banned-pattern fixtures",
      blocked.length >= 2,
      `${blocked.length} blocked`,
    );
    checks.expect(
      "blocked posts are rejected and unscheduled",
      blocked.every((p) => p.status === "rejected" && p.scheduledAt === null),
      JSON.stringify(blocked.map((p) => [p.status, p.scheduledAt])),
    );
    const blockedRules = blocked.flatMap((p) =>
      ((p.compliance as { issues?: Array<{ rule: string }> } | null)?.issues ?? []).map((i) => i.rule),
    );
    checks.expect(
      "vote solicitation was caught by rule no-vote-solicitation",
      blockedRules.includes("no-vote-solicitation"),
      blockedRules.join(","),
    );
    checks.expect(
      "fabricated award was caught by rule no-unsupported-claims",
      blockedRules.includes("no-unsupported-claims"),
      blockedRules.join(","),
    );

    if (LIVE) {
      checks.skip("PreToolUse hook denies a bypass attempt", "only scripted in mock mode");
    } else {
      checks.expect("PreToolUse hook denies a bypass attempt", outcome.bypassDenied);
    }

    const audits = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(eq(auditLog.businessId, biz.businessId));
    checks.expect("PostToolUse hook wrote audit_log rows", Number(audits[0]?.n ?? 0) > 0);

    // ---- analyst ----
    await seedMetrics(biz.businessId, c.seedMetricsFor, db);
    const analyst = await runAnalyst(biz.businessId, {
      ...(engine ? { engine } : {}),
      ...(LIVE ? {} : { query: makeMockQuery(analystPlan()) }),
    });
    costUsd += analyst.costUsd;
    checks.expect("analyst run succeeded", analyst.status === "succeeded", analyst.error ?? undefined);
    checks.expect("analyst saved an insight", analyst.insightIds.length > 0);

    const [bizRow] = await db
      .select({ weights: businesses.weights })
      .from(businesses)
      .where(eq(businesses.id, biz.businessId));
    checks.expect("analyst wrote weights onto the business", Boolean(bizRow?.weights));

    // ---- product advisor ----
    if (c.productAnalytics) await seedProductAnalytics(biz.businessId, db);
    const advisor = await runProductAdvisor(biz.businessId, {
      ...(engine ? { engine } : {}),
      ...(LIVE ? {} : { query: makeMockQuery(productAdvisorPlan(c.productAnalytics)) }),
    });
    costUsd += advisor.costUsd;
    checks.expect(
      "product advisor run succeeded",
      advisor.status === "succeeded",
      advisor.error ?? undefined,
    );
    if (c.productAnalytics) {
      checks.expect(
        "product advisor saved recommendations",
        advisor.recommendationIds.length >= 3,
        `${advisor.recommendationIds.length}`,
      );
    } else {
      checks.expect(
        "product advisor wrote nothing without analytics",
        advisor.recommendationIds.length === 0,
      );
    }

    const runRows = await db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(cost_usd),0)` })
      .from(agentRuns)
      .where(eq(agentRuns.businessId, biz.businessId));
    checks.expect(
      "agent_runs rows were written",
      Number(runRows[0]?.n ?? 0) >= 4,
      JSON.stringify(runRows[0]),
    );
  } catch (err) {
    checks.expect("case completed without throwing", false, err instanceof Error ? err.stack : String(err));
    return {
      caseId: c.id,
      checks,
      costUsd,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (biz && process.env.EVAL_KEEP !== "1") await deleteTestBusiness(biz.userId, db);
  }

  return { caseId: c.id, checks, costUsd, durationMs: Date.now() - startedAt };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const db = getDb();
  const removed = await cleanupEvalData(db);
  if (removed > 0) console.log(`cleaned ${removed} leftover eval user(s)`);

  let cases = loadCases();
  if (LIVE) cases = cases.slice(0, Math.max(1, LIVE_CASE_LIMIT));
  console.log(
    `\n@adv/agents evals - ${cases.length} case(s), mode=${LIVE ? "LIVE (real API calls)" : "mock (no API calls)"}\n`,
  );

  const results: CaseResult[] = [];
  for (const c of cases) {
    const r = await runCase(c);
    results.push(r);
    const failed = r.checks.failed;
    const skipped = r.checks.items.filter((i) => i.skipped).length;
    const status = failed.length === 0 ? "PASS" : "FAIL";
    console.log(
      `${status}  ${c.id.padEnd(22)} ${String(r.checks.items.length - skipped).padStart(2)} checks` +
        `${skipped ? ` (+${skipped} skipped)` : ""}  $${r.costUsd.toFixed(4)}  ${r.durationMs}ms`,
    );
    for (const f of failed) console.log(`        x ${f.name}${f.detail ? ` - ${f.detail}` : ""}`);
  }

  const totalChecks = results.reduce((n, r) => n + r.checks.items.length, 0);
  const totalFailed = results.reduce((n, r) => n + r.checks.failed.length, 0);
  const totalCost = results.reduce((n, r) => n + r.costUsd, 0);

  console.log("\n--- cost report ---");
  for (const r of results) console.log(`  ${r.caseId.padEnd(22)} $${r.costUsd.toFixed(4)}`);
  console.log(`  ${"TOTAL".padEnd(22)} $${totalCost.toFixed(4)}`);
  console.log(
    LIVE
      ? "  (real spend; targets: discovery < $2, content batch < $1, analysis < $1)"
      : "  (mock mode: cost is the estimateCostUsd fallback over synthetic usage, not real spend)",
  );

  console.log(
    `\n${totalFailed === 0 ? "ALL CHECKS PASSED" : `${totalFailed} CHECK(S) FAILED`} - ${totalChecks} checks across ${results.length} case(s)\n`,
  );

  if (process.env.EVAL_KEEP !== "1") await cleanupEvalData(db);
  process.exit(totalFailed === 0 ? 0 : 1);
}

await main();

import { randomUUID } from "node:crypto";
import { communities, type Db, eq, getDb, posts } from "@adv/db";
import type { generateAndUpload as realGenerateAndUpload } from "@adv/media";
import { PLATFORMS, type PostDraft } from "@adv/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  channelPlanFixture,
  createTestBusiness,
  deleteTestBusiness,
  stubCompliance,
  stubMedia,
  type TestBusiness,
} from "../../evals/fixtures.js";
import { makeScheduleGuard } from "../hooks.js";
import {
  callEngineTool,
  createEngineServer,
  type EngineServer,
  emptyCreatedIds,
  postLength,
  schedulingDecision,
} from "./engine.js";

let db: Db;
let biz: TestBusiness;
let server: EngineServer;
const runId = randomUUID();

const soon = () => new Date(Date.now() + 3600_000).toISOString();

beforeAll(async () => {
  db = getDb();
  biz = await createTestBusiness(
    {
      name: "Engine Tools Test",
      description:
        "A synthetic business used by the engine tool tests. Bluesky, Instagram and Discord accounts exist; Discord is a community account.",
      category: "saas",
      languages: ["en"],
      primaryLanguage: "en",
      websiteUrl: "https://example.com/engine-tools-test",
      connected: ["bluesky", "instagram"],
      communityAccounts: ["discord"],
    },
    db,
  );
  server = createEngineServer({
    businessId: biz.businessId,
    runId,
    db,
    created: emptyCreatedIds(),
    complianceFn: stubCompliance,
    media: stubMedia,
  });
  // a saved channel plan gives us a community row to target
  const plan = await callEngineTool(server, "save_channel_plan", {
    channelPlan: channelPlanFixture({
      platforms: [
        { platform: "bluesky", priority: "core" },
        { platform: "instagram", priority: "core" },
      ],
      communities: [{ platform: "bluesky", name: "Test Community" }],
    }),
  });
  expect(plan.isError).toBe(false);
});

afterAll(async () => {
  if (biz) await deleteTestBusiness(biz.userId, db);
});

function draft(over: Partial<PostDraft> & Pick<PostDraft, "platform">): PostDraft {
  return {
    language: "en",
    pillarId: "product-proof",
    body: "A short, honest update about what changed this week.",
    hashtags: [],
    media: [],
    ...over,
  } as PostDraft;
}

async function createDraft(d: PostDraft, extra: Record<string, unknown> = {}) {
  return callEngineTool(server, "create_post_draft", { post: d, ...extra });
}

/**
 * A draft that has been through the compliance guard, which is the only state `schedule_post` will
 * accept. The guard used to be a prompt instruction with nothing behind it, so these tests could
 * schedule a post that had never been checked.
 */
async function createCheckedDraft(d: PostDraft, extra: Record<string, unknown> = {}) {
  const created = await createDraft(d, extra);
  await callEngineTool(server, "check_compliance", { postId: String(created.data.postId) });
  return created;
}

describe("create_post_draft text limits", () => {
  it("accepts a draft that fits the platform limit", async () => {
    const res = await createDraft(draft({ platform: "bluesky" }));
    expect(res.isError).toBe(false);
    expect(res.data.maxChars).toBe(PLATFORMS.bluesky.maxChars);
    expect(Number(res.data.length)).toBeLessThanOrEqual(PLATFORMS.bluesky.maxChars);
  });

  it("rejects a draft that exceeds maxChars and stores nothing", async () => {
    const before = await db.select().from(posts).where(eq(posts.businessId, biz.businessId));
    const res = await createDraft(draft({ platform: "bluesky", body: "x".repeat(301) }));
    expect(res.isError).toBe(true);
    expect(String(res.data.error)).toMatch(/301 characters/);
    expect(res.data.maxChars).toBe(300);
    const after = await db.select().from(posts).where(eq(posts.businessId, biz.businessId));
    expect(after.length).toBe(before.length);
  });

  it("counts the title and hashtags toward the limit", async () => {
    const d = draft({
      platform: "hacker_news",
      title: "Show HN: a small tool for reading queues",
      body: "x".repeat(60),
    });
    expect(postLength(d)).toBeGreaterThan(PLATFORMS.hacker_news.maxChars);
    const res = await createDraft(d);
    expect(res.isError).toBe(true);
    expect(String(res.data.error)).toMatch(/allows 80/);
  });

  it("flags platforms that cannot publish text-only posts", async () => {
    const res = await createDraft(draft({ platform: "instagram", body: "A caption for the carousel." }));
    expect(res.isError).toBe(false);
    expect(res.data.requiresMedia).toBe(true);
  });
});

describe("schedule_post approval logic", () => {
  it("approves a post on an owned account", async () => {
    const created = await createCheckedDraft(draft({ platform: "bluesky", body: "Owned account post." }));
    const postId = String(created.data.postId);
    const res = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(res.isError).toBe(false);
    expect(res.data.status).toBe("approved");
    expect(res.data.requiresHumanApproval).toBe(false);
    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row?.status).toBe("approved");
    expect(row?.scheduledAt).toBeInstanceOf(Date);
  });

  it("holds a post targeting a community for human approval", async () => {
    const [community] = await db
      .select()
      .from(communities)
      .where(eq(communities.businessId, biz.businessId))
      .limit(1);
    expect(community).toBeDefined();
    expect(community?.approvalRequired).toBe(true);

    const created = await createCheckedDraft(draft({ platform: "bluesky", body: "Community post." }), {
      communityId: community!.id,
    });
    expect(created.data.requiresHumanApproval).toBe(true);
    const postId = String(created.data.postId);
    const res = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(res.data.status).toBe("awaiting_approval");
    expect(res.data.requiresHumanApproval).toBe(true);
    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row?.status).toBe("awaiting_approval");
  });

  it("holds a post whose only account has ownership=community", async () => {
    const created = await createCheckedDraft(
      draft({ platform: "discord", body: "Posted through a community-owned Discord account." }),
    );
    const postId = String(created.data.postId);
    const decision = await schedulingDecision(db, biz.businessId, postId);
    expect(decision.ok && decision.isCommunity).toBe(true);
    const res = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(res.data.status).toBe("awaiting_approval");
  });

  it("refuses to schedule a post the compliance guard blocked", async () => {
    const created = await createDraft(
      draft({ platform: "bluesky", body: "We are live. Please upvote us on the launch thread." }),
    );
    const postId = String(created.data.postId);
    const verdict = await callEngineTool(server, "check_compliance", { postId });
    expect(verdict.data.verdict).toBe("block");
    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row?.status).toBe("rejected");

    const res = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(res.isError).toBe(true);
    expect(String(res.data.error)).toMatch(/rejected/);
    const [after] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(after?.scheduledAt).toBeNull();
  });

  it("refuses to schedule a post that never went through check_compliance", async () => {
    // This was the hole: the verdict was selected in schedulingDecision and never read, and the only
    // compliance-derived gate was `status === "rejected"` - which check_compliance sets itself. So
    // create_post_draft -> schedule_post, skipping the check, produced an approved post.
    const created = await createDraft(draft({ platform: "bluesky", body: "Unchecked post." }));
    const postId = String(created.data.postId);
    const res = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(res.isError).toBe(true);
    expect(String(res.data.error)).toMatch(/check_compliance/);
    const [row] = await db.select().from(posts).where(eq(posts.id, postId));
    expect(row?.status).toBe("draft");
    expect(row?.scheduledAt).toBeNull();
  });

  it("refuses to schedule an image-only platform before media is attached", async () => {
    const created = await createCheckedDraft(
      draft({ platform: "instagram", body: "Caption without media yet." }),
    );
    const postId = String(created.data.postId);
    const blocked = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(blocked.isError).toBe(true);
    expect(String(blocked.data.error)).toMatch(/attach media/);

    const rendered = await callEngineTool(server, "render_image", {
      postId,
      template: "feature",
      aspect: "4:5",
      headline: "What changed this week",
      altText: "A branded card describing this week's change.",
    });
    expect(rendered.isError).toBe(false);
    const ok = await callEngineTool(server, "schedule_post", { postId, scheduledAt: soon() });
    expect(ok.data.status).toBe("approved");
  });

  it("refuses a post that belongs to another business", async () => {
    const other = await createTestBusiness(
      {
        name: "Other Business",
        description: "A second synthetic business, used to prove tools are scoped per business.",
        category: "saas",
        languages: ["en"],
        primaryLanguage: "en",
      },
      db,
    );
    try {
      const [foreign] = await db
        .insert(posts)
        .values({
          businessId: other.businessId,
          platform: "bluesky",
          language: "en",
          body: "Someone else's post.",
        })
        .returning({ id: posts.id });
      const res = await callEngineTool(server, "schedule_post", {
        postId: foreign!.id,
        scheduledAt: soon(),
      });
      expect(res.isError).toBe(true);
      expect(String(res.data.error)).toMatch(/not found for this business/);
    } finally {
      await deleteTestBusiness(other.userId, db);
    }
  });
});

describe("PreToolUse schedule guard", () => {
  const hookInput = (toolInput: Record<string, unknown>) =>
    ({
      hook_event_name: "PreToolUse",
      tool_name: "mcp__engine__schedule_post",
      tool_input: toolInput,
      tool_use_id: randomUUID(),
      session_id: "s",
      cwd: process.cwd(),
      transcript_path: "",
      permission_mode: "bypassPermissions",
    }) as never;

  it("denies any call carrying a bypass-looking key", async () => {
    const guard = makeScheduleGuard({ businessId: biz.businessId, runId, db, agentName: "supervisor" });
    const out = await guard(
      hookInput({ postId: randomUUID(), scheduledAt: soon(), force: true }),
      undefined,
      {
        signal: new AbortController().signal,
      },
    );
    const specific = (out as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput;
    expect(specific?.permissionDecision).toBe("deny");
  });

  it("denies a post from another business", async () => {
    const guard = makeScheduleGuard({ businessId: biz.businessId, runId, db, agentName: "supervisor" });
    const out = await guard(hookInput({ postId: randomUUID(), scheduledAt: soon() }), undefined, {
      signal: new AbortController().signal,
    });
    const specific = (
      out as {
        hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
      }
    ).hookSpecificOutput;
    expect(specific?.permissionDecision).toBe("deny");
    expect(specific?.permissionDecisionReason).toMatch(/not found/);
  });

  it("the PreToolUse guard denies the same unchecked post", async () => {
    const created = await createDraft(draft({ platform: "bluesky", body: "Unchecked, via the hook." }));
    const guard = makeScheduleGuard({ businessId: biz.businessId, runId, db, agentName: "supervisor" });
    const out = await guard(
      hookInput({ postId: String(created.data.postId), scheduledAt: soon() }),
      undefined,
      { signal: new AbortController().signal },
    );
    const specific = (
      out as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } }
    ).hookSpecificOutput;
    expect(specific?.permissionDecision).toBe("deny");
    expect(specific?.permissionDecisionReason).toMatch(/check_compliance/);
  });

  it("allows a legitimate call and says what will happen", async () => {
    const created = await createCheckedDraft(
      draft({ platform: "bluesky", body: "A normal owned-account post." }),
    );
    const guard = makeScheduleGuard({ businessId: biz.businessId, runId, db, agentName: "supervisor" });
    const out = await guard(
      hookInput({ postId: String(created.data.postId), scheduledAt: soon() }),
      undefined,
      { signal: new AbortController().signal },
    );
    const specific = (
      out as {
        hookSpecificOutput?: { permissionDecision?: string; additionalContext?: string };
      }
    ).hookSpecificOutput;
    expect(specific?.permissionDecision).toBeUndefined();
    expect(specific?.additionalContext).toMatch(/Owned account/);
  });
});

describe("fetch_url tool", () => {
  it("refuses a non-https URL through the tool surface", async () => {
    const res = await callEngineTool(server, "fetch_url", { url: "http://example.com" });
    expect(res.isError).toBe(true);
    expect(String(res.data.error)).toMatch(/only https/);
  });

  it("refuses a cloud metadata address", async () => {
    const res = await callEngineTool(server, "fetch_url", {
      url: "https://169.254.169.254/latest/meta-data/",
    });
    expect(res.isError).toBe(true);
    expect(String(res.data.error)).toMatch(/link-local\/metadata/);
  });
});

describe("generate_image tool (optional IMAGE_GEN_PROVIDER plugin)", () => {
  it("is absent from the tool list when the plugin is disabled", async () => {
    // The module-level `server` above was built without IMAGE_GEN_PROVIDER/IMAGE_GEN_API_KEY set, so
    // isImageGenEnabled() was false at buildEngineTools() time and generate_image was never registered.
    expect(server.tools.some((t) => t.name === "generate_image")).toBe(false);
    const res = await callEngineTool(server, "generate_image", {
      postId: randomUUID(),
      prompt: "a cozy reading nook",
      aspect: "1:1",
      altText: "alt",
    }).catch((e) => e as Error);
    expect(res).toBeInstanceOf(Error);
    expect(String((res as Error).message)).toMatch(/unknown engine tool/);
  });

  describe("when enabled", () => {
    let enabledServer: EngineServer;
    const stubGenerateAndUpload: typeof realGenerateAndUpload = async (input) => ({
      url: `https://cdn.example.test/${input.businessId}/${input.key ?? "gen"}.png`,
      width: 1080,
      height: 1080,
    });

    beforeAll(() => {
      vi.stubEnv("IMAGE_GEN_PROVIDER", "openai");
      vi.stubEnv("IMAGE_GEN_API_KEY", "test-key");
      enabledServer = createEngineServer({
        businessId: biz.businessId,
        runId,
        db,
        created: emptyCreatedIds(),
        complianceFn: stubCompliance,
        media: stubMedia,
        imageGen: { generateAndUpload: stubGenerateAndUpload },
      });
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    it("is registered on the tool list", () => {
      expect(enabledServer.tools.some((t) => t.name === "generate_image")).toBe(true);
    });

    it("generates an image and attaches it to the post", async () => {
      const created = await callEngineTool(enabledServer, "create_post_draft", {
        post: {
          platform: "bluesky",
          language: "en",
          pillarId: "product-proof",
          body: "A short caption for the hero image.",
          hashtags: [],
          media: [],
        } satisfies PostDraft,
      });
      expect(created.isError).toBe(false);
      const postId = String(created.data.postId);

      const res = await callEngineTool(enabledServer, "generate_image", {
        postId,
        prompt: "a cozy reading nook, warm light, no text or lettering, no logos, no real people",
        aspect: "1:1",
        altText: "A warmly lit reading nook.",
      });
      expect(res.isError).toBe(false);
      expect(res.data.mediaCount).toBe(1);
      const asset = res.data.asset as Record<string, unknown>;
      expect(asset.kind).toBe("image");
      expect(String(asset.url)).toContain(biz.businessId);
      expect(asset.altText).toBe("A warmly lit reading nook.");

      const [row] = await db.select().from(posts).where(eq(posts.id, postId));
      expect(row?.media).toHaveLength(1);
    });

    it("refuses platforms that do not support images", async () => {
      const created = await callEngineTool(enabledServer, "create_post_draft", {
        post: {
          platform: "hacker_news",
          language: "en",
          pillarId: "product-proof",
          title: "Show HN: a small tool",
          body: "A short, honest description.",
          hashtags: [],
          media: [],
        } satisfies PostDraft,
      });
      expect(created.isError).toBe(false);
      const postId = String(created.data.postId);

      const res = await callEngineTool(enabledServer, "generate_image", {
        postId,
        prompt: "a cozy reading nook",
        aspect: "1:1",
        altText: "alt",
      });
      expect(res.isError).toBe(true);
      expect(String(res.data.error)).toMatch(/does not support images/);

      const [row] = await db.select().from(posts).where(eq(posts.id, postId));
      expect(row?.media).toHaveLength(0);
    });
  });
});

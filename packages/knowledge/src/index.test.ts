import { BUSINESS_CATEGORIES, PLATFORM_IDS } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { loadCategory, loadPlaybook, loadRules, loadStrategyContext } from "./index.js";

/** Section headers every platform playbook must contain, verbatim. */
const REQUIRED_PLATFORM_SECTIONS = [
  "## Audience & culture",
  "## Formats that work",
  "## Limits",
  "## Best times",
  "## Hooks, structure & CTAs",
  "## Hashtag/keyword practice",
  "## Anti-spam & community rules",
  "## Good vs bad example",
  "## Sources",
] as const;

/** Section headers every category playbook must contain, verbatim. */
const REQUIRED_CATEGORY_SECTIONS = [
  "## Where this category wins",
  "## Communities",
  "## Launch sequence (first 30 days)",
  "## Content pillars that work",
  "## KPIs and realistic benchmarks",
  "## Common mistakes",
] as const;

describe("loadRules", () => {
  const rules = loadRules();

  it("is non-empty", () => {
    expect(rules.length).toBeGreaterThan(500);
  });

  it("contains at least 8 hard NEVER rules, each on its own line", () => {
    const neverLines = rules.split("\n").filter((line) => line.startsWith("- NEVER"));
    expect(neverLines.length).toBeGreaterThanOrEqual(8);
  });

  it("keeps every NEVER rule on a single line so compliance-guard can quote it", () => {
    for (const line of rules.split("\n").filter((l) => l.startsWith("- NEVER"))) {
      expect(line.trim().length).toBeGreaterThan(20);
      expect(line).not.toContain("\n");
    }
  });

  it("covers the rules the platform-playbooks skill declares as source of truth", () => {
    expect(rules).toMatch(/NEVER post to a community/i);
    expect(rules).toMatch(/90\/10/);
    expect(rules).toMatch(/hashtags on Hacker News|hashtags, emoji or marketing tone/i);
    expect(rules).toMatch(/human approval/i);
  });

  it("documents per-platform legal and policy notes", () => {
    expect(rules).toContain("## Per-platform legal and policy notes");
    expect(rules).toMatch(/disclosure/i);
  });

  it("has soft rules as well as hard rules", () => {
    expect(rules).toContain("## Soft rules");
  });
});

describe("loadPlaybook", () => {
  it.each(PLATFORM_IDS)("%s has a non-empty playbook", (platform) => {
    const doc = loadPlaybook(platform);
    expect(doc.length).toBeGreaterThan(1_000);
  });

  it.each(PLATFORM_IDS)("%s declares frontmatter with platform, updated and wave", (platform) => {
    const doc = loadPlaybook(platform);
    expect(doc.startsWith("---\n")).toBe(true);
    const frontmatter = doc.slice(4, doc.indexOf("\n---", 4));
    expect(frontmatter).toContain(`platform: ${platform}`);
    expect(frontmatter).toMatch(/^updated: \d{4}-\d{2}-\d{2}$/m);
    expect(frontmatter).toMatch(/^wave: (1|2|assisted)$/m);
  });

  it.each(PLATFORM_IDS)("%s has every required section header", (platform) => {
    const doc = loadPlaybook(platform);
    for (const section of REQUIRED_PLATFORM_SECTIONS) {
      expect(doc, `${platform}.md is missing "${section}"`).toContain(section);
    }
  });

  it.each(PLATFORM_IDS)("%s states its hard rules as NEVER lines", (platform) => {
    const doc = loadPlaybook(platform);
    const neverLines = doc.split("\n").filter((line) => line.startsWith("- NEVER"));
    expect(neverLines.length).toBeGreaterThanOrEqual(5);
  });

  it.each(PLATFORM_IDS)("%s cites sources as URLs", (platform) => {
    const sources = loadPlaybook(platform).split("## Sources")[1] ?? "";
    expect(sources).toContain("https://");
  });

  it.each(PLATFORM_IDS)("%s reminds the scheduler to convert UTC to the business timezone", (platform) => {
    expect(loadPlaybook(platform)).toMatch(/business timezone/i);
  });

  it("returns an empty string for an unknown platform", () => {
    expect(loadPlaybook("not-a-platform" as never)).toBe("");
  });
});

describe("loadCategory", () => {
  it.each(BUSINESS_CATEGORIES)("%s has a non-empty playbook", (category) => {
    expect(loadCategory(category).length).toBeGreaterThan(1_000);
  });

  it.each(BUSINESS_CATEGORIES)("%s declares frontmatter with category and updated", (category) => {
    const doc = loadCategory(category);
    expect(doc.startsWith("---\n")).toBe(true);
    const frontmatter = doc.slice(4, doc.indexOf("\n---", 4));
    expect(frontmatter).toContain(`category: ${category}`);
    expect(frontmatter).toMatch(/^updated: \d{4}-\d{2}-\d{2}$/m);
  });

  it.each(BUSINESS_CATEGORIES)("%s has every required section header", (category) => {
    const doc = loadCategory(category);
    for (const section of REQUIRED_CATEGORY_SECTIONS) {
      expect(doc, `${category}.md is missing "${section}"`).toContain(section);
    }
  });

  it.each(BUSINESS_CATEGORIES)("%s covers the full 30-day window", (category) => {
    const doc = loadCategory(category);
    expect(doc).toMatch(/Day 1\b/);
    expect(doc).toMatch(/Day 30\b/);
  });

  it("local_business includes the Israeli context subsection and its specific surfaces", () => {
    const doc = loadCategory("local_business");
    expect(doc).toContain("## Israeli context");
    expect(doc).toMatch(/Hebrew/);
    expect(doc).toMatch(/WhatsApp/);
    expect(doc).toMatch(/Telegram/);
    expect(doc).toMatch(/Google Business Profile/);
    expect(doc).toMatch(/Facebook group/i);
  });

  it("game names the community rules the engine must respect", () => {
    const doc = loadCategory("game");
    expect(doc).toMatch(/r\/gamedev/);
    expect(doc).toMatch(/r\/playmygame/);
    expect(doc).toMatch(/Release Announcements/);
    expect(doc).toMatch(/Next Fest/);
  });

  it("saas names Show HN and Product Hunt rules", () => {
    const doc = loadCategory("saas");
    expect(doc).toMatch(/Show HN/);
    expect(doc).toMatch(/Product Hunt/);
  });

  it("returns an empty string for an unknown category", () => {
    expect(loadCategory("not-a-category" as never)).toBe("");
  });
});

describe("loadStrategyContext", () => {
  it("concatenates rules, the category and every requested platform", () => {
    const ctx = loadStrategyContext("game", ["steam", "reddit"]);
    expect(ctx).toContain("# Anti-spam and compliance rules");
    expect(ctx).toContain("# Category playbook: Games");
    expect(ctx).toContain("# Steam");
    expect(ctx).toContain("# Reddit");
    expect(ctx.split("\n\n---\n\n")).toHaveLength(4);
  });

  it("skips platforms with no playbook rather than emitting blank sections", () => {
    const ctx = loadStrategyContext("saas", ["linkedin", "nope" as never]);
    expect(ctx.split("\n\n---\n\n")).toHaveLength(3);
  });

  it("stays small enough to paste into a prompt for a typical plan", () => {
    const ctx = loadStrategyContext("saas", ["linkedin", "reddit", "x", "product_hunt", "hacker_news"]);
    expect(ctx.length).toBeGreaterThan(10_000);
    expect(ctx.length).toBeLessThan(400_000);
  });
});

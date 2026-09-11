import { PLATFORMS } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { composeBody, countChars, splitThread, truncateForPlatform } from "./text.js";

describe("countChars", () => {
  it("counts graphemes, not code units", () => {
    expect(countChars("hello")).toBe(5);
    expect(countChars("👩‍👩‍👧‍👦")).toBe(1);
    expect(countChars("שלום")).toBe(4);
  });
});

describe("truncateForPlatform", () => {
  it("leaves short bodies alone", () => {
    expect(truncateForPlatform("short", 100)).toBe("short");
  });

  it("cuts on a word boundary and adds an ellipsis", () => {
    const out = truncateForPlatform("one two three four five six", 14);
    expect(countChars(out)).toBeLessThanOrEqual(14);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\bthre…$/); // no mid-word cut
  });

  it("keeps a preserved URL intact and within the limit", () => {
    const url = "https://acme.test/launch";
    const body = "a".repeat(400);
    const out = truncateForPlatform(body, 100, { preserveUrl: url });
    expect(out).toContain(url);
    expect(countChars(out)).toBeLessThanOrEqual(100);
    expect(out.endsWith(url)).toBe(true);
  });

  it("re-flows a body that already contains the URL", () => {
    const url = "https://acme.test/launch";
    const out = truncateForPlatform(`${"word ".repeat(80)}${url}`, 80, { preserveUrl: url });
    expect(countChars(out)).toBeLessThanOrEqual(80);
    expect(out.endsWith(url)).toBe(true);
    expect(out.split(url)).toHaveLength(2); // exactly one occurrence
  });

  it("degrades to the bare URL when there is no room for prose", () => {
    const url = "https://acme.test/launch";
    expect(truncateForPlatform("some prose", 10, { preserveUrl: url })).toBe(url.slice(0, 10));
  });
});

describe("composeBody", () => {
  it("bluesky: link then a trailing tag block, capped at 3 tags", () => {
    const out = composeBody({
      body: "Tiny robots.",
      hashtags: ["robots", "#launch", "ai", "extra"],
      linkUrl: "https://acme.test/launch",
      platform: "bluesky",
    });
    expect(out).toBe("Tiny robots.\n\nhttps://acme.test/launch\n\n#robots #launch #ai");
  });

  it("discord: hashtags are dropped entirely", () => {
    const out = composeBody({
      body: "Tiny robots.",
      hashtags: ["robots"],
      linkUrl: "https://acme.test/launch",
      platform: "discord",
    });
    expect(out).toBe("Tiny robots.\n\nhttps://acme.test/launch");
  });

  it("threads: a single inline topic tag", () => {
    const out = composeBody({
      body: "Tiny robots.",
      hashtags: ["robots", "launch"],
      linkUrl: "https://acme.test/launch",
      platform: "threads",
    });
    expect(out).toBe("Tiny robots.\n\nhttps://acme.test/launch #robots");
  });

  it("linkedin: hashtags before the link", () => {
    const out = composeBody({
      body: "Tiny robots.",
      hashtags: ["robots"],
      linkUrl: "https://acme.test/launch",
      platform: "linkedin",
    });
    expect(out).toBe("Tiny robots.\n\n#robots\n\nhttps://acme.test/launch");
  });

  it("instagram: keeps up to 12 tags in a trailing block", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const out = composeBody({ body: "Look", hashtags: tags, platform: "instagram" });
    expect((out.match(/#/g) ?? []).length).toBe(12);
  });

  it("normalises and de-duplicates hashtags", () => {
    const out = composeBody({ body: "x", hashtags: ["##robots", "robots", " launch "], platform: "bluesky" });
    expect(out).toBe("x\n\n#robots #launch");
  });

  it("never exceeds the platform limit", () => {
    for (const platform of ["bluesky", "threads", "instagram", "linkedin", "discord"] as const) {
      const out = composeBody({
        body: "word ".repeat(2000),
        hashtags: ["a", "b", "c"],
        linkUrl: "https://acme.test/launch",
        platform,
      });
      expect(countChars(out)).toBeLessThanOrEqual(PLATFORMS[platform].maxChars);
    }
  });
});

describe("splitThread", () => {
  it("returns a single unnumbered part when it fits", () => {
    expect(splitThread("short one", 300)).toEqual(["short one"]);
  });

  it("returns [] for empty input", () => {
    expect(splitThread("   ", 300)).toEqual([]);
  });

  it("splits into numbered parts that each fit", () => {
    const body = Array.from({ length: 30 }, (_, i) => `Sentence ${i} about tiny robots.`).join(" ");
    const parts = splitThread(body, 300);
    expect(parts.length).toBeGreaterThan(2);
    for (const [i, part] of parts.entries()) {
      expect(countChars(part)).toBeLessThanOrEqual(300);
      expect(part.endsWith(`(${i + 1}/${parts.length})`)).toBe(true);
    }
  });

  it("prefers paragraph breaks", () => {
    const body = `${"a".repeat(120)}\n\n${"b".repeat(120)}\n\n${"c".repeat(120)}`;
    const parts = splitThread(body, 150, { numbered: false });
    expect(parts[0]).toBe("a".repeat(120));
    expect(parts[1]).toBe("b".repeat(120));
  });

  it("does not lose content across the split", () => {
    const body = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const parts = splitThread(body, 40, { numbered: false });
    expect(parts.join(" ")).toBe(body);
  });

  it("caps the number of parts", () => {
    const parts = splitThread("word ".repeat(5000), 100, { maxParts: 3 });
    expect(parts).toHaveLength(3);
  });
});

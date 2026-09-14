import "../test-setup.js";

import { describe, expect, it } from "vitest";
import {
  assertPushableBranch,
  branchNameFor,
  buildPrBody,
  buildRemoteUrl,
  credentialArgs,
  hasChanges,
  parseRepoUrl,
  shortRecommendationId,
} from "./improve_app.js";

describe("improve_app pure helpers", () => {
  describe("parseRepoUrl", () => {
    it("parses a plain https github url", () => {
      expect(parseRepoUrl("https://github.com/acme/widget-app")).toEqual({
        owner: "acme",
        repo: "widget-app",
      });
    });

    it("strips a trailing .git and slash", () => {
      expect(parseRepoUrl("https://github.com/acme/widget-app.git/")).toEqual({
        owner: "acme",
        repo: "widget-app",
      });
    });

    it("parses the SSH form", () => {
      expect(parseRepoUrl("git@github.com:acme/widget-app.git")).toEqual({
        owner: "acme",
        repo: "widget-app",
      });
    });

    it("rejects a non-github host", () => {
      expect(() => parseRepoUrl("https://gitlab.com/acme/widget-app")).toThrow(/github\.com/);
    });

    it("rejects a URL missing an owner/repo path", () => {
      expect(() => parseRepoUrl("https://github.com/acme")).toThrow(/owner\/repo/);
    });

    it("rejects garbage input", () => {
      expect(() => parseRepoUrl("not a url")).toThrow();
    });
  });

  describe("buildRemoteUrl", () => {
    // The token must never reach the remote URL: `git clone` writes that URL into .git/config, in
    // the same directory the coding agent has Read and Bash access to.
    it("produces a remote with no credentials in it", () => {
      expect(buildRemoteUrl("https://github.com/acme/widget-app")).toBe(
        "https://github.com/acme/widget-app.git",
      );
    });

    it.each(["ghp_secret123", "x-access-token"])("never contains %s", (needle) => {
      expect(buildRemoteUrl("https://github.com/acme/widget-app")).not.toContain(needle);
    });
  });

  describe("credentialArgs", () => {
    it("passes the token as a per-invocation header, not repository config", () => {
      const args = credentialArgs("ghp_secret123");
      expect(args[0]).toBe("-c");
      expect(args[1]).toMatch(/^http\.extraHeader=Authorization: Basic /);
      const encoded = (args[1] as string).split("Basic ")[1] as string;
      expect(Buffer.from(encoded, "base64").toString()).toBe("x-access-token:ghp_secret123");
      // `-c` config is process-scoped; nothing here writes to .git/config.
      expect(args).not.toContain("--global");
    });
  });

  describe("shortRecommendationId / branchNameFor", () => {
    it("takes the first 8 hex chars with dashes stripped", () => {
      expect(shortRecommendationId("abcd1234-5678-90ab-cdef-1234567890ab")).toBe("abcd1234");
    });

    it("builds an adv/<short-id> branch name", () => {
      expect(branchNameFor("abcd1234-5678-90ab-cdef-1234567890ab")).toBe("adv/abcd1234");
    });
  });

  describe("assertPushableBranch", () => {
    it("allows a feature branch that differs from the default branch", () => {
      expect(() => assertPushableBranch("adv/abcd1234", "main")).not.toThrow();
    });

    it("throws when the branch IS the default branch (never push to default)", () => {
      expect(() => assertPushableBranch("main", "main")).toThrow(/default branch/);
    });
  });

  describe("hasChanges", () => {
    it("is false for empty porcelain output", () => {
      expect(hasChanges("")).toBe(false);
      expect(hasChanges("   \n")).toBe(false);
    });

    it("is true when there are modified files", () => {
      expect(hasChanges(" M src/index.ts\n")).toBe(true);
    });
  });

  describe("buildPrBody", () => {
    const base = {
      title: "Add empty-state to onboarding",
      detail: "New users see a blank screen before their first post.",
      recommendationId: "abcd1234-5678-90ab-cdef-1234567890ab",
    };

    it("includes the recommendation id, title and detail", () => {
      const body = buildPrBody(base);
      expect(body).toContain(base.recommendationId);
      expect(body).toContain(base.title);
      expect(body).toContain(base.detail);
    });

    it("includes evidence when present", () => {
      const body = buildPrBody({ ...base, evidence: "42% drop-off on the first screen" });
      expect(body).toContain("42% drop-off");
    });

    it("uses the agent's PR_BODY.md content when present", () => {
      const body = buildPrBody({ ...base, agentSummary: "Added a friendly empty-state component." });
      expect(body).toContain("Added a friendly empty-state component.");
    });

    it("falls back to a placeholder when the agent wrote no PR_BODY.md", () => {
      const body = buildPrBody(base);
      expect(body).toMatch(/did not write a `PR_BODY\.md`/);
    });
  });
});

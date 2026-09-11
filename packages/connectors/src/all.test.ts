import { PLATFORMS, type PlatformId } from "@adv/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_CONNECTORS,
  ASSISTED_CONNECTORS,
  registerAllConnectors,
  resolveConnector,
  WAVE_1_CONNECTORS,
  WAVE_2_CONNECTORS,
} from "./all.js";
import { getConnector, hasConnector, listConnectors } from "./registry.js";
import { makeAccount, makePost } from "./testing.js";

const WAVE_1_IDS: PlatformId[] = [
  "bluesky",
  "telegram",
  "discord",
  "facebook",
  "instagram",
  "threads",
  "linkedin",
];

const WAVE_2_IDS: PlatformId[] = ["x", "reddit", "tiktok", "youtube", "pinterest", "google_business"];

const ASSISTED_IDS: PlatformId[] = ["product_hunt", "hacker_news", "itch_io", "steam"];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registerAllConnectors", () => {
  it("registers every platform and is idempotent", () => {
    registerAllConnectors();
    registerAllConnectors();
    for (const id of [...WAVE_1_IDS, ...WAVE_2_IDS, ...ASSISTED_IDS]) {
      expect(hasConnector(id)).toBe(true);
      expect(getConnector(id).id).toBe(id);
    }
    expect(listConnectors()).toHaveLength(Object.keys(PLATFORMS).length);
  });

  it("covers exactly the platforms PLATFORMS declares, wave by wave", () => {
    const byWave = (wave: 1 | 2 | "assisted") =>
      Object.values(PLATFORMS)
        .filter((p) => p.wave === wave)
        .map((p) => p.id)
        .sort();
    expect(WAVE_1_CONNECTORS.map((c) => c.id).sort()).toEqual(byWave(1));
    expect(WAVE_2_CONNECTORS.map((c) => c.id).sort()).toEqual(byWave(2));
    expect(ASSISTED_CONNECTORS.map((c) => c.id).sort()).toEqual(byWave("assisted"));
  });
});

describe("resolveConnector", () => {
  it("returns the first-party connector by default", () => {
    registerAllConnectors();
    expect(resolveConnector("x").authKind).toBe("oauth");
    expect(resolveConnector("x", makeAccount("x")).authKind).toBe("oauth");
  });

  it("routes via Late only when the account asks for it and the key is set", () => {
    registerAllConnectors();
    const viaLate = makeAccount("x", { config: { via: "late", lateAccountId: "abc" } });
    vi.stubEnv("LATE_API_KEY", "");
    expect(resolveConnector("x", viaLate).authKind).toBe("oauth");
    vi.stubEnv("LATE_API_KEY", "sk_test");
    expect(resolveConnector("x", viaLate).authKind).toBe("token");
    // A platform Late cannot reach still uses the first-party connector.
    const assistedViaLate = makeAccount("steam", { config: { via: "late" } });
    expect(resolveConnector("steam", assistedViaLate).authKind).toBe("assisted");
  });
});

describe("every connector", () => {
  for (const connector of ALL_CONNECTORS) {
    describe(connector.id, () => {
      it("takes maxChars from PLATFORMS", () => {
        expect(connector.capabilities.maxChars).toBe(PLATFORMS[connector.id].maxChars);
      });

      it("declares a sane rate limit", () => {
        expect(connector.rateLimit.limit).toBeGreaterThan(0);
        expect(connector.rateLimit.windowMs).toBeGreaterThan(0);
      });

      it("implements the methods its authKind implies", () => {
        expect(typeof connector.publish).toBe("function");
        expect(typeof connector.verify).toBe("function");
        expect(typeof connector.fetchInsights).toBe("function");
        if (connector.authKind === "oauth") {
          expect(typeof connector.authUrl).toBe("function");
          expect(typeof connector.exchangeCode).toBe("function");
        } else {
          expect(typeof connector.connectWithInputs).toBe("function");
        }
      });

      it("agrees with PLATFORMS about whether it needs a review", () => {
        const meta = PLATFORMS[connector.id];
        // Anything gated behind an audit must say so, so the UI can warn.
        if (connector.capabilities.privateUntilReview) {
          expect(meta.worksWithoutReview).toBe(false);
        }
        // Assisted platforms have no API at all.
        if (connector.authKind === "assisted") {
          expect(connector.capabilities.manualPublish).toBe(true);
          expect(connector.capabilities.insights).toBe(false);
          expect(meta.wave).toBe("assisted");
        }
      });

      it("only prices posts where the platform actually charges", () => {
        if (connector.estimatedCostUsd) {
          const cost = connector.estimatedCostUsd(makePost(connector.id));
          expect(cost).toBeGreaterThan(0);
          expect(PLATFORMS[connector.id].costPerPostUsd).toBeGreaterThan(0);
        } else {
          expect(connector.capabilities.costPerPostUsd).toBeUndefined();
        }
      });

      it("returns well-formed wizard steps with and without a brand kit", () => {
        const ctx = {
          businessName: "Acme Robotics",
          websiteUrl: "https://acme.test",
          contactEmail: "hi@acme.test",
        };
        for (const steps of [connector.wizard(null, ctx), connector.wizard(null, { businessName: "X" })]) {
          expect(steps.length).toBeGreaterThanOrEqual(3);
          const kinds = steps.map((s) => s.kind);
          expect(kinds).toContain("verify");
          expect(kinds.includes("connect_oauth") || kinds.includes("connect_token")).toBe(true);

          for (const step of steps) {
            expect(step.title.length).toBeGreaterThan(3);
            expect(step.instructions.length).toBeGreaterThan(10);
            if (step.url) expect(() => new URL(step.url as string)).not.toThrow();
            for (const field of step.prefill ?? []) {
              expect(field.label.length).toBeGreaterThan(0);
              expect(field.value.length).toBeGreaterThan(0);
              expect(field.value).not.toContain("undefined");
              expect(field.value).not.toContain("null");
            }
            for (const input of step.inputs ?? []) {
              expect(input.name).toMatch(/^[a-zA-Z]+$/);
              expect(input.label.length).toBeGreaterThan(0);
            }
          }
        }
      });

      it("uses the brand kit when one is provided", () => {
        const brandKit = {
          tagline: "Desks that tidy themselves",
          handleSuggestions: ["tidybots", "tidybotshq", "gettidybots"],
          hashtags: ["#tidybots"],
          bios: { [connector.id]: { short: "We build tiny desk robots.", long: "A longer story." } },
        } as never;
        const steps = connector.wizard(brandKit, { businessName: "Acme Robotics" });
        const blob = JSON.stringify(steps);
        expect(blob).toMatch(/tidybots|Desks that tidy themselves|tiny desk robots/);
      });
    });
  }
});

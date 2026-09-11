import { PLATFORMS, type PlatformId } from "@adv/shared";
import { describe, expect, it } from "vitest";
import { registerAllConnectors, WAVE_1_CONNECTORS } from "./all.js";
import { getConnector, hasConnector, listConnectors } from "./registry.js";

const WAVE_1_IDS: PlatformId[] = [
  "bluesky",
  "telegram",
  "discord",
  "facebook",
  "instagram",
  "threads",
  "linkedin",
];

describe("registerAllConnectors", () => {
  it("registers every wave-1 platform and is idempotent", () => {
    registerAllConnectors();
    registerAllConnectors();
    for (const id of WAVE_1_IDS) {
      expect(hasConnector(id)).toBe(true);
      expect(getConnector(id).id).toBe(id);
    }
    expect(listConnectors()).toHaveLength(WAVE_1_IDS.length);
  });

  it("covers exactly the platforms PLATFORMS marks as wave 1", () => {
    const wave1FromMeta = Object.values(PLATFORMS)
      .filter((p) => p.wave === 1)
      .map((p) => p.id)
      .sort();
    expect(WAVE_1_CONNECTORS.map((c) => c.id).sort()).toEqual(wave1FromMeta);
  });
});

describe("every connector", () => {
  for (const connector of WAVE_1_CONNECTORS) {
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

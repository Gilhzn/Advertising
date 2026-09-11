import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BusinessCategory, PlatformId } from "@adv/shared";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/** Full playbook markdown for a platform ("" when missing). */
export function loadPlaybook(platform: PlatformId): string {
  return read(`platforms/${platform}.md`);
}
/** Category playbook: where to promote, launch sequence, KPIs. */
export function loadCategory(category: BusinessCategory): string {
  return read(`categories/${category}.md`);
}
/** Hard anti-spam rules quoted verbatim by compliance-guard. */
export function loadRules(): string {
  return read("rules/anti-spam.md");
}
/** Convenience: everything a strategist needs for one business. */
export function loadStrategyContext(category: BusinessCategory, platforms: PlatformId[]): string {
  return [loadRules(), loadCategory(category), ...platforms.map(loadPlaybook)]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

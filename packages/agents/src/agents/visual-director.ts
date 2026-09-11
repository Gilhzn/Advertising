import { isImageGenEnabled } from "@adv/media";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { MODEL_POLICY } from "../model-policy.js";
import { buildPrompt, PLATFORM_TABLE } from "./shared.js";

/**
 * Builds the visual-director prompt. `imageGenEnabled` mirrors `isImageGenEnabled()` (true only when
 * the optional `IMAGE_GEN_PROVIDER` plugin is configured) - it is a deploy-time setting, not a
 * per-business one, so the prompt stays stable (and cacheable) across every business on this
 * deployment. When disabled, `generate_image` is never mentioned: the tool does not exist in that
 * case (`buildEngineTools` only registers it when the provider is configured).
 */
export function buildVisualDirectorPrompt(imageGenEnabled: boolean): string {
  return buildPrompt({
    role: [
      "# Role: Visual director",
      "You decide which drafts get an image, which template/generator and aspect ratio each one uses, and what the image says. You do not rewrite copy.",
    ].join("\n"),
    reference: [
      PLATFORM_TABLE,
      [
        "## Templates and aspects",
        "- Templates (`render_image`): `announcement` (launch/update), `quote` (testimonial or punchy line), `feature` (one capability), `before_after` (transformation), `stat` (a single number), `plain_photo` (product/logo only).",
        "- Aspects: `1:1` (Instagram feed, Facebook, Discord), `4:5` (Instagram/Threads, best feed real estate), `16:9` (LinkedIn, Telegram, Bluesky, blog), `9:16` (Reels/Shorts/TikTok stills), `1.91:1` (link previews, Facebook link posts).",
        "- Default mapping: instagram 4:5, threads 4:5, facebook 1.91:1, linkedin 16:9, bluesky 16:9, telegram 16:9, discord 1:1, pinterest 4:5, product_hunt 16:9.",
      ].join("\n"),
      ...(imageGenEnabled
        ? [
            [
              "## Choosing render_image vs generate_image",
              "Two ways to get a post an image; only use one per post.",
              "- `render_image` (branded card, satori templates): text-heavy or data-driven visuals - a quote, a stat, a before/after, an announcement banner. Always use this when the image needs to show real copy, a number, or the product name as text.",
              "- `generate_image` (external AI image generation, only available because IMAGE_GEN_PROVIDER is configured): photographic/illustrative hero visuals with no on-image text - a scene, mood shot, or metaphor that supports the caption. Prefer it for the hero image of core-priority platforms when a template card would look generic.",
              "- `generate_image` prompt template you must follow: describe the subject and scene, then append fixed brand-consistency clauses built from the brand kit - the palette's mood in words (not hex codes), the visual style from the brand kit, and always end with: 'no text or lettering in the image, no logos or trademarks, no real or recognisable people.' Keep the prompt under 1000 characters.",
            ].join("\n"),
          ]
        : []),
    ],
    task: [
      "## Task",
      "1. Call `get_business` for the brand kit palette, visual style and languages.",
      "2. For each draft the supervisor gives you, check the platform's `supports.image` in the metadata above.",
      `   - \`false\` (hacker_news, youtube): do NOT call render_image${imageGenEnabled ? " or generate_image" : ""}. Say so and move on.`,
      "   - `true` but the platform is text-first (bluesky, telegram, discord, linkedin): add an image only when it genuinely adds information (a stat, a screenshot-style feature card).",
      "   - Instagram and Pinterest require media: every draft on those platforms gets an image.",
      imageGenEnabled
        ? "3. Pick the tool per the render_image vs generate_image guidance above, then the template (render_image only) or aspect from the mapping above."
        : "3. Pick the template from the post's pillar and angle, and the aspect from the mapping above.",
      "4. For `render_image`, write the on-image text yourself: `headline` (<= 8 words, the value not the feature name), optional `subheadline`, optional `cta`, `stat` only for the stat template. It must not contradict the post body and must not claim anything absent from the business description.",
      "5. Write `altText` for every image: what a screen-reader user needs, in the post's language, no hashtags. This is mandatory - an image without alt text is not acceptable.",
      "6. Hebrew posts render right-to-left; keep headlines short and avoid mixed-direction strings.",
      `7. If \`render_image\`${imageGenEnabled ? " or `generate_image`" : ""} fails, do not retry more than once. Report the failure and leave the post text-only.`,
    ].join("\n"),
    output: [
      "## Output contract",
      "- For each post that should have a branded card call `mcp__engine__render_image` with `{ postId, template, aspect, headline, subheadline?, body?, cta?, stat?, altText }`.",
      ...(imageGenEnabled
        ? [
            "- For each post that should have a generated hero visual instead, call `mcp__engine__generate_image` with `{ postId, prompt, aspect, altText }`.",
          ]
        : []),
      "- The tool returns a `MediaAsset` and attaches it to the post; you do not need to store anything else.",
      "- Finish with a list: postId, platform, tool used, template/aspect, or `skipped (<reason>)`.",
    ].join("\n"),
  });
}

/** Computed once at import time from the current environment; prefer `buildVisualDirectorPrompt` when you need it recomputed (e.g. tests toggling `IMAGE_GEN_PROVIDER`). */
export const VISUAL_DIRECTOR_PROMPT = buildVisualDirectorPrompt(isImageGenEnabled());

export function visualDirectorAgent(): AgentDefinition {
  const imageGenEnabled = isImageGenEnabled();
  return {
    description:
      "Chooses template + aspect ratio per platform and renders branded images for post drafts, with alt text. Skips platforms that do not support images.",
    prompt: buildVisualDirectorPrompt(imageGenEnabled),
    model: MODEL_POLICY.visualDirector.model,
    effort: MODEL_POLICY.visualDirector.effort,
    tools: [
      "mcp__engine__get_business",
      "mcp__engine__read_playbook",
      "mcp__engine__render_image",
      ...(imageGenEnabled ? (["mcp__engine__generate_image"] as const) : []),
    ],
  };
}

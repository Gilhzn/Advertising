import { type ComplianceResult, PLATFORMS, type PlatformId } from "@adv/shared";

export interface HardRuleInput {
  platform: PlatformId;
  title?: string | null;
  body: string;
  hashtags?: string[];
  /** business description + website copy: the only facts we are allowed to claim */
  evidenceText?: string;
  /** true when the target is a community we do not own (context for the model, not an issue by itself) */
  isCommunityTarget?: boolean;
}

export type Issue = ComplianceResult["issues"][number];

interface Pattern {
  rule: string;
  re: RegExp;
  severity: Issue["severity"];
  detail: string;
  /** when set, the match only counts if the matched phrase is absent from the evidence text */
  requiresEvidence?: boolean;
}

/**
 * Deterministic mirror of the NEVER rules in `packages/knowledge/rules/anti-spam.md`.
 * These are matched locally before (and independently of) the compliance-guard model call, so a
 * banned pattern can never reach a platform because a model was lenient, offline or out of budget.
 */
const PATTERNS: Pattern[] = [
  {
    rule: "no-vote-solicitation",
    re: /\b(upvote|up-vote|downvote|vote)\s+(us|me|this|it|our|my)\b|\bplease\s+upvote\b|\bupvote\s+if\b|\bsmash\s+(that\s+)?like\b|\bgive\s+us\s+(a\s+)?(star|upvote|like)\b/i,
    severity: "high",
    detail: "Soliciting votes, upvotes or likes is banned (anti-spam rules: never solicit upvotes/votes).",
  },
  {
    rule: "no-engagement-pods",
    re: /\bengagement\s+pod|\bfollow[\s-]?for[\s-]?follow\b|\bf4f\b|\blike\s?4\s?like\b/i,
    severity: "high",
    detail: "Engagement pods and follow-for-follow schemes are banned.",
  },
  {
    rule: "no-mass-dm",
    re: /\b(mass|bulk)\s+dm|\bdm(ing)?\s+every(one|body)\b|\bwe('| a)re\s+dming\s+all\b/i,
    severity: "high",
    detail: "Mass or bulk DMs are banned.",
  },
  {
    rule: "no-unsupported-claims",
    re: /\baward[-\s]?winning\b|\baward\s+winner\b|\bwinner\s+of\s+the\b|\bvoted\s+(the\s+)?best\b|\b#1\s+(app|game|tool|product|platform)\b|\bno\.?\s?1\s+(app|game|tool|product|platform)\b|\bofficial\s+partner\s+of\b/i,
    severity: "high",
    detail:
      "Award/superlative claim is not supported by the business description or website (never claim features, numbers, prices or awards that are not in the source material).",
    requiresEvidence: true,
  },
];

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

/** Runs the hard anti-spam rules. Returns [] when the text is clean. */
export function screenHardRules(input: HardRuleInput): Issue[] {
  const meta = PLATFORMS[input.platform];
  const hashtags = input.hashtags ?? [];
  const text = [input.title ?? "", input.body, hashtags.join(" ")].join("\n");
  const evidence = normalise(input.evidenceText ?? "");
  const issues: Issue[] = [];

  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (!m) continue;
    if (p.requiresEvidence && evidence.includes(normalise(m[0]))) continue;
    issues.push({ rule: p.rule, severity: p.severity, detail: `${p.detail} Matched: "${m[0]}".` });
  }

  if (input.platform === "hacker_news") {
    if (hashtags.length > 0 || /(^|\s)#\w+/.test(text)) {
      issues.push({
        rule: "hn-no-hashtags",
        severity: "high",
        detail: "Hacker News posts must never contain hashtags.",
      });
    }
    if (
      /\b(revolutionary|game[-\s]?chang(er|ing)|amazing|best[-\s]ever|unleash|supercharge|🚀)/i.test(
        input.title ?? "",
      )
    ) {
      issues.push({
        rule: "hn-no-marketing-tone",
        severity: "high",
        detail: "Show HN titles must be plain and factual, with no marketing tone.",
      });
    }
  }

  const length = (input.title ?? "").length + input.body.length + hashtags.join(" ").length;
  if (length > meta.maxChars) {
    issues.push({
      rule: "max-chars",
      severity: "high",
      detail: `Post is ${length} characters; ${meta.label} allows ${meta.maxChars}.`,
    });
  }

  return issues;
}

/** Verdict implied by a set of issues. */
export function verdictFor(issues: Issue[]): ComplianceResult["verdict"] {
  if (issues.some((i) => i.severity === "high")) return "block";
  if (issues.length > 0) return "fix";
  return "pass";
}

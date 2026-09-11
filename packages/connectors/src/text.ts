import { PLATFORMS, type PlatformId } from "@adv/shared";

const ELLIPSIS = "…";

let segmenter: Intl.Segmenter | undefined;
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((s) => s.segment);
  }
  /* c8 ignore next */
  return [...text];
}

/** Grapheme count - what Bluesky, X and Threads actually enforce. */
export function countChars(text: string): number {
  return graphemes(text).length;
}

function takeChars(text: string, max: number): string {
  if (max <= 0) return "";
  const g = graphemes(text);
  return g.length <= max ? text : g.slice(0, max).join("");
}

/** Trims back to the last whitespace so we never cut a word (or a URL) in half. */
function trimToWordBoundary(text: string): string {
  const idx = text.search(/\s\S*$/);
  if (idx <= 0) return text.trimEnd();
  return text.slice(0, idx).trimEnd();
}

export interface TruncateOptions {
  /** A URL that must survive truncation; it is re-appended after the ellipsis. */
  preserveUrl?: string | null;
}

/**
 * Truncates `body` to `maxChars` graphemes on a word boundary, adding an
 * ellipsis. When `preserveUrl` is given, room is reserved for it and it is
 * appended at the end, so a link post never loses its link.
 */
export function truncateForPlatform(body: string, maxChars: number, opts: TruncateOptions = {}): string {
  const url = opts.preserveUrl?.trim() || undefined;
  const text = body.trim();

  if (!url) {
    if (countChars(text) <= maxChars) return text;
    const cut = trimToWordBoundary(takeChars(text, Math.max(0, maxChars - 1)));
    return `${cut}${ELLIPSIS}`;
  }

  const urlLen = countChars(url);
  const alreadyHasUrl = text.includes(url);
  if (alreadyHasUrl) {
    if (countChars(text) <= maxChars) return text;
    // Re-flow: strip the url, truncate the prose, then re-append.
    const prose = text.replace(url, "").trim();
    const room = maxChars - urlLen - 2; // "\n\n"
    if (room <= 1) return takeChars(url, maxChars);
    const cut = trimToWordBoundary(takeChars(prose, room - 1));
    return `${cut}${ELLIPSIS}\n\n${url}`;
  }

  const room = maxChars - urlLen - 2;
  if (room <= 1) return takeChars(url, maxChars);
  if (countChars(text) <= room) return `${text}\n\n${url}`;
  const cut = trimToWordBoundary(takeChars(text, room - 1));
  return `${cut}${ELLIPSIS}\n\n${url}`;
}

/* ------------------------------------------------------------------ */
/* composeBody                                                         */
/* ------------------------------------------------------------------ */

export interface ComposeInput {
  body: string;
  hashtags?: string[];
  linkUrl?: string | null;
  platform: PlatformId;
  /** Overrides PLATFORMS[platform].maxChars (Telegram captions are 1024, not 4096). */
  maxChars?: number;
}

interface PlatformConvention {
  /** How many hashtags are idiomatic; 0 means "drop them". */
  maxHashtags: number;
  /** Where the link goes relative to the hashtag block. */
  linkPlacement: "before_hashtags" | "after_hashtags" | "none";
  /** Trailing block (own paragraph) vs. appended to the last line. */
  hashtagStyle: "trailing_block" | "inline";
}

/**
 * Per-platform copy conventions. Sources for the numbers are in each
 * connector's NOTES.md; the ones without an API rule are editorial defaults
 * agreed with the growth playbooks.
 */
export const PLATFORM_CONVENTIONS: Record<PlatformId, PlatformConvention> = {
  // Link is inline in the text and gets a facet; 2 tags is the Bluesky norm.
  bluesky: { maxHashtags: 3, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  // Telegram auto-links bare URLs; tags are used for channel search.
  telegram: { maxHashtags: 5, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  // Hashtags are inert on Discord - drop them; the URL unfurls.
  discord: { maxHashtags: 0, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  facebook: { maxHashtags: 3, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  // IG captions have no clickable links; the tag block is the convention.
  instagram: { maxHashtags: 12, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  // Threads surfaces a single topic tag per post.
  threads: { maxHashtags: 1, linkPlacement: "before_hashtags", hashtagStyle: "inline" },
  linkedin: { maxHashtags: 3, linkPlacement: "after_hashtags", hashtagStyle: "trailing_block" },
  x: { maxHashtags: 2, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  reddit: { maxHashtags: 0, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  tiktok: { maxHashtags: 5, linkPlacement: "none", hashtagStyle: "inline" },
  youtube: { maxHashtags: 3, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  pinterest: { maxHashtags: 3, linkPlacement: "none", hashtagStyle: "trailing_block" },
  google_business: { maxHashtags: 0, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  product_hunt: { maxHashtags: 0, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  hacker_news: { maxHashtags: 0, linkPlacement: "none", hashtagStyle: "trailing_block" },
  itch_io: { maxHashtags: 2, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
  steam: { maxHashtags: 0, linkPlacement: "before_hashtags", hashtagStyle: "trailing_block" },
};

function normalizeHashtag(tag: string): string {
  const bare = tag.trim().replace(/^#+/, "");
  return bare ? `#${bare}` : "";
}

/**
 * Assembles the final post body from the copywriter's pieces using the
 * platform's convention for hashtag placement and link position, then
 * truncates to the platform limit while keeping the link intact.
 */
export function composeBody(input: ComposeInput): string {
  const { platform } = input;
  const convention = PLATFORM_CONVENTIONS[platform];
  const maxChars = input.maxChars ?? PLATFORMS[platform].maxChars;

  const body = input.body.trim();
  const link = convention.linkPlacement === "none" ? undefined : input.linkUrl?.trim() || undefined;

  const tags = (input.hashtags ?? [])
    .map(normalizeHashtag)
    .filter(Boolean)
    .filter((tag, i, arr) => arr.indexOf(tag) === i)
    .slice(0, convention.maxHashtags);
  const tagBlock = tags.join(" ");

  const parts: string[] = [body];
  if (link && convention.linkPlacement === "before_hashtags") parts.push(link);
  if (tagBlock) {
    if (convention.hashtagStyle === "inline") {
      const last = parts.pop() ?? "";
      parts.push(`${last} ${tagBlock}`.trim());
    } else {
      parts.push(tagBlock);
    }
  }
  if (link && convention.linkPlacement === "after_hashtags") parts.push(link);

  const composed = parts.filter(Boolean).join("\n\n");
  return truncateForPlatform(composed, maxChars, { preserveUrl: link ?? null });
}

/* ------------------------------------------------------------------ */
/* splitThread                                                         */
/* ------------------------------------------------------------------ */

/**
 * Works on a pre-segmented grapheme array so the whole body is segmented once
 * rather than once per part (a 25k-char body would otherwise be quadratic).
 */
function splitOnce(body: string, room: number): string[] {
  const g = graphemes(body.trim());
  if (room <= 0) return [body.trim()];

  const parts: string[] = [];
  let i = 0;

  while (g.length - i > room) {
    const window = g.slice(i, i + room).join("");
    // Prefer a paragraph break, then a sentence end, then a word boundary.
    let cutAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cutAt < window.length * 0.4) {
      const sentence = window.search(/[^.!?]*$/);
      if (sentence > window.length * 0.4) cutAt = sentence - 1;
    }
    if (cutAt < window.length * 0.4) cutAt = window.lastIndexOf(" ");
    if (cutAt <= 0) cutAt = window.length;

    const head = window.slice(0, cutAt);
    parts.push(head.trim());
    // Advance by however many graphemes `head` consumed.
    i += countChars(head);
    while (i < g.length && (g[i] === " " || g[i] === "\n")) i += 1;
  }

  const tail = g.slice(i).join("").trim();
  if (tail) parts.push(tail);
  return parts.length ? parts : [""];
}

export interface SplitThreadOptions {
  /** Append " (1/3)" style counters. Default true when more than one part. */
  numbered?: boolean;
  /** Never produce more than this many posts; the tail is dropped with an ellipsis. */
  maxParts?: number;
}

/**
 * Splits a long body into a thread of posts that each fit `maxChars`,
 * breaking on paragraph > sentence > word boundaries and reserving room for
 * the "(n/m)" counter. Used for Bluesky (300) and X (280) threads.
 */
export function splitThread(body: string, maxChars: number, opts: SplitThreadOptions = {}): string[] {
  const { numbered = true, maxParts = 25 } = opts;
  const text = body.trim();
  if (!text) return [];
  if (countChars(text) <= maxChars) return [text];

  // Reserve room for the counter, iterating because the reservation changes the count.
  let room = maxChars;
  let parts = splitOnce(text, room);
  if (numbered) {
    for (let i = 0; i < 3; i++) {
      const suffixLen = ` (${parts.length}/${parts.length})`.length;
      const nextRoom = maxChars - suffixLen;
      if (nextRoom === room) break;
      room = nextRoom;
      const next = splitOnce(text, room);
      if (next.length === parts.length) {
        parts = next;
        break;
      }
      parts = next;
    }
  }

  if (parts.length > maxParts) {
    parts = parts.slice(0, maxParts);
    const last = parts[maxParts - 1] ?? "";
    parts[maxParts - 1] = truncateForPlatform(`${last}${ELLIPSIS}`, room);
  }

  if (!numbered || parts.length === 1) return parts;
  const total = parts.length;
  return parts.map((part, i) => `${part} (${i + 1}/${total})`);
}

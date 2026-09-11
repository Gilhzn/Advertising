import type { BrandKit } from "@adv/shared";
import { createAssistedConnector } from "../assisted.js";
import { taglineOf, type WizardContext } from "../brand.js";

/**
 * The Hacker News API (Firebase) is **read-only**: there is no submit endpoint.
 * We prepare the title and the Show HN text; the founder submits it.
 */
export const hackerNewsConnector = createAssistedConnector({
  platform: "hacker_news",
  signupUrl: "https://news.ycombinator.com/login",
  submitUrl: "https://news.ycombinator.com/submit",
  profileLabel: "Hacker News profile URL",
  profilePlaceholder: "https://news.ycombinator.com/user?id=yourhandle",
  createInstructions: [
    "Create an HN account and use it for a while before you submit anything. New accounts that only submit their own links are watched and rate-limited.",
    "Fill in the `about` field with one plain line about what you work on and a link. No marketing copy - HN punishes it immediately.",
  ],
  configureTitle: "Prepare the Show HN",
  configureInstructions: [
    "The title is the whole submission and it is capped at **80 characters**. Format: `Show HN: <plain description of what it does>`. No adjectives, no exclamation marks, no emoji - moderators rewrite titles that have them.",
    "The text box holds the story: what it does, why you built it, what is honestly not good yet, and what it costs. A couple of short paragraphs.",
    "Submit yourself, from your own account, and be at the keyboard for the next two hours to answer every comment - including the harsh ones, without defensiveness.",
  ],
  publishTitle: "How a Show HN gets published",
  publishInstructions: [
    "There is **no posting API** - the HN Firebase API is read-only.",
    "When the post comes up in the calendar we hand you the title and the text. You paste them at news.ycombinator.com/submit and then paste the item URL back so the calendar can link to it.",
    "If it gets no traction you may email hn@ycombinator.com **once**, politely, to ask about the second-chance pool. Do not resubmit.",
  ],
  caveat:
    "Never ask anyone to upvote, and never submit the same URL twice. Both are the fastest routes to a domain-level ban.",
  prefill: (brandKit: BrandKit | null, ctx: WizardContext) => [
    { label: "Show HN title (80 chars)", value: `Show HN: ${taglineOf(brandKit, ctx)}`.slice(0, 80) },
    ...(ctx.websiteUrl ? [{ label: "URL", value: ctx.websiteUrl }] : []),
  ],
});

export default hackerNewsConnector;

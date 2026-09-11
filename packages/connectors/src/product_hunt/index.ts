import type { BrandKit } from "@adv/shared";
import { createAssistedConnector } from "../assisted.js";
import { bioFor, taglineOf, type WizardContext } from "../brand.js";

/**
 * Product Hunt has a **read-only** GraphQL API: launches cannot be created
 * through it. The engine prepares every asset and the maker submits by hand.
 */
export const productHuntConnector = createAssistedConnector({
  platform: "product_hunt",
  signupUrl: "https://www.producthunt.com/",
  submitUrl: "https://www.producthunt.com/posts/new",
  profileLabel: "Product Hunt product URL",
  profilePlaceholder: "https://www.producthunt.com/products/acme-robotics",
  createInstructions: [
    "Create a Product Hunt account **weeks before** the launch and use it: upvote, comment, follow people in your space. A brand-new account launching a product reads as astroturf and gets throttled.",
    "Fill in your maker profile with a real photo, a bio and a link - the maker comment is the most-read text on launch day and people click through to you.",
  ],
  configureTitle: "Prepare the launch assets",
  configureInstructions: [
    "A launch needs: a **60-character tagline**, a 260-character description, 1-8 gallery images at **1270x760**, a 240x240 thumbnail, up to 3 topics, and a maker comment of 150-250 words.",
    "Schedule the launch in Product Hunt's own UI at least a week ahead. **Launch day starts at 00:01 Pacific** and runs 24 hours - everything else is planned around that.",
    "A product can only relaunch about every 6 months, and only with a substantive update. Do not burn the launch on a half-finished build.",
  ],
  publishTitle: "How a Product Hunt post gets published",
  publishInstructions: [
    "There is **no posting API**. When a Product Hunt post comes up in the calendar we hand you the tagline, description, topics, gallery images and the maker comment, ready to paste.",
    "You submit it at producthunt.com/posts/new (or schedule it there), then paste the live URL back into the post so the calendar links to it.",
    "Be present for the first few hours to answer comments - reply velocity is most of the ranking.",
  ],
  caveat:
    "Never ask for upvotes anywhere - Product Hunt detects vote solicitation and removes the launch. Ask for feedback instead.",
  prefill: (brandKit: BrandKit | null, ctx: WizardContext) => [
    { label: "Product name", value: ctx.businessName },
    { label: "Tagline (60 chars)", value: taglineOf(brandKit, ctx).slice(0, 60) },
    {
      label: "Description (260 chars)",
      value: bioFor(brandKit, "product_hunt", ctx).slice(0, 260),
      multiline: true,
    },
    ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
  ],
});

export default productHuntConnector;

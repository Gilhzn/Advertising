import type { BrandKit } from "@adv/shared";
import { createAssistedConnector } from "../assisted.js";
import { bioFor, taglineOf, type WizardContext } from "../brand.js";

/**
 * The Steamworks Web API does not expose announcement posting to third-party
 * apps. Everything here is prepared by the engine and published by the
 * developer from Steamworks.
 */
export const steamConnector = createAssistedConnector({
  platform: "steam",
  signupUrl: "https://partner.steamgames.com/",
  submitUrl: "https://partner.steamgames.com/",
  profileLabel: "Steam store page URL",
  profilePlaceholder: "https://store.steampowered.com/app/1234567/Tiny_Bots/",
  createInstructions: [
    "Register on Steamworks and pay the **$100 Steam Direct fee** per app (recoupable after $1,000 of adjusted gross revenue). Then complete the tax and banking paperwork - it gates release, and it takes longer than people expect.",
    "Build the store page: a **300-character short description** (this is what shows in search, the queue and every link embed), the full description in BBCode, at least 5 screenshots at 1920x1080, a trailer, and up to 20 tags.",
    "Set the page to **Coming Soon** as early as you can - wishlists accumulated before launch are the single best predictor of launch-day visibility.",
  ],
  configureTitle: "Plan Next Fest and the announcement cadence",
  configureInstructions: [
    "**Next Fest: one per game, ever.** Pick the edition deliberately. Eligibility: unreleased and staying unreleased until after the fest, a public store page, a **playable demo live before the fest begins**, and a Steamworks account in good standing.",
    "Registration closes roughly **7-8 weeks before** the event, and every asset has to be through review before it starts. Put those dates in the plan, not the week before.",
    "Announcements (events) are scheduled inside Steamworks itself. Use them for the demo going live, the Next Fest slot, the release date reveal and the launch.",
  ],
  publishTitle: "How a Steam announcement gets published",
  publishInstructions: [
    "There is **no posting API** for announcements: the Steamworks Web API does not expose them to third-party apps.",
    "When an announcement comes up in the calendar we hand you the title and the **BBCode** body plus any images. You paste it into Steamworks -> Community -> Events & Announcements, and schedule it there.",
    "Paste the announcement URL back into the post so the calendar links to it.",
  ],
  caveat:
    "Discount rules are strict: about 30 days between discounts and 30 days after release before the first one. Plan the launch discount before you commit to a date.",
  prefill: (brandKit: BrandKit | null, ctx: WizardContext) => [
    { label: "Game name", value: ctx.businessName },
    {
      label: "Short description (300 chars)",
      value: bioFor(brandKit, "steam", ctx).slice(0, 300),
      multiline: true,
    },
    { label: "Tagline", value: taglineOf(brandKit, ctx) },
    ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
  ],
});

export default steamConnector;

import type { BrandKit } from "@adv/shared";
import { createAssistedConnector } from "../assisted.js";
import { bioFor, taglineOf, type WizardContext } from "../brand.js";

/**
 * itch.io's API is read-only for page data and `butler` pushes **builds**, not
 * posts. Devlogs and forum posts are manual.
 */
export const itchIoConnector = createAssistedConnector({
  platform: "itch_io",
  signupUrl: "https://itch.io/register",
  submitUrl: "https://itch.io/dashboard",
  profileLabel: "itch.io project URL",
  profilePlaceholder: "https://acmerobotics.itch.io/tiny-bots",
  createInstructions: [
    "Register an itch.io account and create the project page. The page can stay in **Draft/Restricted** until you are ready - the URL works for sharing while it is hidden.",
    "The **short description (~120 characters)** is the most important text you will write here: it is what shows in lists, in search and in every link embed.",
    "Add a 630x500 cover image (an animated GIF works and stands out), at least three screenshots, and up to 10 tags from itch.io's vocabulary.",
  ],
  configureTitle: "Prepare the devlog",
  configureInstructions: [
    "Devlogs are the posting surface here. A good one is a real development note - what changed, what broke, a GIF of the new thing - not an announcement.",
    "Uploads go through the web uploader (1 GB per file) or `butler`, itch.io's CLI, which has no practical size cap and does delta updates.",
    "Post devlogs only in **Release Announcements** on the community boards; the other boards are for players, and self-promotion there gets removed.",
  ],
  publishTitle: "How an itch.io devlog gets published",
  publishInstructions: [
    "There is **no posting API** for devlogs or forum posts, and devlogs cannot be scheduled.",
    "When a devlog comes up in the calendar we hand you the title, the body (Markdown) and the images. You publish it from the project's dashboard and paste the devlog URL back.",
    "Post the build first, the devlog second - a devlog pointing at a build that is not live yet wastes the traffic spike.",
  ],
  caveat:
    "itch.io's community rules treat cross-board self-promotion as spam. One Release Announcement post per release, and reply to comments on your own page.",
  prefill: (brandKit: BrandKit | null, ctx: WizardContext) => [
    { label: "Project title", value: ctx.businessName },
    { label: "Short description (~120 chars)", value: taglineOf(brandKit, ctx).slice(0, 120) },
    { label: "Page description", value: bioFor(brandKit, "itch_io", ctx), multiline: true },
    ...(ctx.websiteUrl ? [{ label: "Website link", value: ctx.websiteUrl }] : []),
  ],
});

export default itchIoConnector;

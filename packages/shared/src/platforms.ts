/** Every platform the engine knows about. Wave 1 works day one; wave 2 needs app reviews or per-post cost. */
export const PLATFORM_IDS = [
  // wave 1 (no review needed for the business owner's own accounts)
  "bluesky",
  "telegram",
  "discord",
  "facebook",
  "instagram",
  "threads",
  "linkedin",
  // wave 2
  "x",
  "reddit",
  "tiktok",
  "youtube",
  "pinterest",
  "google_business",
  // assisted (no publishing API; we prepare the post and track the link)
  "product_hunt",
  "hacker_news",
  "itch_io",
  "steam",
] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export type PlatformWave = 1 | 2 | "assisted";

export interface PlatformMeta {
  id: PlatformId;
  label: string;
  wave: PlatformWave;
  /** Does publishing work for the owner's own account without an app review/audit? */
  worksWithoutReview: boolean;
  /** Human-readable caveat shown in the wizard */
  caveat?: string;
  maxChars: number;
  supports: {
    text: boolean;
    image: boolean;
    video: boolean;
    carousel: boolean;
    nativeSchedule: boolean;
    insights: boolean;
  };
  /** Typical per-post cost in USD (X pay-per-use) */
  costPerPostUsd?: number;
}

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    wave: 1,
    worksWithoutReview: true,
    maxChars: 300,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      nativeSchedule: false,
      insights: true,
    },
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    wave: 1,
    worksWithoutReview: true,
    maxChars: 4096,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: true,
      nativeSchedule: false,
      insights: false,
    },
  },
  discord: {
    id: "discord",
    label: "Discord",
    wave: 1,
    worksWithoutReview: true,
    maxChars: 2000,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      nativeSchedule: false,
      insights: false,
    },
  },
  facebook: {
    id: "facebook",
    label: "Facebook Page",
    wave: 1,
    worksWithoutReview: true,
    caveat:
      "Works in Meta app Development mode for accounts with a role on the app. Public third-party use needs App Review.",
    maxChars: 63206,
    supports: { text: true, image: true, video: true, carousel: true, nativeSchedule: true, insights: true },
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    wave: 1,
    worksWithoutReview: true,
    caveat: "Requires a Business/Creator account linked to a Facebook Page. 100 API posts per 24h.",
    maxChars: 2200,
    supports: {
      text: false,
      image: true,
      video: true,
      carousel: true,
      nativeSchedule: false,
      insights: true,
    },
  },
  threads: {
    id: "threads",
    label: "Threads",
    wave: 1,
    worksWithoutReview: true,
    maxChars: 500,
    supports: { text: true, image: true, video: true, carousel: true, nativeSchedule: false, insights: true },
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn (personal)",
    wave: 1,
    worksWithoutReview: true,
    caveat: "Personal profile posting is self-serve. Company Pages need the Community Management API review.",
    maxChars: 3000,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      nativeSchedule: false,
      insights: false,
    },
  },
  x: {
    id: "x",
    label: "X (Twitter)",
    wave: 2,
    worksWithoutReview: true,
    caveat: "Pay-per-use API: ~$0.015 per post, ~$0.20 if it contains a link.",
    maxChars: 280,
    costPerPostUsd: 0.015,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      nativeSchedule: false,
      insights: true,
    },
  },
  reddit: {
    id: "reddit",
    label: "Reddit",
    wave: 2,
    worksWithoutReview: false,
    caveat: "New API apps need manual approval. Community posts always require human approval (90/10 rule).",
    maxChars: 40000,
    supports: { text: true, image: true, video: true, carousel: true, nativeSchedule: false, insights: true },
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    wave: 2,
    worksWithoutReview: false,
    caveat: "Unaudited apps can only post as private (SELF_ONLY). Audit takes 2-4 weeks.",
    maxChars: 2200,
    supports: {
      text: false,
      image: true,
      video: true,
      carousel: true,
      nativeSchedule: false,
      insights: true,
    },
  },
  youtube: {
    id: "youtube",
    label: "YouTube Shorts",
    wave: 2,
    worksWithoutReview: false,
    caveat:
      "Uploads are private until the compliance audit passes (2-4 weeks). Upload quota: 100 videos/day per project since June 2026.",
    maxChars: 5000,
    supports: {
      text: false,
      image: false,
      video: true,
      carousel: false,
      nativeSchedule: true,
      insights: true,
    },
  },
  pinterest: {
    id: "pinterest",
    label: "Pinterest",
    wave: 2,
    worksWithoutReview: false,
    caveat: "Trial access is sandbox-only until review.",
    maxChars: 500,
    supports: {
      text: false,
      image: true,
      video: true,
      carousel: true,
      nativeSchedule: false,
      insights: true,
    },
  },
  google_business: {
    id: "google_business",
    label: "Google Business Profile",
    wave: 2,
    worksWithoutReview: false,
    caveat: "Project starts with zero quota until access is approved.",
    maxChars: 1500,
    supports: {
      text: true,
      image: true,
      video: false,
      carousel: false,
      nativeSchedule: false,
      insights: true,
    },
  },
  product_hunt: {
    id: "product_hunt",
    label: "Product Hunt",
    wave: "assisted",
    worksWithoutReview: true,
    caveat: "No posting API. We prepare the launch copy; you submit manually.",
    maxChars: 260,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: true,
      nativeSchedule: false,
      insights: false,
    },
  },
  hacker_news: {
    id: "hacker_news",
    label: "Hacker News (Show HN)",
    wave: "assisted",
    worksWithoutReview: true,
    caveat: "No posting API. Plain title, no marketing tone.",
    maxChars: 80,
    supports: {
      text: true,
      image: false,
      video: false,
      carousel: false,
      nativeSchedule: false,
      insights: false,
    },
  },
  itch_io: {
    id: "itch_io",
    label: "itch.io",
    wave: "assisted",
    worksWithoutReview: true,
    caveat: "Post only in Release Announcements.",
    maxChars: 10000,
    supports: {
      text: true,
      image: true,
      video: false,
      carousel: false,
      nativeSchedule: false,
      insights: false,
    },
  },
  steam: {
    id: "steam",
    label: "Steam",
    wave: "assisted",
    worksWithoutReview: true,
    caveat: "Steam page + Next Fest. Manual.",
    maxChars: 10000,
    supports: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      nativeSchedule: false,
      insights: false,
    },
  },
};

export const BUSINESS_CATEGORIES = ["game", "saas", "mobile_app", "local_business", "other"] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const CONTENT_LANGUAGES = ["en", "he"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

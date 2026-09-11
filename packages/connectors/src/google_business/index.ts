import type { BrandKit } from "@adv/shared";
import { logger } from "@adv/shared";
import { bioFor, longBioFor, taglineOf, type WizardContext } from "../brand.js";
import {
  type AuthorizeInput,
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type OAuthTokens,
  type PublishablePost,
  type PublishResult,
  type VerifyResult,
  type WizardStep,
} from "../connector.js";
import {
  googleAuthHeaders,
  googleAuthUrl,
  googleExchangeCode,
  googleHttp,
  googleRefresh,
  requireGoogleToken,
} from "../google/oauth.js";
import { fetchJson } from "../http.js";
import { composeBody, truncateForPlatform } from "../text.js";

const PLATFORM = "google_business" as const;
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
/** Local posts never moved off the legacy v4 surface. */
const V4_API = "https://mybusiness.googleapis.com/v4";
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";
const MAX_CHARS = 1500;

export const GOOGLE_BUSINESS_SCOPES = ["https://www.googleapis.com/auth/business.manage"];

/** What we ask `locations.list` for; `readMask` is mandatory on that call. */
const LOCATION_READ_MASK = "name,title,storefrontAddress,websiteUri,metadata";

/** Impressions are reported split by surface and device; we sum the four. */
const IMPRESSION_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
];

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface GbpAccount {
  name?: string;
  accountName?: string;
  type?: string;
  verificationState?: string;
}

interface GbpLocation {
  name?: string;
  title?: string;
  websiteUri?: string;
  metadata?: { mapsUri?: string; newReviewUri?: string; hasVoiceOfMerchant?: boolean };
}

interface LocalPost {
  name?: string;
  searchUrl?: string;
  state?: string;
  summary?: string;
  topicType?: string;
  createTime?: string;
}

interface DatedValue {
  date?: { year?: number; month?: number; day?: number };
  value?: string;
}

interface MultiDailyMetricsResponse {
  multiDailyMetricTimeSeries?: Array<{
    dailyMetricTimeSeries?: Array<{
      dailyMetric?: string;
      timeSeries?: { datedValues?: DatedValue[] };
    }>;
  }>;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function tokenOf(account: ConnectedAccount): string {
  return requireGoogleToken(PLATFORM, account.tokens?.accessToken);
}

/**
 * v4 local posts hang off `accounts/*&#47;locations/*`, but the v1 Business
 * Information API returns locations as bare `locations/{id}`. This re-joins them.
 */
export function localPostsParent(account: ConnectedAccount): string {
  const accountName = account.config?.accountName;
  const locationName = account.config?.locationName;
  if (typeof accountName !== "string" || !accountName || typeof locationName !== "string" || !locationName) {
    throw new ConnectorError(
      "Google Business account has no account/location selected; re-run the connect flow",
      PLATFORM,
      "not_configured",
      false,
    );
  }
  const location = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  return `${accountName}/${location}`;
}

function ymd(value: string | number | Date): { year: number; month: number; day: number } {
  const d = new Date(value);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function sumSeries(values: DatedValue[] | undefined): number {
  let total = 0;
  for (const point of values ?? []) {
    // "The value of the datapoint. This will not be present when the value is zero."
    const n = Number(point.value ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const googleBusinessConnector: Connector = {
  id: PLATFORM,
  authKind: "oauth",
  capabilities: {
    text: true,
    image: true,
    // The profile supports video; the Local Posts API does not accept it.
    video: false,
    carousel: false,
    nativeSchedule: false,
    insights: true,
    privateUntilReview: true,
    maxChars: MAX_CHARS,
    maxMedia: 1,
    imageAspects: ["4:3", "1:1"],
  },
  // An approved project gets ~300 QPM; the binding limit is per-location write
  // quota and the fact that a profile posting hourly looks like spam.
  rateLimit: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    return [
      {
        kind: "create_account",
        title: "Create and verify the Business Profile",
        url: "https://business.google.com/create",
        instructions: [
          "Create the Business Profile for the business and complete **verification** (postcard, phone or video, depending on the category). Nothing works before verification.",
          "Fill in the category, hours, service area, photos and the website link - the profile itself outranks any individual post.",
        ].join("\n\n"),
        prefill: [
          { label: "Business name", value: ctx.businessName },
          { label: "Description", value: longBioFor(brandKit, PLATFORM, ctx), multiline: true },
          { label: "Short description", value: bioFor(brandKit, PLATFORM, ctx), multiline: true },
          { label: "Tagline", value: taglineOf(brandKit, ctx) },
          ...(ctx.websiteUrl ? [{ label: "Website", value: ctx.websiteUrl }] : []),
        ],
      },
      {
        kind: "configure",
        title: "Request Google Business Profile API access",
        url: "https://developers.google.com/my-business/content/prereqs",
        instructions: [
          "In Google Cloud, enable the **My Business Account Management**, **My Business Business Information** and **My Business** (v4) APIs, then submit the **GBP API access request form**.",
          "**A new project starts at 0 QPM - literally zero quota** - until Google approves that request. Nothing can be published before then; the request wants a verified profile, a real website and a written use case.",
          "Approved projects show 300 QPM in the quota page. Until you see that, treat this channel as 'prepare + post manually'.",
        ].join("\n\n"),
        caveat:
          "This is the only wave-2 platform where nothing at all works before approval - not even a private post. Expect days to weeks.",
      },
      {
        kind: "connect_oauth",
        title: "Connect with Google",
        instructions: [
          "You will be sent to Google to approve the connection.",
          `Requested scope: ${GOOGLE_BUSINESS_SCOPES.join(", ")} - one scope that covers accounts, locations and posts.`,
          "We then list your accounts and locations and store the location this business posts to.",
        ].join("\n\n"),
      },
      {
        kind: "verify",
        title: "Verify the Google Business connection",
        instructions:
          "We read the location to confirm the token, the approved quota and which profile we will post to.",
      },
    ];
  },

  authUrl(input: AuthorizeInput): string {
    return googleAuthUrl(PLATFORM, input, GOOGLE_BUSINESS_SCOPES);
  },

  async exchangeCode(code: string, input: AuthorizeInput) {
    const tokens = await googleExchangeCode(PLATFORM, code, input);
    const accounts = await listAccounts(tokens.accessToken);
    const first = accounts[0];
    if (!first?.name) {
      throw new ConnectorError(
        "This Google account manages no Business Profile accounts. Create and verify a profile first.",
        PLATFORM,
        "not_configured",
        false,
      );
    }
    const locations = await listLocations(tokens.accessToken, first.name);
    const location = locations[0];

    return {
      tokens,
      account: {
        externalId: location?.name ?? first.name,
        handle: location?.title ?? first.accountName ?? null,
        config: {
          accountName: first.name,
          accountLabel: first.accountName ?? null,
          locationName: location?.name ?? null,
          locationTitle: location?.title ?? null,
          mapsUri: location?.metadata?.mapsUri ?? null,
          locations: locations.map((l) => ({ name: l.name, title: l.title })),
        },
      },
    };
  },

  async refresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    return googleRefresh(PLATFORM, tokens);
  },

  async verify(account: ConnectedAccount): Promise<VerifyResult> {
    try {
      const locationName = account.config?.locationName as string | undefined;
      if (!locationName) {
        return { ok: false, error: "No Business Profile location is selected for this account" };
      }
      const { data } = await fetchJson<GbpLocation>(
        `${INFO_API}/${locationName}?readMask=${encodeURIComponent("name,title,websiteUri,metadata")}`,
        { headers: googleAuthHeaders(tokenOf(account)) },
        googleHttp(PLATFORM),
      );
      return {
        ok: true,
        handle: data.title,
        displayName: data.title,
        profileUrl: data.metadata?.mapsUri ?? undefined,
        ...(data.metadata?.hasVoiceOfMerchant === false
          ? {
              warning:
                "Google reports this profile does not currently have 'Voice of Merchant' status, so posts may not appear publicly. Complete verification in the Business Profile UI.",
            }
          : {}),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      return { externalId: post.externalId, url: (account.config?.mapsUri as string) || undefined };
    }

    const token = tokenOf(account);
    const parent = localPostsParent(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    // Google truncates the card at ~250-300 chars before "Read more", so the
    // copy is front-loaded upstream; 1,500 is the hard API limit.
    const summary = truncateForPlatform(
      composeBody({ body: post.body, hashtags: post.hashtags, linkUrl: null, platform: PLATFORM }),
      MAX_CHARS,
    );

    const body: Record<string, unknown> = {
      languageCode: post.language,
      summary,
      topicType: "STANDARD",
    };
    if (post.linkUrl) {
      body.callToAction = {
        actionType: (account.config?.actionType as string | undefined) ?? "LEARN_MORE",
        url: post.linkUrl,
      };
    }
    const image = post.media.find((m) => m.kind === "image");
    if (image) {
      body.media = [{ mediaFormat: "PHOTO", sourceUrl: image.url }];
    }

    const { data } = await fetchJson<LocalPost>(
      `${V4_API}/${parent}/localPosts`,
      {
        method: "POST",
        headers: { ...googleAuthHeaders(token), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      googleHttp(PLATFORM, context),
    );

    const name = data.name;
    if (!name) {
      throw new ConnectorError(
        "Google Business accepted the post but returned no local post name",
        PLATFORM,
        "unknown",
        false,
      );
    }

    logger.info(
      { ...context, platform: PLATFORM, externalId: name, state: data.state },
      "connector.gbp.published",
    );
    return {
      externalId: name,
      url: data.searchUrl ?? (account.config?.mapsUri as string) ?? undefined,
      visibility: data.state === "LIVE" || data.state === undefined ? "public" : "private",
      raw: { state: data.state, topicType: body.topicType },
    };
  },

  /**
   * Post-level insights are gone: v4 `localPosts.reportInsights` is part of the
   * deprecated v4 surface and has no discovery document any more. The supported
   * replacement is the **Business Profile Performance API**, which reports at
   * the location level, so `fetchInsights` returns location metrics and no
   * `externalPostId`. See NOTES.md.
   */
  async fetchInsights(account: ConnectedAccount, since: string): Promise<MetricSnapshotInput[]> {
    const locationName = account.config?.locationName as string | undefined;
    if (!locationName) return [];

    const token = tokenOf(account);
    const capturedAt = new Date().toISOString();
    const start = ymd(Number.isFinite(Date.parse(since)) ? since : Date.now() - 30 * 86_400_000);
    const end = ymd(Date.now());

    const params = new URLSearchParams();
    for (const metric of [...IMPRESSION_METRICS, "WEBSITE_CLICKS", "CALL_CLICKS"]) {
      params.append("dailyMetrics", metric);
    }
    params.set("dailyRange.startDate.year", String(start.year));
    params.set("dailyRange.startDate.month", String(start.month));
    params.set("dailyRange.startDate.day", String(start.day));
    params.set("dailyRange.endDate.year", String(end.year));
    params.set("dailyRange.endDate.month", String(end.month));
    params.set("dailyRange.endDate.day", String(end.day));

    const { data } = await fetchJson<MultiDailyMetricsResponse>(
      `${PERFORMANCE_API}/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`,
      { headers: googleAuthHeaders(token) },
      { ...googleHttp(PLATFORM), retries: 1 },
    );

    let impressions = 0;
    let clicks = 0;
    let sawImpressions = false;
    let sawClicks = false;

    for (const multi of data.multiDailyMetricTimeSeries ?? []) {
      for (const series of multi.dailyMetricTimeSeries ?? []) {
        const total = sumSeries(series.timeSeries?.datedValues);
        if (series.dailyMetric && IMPRESSION_METRICS.includes(series.dailyMetric)) {
          impressions += total;
          sawImpressions = true;
        } else if (series.dailyMetric === "WEBSITE_CLICKS" || series.dailyMetric === "CALL_CLICKS") {
          clicks += total;
          sawClicks = true;
        }
      }
    }

    const out: MetricSnapshotInput[] = [];
    if (sawImpressions) out.push({ metric: "impressions", value: impressions, capturedAt });
    if (sawClicks) out.push({ metric: "clicks", value: clicks, capturedAt });
    return out;
  },
};

async function listAccounts(token: string): Promise<GbpAccount[]> {
  const { data } = await fetchJson<{ accounts?: GbpAccount[] }>(
    `${ACCOUNTS_API}/accounts?pageSize=20`,
    { headers: googleAuthHeaders(token) },
    googleHttp(PLATFORM),
  );
  return data.accounts ?? [];
}

async function listLocations(token: string, accountName: string): Promise<GbpLocation[]> {
  const { data } = await fetchJson<{ locations?: GbpLocation[] }>(
    `${INFO_API}/${accountName}/locations?pageSize=100&readMask=${encodeURIComponent(LOCATION_READ_MASK)}`,
    { headers: googleAuthHeaders(token) },
    googleHttp(PLATFORM),
  );
  return data.locations ?? [];
}

export default googleBusinessConnector;

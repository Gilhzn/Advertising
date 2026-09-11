import type { BrandKit, MetricName, PlatformId } from "@adv/shared";

/** A connected account row as the connector sees it (decrypted tokens, config). */
export interface ConnectedAccount {
  id: string;
  businessId: string;
  platform: PlatformId;
  ownership: "owned" | "community";
  externalId?: string | null;
  handle?: string | null;
  /** connector-specific: pageId, igUserId, channelId, webhookUrl, guildId, privacyLevel... */
  config: Record<string, unknown>;
  tokens?: OAuthTokens | null;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scopes?: string[];
  /** ISO timestamp */
  expiresAt?: string;
}

export interface PublishablePost {
  id: string;
  platform: PlatformId;
  language: string;
  title?: string | null;
  body: string;
  hashtags: string[];
  linkUrl?: string | null;
  media: Array<{
    kind: "image" | "video";
    url: string;
    altText?: string;
    mimeType?: string;
    width?: number;
    height?: number;
  }>;
  /** already published? connectors must not re-post */
  externalId?: string | null;
  /** community target (subreddit name, channel id...) when ownership is community */
  communityRef?: string | null;
}

export interface PublishResult {
  externalId: string;
  url?: string;
  /** e.g. TikTok/YouTube before audit */
  visibility?: "public" | "private";
  raw?: unknown;
}

export interface MetricSnapshotInput {
  metric: MetricName;
  value: number;
  capturedAt: string;
  /** set when the metric belongs to a post rather than the account */
  externalPostId?: string;
}

export type WizardStepKind =
  | "create_account"
  | "configure"
  | "connect_oauth"
  | "connect_token"
  | "verify"
  | "info";

export interface WizardStep {
  kind: WizardStepKind;
  title: string;
  /** markdown; may include {{brand.tagline}} style placeholders already resolved */
  instructions: string;
  /** deep link to open (signup page, settings page, bot invite...) */
  url?: string;
  /** values the user copies into the platform's form */
  prefill?: Array<{ label: string; value: string; multiline?: boolean }>;
  /** for connect_token: fields we ask the user to paste */
  inputs?: Array<{ name: string; label: string; secret?: boolean; placeholder?: string; help?: string }>;
  /** shown as a warning box */
  caveat?: string;
}

export interface RateLimit {
  /** max operations per window */
  limit: number;
  /** window length in ms */
  windowMs: number;
}

export interface ConnectorCapabilities {
  text: boolean;
  image: boolean;
  video: boolean;
  carousel: boolean;
  nativeSchedule: boolean;
  insights: boolean;
  /** posts are forced private until an app review/audit passes */
  privateUntilReview?: boolean;
  maxChars: number;
  maxMedia: number;
  /** aspect ratios accepted for images, e.g. ["1:1","4:5","16:9","9:16"] */
  imageAspects: string[];
}

export interface AuthorizeInput {
  businessId: string;
  redirectUri: string;
  state: string;
  codeVerifier?: string;
}

export interface Connector {
  readonly id: PlatformId;
  readonly capabilities: ConnectorCapabilities;
  /** "oauth" = standard redirect flow; "token" = user pastes a token/webhook/app password; "assisted" = no API, manual publish */
  readonly authKind: "oauth" | "token" | "assisted";
  readonly rateLimit: RateLimit;

  /** Steps shown by the onboarding wizard for this platform. */
  wizard(
    brandKit: BrandKit | null,
    ctx: { businessName: string; websiteUrl?: string | null; contactEmail?: string | null },
  ): WizardStep[];

  /** OAuth only */
  authUrl?(input: AuthorizeInput): string;
  exchangeCode?(
    code: string,
    input: AuthorizeInput,
  ): Promise<{ tokens: OAuthTokens; account: Partial<ConnectedAccount> }>;
  refresh?(tokens: OAuthTokens): Promise<OAuthTokens>;

  /** Token/webhook flows: validate pasted inputs and return the account identity + config to store. */
  connectWithInputs?(
    inputs: Record<string, string>,
  ): Promise<{ tokens?: OAuthTokens; account: Partial<ConnectedAccount> }>;

  /** Confirms the connection still works; returns fresh identity info. */
  verify(
    account: ConnectedAccount,
  ): Promise<{ ok: boolean; handle?: string; displayName?: string; profileUrl?: string; error?: string }>;

  publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult>;

  /** Account-level and post-level metrics since `since` (ISO). May return [] when unsupported. */
  fetchInsights(
    account: ConnectedAccount,
    since: string,
    posts: Array<{ id: string; externalId: string }>,
  ): Promise<MetricSnapshotInput[]>;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly platform: PlatformId,
    public readonly code:
      | "auth_expired"
      | "rate_limited"
      | "invalid_media"
      | "rejected"
      | "not_configured"
      | "network"
      | "unknown",
    public readonly retryable = false,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

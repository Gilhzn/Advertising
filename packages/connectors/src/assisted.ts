import { type BrandKit, logger, PLATFORMS, type PlatformId } from "@adv/shared";
import type { WizardContext } from "./brand.js";
import {
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type PublishablePost,
  type PublishResult,
  type RateLimit,
  type VerifyResult,
  type WizardStep,
} from "./connector.js";
import { safeHttpUrl } from "./net-guard.js";

/**
 * Assisted platforms have **no posting API at all** (Product Hunt, Hacker News,
 * itch.io, Steam). The engine still plans, writes, schedules and tracks the
 * post; at publish time it marks the copy as *prepared* and a human pastes it.
 *
 * The contract with the worker:
 *   - `capabilities.manualPublish === true` - show "prepared for manual posting"
 *     instead of "published", and surface the copy + assets to the user.
 *   - `publish()` performs **no network calls** and returns
 *     `externalId = "manual:<post id>"`, no `url`, `visibility: "public"`.
 *   - `fetchInsights()` returns `[]` - there is nothing to read back. If the
 *     user later pastes the live URL we store it on the account config; metrics
 *     stay manual.
 */
export const MANUAL_EXTERNAL_ID_PREFIX = "manual:";

export function manualExternalId(postId: string): string {
  return `${MANUAL_EXTERNAL_ID_PREFIX}${postId}`;
}

export function isManualExternalId(externalId: string | null | undefined): boolean {
  return typeof externalId === "string" && externalId.startsWith(MANUAL_EXTERNAL_ID_PREFIX);
}

export interface AssistedConnectorSpec {
  platform: PlatformId;
  /** Where the user creates/holds the account. */
  signupUrl: string;
  /** Where they actually publish (the submit form, the dashboard...). */
  submitUrl: string;
  /** Label for the profile/page URL we ask them to paste. */
  profileLabel: string;
  profilePlaceholder: string;
  /** Steps 1..n of the manual flow, in markdown. */
  createInstructions: string[];
  configureTitle: string;
  configureInstructions: string[];
  /** The manual-publish explainer (kind: "info"). */
  publishTitle: string;
  publishInstructions: string[];
  caveat: string;
  /** Extra copy fields we can prefill from the brand kit. */
  prefill?: (
    brandKit: BrandKit | null,
    ctx: WizardContext,
  ) => Array<{ label: string; value: string; multiline?: boolean }>;
  capabilities?: Partial<Connector["capabilities"]>;
  rateLimit?: RateLimit;
}

/** One publish attempt per day: these are launches, not a posting cadence. */
const DEFAULT_ASSISTED_RATE_LIMIT: RateLimit = { limit: 5, windowMs: 24 * 60 * 60 * 1000 };

export function createAssistedConnector(spec: AssistedConnectorSpec): Connector {
  const meta = PLATFORMS[spec.platform];
  const supports = meta.supports;

  return {
    id: spec.platform,
    authKind: "assisted",
    capabilities: {
      text: supports.text,
      image: supports.image,
      video: supports.video,
      carousel: supports.carousel,
      nativeSchedule: false,
      insights: false,
      manualPublish: true,
      maxChars: meta.maxChars,
      maxMedia: supports.carousel ? 8 : supports.image ? 1 : 0,
      imageAspects: ["16:9", "1:1"],
      ...spec.capabilities,
    },
    rateLimit: spec.rateLimit ?? DEFAULT_ASSISTED_RATE_LIMIT,

    wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
      const prefill = spec.prefill?.(brandKit, ctx) ?? [{ label: "Name", value: ctx.businessName }];
      return [
        {
          kind: "create_account",
          title: `Create your ${meta.label} presence`,
          url: spec.signupUrl,
          instructions: spec.createInstructions.join("\n\n"),
          prefill,
        },
        {
          kind: "configure",
          title: spec.configureTitle,
          url: spec.submitUrl,
          instructions: spec.configureInstructions.join("\n\n"),
          caveat: spec.caveat,
        },
        {
          kind: "connect_token",
          title: `Link your ${meta.label} page`,
          instructions: [
            `${meta.label} has **no posting API**, so there is nothing to authorise. Paste the URL of your page so we can link every prepared post to it and track it in the calendar.`,
            "You can change it later in settings.",
          ].join("\n\n"),
          inputs: [
            {
              name: "profileUrl",
              label: spec.profileLabel,
              placeholder: spec.profilePlaceholder,
              help: "Optional - leave empty if the page does not exist yet.",
            },
          ],
        },
        {
          kind: "info",
          title: spec.publishTitle,
          url: spec.submitUrl,
          instructions: spec.publishInstructions.join("\n\n"),
          caveat: spec.caveat,
        },
        {
          kind: "verify",
          title: `Confirm the ${meta.label} setup`,
          instructions: `Nothing to call - ${meta.label} has no API. We record the page URL and mark the channel ready so scheduled posts show up in your calendar as "prepared for manual posting".`,
        },
      ];
    },

    /** Stores the profile/page URL the user pastes. No network call. */
    async connectWithInputs(inputs: Record<string, string>) {
      const raw = (inputs.profileUrl ?? "").trim();
      if (raw) {
        // `new URL()` alone parses `javascript:alert(1)` quite happily, and this value is stored as
        // `config.profileUrl` and rendered as an href, so the scheme is the check that matters.
        if (!safeHttpUrl(raw)) {
          throw new ConnectorError(
            `"${raw}" is not a valid URL. Paste the full address including https://`,
            spec.platform,
            "not_configured",
            false,
          );
        }
      }
      return {
        account: {
          externalId: raw || null,
          handle: raw ? (new URL(raw).pathname.split("/").filter(Boolean).pop() ?? null) : null,
          config: { profileUrl: raw || null, manual: true },
        },
      };
    },

    async verify(account: ConnectedAccount): Promise<VerifyResult> {
      const profileUrl = (account.config?.profileUrl as string | undefined) ?? undefined;
      return {
        ok: true,
        handle: account.handle ?? undefined,
        displayName: meta.label,
        profileUrl,
        warning: `${meta.label} has no posting API. Scheduled posts are prepared for you and you publish them by hand.`,
      };
    },

    async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
      const externalId = post.externalId ?? manualExternalId(post.id);
      logger.info(
        { businessId: account.businessId, accountId: account.id, postId: post.id, platform: spec.platform },
        "connector.assisted.prepared",
      );
      return {
        externalId,
        // No URL: the post does not exist anywhere yet. The worker shows the
        // submit link from the wizard instead.
        visibility: "public",
        raw: { manual: true, submitUrl: spec.submitUrl },
      };
    },

    async fetchInsights(): Promise<MetricSnapshotInput[]> {
      return [];
    },
  };
}

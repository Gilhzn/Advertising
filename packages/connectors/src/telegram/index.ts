import type { BrandKit } from "@adv/shared";
import { bioFor, primaryHandle, taglineOf, type WizardContext } from "../brand.js";
import {
  type ConnectedAccount,
  type Connector,
  ConnectorError,
  type MetricSnapshotInput,
  type PublishablePost,
  type PublishResult,
  type WizardStep,
} from "../connector.js";
import { fetchJson } from "../http.js";
import { requireEnv } from "../oauth.js";
import { composeBody } from "../text.js";

const PLATFORM = "telegram" as const;
const API_BASE = "https://api.telegram.org";
const MAX_TEXT = 4096;
const MAX_CAPTION = 1024;
const MAX_MEDIA_GROUP = 10;

/* ------------------------------------------------------------------ */
/* wire types                                                          */
/* ------------------------------------------------------------------ */

interface TgResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  invite_link?: string;
  description?: string;
}

interface TgMessage {
  message_id: number;
  chat: TgChat;
  date: number;
}

interface TgChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TgUser;
  can_post_messages?: boolean;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function botToken(): string {
  return requireEnv("TELEGRAM_BOT_TOKEN", PLATFORM);
}

function methodUrl(method: string): string {
  return `${API_BASE}/bot${botToken()}/${method}`;
}

/** HTML parse mode: only `<`, `>` and `&` are special; everything else is literal. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram reports failures as `{ ok:false, error_code, description, parameters }`. */
function mapTelegramError(status: number, body: unknown): ConnectorError | undefined {
  const b = (body ?? {}) as TgResponse<unknown>;
  const description = b.description ?? `HTTP ${status}`;
  const retryAfterMs = b.parameters?.retry_after !== undefined ? b.parameters.retry_after * 1000 : undefined;
  const lower = description.toLowerCase();

  if (status === 429 || lower.includes("too many requests")) {
    return new ConnectorError(`Telegram: ${description}`, PLATFORM, "rate_limited", true, retryAfterMs);
  }
  if (status === 401 || lower.includes("unauthorized")) {
    return new ConnectorError(`Telegram bot token rejected: ${description}`, PLATFORM, "auth_expired", false);
  }
  if (lower.includes("chat not found") || lower.includes("chat_id is empty")) {
    return new ConnectorError(
      `Telegram channel not found: ${description}. Check the @username and that the bot was added.`,
      PLATFORM,
      "not_configured",
      false,
    );
  }
  if (
    lower.includes("not enough rights") ||
    lower.includes("need administrator rights") ||
    lower.includes("bot was kicked") ||
    lower.includes("bot is not a member") ||
    lower.includes("forbidden")
  ) {
    return new ConnectorError(
      `Telegram rejected the post: ${description}. The bot must be an admin with "Post messages".`,
      PLATFORM,
      "rejected",
      false,
    );
  }
  if (lower.includes("wrong file identifier") || lower.includes("failed to get http url content")) {
    return new ConnectorError(
      `Telegram could not fetch the media: ${description}`,
      PLATFORM,
      "invalid_media",
      false,
    );
  }
  return undefined;
}

function checkOk(body: unknown, status: number): ConnectorError | undefined {
  const b = (body ?? {}) as TgResponse<unknown>;
  if (b.ok === false)
    return (
      mapTelegramError(status, body) ??
      new ConnectorError(`Telegram: ${b.description ?? "unknown error"}`, PLATFORM, "unknown", false)
    );
  return undefined;
}

async function call<T>(
  method: string,
  payload: Record<string, unknown>,
  context: Record<string, unknown> = {},
): Promise<T> {
  const { data } = await fetchJson<TgResponse<T>>(
    methodUrl(method),
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    },
    {
      platform: PLATFORM,
      context: { ...context, telegramMethod: method },
      retryAfterFrom: (body) => (body as TgResponse<unknown>)?.parameters?.retry_after,
      mapError: mapTelegramError,
      checkBody: checkOk,
    },
  );
  if (data.result === undefined) {
    throw new ConnectorError(`Telegram ${method} returned no result`, PLATFORM, "unknown", false);
  }
  return data.result;
}

/** Accepts `@channel`, `channel`, `https://t.me/channel` or a numeric `-100…` id. */
export function normalizeChannel(input: string): string {
  const raw = input.trim();
  if (/^-?\d+$/.test(raw)) return raw;
  const fromUrl = raw.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/);
  const name = fromUrl?.[1] ?? raw.replace(/^@/, "");
  return `@${name}`;
}

function chatIdOf(account: ConnectedAccount): string | number {
  const id = account.config?.chatId ?? account.externalId;
  if (id === undefined || id === null || id === "") {
    throw new ConnectorError("Telegram account has no chat id", PLATFORM, "not_configured", false);
  }
  return id as string | number;
}

function messageUrl(account: ConnectedAccount, messageId: number): string | undefined {
  const username = account.config?.username;
  if (typeof username === "string" && username) return `https://t.me/${username}/${messageId}`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* connector                                                           */
/* ------------------------------------------------------------------ */

export const telegramConnector: Connector = {
  id: PLATFORM,
  authKind: "token",
  capabilities: {
    text: true,
    image: true,
    video: true,
    carousel: true,
    nativeSchedule: false,
    insights: false,
    maxChars: MAX_TEXT,
    maxMedia: MAX_MEDIA_GROUP,
    imageAspects: ["1:1", "4:5", "16:9", "9:16"],
  },
  // Telegram documents ~20 messages/minute to the same group or channel.
  rateLimit: { limit: 20, windowMs: 60_000 },

  wizard(brandKit: BrandKit | null, ctx: WizardContext): WizardStep[] {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "your_advertising_bot";
    const handle = primaryHandle(brandKit, ctx);
    const bio = bioFor(brandKit, PLATFORM, ctx);
    return [
      {
        kind: "create_account",
        title: "Create a Telegram channel",
        url: "https://t.me",
        instructions: [
          "In Telegram: menu -> New Channel.",
          "Name it after the business, make it **Public**, and set a permanent link (@username).",
          "A public channel is required so posts have shareable `t.me/<name>/<id>` links.",
        ].join("\n\n"),
        prefill: [
          { label: "Channel name", value: ctx.businessName },
          { label: "Public link (@username)", value: handle },
          { label: "Description", value: bio, multiline: true },
        ],
      },
      {
        kind: "configure",
        title: `Add @${botUsername} as an admin`,
        instructions: [
          `Open the channel -> Administrators -> Add Admin -> search for \`@${botUsername}\`.`,
          "Grant at least **Post Messages**. Everything else can stay off.",
          "We publish through our own bot, so you never hand over an account password.",
        ].join("\n\n"),
        prefill: [
          { label: "Bot to add", value: `@${botUsername}` },
          { label: "Required permission", value: "Post Messages" },
        ],
        caveat: "Without the “Post messages” right the connection check will fail.",
      },
      {
        kind: "connect_token",
        title: "Connect the channel",
        instructions: `Paste the channel's public link. We call getChat + getChatMember to confirm @${botUsername} can post.`,
        inputs: [
          {
            name: "channel",
            label: "Channel",
            placeholder: `@${handle}`,
            help: "@username, t.me link, or the numeric -100… id for private channels",
          },
        ],
      },
      {
        kind: "verify",
        title: "Verify the connection",
        instructions: `We confirm the bot is an administrator with post rights. Tagline for the channel description: “${taglineOf(brandKit, ctx)}”.`,
      },
    ];
  },

  async connectWithInputs(inputs: Record<string, string>) {
    const raw = inputs.channel ?? inputs.chatId ?? "";
    if (!raw.trim()) {
      throw new ConnectorError("A channel @username or id is required", PLATFORM, "not_configured", false);
    }
    const chatId = normalizeChannel(raw);

    const chat = await call<TgChat>("getChat", { chat_id: chatId });
    const me = await call<TgUser>("getMe", {});
    const member = await call<TgChatMember>("getChatMember", { chat_id: chat.id, user_id: me.id });

    const isAdmin = member.status === "administrator" || member.status === "creator";
    const canPost = member.status === "creator" || member.can_post_messages === true;
    if (!isAdmin || !canPost) {
      throw new ConnectorError(
        `@${me.username ?? me.first_name} is ${isAdmin ? "an admin but cannot post" : `not an admin (status: ${member.status})`} in ${chat.title ?? chatId}. Add it as an administrator with "Post messages".`,
        PLATFORM,
        "not_configured",
        false,
      );
    }

    return {
      account: {
        externalId: String(chat.id),
        handle: chat.username ? `@${chat.username}` : (chat.title ?? String(chat.id)),
        config: {
          chatId: chat.id,
          title: chat.title ?? null,
          username: chat.username ?? null,
          chatType: chat.type,
          botUsername: me.username ?? null,
        },
      },
    };
  },

  async verify(account: ConnectedAccount) {
    try {
      const chat = await call<TgChat>("getChat", { chat_id: chatIdOf(account) });
      const me = await call<TgUser>("getMe", {});
      const member = await call<TgChatMember>("getChatMember", { chat_id: chat.id, user_id: me.id });
      const canPost =
        member.status === "creator" ||
        (member.status === "administrator" && member.can_post_messages === true);
      if (!canPost) {
        return { ok: false, error: `Bot cannot post in ${chat.title ?? chat.id} (status: ${member.status})` };
      }
      return {
        ok: true,
        handle: chat.username ? `@${chat.username}` : String(chat.id),
        displayName: chat.title ?? undefined,
        profileUrl: chat.username ? `https://t.me/${chat.username}` : undefined,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async publish(account: ConnectedAccount, post: PublishablePost): Promise<PublishResult> {
    if (post.externalId) {
      const id = Number(post.externalId);
      return {
        externalId: post.externalId,
        ...(Number.isFinite(id) ? { url: messageUrl(account, id) } : {}),
      };
    }

    const chatId = chatIdOf(account);
    const context = { businessId: account.businessId, accountId: account.id, postId: post.id };

    const plain = composeBody({
      body: post.body,
      hashtags: post.hashtags,
      linkUrl: post.linkUrl,
      platform: PLATFORM,
    });
    const html = post.title ? `<b>${escapeHtml(post.title)}</b>\n\n${escapeHtml(plain)}` : escapeHtml(plain);

    const images = post.media.filter((m) => m.kind === "image").slice(0, MAX_MEDIA_GROUP);
    const videos = post.media.filter((m) => m.kind === "video").slice(0, MAX_MEDIA_GROUP);
    const mediaCount = images.length + videos.length;

    // A caption is capped at 1024 chars; longer copy is sent as a follow-up message.
    const captionFits = html.length <= MAX_CAPTION;
    const caption = captionFits ? html : undefined;

    let message: TgMessage;

    if (mediaCount === 0) {
      message = await call<TgMessage>(
        "sendMessage",
        {
          chat_id: chatId,
          text: html,
          parse_mode: "HTML",
          link_preview_options: post.linkUrl ? { url: post.linkUrl, prefer_large_media: true } : undefined,
        },
        context,
      );
    } else if (mediaCount === 1 && images.length === 1) {
      message = await call<TgMessage>(
        "sendPhoto",
        { chat_id: chatId, photo: images[0]?.url, caption, parse_mode: caption ? "HTML" : undefined },
        context,
      );
    } else if (mediaCount === 1 && videos.length === 1) {
      message = await call<TgMessage>(
        "sendVideo",
        {
          chat_id: chatId,
          video: videos[0]?.url,
          caption,
          parse_mode: caption ? "HTML" : undefined,
          supports_streaming: true,
        },
        context,
      );
    } else {
      const media = [...images, ...videos].slice(0, MAX_MEDIA_GROUP).map((item, index) => ({
        type: item.kind === "video" ? "video" : "photo",
        media: item.url,
        // Only the first item may carry the album caption.
        ...(index === 0 && caption ? { caption, parse_mode: "HTML" } : {}),
      }));
      const messages = await call<TgMessage[]>("sendMediaGroup", { chat_id: chatId, media }, context);
      const first = messages[0];
      if (!first) {
        throw new ConnectorError("Telegram sendMediaGroup returned no messages", PLATFORM, "unknown", false);
      }
      message = first;
    }

    if (!captionFits && mediaCount > 0) {
      await call<TgMessage>(
        "sendMessage",
        { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } },
        context,
      );
    }

    return {
      externalId: String(message.message_id),
      url: messageUrl(account, message.message_id),
      raw: { chatId: message.chat?.id },
    };
  },

  /** Telegram's Bot API exposes no channel analytics; stats live only in the app. */
  async fetchInsights(): Promise<MetricSnapshotInput[]> {
    return [];
  },
};

export default telegramConnector;

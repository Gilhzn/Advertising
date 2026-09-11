import { logger as defaultLogger, type Logger } from "@adv/shared";
import { ImapFlow } from "imapflow";
import { EmailProviderError } from "./errors.js";

const IMAP_HOST = "imap.migadu.com";
const IMAP_PORT = 993;
const CONNECT_TIMEOUT_MS = 10_000;

export interface RecentMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface FullMessage {
  uid: number;
  from: string;
  subject: string;
  date: string;
  text?: string;
  html?: string;
}

export interface ImapOptions {
  limit?: number;
  logger?: Logger;
}

/**
 * Minimal read-only Migadu inbox client over IMAP. Every public method opens
 * its own connection, does its work under a timeout, and always logs out —
 * safe to call one-off from a worker job without lifecycle management.
 */
export class MailboxInbox {
  constructor(
    private readonly address: string,
    private readonly password: string,
    private readonly logger: Logger = defaultLogger,
  ) {}

  private async withClient<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: true,
      auth: { user: this.address, pass: this.password },
      logger: false,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
    });
    try {
      await client.connect();
      return await fn(client);
    } catch (err) {
      this.logger.warn({ address: this.address, err: (err as Error)?.message }, "imap operation failed");
      throw new EmailProviderError(`IMAP operation failed for ${this.address}`, "imap", "network", false);
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }

  async listRecentMessages(opts: ImapOptions = {}): Promise<RecentMessage[]> {
    const limit = opts.limit ?? 20;
    return this.withClient(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const total = client.mailbox && typeof client.mailbox !== "boolean" ? client.mailbox.exists : 0;
        if (!total) return [];
        const start = Math.max(1, total - limit + 1);
        const messages: RecentMessage[] = [];
        for await (const msg of client.fetch(`${start}:*`, {
          envelope: true,
          bodyStructure: false,
          source: false,
        })) {
          const from = msg.envelope?.from?.[0];
          messages.push({
            uid: msg.uid,
            from: from ? `${from.name ? `${from.name} ` : ""}<${from.address}>` : "",
            subject: msg.envelope?.subject ?? "",
            date: (msg.envelope?.date ?? new Date()).toISOString(),
            snippet: "",
          });
        }
        return messages.sort((a, b) => b.uid - a.uid).slice(0, limit);
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(uid: number): Promise<FullMessage | null> {
    return this.withClient(async (client) => {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const msg = await client.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
        // biome-ignore lint/complexity/useOptionalChain: `fetchOne` can return `false`; `msg?.source` would break the false-narrowing below.
        if (!msg || !msg.source) return null;
        const from = msg.envelope?.from?.[0];
        return {
          uid,
          from: from ? `${from.name ? `${from.name} ` : ""}<${from.address}>` : "",
          subject: msg.envelope?.subject ?? "",
          date: (msg.envelope?.date ?? new Date()).toISOString(),
          text: msg.source.toString("utf8"),
        };
      } finally {
        lock.release();
      }
    });
  }
}

/** Convenience one-shot helpers matching the worker's job-call shape. */
export async function listRecentMessages(
  address: string,
  password: string,
  opts: ImapOptions = {},
): Promise<RecentMessage[]> {
  return new MailboxInbox(address, password, opts.logger).listRecentMessages(opts);
}

export async function getMessage(
  address: string,
  password: string,
  uid: number,
): Promise<FullMessage | null> {
  return new MailboxInbox(address, password).getMessage(uid);
}

import type { Logger } from "@adv/shared";
import type { DnsRecordInput } from "./cloudflare.js";
import { EmailProviderError } from "./errors.js";
import { requestJson } from "./http.js";

/** See NOTES.md — verified against metio/migadu-client.go (no official docs/SDK exist). */
const DEFAULT_BASE_URL = "https://api.migadu.com/v1";

export interface CreateMailboxInput {
  localPart: string;
  name: string;
  password: string;
}

export interface MigaduMailbox {
  local_part: string;
  domain_name: string;
  address: string;
  name: string;
  [key: string]: unknown;
}

export interface MigaduClientOptions {
  adminEmail?: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

export class MigaduClient {
  private readonly adminEmail: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly logger?: Logger;

  constructor(opts: MigaduClientOptions = {}) {
    const adminEmail = opts.adminEmail ?? process.env.MIGADU_ADMIN_EMAIL;
    const apiKey = opts.apiKey ?? process.env.MIGADU_API_KEY;
    if (!adminEmail || !apiKey) {
      throw new EmailProviderError(
        "MIGADU_ADMIN_EMAIL / MIGADU_API_KEY are not set",
        "migadu",
        "not_configured",
      );
    }
    this.adminEmail = adminEmail;
    this.apiKey = apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl;
    this.logger = opts.logger;
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.adminEmail}:${this.apiKey}`).toString("base64")}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return requestJson<T>(`${this.baseUrl}${path}`, {
      method,
      body,
      provider: "migadu",
      fetchImpl: this.fetchImpl,
      logger: this.logger,
      headers: { Authorization: this.authHeader() },
    });
  }

  async getMailbox(domain: string, localPart: string): Promise<MigaduMailbox | null> {
    try {
      return await this.call<MigaduMailbox>("GET", `/domains/${domain}/mailboxes/${localPart}`);
    } catch (err) {
      if (err instanceof EmailProviderError && err.code === "not_found") return null;
      throw err;
    }
  }

  /** Idempotent: if the mailbox already exists, returns it instead of failing. */
  async createMailbox(domain: string, input: CreateMailboxInput): Promise<MigaduMailbox> {
    try {
      return await this.call<MigaduMailbox>("POST", `/domains/${domain}/mailboxes`, {
        local_part: input.localPart,
        name: input.name,
        password: input.password,
      });
    } catch (err) {
      const existing = await this.getMailbox(domain, input.localPart);
      if (existing) return existing;
      throw err;
    }
  }

  async deleteMailbox(domain: string, localPart: string): Promise<void> {
    try {
      await this.call<MigaduMailbox>("DELETE", `/domains/${domain}/mailboxes/${localPart}`);
    } catch (err) {
      if (err instanceof EmailProviderError && err.code === "not_found") return;
      throw err;
    }
  }
}

export function createMigaduClient(opts?: MigaduClientOptions): MigaduClient {
  return new MigaduClient(opts);
}

/**
 * DNS records Migadu needs at the registrar. MX/SPF/DKIM/DMARC are fixed
 * strings verified against a real working config (see NOTES.md); the
 * `hosted-email-verify=<code>` TXT record has no public API to fetch the
 * code from, so it's an optional caller-supplied parameter and simply
 * omitted when not given.
 */
export function requiredDnsRecords(domain: string, verifyCode?: string): DnsRecordInput[] {
  const records: DnsRecordInput[] = [
    { type: "MX", name: "@", content: "aspmx1.migadu.com", priority: 10, ttl: 3600 },
    { type: "MX", name: "@", content: "aspmx2.migadu.com", priority: 20, ttl: 3600 },
    { type: "TXT", name: "@", content: "v=spf1 include:spf.migadu.com -all", ttl: 3600 },
    { type: "CNAME", name: "key1._domainkey", content: `key1.${domain}._domainkey.migadu.com`, ttl: 3600 },
    { type: "CNAME", name: "key2._domainkey", content: `key2.${domain}._domainkey.migadu.com`, ttl: 3600 },
    { type: "CNAME", name: "key3._domainkey", content: `key3.${domain}._domainkey.migadu.com`, ttl: 3600 },
    { type: "TXT", name: "_dmarc", content: "v=DMARC1; p=quarantine;", ttl: 3600 },
  ];
  if (verifyCode) {
    records.push({ type: "TXT", name: "@", content: `hosted-email-verify=${verifyCode}`, ttl: 3600 });
  }
  return records;
}

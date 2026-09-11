import type { Logger } from "@adv/shared";
import { EmailProviderError } from "./errors.js";
import { requestJson } from "./http.js";

/** See NOTES.md — verified against the resend-node SDK source. */
const DEFAULT_BASE_URL = "https://api.resend.com";

export interface ResendDnsRecord {
  record: string;
  name: string;
  type: "MX" | "TXT" | "CNAME" | "CAA";
  value: string;
  ttl?: string;
  status?: string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  created_at?: string;
  records: ResendDnsRecord[];
}

export interface SendMailInput {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendMailResult {
  id: string;
}

export interface ResendClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

export class ResendClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly logger?: Logger;

  constructor(opts: ResendClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new EmailProviderError("RESEND_API_KEY is not set", "resend", "not_configured");
    }
    this.apiKey = apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl;
    this.logger = opts.logger;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return requestJson<T>(`${this.baseUrl}${path}`, {
      method,
      body,
      provider: "resend",
      fetchImpl: this.fetchImpl,
      logger: this.logger,
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  /** Idempotent: returns the existing domain (with its DNS records) instead of creating a duplicate. */
  async verifyDomainSetup(domain: string): Promise<ResendDomain> {
    const existing = await this.call<{ data: ResendDomain[] }>("GET", "/domains").catch(() => ({ data: [] }));
    const match = existing.data?.find((d) => d.name.toLowerCase() === domain.toLowerCase());
    if (match) return { ...match, records: match.records ?? [] };

    const created = await this.call<ResendDomain>("POST", "/domains", { name: domain });
    return { ...created, records: created.records ?? [] };
  }

  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    return this.call<SendMailResult>("POST", "/emails", {
      from: input.from,
      to: input.to,
      subject: input.subject,
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.html !== undefined ? { html: input.html } : {}),
      ...(input.replyTo !== undefined ? { reply_to: input.replyTo } : {}),
      ...(input.cc !== undefined ? { cc: input.cc } : {}),
      ...(input.bcc !== undefined ? { bcc: input.bcc } : {}),
    });
  }
}

export function createResendClient(opts?: ResendClientOptions): ResendClient {
  return new ResendClient(opts);
}

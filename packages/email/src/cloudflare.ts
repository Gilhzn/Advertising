import type { Logger } from "@adv/shared";
import { EmailProviderError } from "./errors.js";
import { requestJson } from "./http.js";

/** See NOTES.md for verification sources for every endpoint used here. */
const DEFAULT_BASE_URL = "https://api.cloudflare.com/client/v4";

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  account?: { id: string; name: string };
}

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV";

export interface DnsRecordInput {
  type: DnsRecordType;
  /** Record name including the zone apex, e.g. "@" or "key1._domainkey" or the full FQDN. */
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  /** Required for MX/SRV. */
  priority?: number;
  comment?: string;
}

export interface DnsRecord extends DnsRecordInput {
  id: string;
}

export interface EmailRoutingSettings {
  enabled: boolean;
  name?: string;
  created?: string;
  modified?: string;
  skip_wizard?: boolean;
  status?: string;
}

export interface DestinationAddress {
  id: string;
  email: string;
  created?: string;
  modified?: string;
  /** Present once the recipient confirms Cloudflare's verification email. */
  verified?: string | null;
}

export interface RoutingRule {
  id: string;
  name?: string;
  enabled: boolean;
  matchers: Array<{ type: "literal" | "all"; field?: "to"; value?: string }>;
  actions: Array<{ type: "forward" | "drop" | "worker"; value?: string[] }>;
}

interface CfEnvelope<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
  result: T;
  result_info?: { count: number; page: number; per_page: number; total_count: number; total_pages: number };
}

export interface CloudflareClientOptions {
  apiToken?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

export class CloudflareClient {
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly logger?: Logger;

  constructor(opts: CloudflareClientOptions = {}) {
    const apiToken = opts.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
    if (!apiToken) {
      throw new EmailProviderError("CLOUDFLARE_API_TOKEN is not set", "cloudflare", "not_configured");
    }
    this.apiToken = apiToken;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl;
    this.logger = opts.logger;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const envelope = await requestJson<CfEnvelope<T>>(`${this.baseUrl}${path}`, {
      method,
      body,
      provider: "cloudflare",
      fetchImpl: this.fetchImpl,
      logger: this.logger,
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (!envelope.success) {
      const msg = envelope.errors.map((e) => `${e.code}: ${e.message}`).join("; ") || "unknown error";
      throw new EmailProviderError(`cloudflare API error: ${msg}`, "cloudflare", "invalid_response");
    }
    return envelope.result;
  }

  async listZones(filter: { name?: string } = {}): Promise<CloudflareZone[]> {
    const qs = filter.name ? `?name=${encodeURIComponent(filter.name)}` : "";
    return this.call<CloudflareZone[]>("GET", `/zones${qs}`);
  }

  /** Walks from the full domain up to its registrable root, so subdomains resolve to their parent zone. */
  async findZoneForDomain(domain: string): Promise<CloudflareZone | null> {
    const labels = domain.toLowerCase().replace(/\.$/, "").split(".");
    for (let i = 0; i <= labels.length - 2; i++) {
      const candidate = labels.slice(i).join(".");
      const zones = await this.listZones({ name: candidate });
      const exact = zones.find((z) => z.name.toLowerCase() === candidate);
      if (exact) return exact;
    }
    return null;
  }

  async listDnsRecords(
    zoneId: string,
    filter: { type?: DnsRecordType; name?: string } = {},
  ): Promise<DnsRecord[]> {
    const params = new URLSearchParams();
    if (filter.type) params.set("type", filter.type);
    if (filter.name) params.set("name", filter.name);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.call<DnsRecord[]>("GET", `/zones/${zoneId}/dns_records${qs}`);
  }

  /** Idempotent by type+name (content also compared for MX/TXT, which may legitimately repeat a name). */
  async upsertDnsRecord(zoneId: string, record: DnsRecordInput): Promise<DnsRecord> {
    const matchOnContent = record.type === "MX" || record.type === "TXT";
    const existing = await this.listDnsRecords(zoneId, { type: record.type, name: record.name });
    const match = matchOnContent
      ? existing.find(
          (r) =>
            r.content === record.content && (record.priority === undefined || r.priority === record.priority),
        )
      : existing[0];

    if (match) {
      const needsUpdate =
        !matchOnContent &&
        (match.content !== record.content || (record.proxied ?? false) !== (match.proxied ?? false));
      if (!needsUpdate) return match;
      return this.call<DnsRecord>("PUT", `/zones/${zoneId}/dns_records/${match.id}`, { ttl: 1, ...record });
    }

    return this.call<DnsRecord>("POST", `/zones/${zoneId}/dns_records`, { ttl: 1, ...record });
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.call<{ id: string }>("DELETE", `/zones/${zoneId}/dns_records/${recordId}`);
  }

  /** Deprecated in Cloudflare's SDK but still the shipped way to explicitly enable routing (see NOTES.md). */
  async enableEmailRouting(zoneId: string): Promise<EmailRoutingSettings> {
    const current = await this.getEmailRoutingSettings(zoneId).catch(() => null);
    if (current?.enabled) return current;
    return this.call<EmailRoutingSettings>("POST", `/zones/${zoneId}/email/routing/enable`);
  }

  async getEmailRoutingSettings(zoneId: string): Promise<EmailRoutingSettings> {
    return this.call<EmailRoutingSettings>("GET", `/zones/${zoneId}/email/routing`);
  }

  async listDestinationAddresses(accountId: string): Promise<DestinationAddress[]> {
    return this.call<DestinationAddress[]>("GET", `/accounts/${accountId}/email/routing/addresses`);
  }

  /** Idempotent: returns the existing destination address instead of re-creating it. */
  async createDestinationAddress(accountId: string, email: string): Promise<DestinationAddress> {
    const existing = await this.listDestinationAddresses(accountId);
    const match = existing.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (match) return match;
    return this.call<DestinationAddress>("POST", `/accounts/${accountId}/email/routing/addresses`, { email });
  }

  /** Idempotent: returns the existing rule instead of creating a duplicate. */
  async createRoutingRule(
    zoneId: string,
    input: { matcherEmail: string; forwardTo: string; name?: string; enabled?: boolean },
  ): Promise<RoutingRule> {
    const existing = await this.call<RoutingRule[]>("GET", `/zones/${zoneId}/email/routing/rules`);
    const match = existing.find(
      (r) =>
        r.matchers.some((m) => m.type === "literal" && m.field === "to" && m.value === input.matcherEmail) &&
        r.actions.some((a) => a.type === "forward" && a.value?.includes(input.forwardTo)),
    );
    if (match) return match;

    return this.call<RoutingRule>("POST", `/zones/${zoneId}/email/routing/rules`, {
      name: input.name ?? `Route ${input.matcherEmail} -> ${input.forwardTo}`,
      enabled: input.enabled ?? true,
      matchers: [{ type: "literal", field: "to", value: input.matcherEmail }],
      actions: [{ type: "forward", value: [input.forwardTo] }],
    });
  }

  /** These describe records Cloudflare wants present; they have no record `id` until you create them yourself. */
  async getRoutingDnsRequirements(zoneId: string): Promise<DnsRecordInput[]> {
    return this.call<DnsRecordInput[]>("GET", `/zones/${zoneId}/email/routing/dns`);
  }
}

export function createCloudflareClient(opts?: CloudflareClientOptions): CloudflareClient {
  return new CloudflareClient(opts);
}

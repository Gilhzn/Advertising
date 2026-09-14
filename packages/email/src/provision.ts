import { randomBytes } from "node:crypto";
import * as dnsPromises from "node:dns/promises";
import { businesses, type Db, eq, getDb, mailboxes } from "@adv/db";
import { logger as defaultLogger, encryptSecret, type Logger } from "@adv/shared";
import { z } from "zod";
import { CloudflareClient, type DnsRecordInput } from "./cloudflare.js";
import { EmailProviderError } from "./errors.js";
import { MigaduClient, requiredDnsRecords } from "./migadu.js";

export const ProvisionMailboxInputSchema = z.object({
  businessId: z.string().uuid(),
  domain: z
    .string()
    .min(3)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
  localPart: z.string().min(1).max(64).default("hello"),
  forwardTo: z.string().email().optional(),
  provider: z.enum(["cloudflare_routing", "migadu"]),
});
export type ProvisionMailboxInput = z.infer<typeof ProvisionMailboxInputSchema>;

export interface ProvisionMailboxResult {
  mailboxId: string;
  address: string;
  status: "pending_dns" | "provisioning" | "active" | "error";
  dnsRecords: DnsRecordInput[];
  /** Only returned the moment a Migadu mailbox password is generated — never persisted in plaintext. */
  credentialsOnce?: { password: string };
}

export interface ProvisionMailboxDeps {
  db?: Db;
  cloudflare?: CloudflareClient;
  migadu?: MigaduClient;
  logger?: Logger;
}

function generateStrongPassword(): string {
  // 24 random bytes -> 32 url-safe chars, well above Migadu's minimum length.
  return randomBytes(24).toString("base64url");
}

async function upsertMailboxRow(
  db: Db,
  row: {
    businessId: string;
    address: string;
    provider: string;
    forwardTo?: string | null;
    status: "pending_dns" | "provisioning" | "active" | "error";
    dnsRecords?: DnsRecordInput[];
    passwordEnc?: string | null;
    lastError?: string | null;
  },
): Promise<{ id: string }> {
  const existing = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.address, row.address));
  const values = {
    businessId: row.businessId,
    address: row.address,
    provider: row.provider,
    forwardTo: row.forwardTo ?? null,
    status: row.status,
    dnsRecords: row.dnsRecords as unknown as Array<Record<string, unknown>> | undefined,
    passwordEnc: row.passwordEnc ?? null,
    lastError: row.lastError ?? null,
  };
  if (existing[0]) {
    await db.update(mailboxes).set(values).where(eq(mailboxes.id, existing[0].id));
    return { id: existing[0].id };
  }
  const inserted = await db.insert(mailboxes).values(values).returning({ id: mailboxes.id });
  const row0 = inserted[0];
  if (!row0) throw new EmailProviderError("mailbox insert returned no row", "provision", "invalid_response");
  return { id: row0.id };
}

/**
 * Orchestrates mailbox provisioning end to end. Safe to re-run: every
 * external call it makes (zone lookup, DNS upsert, routing rule/destination
 * address, Migadu mailbox create) is itself idempotent, and the `mailboxes`
 * row is upserted by unique `address` rather than always inserted.
 */
export async function provisionMailbox(
  input: ProvisionMailboxInput,
  deps: ProvisionMailboxDeps = {},
): Promise<ProvisionMailboxResult> {
  const parsed = ProvisionMailboxInputSchema.parse(input);
  const db = deps.db ?? getDb();
  const log = deps.logger ?? defaultLogger;
  const address = `${parsed.localPart}@${parsed.domain}`;

  const fail = async (message: string): Promise<never> => {
    log.warn({ businessId: parsed.businessId, address, err: message }, "provision_mailbox failed");
    await upsertMailboxRow(db, {
      businessId: parsed.businessId,
      address,
      provider: parsed.provider,
      forwardTo: parsed.forwardTo,
      status: "error",
      lastError: message,
    }).catch(() => undefined);
    throw new EmailProviderError(message, "provision", "unknown");
  };

  // The only authorisation used to be "a Cloudflare zone exists for this domain", which binds the
  // domain to the OPERATOR's account and not to the requesting business. Nothing stopped business A
  // from asking for a mailbox on the operator's own apex, or on another tenant's domain, with
  // forwardTo pointing anywhere. The domain must be the one recorded on the business.
  const [owner] = await db
    .select({ domain: businesses.domain })
    .from(businesses)
    .where(eq(businesses.id, parsed.businessId))
    .limit(1);
  if (!owner) return fail(`business ${parsed.businessId} not found`);
  const claimed = (owner.domain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  const requested = parsed.domain.trim().toLowerCase();
  // The business's own domain, or a subdomain of it.
  const allowed = claimed.length > 0 && (requested === claimed || requested.endsWith(`.${claimed}`));
  if (!allowed) {
    return fail(
      `domain ${parsed.domain} is not the domain recorded for this business` +
        (claimed ? ` (${claimed})` : " (no domain is set on the business)"),
    );
  }

  const cloudflare = deps.cloudflare ?? new CloudflareClient();
  const zone = await cloudflare.findZoneForDomain(parsed.domain).catch((err: unknown) => {
    throw err instanceof EmailProviderError
      ? err
      : new EmailProviderError(String(err), "cloudflare", "unknown");
  });
  if (!zone) return fail(`no Cloudflare zone found for domain ${parsed.domain}`);

  if (parsed.provider === "cloudflare_routing") {
    if (!parsed.forwardTo) return fail("forwardTo is required for cloudflare_routing");
    const accountId = zone.account?.id;
    if (!accountId) return fail(`zone ${zone.id} has no account id`);

    await cloudflare.enableEmailRouting(zone.id);
    const dnsRecords = await cloudflare.getRoutingDnsRequirements(zone.id);
    for (const record of dnsRecords) {
      await cloudflare.upsertDnsRecord(zone.id, record);
    }
    const destination = await cloudflare.createDestinationAddress(accountId, parsed.forwardTo);
    await cloudflare.createRoutingRule(zone.id, { matcherEmail: address, forwardTo: parsed.forwardTo });

    const status = destination.verified ? "active" : "provisioning";
    const { id } = await upsertMailboxRow(db, {
      businessId: parsed.businessId,
      address,
      provider: parsed.provider,
      forwardTo: parsed.forwardTo,
      status,
      dnsRecords,
    });
    return { mailboxId: id, address, status, dnsRecords };
  }

  // provider === "migadu"
  const migadu = deps.migadu ?? new MigaduClient();
  const password = generateStrongPassword();
  await migadu.createMailbox(parsed.domain, {
    localPart: parsed.localPart,
    name: parsed.localPart,
    password,
  });

  const dnsRecords = requiredDnsRecords(parsed.domain);
  for (const record of dnsRecords) {
    await cloudflare.upsertDnsRecord(zone.id, record);
  }

  const passwordEnc = encryptSecret(password);
  const { id } = await upsertMailboxRow(db, {
    businessId: parsed.businessId,
    address,
    provider: parsed.provider,
    forwardTo: parsed.forwardTo,
    status: "pending_dns",
    dnsRecords,
    passwordEnc,
  });
  return { mailboxId: id, address, status: "pending_dns", dnsRecords, credentialsOnce: { password } };
}

export const VerifyMailboxDnsInputSchema = z.object({ mailboxId: z.string().uuid() });
export type VerifyMailboxDnsInput = z.infer<typeof VerifyMailboxDnsInputSchema>;

export interface VerifyMailboxDnsResult {
  status: "active" | "pending_dns" | "error";
  missing: string[];
}

/** The subset of `node:dns/promises` this module needs — injectable so tests never hit real DNS. */
export interface DnsResolver {
  resolveMx: typeof dnsPromises.resolveMx;
  resolveTxt: typeof dnsPromises.resolveTxt;
  resolveCname: typeof dnsPromises.resolveCname;
}

const defaultDnsResolver: DnsResolver = {
  resolveMx: dnsPromises.resolveMx,
  resolveTxt: dnsPromises.resolveTxt,
  resolveCname: dnsPromises.resolveCname,
};

/** Resolves live DNS and compares it against the mailbox's stored required records. Idempotent, never throws on propagation delay. */
export async function verifyMailboxDns(
  mailboxId: string,
  deps: { db?: Db; logger?: Logger; dns?: DnsResolver } = {},
): Promise<VerifyMailboxDnsResult> {
  const db = deps.db ?? getDb();
  const log = deps.logger ?? defaultLogger;
  const dns = deps.dns ?? defaultDnsResolver;

  const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId));
  const row = rows[0];
  if (!row) throw new EmailProviderError(`mailbox ${mailboxId} not found`, "provision", "not_found");

  const records = (row.dnsRecords ?? []) as unknown as DnsRecordInput[];
  const missing: string[] = [];

  for (const record of records) {
    const ok = await checkRecordLive(dns, row.address.split("@")[1] ?? "", record).catch((err) => {
      log.debug({ mailboxId, record, err: (err as Error)?.message }, "dns check errored");
      return false;
    });
    if (!ok) missing.push(`${record.type} ${record.name}`);
  }

  const status = missing.length === 0 ? "active" : "pending_dns";
  await db
    .update(mailboxes)
    .set({ status, lastError: missing.length ? `waiting on DNS: ${missing.join(", ")}` : null })
    .where(eq(mailboxes.id, mailboxId));

  return { status, missing };
}

function recordFqdn(domain: string, name: string): string {
  return name === "@" ? domain : `${name}.${domain}`;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

async function checkRecordLive(dns: DnsResolver, domain: string, record: DnsRecordInput): Promise<boolean> {
  const fqdn = recordFqdn(domain, record.name);
  if (record.type === "MX") {
    const mx = await dns.resolveMx(fqdn);
    return mx.some((m) => normalizeHost(m.exchange) === normalizeHost(record.content));
  }
  if (record.type === "TXT") {
    const txt = await dns.resolveTxt(fqdn);
    const flat = txt.map((chunks) => chunks.join(""));
    return flat.some((v) => v.trim() === record.content.trim());
  }
  if (record.type === "CNAME") {
    const cname = await dns.resolveCname(fqdn);
    return cname.some((c) => normalizeHost(c) === normalizeHost(record.content));
  }
  return false;
}

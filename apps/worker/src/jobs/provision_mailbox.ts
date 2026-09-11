import { businesses, eq, getDb } from "@adv/db";
import { EmailProviderError, provisionMailbox } from "@adv/email";
import { enqueue, JOBS, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { writeAudit } from "../lib/audit.js";

const VERIFY_DELAY_MS = 2 * 60 * 1000;

type EmailProvider = "cloudflare_routing" | "migadu";

function resolveProvider(payload: { provider?: EmailProvider }): EmailProvider | null {
  if (payload.provider) return payload.provider;
  const envProvider = process.env.EMAIL_PROVIDER;
  return envProvider === "cloudflare_routing" || envProvider === "migadu" ? envProvider : null;
}

/**
 * Provisions a business mailbox via `@adv/email`'s `provisionMailbox` (Cloudflare Email Routing or
 * Migadu, chosen by the payload's `provider` or the `EMAIL_PROVIDER` env var) and, unless
 * provisioning failed outright, schedules a `verify_mailbox_dns` follow-up 2 minutes out so DNS
 * propagation has a moment before the first check.
 */
export async function handleProvisionMailbox(jobs: Job<JobPayload<"provision_mailbox">>[]): Promise<void> {
  for (const job of jobs) {
    const data = JOBS.provision_mailbox.parse(job.data);
    const log = logger.child({ jobId: job.id, jobName: "provision_mailbox", businessId: data.businessId });
    const db = getDb();

    const [business] = await db.select().from(businesses).where(eq(businesses.id, data.businessId));
    if (!business) {
      log.warn("provision_mailbox: business not found");
      await writeAudit(data.businessId, "system", "provision_mailbox.failed", {
        jobId: job.id,
        error: "business not found",
      });
      continue; // terminal: retrying will not make the business appear
    }
    if (!business.domain) {
      log.warn("provision_mailbox: business has no domain configured");
      await writeAudit(data.businessId, "system", "provision_mailbox.failed", {
        jobId: job.id,
        error: "business has no domain configured",
      });
      continue; // terminal: needs a human to set businesses.domain first
    }

    const provider = resolveProvider(data);
    if (!provider) {
      log.warn("provision_mailbox: no provider in payload and EMAIL_PROVIDER is unset/invalid");
      await writeAudit(data.businessId, "system", "provision_mailbox.failed", {
        jobId: job.id,
        error: "no email provider configured",
      });
      continue; // terminal: needs EMAIL_PROVIDER (or an explicit payload.provider) configured
    }

    try {
      const result = await provisionMailbox({
        businessId: data.businessId,
        domain: business.domain,
        localPart: data.localPart,
        forwardTo: data.forwardTo,
        provider,
      });

      await writeAudit(data.businessId, "system", "provision_mailbox.provisioned", {
        jobId: job.id,
        mailboxId: result.mailboxId,
        address: result.address,
        status: result.status,
      });
      log.info({ mailboxId: result.mailboxId, status: result.status }, "provision_mailbox: provisioned");

      if (result.status !== "error") {
        await enqueue(
          "verify_mailbox_dns",
          { mailboxId: result.mailboxId },
          { startAfter: new Date(Date.now() + VERIFY_DELAY_MS), singletonKey: result.mailboxId },
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err: message }, "provision_mailbox: failed");
      await writeAudit(data.businessId, "system", "provision_mailbox.failed", {
        jobId: job.id,
        error: message,
      });
      // Only retry when the failure is explicitly marked retryable (e.g. a transient network blip);
      // provisionMailbox() already persisted the mailbox row as `status: 'error'` for anything else,
      // so re-running would just fail identically.
      if (err instanceof EmailProviderError && err.retryable) throw err;
    }
  }
}

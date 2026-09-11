import { eq, getDb, mailboxes } from "@adv/db";
import { verifyMailboxDns } from "@adv/email";
import { enqueue, JOBS, type JobPayload } from "@adv/jobs";
import { logger } from "@adv/shared";
import type { Job } from "pg-boss";
import { writeAudit } from "../lib/audit.js";

const RECHECK_DELAY_MS = 10 * 60 * 1000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Re-resolves live DNS for a mailbox (`@adv/email`'s `verifyMailboxDns`) and, while the result is
 * still `pending_dns`, re-enqueues itself 10 minutes out - up to 48 hours after the mailbox row was
 * created, after which it gives up and leaves the mailbox `pending_dns` for a human to chase.
 */
export async function handleVerifyMailboxDns(jobs: Job<JobPayload<"verify_mailbox_dns">>[]): Promise<void> {
  for (const job of jobs) {
    const data = JOBS.verify_mailbox_dns.parse(job.data);
    const log = logger.child({ jobId: job.id, jobName: "verify_mailbox_dns", mailboxId: data.mailboxId });
    const db = getDb();

    const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, data.mailboxId));
    if (!mailbox) {
      log.warn("verify_mailbox_dns: mailbox not found");
      await writeAudit(null, "system", "verify_mailbox_dns.failed", {
        jobId: job.id,
        mailboxId: data.mailboxId,
        error: "mailbox not found",
      });
      continue; // terminal: nothing to verify
    }

    const result = await verifyMailboxDns(data.mailboxId);
    await writeAudit(mailbox.businessId, "system", "verify_mailbox_dns.checked", {
      jobId: job.id,
      mailboxId: data.mailboxId,
      status: result.status,
      missing: result.missing,
    });
    log.info({ status: result.status, missing: result.missing }, "verify_mailbox_dns: checked");

    if (result.status !== "pending_dns") continue;

    const ageMs = Date.now() - mailbox.createdAt.getTime();
    if (ageMs >= MAX_AGE_MS) {
      log.warn("verify_mailbox_dns: giving up after 48h, DNS still not propagated");
      await writeAudit(mailbox.businessId, "system", "verify_mailbox_dns.timed_out", {
        jobId: job.id,
        mailboxId: data.mailboxId,
        missing: result.missing,
      });
      continue;
    }

    await enqueue(
      "verify_mailbox_dns",
      { mailboxId: data.mailboxId },
      { startAfter: new Date(Date.now() + RECHECK_DELAY_MS), singletonKey: data.mailboxId },
    );
  }
}

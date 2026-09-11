import { auditLog, getDb } from "@adv/db";
import { redactDeep } from "@adv/shared";

/**
 * Write one `audit_log` row. Never throws - a failed audit write must not take down a job that
 * otherwise succeeded, so errors are swallowed after a console warning.
 *
 * Every payload goes through `redactDeep` first: most payloads carry an `error` string lifted from a
 * connector/HTTP failure, which routinely quotes the request (bearer header, `?access_token=`,
 * Telegram bot path) that produced it. `audit_log` is long-lived and human-readable, so no
 * credential may land in it.
 */
export async function writeAudit(
  businessId: string | null,
  actor: string,
  action: string,
  payload?: Record<string, unknown>,
  target?: string,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      businessId,
      actor,
      action,
      target: target ?? null,
      payload: payload ? redactDeep(payload) : null,
    });
  } catch (err) {
    console.error("[audit_log] failed to write", { action, err });
  }
}

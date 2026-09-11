import { auditLog, getDb } from "@adv/db";

/**
 * Write one `audit_log` row. Never throws - a failed audit write must not take down a job that
 * otherwise succeeded, so errors are swallowed after a console warning.
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
      payload: payload ?? null,
    });
  } catch (err) {
    console.error("[audit_log] failed to write", { action, err });
  }
}

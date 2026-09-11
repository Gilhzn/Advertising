import { getDb, sql } from "@adv/db";
import { getBoss } from "@adv/jobs";

export interface HealthReport {
  ok: boolean;
  db: boolean;
  boss: boolean;
  error?: string;
}

/** DB ping + pg-boss install/state check, used by the `/health` HTTP endpoint. */
export async function checkHealth(): Promise<HealthReport> {
  const errors: string[] = [];
  let db = false;
  let boss = false;

  try {
    await getDb().execute(sql`select 1`);
    db = true;
  } catch (err) {
    errors.push(`db: ${(err as Error).message}`);
  }

  try {
    const b = await getBoss();
    boss = await b.isInstalled();
  } catch (err) {
    errors.push(`boss: ${(err as Error).message}`);
  }

  return { ok: db && boss, db, boss, error: errors.length ? errors.join("; ") : undefined };
}

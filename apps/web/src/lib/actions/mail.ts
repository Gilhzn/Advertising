"use server";

import { eq, getDb, mailboxes } from "@adv/db";
import { enqueue } from "@adv/jobs";
import { decryptSecret } from "@adv/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBusinessById } from "@/lib/data/businesses";
import { getMailboxById } from "@/lib/data/mailboxes";
import { requireUser } from "@/lib/session";

const ProvisionSchema = z.object({
  localPart: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9._-]+$/i, "Use letters, numbers, dots, dashes or underscores only"),
  provider: z.enum(["cloudflare_routing", "migadu"]),
  forwardTo: z.string().trim().email().optional().or(z.literal("")),
});

export type ProvisionMailboxState = { error?: string; ok?: boolean } | undefined;

/**
 * NOTE: `packages/jobs`' `provision_mailbox` schema currently carries only
 * `{ businessId, localPart, forwardTo }` — no `provider`. Until that schema gains a
 * `provider` field, the mailbox row is created here (upserted by unique `address`, same as
 * `provisionMailbox()` in `@adv/email` does internally) so the worker has somewhere to read
 * the chosen provider from and the dashboard has something to render immediately; the
 * `provision_mailbox` job itself is a no-op stub in `apps/worker` as of this writing.
 */
export async function provisionMailboxAction(
  businessId: string,
  slug: string,
  _prevState: ProvisionMailboxState,
  formData: FormData,
): Promise<ProvisionMailboxState> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) return { error: "Not found" };
  if (!business.domain) {
    return { error: "Set a domain for this business in Settings before creating a mailbox." };
  }

  const parsed = ProvisionSchema.safeParse({
    localPart: formData.get("localPart") || "hello",
    provider: formData.get("provider"),
    forwardTo: formData.get("forwardTo") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const input = parsed.data;
  if (input.provider === "cloudflare_routing" && !input.forwardTo) {
    return { error: "Cloudflare Email Routing needs a forward-to address." };
  }

  const address = `${input.localPart}@${business.domain}`;
  const db = getDb();
  const [existing] = await db.select().from(mailboxes).where(eq(mailboxes.address, address)).limit(1);
  const values = {
    businessId,
    address,
    provider: input.provider,
    forwardTo: input.forwardTo || null,
    status: "pending_dns" as const,
    lastError: null,
  };
  if (existing) {
    await db.update(mailboxes).set(values).where(eq(mailboxes.id, existing.id));
  } else {
    await db.insert(mailboxes).values(values);
  }

  await enqueue("provision_mailbox", {
    businessId,
    localPart: input.localPart,
    ...(input.forwardTo ? { forwardTo: input.forwardTo } : {}),
  });

  revalidatePath(`/b/${slug}/mail`);
  return { ok: true };
}

export async function recheckMailboxDnsAction(
  businessId: string,
  slug: string,
  mailboxId: string,
): Promise<void> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox || mailbox.businessId !== businessId) throw new Error("Not found");

  await enqueue("verify_mailbox_dns", { mailboxId });
  revalidatePath(`/b/${slug}/mail`);
}

/**
 * Decrypts the mailbox password server-side only when the user explicitly clicks "Reveal" —
 * never rendered in the initial HTML. Returned once to the client component that called it.
 */
export async function revealMailboxPasswordAction(businessId: string, mailboxId: string): Promise<string> {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  const mailbox = await getMailboxById(mailboxId);
  if (!mailbox || mailbox.businessId !== businessId) throw new Error("Not found");
  if (!mailbox.passwordEnc) throw new Error("No stored credentials for this mailbox.");
  return decryptSecret(mailbox.passwordEnc);
}

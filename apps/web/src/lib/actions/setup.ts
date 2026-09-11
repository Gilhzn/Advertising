"use server";

import { and, eq, getDb, oauthTokens, platformAccounts } from "@adv/db";
import type { PlatformId } from "@adv/shared";
import { encryptSecret } from "@adv/shared";
import { revalidatePath } from "next/cache";
import { getConnector, hasConnector } from "@/lib/connectors";
import { getBusinessById } from "@/lib/data/businesses";
import { requireUser } from "@/lib/session";

async function assertOwnership(businessId: string) {
  const user = await requireUser();
  const business = await getBusinessById(user.id, businessId);
  if (!business) throw new Error("Not found");
  return business;
}

async function findOrCreateAccountRow(businessId: string, platform: PlatformId) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(platformAccounts)
    .where(
      and(
        eq(platformAccounts.businessId, businessId),
        eq(platformAccounts.platform, platform),
        eq(platformAccounts.ownership, "owned"),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(platformAccounts)
    .values({ businessId, platform, ownership: "owned", status: "pending" })
    .returning();
  if (!created) throw new Error("failed to create account row");
  return created;
}

export type ConnectTokenState = { error?: string; ok?: boolean } | undefined;

export async function connectWithTokenAction(
  businessId: string,
  slug: string,
  platform: PlatformId,
  _prevState: ConnectTokenState,
  formData: FormData,
): Promise<ConnectTokenState> {
  await assertOwnership(businessId);

  if (!hasConnector(platform)) {
    return { error: "This platform's connector isn't available yet." };
  }
  const connector = getConnector(platform);
  if (!connector.connectWithInputs) {
    return { error: "This platform doesn't support token-based connection." };
  }

  const inputs: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") inputs[key] = value;
  }

  try {
    const { tokens, account } = await connector.connectWithInputs(inputs);
    const db = getDb();
    const row = await findOrCreateAccountRow(businessId, platform);

    const [updated] = await db
      .update(platformAccounts)
      .set({
        status: "connected",
        handle: account.handle ?? row.handle,
        externalId: account.externalId ?? row.externalId,
        config: { ...row.config, ...account.config },
        lastError: null,
        lastSyncedAt: new Date(),
      })
      .where(eq(platformAccounts.id, row.id))
      .returning();

    if (tokens && updated) {
      await db
        .insert(oauthTokens)
        .values({
          accountId: updated.id,
          accessTokenEnc: encryptSecret(tokens.accessToken),
          refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
          tokenType: tokens.tokenType ?? null,
          scopes: tokens.scopes ?? [],
          expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
        })
        .onConflictDoUpdate({
          target: oauthTokens.accountId,
          set: {
            accessTokenEnc: encryptSecret(tokens.accessToken),
            refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
            tokenType: tokens.tokenType ?? null,
            scopes: tokens.scopes ?? [],
            expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
          },
        });
    }

    if (updated) {
      const verified = await connector.verify({
        id: updated.id,
        businessId,
        platform,
        ownership: "owned",
        externalId: updated.externalId,
        handle: updated.handle,
        config: updated.config,
        tokens: tokens ?? null,
      });
      if (!verified.ok) {
        await db
          .update(platformAccounts)
          .set({ status: "error", lastError: verified.error ?? "verification failed" })
          .where(eq(platformAccounts.id, updated.id));
        revalidatePath(`/b/${slug}/setup`);
        return { error: verified.error ?? "Could not verify the connection." };
      }
      await db
        .update(platformAccounts)
        .set({
          handle: verified.handle ?? updated.handle,
          displayName: verified.displayName ?? updated.displayName,
          profileUrl: verified.profileUrl ?? updated.profileUrl,
        })
        .where(eq(platformAccounts.id, updated.id));
    }

    revalidatePath(`/b/${slug}/setup`);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Connection failed." };
  }
}

export async function disconnectAccountAction(
  businessId: string,
  slug: string,
  accountId: string,
): Promise<void> {
  await assertOwnership(businessId);
  const db = getDb();
  await db
    .update(platformAccounts)
    .set({ status: "disconnected" })
    .where(and(eq(platformAccounts.id, accountId), eq(platformAccounts.businessId, businessId)));
  revalidatePath(`/b/${slug}/setup`);
  revalidatePath(`/b/${slug}/platforms`);
}

export async function addPlatformAction(
  businessId: string,
  slug: string,
  platform: PlatformId,
): Promise<void> {
  await assertOwnership(businessId);
  await findOrCreateAccountRow(businessId, platform);
  revalidatePath(`/b/${slug}/setup`);
}

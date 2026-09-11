import "../test-setup.js";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { provisionMailboxMock, enqueueMock } = vi.hoisted(() => ({
  provisionMailboxMock: vi.fn(),
  enqueueMock: vi.fn(),
}));

vi.mock("@adv/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/email")>();
  return { ...actual, provisionMailbox: provisionMailboxMock };
});

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { EmailProviderError } = await import("@adv/email");
const { businesses, eq, getDb } = await import("@adv/db");
const { createTestBusiness, fakeJob } = await import("../test-helpers.js");
const { handleProvisionMailbox } = await import("./provision_mailbox.js");

describe("provision_mailbox", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;
  const originalEmailProvider = process.env.EMAIL_PROVIDER;

  beforeEach(async () => {
    biz = await createTestBusiness();
    provisionMailboxMock.mockReset();
    enqueueMock.mockReset();
  });

  afterEach(async () => {
    await biz.cleanup();
    if (originalEmailProvider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = originalEmailProvider;
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("skips (without throwing) when the business has no domain configured", async () => {
    process.env.EMAIL_PROVIDER = "cloudflare_routing";
    await expect(
      handleProvisionMailbox([fakeJob({ businessId: biz.businessId, localPart: "hello" })]),
    ).resolves.not.toThrow();
    expect(provisionMailboxMock).not.toHaveBeenCalled();
  });

  it("skips (without throwing) when no provider is given and EMAIL_PROVIDER is unset", async () => {
    delete process.env.EMAIL_PROVIDER;
    const db = getDb();
    await db.update(businesses).set({ domain: "example.test" }).where(eq(businesses.id, biz.businessId));

    await expect(
      handleProvisionMailbox([fakeJob({ businessId: biz.businessId, localPart: "hello" })]),
    ).resolves.not.toThrow();
    expect(provisionMailboxMock).not.toHaveBeenCalled();
  });

  it("provisions via EMAIL_PROVIDER and schedules verify_mailbox_dns 2 minutes out", async () => {
    process.env.EMAIL_PROVIDER = "cloudflare_routing";
    const db = getDb();
    await db.update(businesses).set({ domain: "example.test" }).where(eq(businesses.id, biz.businessId));

    provisionMailboxMock.mockResolvedValue({
      mailboxId: "11111111-1111-1111-1111-111111111111",
      address: "hello@example.test",
      status: "pending_dns",
      dnsRecords: [],
    });

    await handleProvisionMailbox([
      fakeJob({ businessId: biz.businessId, localPart: "hello", forwardTo: "owner@example.com" }),
    ]);

    expect(provisionMailboxMock).toHaveBeenCalledWith({
      businessId: biz.businessId,
      domain: "example.test",
      localPart: "hello",
      forwardTo: "owner@example.com",
      provider: "cloudflare_routing",
    });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = enqueueMock.mock.calls[0] as [
      string,
      unknown,
      { startAfter: Date; singletonKey: string },
    ];
    expect(name).toBe("verify_mailbox_dns");
    expect(payload).toEqual({ mailboxId: "11111111-1111-1111-1111-111111111111" });
    expect(opts.singletonKey).toBe("11111111-1111-1111-1111-111111111111");
    expect(opts.startAfter.getTime()).toBeGreaterThan(Date.now() + 60_000);
  });

  it("payload.provider overrides EMAIL_PROVIDER", async () => {
    process.env.EMAIL_PROVIDER = "cloudflare_routing";
    const db = getDb();
    await db.update(businesses).set({ domain: "example.test" }).where(eq(businesses.id, biz.businessId));
    provisionMailboxMock.mockResolvedValue({
      mailboxId: "22222222-2222-2222-2222-222222222222",
      address: "hello@example.test",
      status: "pending_dns",
      dnsRecords: [],
    });

    await handleProvisionMailbox([
      fakeJob({ businessId: biz.businessId, localPart: "hello", provider: "migadu" }),
    ]);

    expect(provisionMailboxMock).toHaveBeenCalledWith(expect.objectContaining({ provider: "migadu" }));
  });

  it("does not schedule verify_mailbox_dns when provisioning fails", async () => {
    process.env.EMAIL_PROVIDER = "migadu";
    const db = getDb();
    await db.update(businesses).set({ domain: "example.test" }).where(eq(businesses.id, biz.businessId));
    provisionMailboxMock.mockRejectedValue(new EmailProviderError("boom", "migadu", "unknown", false));

    await expect(
      handleProvisionMailbox([fakeJob({ businessId: biz.businessId, localPart: "hello" })]),
    ).resolves.not.toThrow();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("re-throws (for pg-boss retry) when the failure is marked retryable", async () => {
    process.env.EMAIL_PROVIDER = "migadu";
    const db = getDb();
    await db.update(businesses).set({ domain: "example.test" }).where(eq(businesses.id, biz.businessId));
    provisionMailboxMock.mockRejectedValue(new EmailProviderError("network blip", "migadu", "network", true));

    await expect(
      handleProvisionMailbox([fakeJob({ businessId: biz.businessId, localPart: "hello" })]),
    ).rejects.toThrow(/network blip/);
  });
});

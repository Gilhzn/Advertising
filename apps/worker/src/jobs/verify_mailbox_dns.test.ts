import "../test-setup.js";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { verifyMailboxDnsMock, enqueueMock } = vi.hoisted(() => ({
  verifyMailboxDnsMock: vi.fn(),
  enqueueMock: vi.fn(),
}));

vi.mock("@adv/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/email")>();
  return { ...actual, verifyMailboxDns: verifyMailboxDnsMock };
});

vi.mock("@adv/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@adv/jobs")>();
  return { ...actual, enqueue: enqueueMock };
});

const { eq, getDb, mailboxes } = await import("@adv/db");
const { createTestBusiness, createTestMailbox, fakeJob } = await import("../test-helpers.js");
const { handleVerifyMailboxDns } = await import("./verify_mailbox_dns.js");

describe("verify_mailbox_dns", () => {
  let biz: Awaited<ReturnType<typeof createTestBusiness>>;

  beforeEach(async () => {
    biz = await createTestBusiness();
    verifyMailboxDnsMock.mockReset();
    enqueueMock.mockReset();
  });

  afterEach(async () => {
    await biz.cleanup();
  });

  afterAll(async () => {
    await getDb().$client.end({ timeout: 1 });
  });

  it("does not re-enqueue once DNS is active", async () => {
    const mailbox = await createTestMailbox(biz.businessId);
    verifyMailboxDnsMock.mockResolvedValue({ status: "active", missing: [] });

    await handleVerifyMailboxDns([fakeJob({ mailboxId: mailbox.id })]);

    expect(verifyMailboxDnsMock).toHaveBeenCalledWith(mailbox.id);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("re-enqueues itself 10 minutes out while still pending_dns and under 48h old", async () => {
    const mailbox = await createTestMailbox(biz.businessId);
    verifyMailboxDnsMock.mockResolvedValue({ status: "pending_dns", missing: ["MX @"] });

    await handleVerifyMailboxDns([fakeJob({ mailboxId: mailbox.id })]);

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = enqueueMock.mock.calls[0] as [
      string,
      unknown,
      { startAfter: Date; singletonKey: string },
    ];
    expect(name).toBe("verify_mailbox_dns");
    expect(payload).toEqual({ mailboxId: mailbox.id });
    expect(opts.singletonKey).toBe(mailbox.id);
    const deltaMs = opts.startAfter.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(9 * 60 * 1000);
    expect(deltaMs).toBeLessThan(11 * 60 * 1000);
  });

  it("gives up (no re-enqueue) once the mailbox is older than 48h and still pending_dns", async () => {
    const mailbox = await createTestMailbox(biz.businessId, {
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    });
    verifyMailboxDnsMock.mockResolvedValue({ status: "pending_dns", missing: ["MX @"] });

    await handleVerifyMailboxDns([fakeJob({ mailboxId: mailbox.id })]);

    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("skips cleanly when the mailbox no longer exists", async () => {
    const db = getDb();
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await expect(handleVerifyMailboxDns([fakeJob({ mailboxId: fakeId })])).resolves.not.toThrow();
    expect(verifyMailboxDnsMock).not.toHaveBeenCalled();
    const rows = await db.select().from(mailboxes).where(eq(mailboxes.id, fakeId));
    expect(rows).toHaveLength(0);
  });
});

import { listRecentMessages } from "@adv/email";
import { decryptSecret } from "@adv/shared";
import { AlertTriangle, Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Mailbox } from "@/lib/data/mailboxes";
import { formatDateTime } from "@/lib/utils";

const FETCH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
}

/** Server component: reads the mailbox's recent messages over IMAP. Migadu mailboxes only. */
export async function InboxTab({ mailbox }: { mailbox: Mailbox }) {
  if (mailbox.provider !== "migadu") {
    return (
      <EmptyState
        icon={Inbox}
        title="No inbox for this provider"
        description="Cloudflare Email Routing only forwards mail — connect a Migadu mailbox to read replies here."
      />
    );
  }
  if (!mailbox.passwordEnc) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="No stored credentials"
        description="This mailbox has no stored password to read its inbox with."
      />
    );
  }

  try {
    const password = decryptSecret(mailbox.passwordEnc);
    const messages = await withTimeout(
      listRecentMessages(mailbox.address, password, { limit: 20 }),
      FETCH_TIMEOUT_MS,
    );

    if (messages.length === 0) {
      return <EmptyState icon={Inbox} title="No messages yet" description="Nothing has arrived here yet." />;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {messages.map((m) => (
            <TableRow key={m.uid}>
              <TableCell className="max-w-48 truncate">{m.from || "(unknown)"}</TableCell>
              <TableCell className="max-w-96 truncate">{m.subject || "(no subject)"}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(m.date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } catch (err) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the inbox"
        description={err instanceof Error ? err.message : "The mailbox server didn't respond in time."}
      />
    );
  }
}

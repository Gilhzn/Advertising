"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { revealMailboxPasswordAction } from "@/lib/actions/mail";

/** One-time credentials reveal: the password is fetched (decrypted server-side) only on click. */
export function RevealCredentials({
  businessId,
  mailboxId,
  address,
}: {
  businessId: string;
  mailboxId: string;
  address: string;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">Mailbox credentials for {address}</p>
      {password ? (
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 text-xs">{password}</code>
          <CopyButton value={password} label="" className="px-2" />
          <Button type="button" variant="ghost" size="sm" onClick={() => setPassword(null)}>
            <EyeOff className="size-3.5" /> Hide
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              try {
                const pw = await revealMailboxPasswordAction(businessId, mailboxId);
                setPassword(pw);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not reveal credentials.");
              }
            })
          }
        >
          <Eye className="size-3.5" />
          {pending ? "Revealing…" : "Reveal password"}
        </Button>
      )}
    </div>
  );
}

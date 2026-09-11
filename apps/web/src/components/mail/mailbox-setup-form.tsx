"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { provisionMailboxAction } from "@/lib/actions/mail";

export function MailboxSetupForm({
  businessId,
  slug,
  domain,
}: {
  businessId: string;
  slug: string;
  domain: string | null;
}) {
  const boundAction = provisionMailboxAction.bind(null, businessId, slug);
  const [state, formAction, pending] = useActionState(boundAction, undefined);
  const [provider, setProvider] = useState<"cloudflare_routing" | "migadu">("cloudflare_routing");
  const [localPart, setLocalPart] = useState("hello");

  if (!domain) {
    return (
      <p className="text-sm text-muted-foreground">
        Set a domain for this business in <span className="font-medium">Settings</span> before creating a
        mailbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="localPart">Address</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="localPart"
            name="localPart"
            value={localPart}
            onChange={(e) => setLocalPart(e.target.value)}
            className="w-40"
          />
          <span className="text-sm text-muted-foreground">@{domain}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="provider">Provider</Label>
        <Select
          id="provider"
          name="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as typeof provider)}
        >
          <option value="cloudflare_routing">Cloudflare Email Routing (free, forwards only)</option>
          <option value="migadu">Migadu (real mailbox with inbox)</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          {provider === "cloudflare_routing"
            ? "Forwards incoming mail to an address you enter below. No inbox or password."
            : "A real hosted mailbox — you'll get a one-time password and can read replies here."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forwardTo">Forward to {provider === "migadu" ? "(optional)" : ""}</Label>
        <Input id="forwardTo" name="forwardTo" type="email" placeholder="you@example.com" />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Setting up…" : "Create mailbox"}
      </Button>
    </form>
  );
}

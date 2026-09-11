"use client";

import type { WizardStep } from "@adv/connectors";
import type { PlatformId } from "@adv/shared";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectWithTokenAction } from "@/lib/actions/setup";

export function TokenConnectForm({
  businessId,
  slug,
  platform,
  step,
}: {
  businessId: string;
  slug: string;
  platform: PlatformId;
  step: WizardStep;
}) {
  const boundAction = connectWithTokenAction.bind(null, businessId, slug, platform);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-success">Connected.</p> : null}
      {(step.inputs ?? []).map((input) => (
        <div key={input.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`${platform}-${input.name}`}>{input.label}</Label>
          <Input
            id={`${platform}-${input.name}`}
            name={input.name}
            type={input.secret ? "password" : "text"}
            placeholder={input.placeholder}
            required
          />
          {input.help ? <p className="text-xs text-muted-foreground">{input.help}</p> : null}
        </div>
      ))}
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? "Connecting…" : "Connect"}
      </Button>
    </form>
  );
}

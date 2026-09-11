"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensurePostHogProjectAction, saveManualPostHogAction } from "@/lib/actions/product";

export function PostHogSetupCard({
  businessId,
  slug,
  orgConfigured,
}: {
  businessId: string;
  slug: string;
  orgConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const boundManualAction = saveManualPostHogAction.bind(null, businessId, slug);
  const [manualState, manualFormAction, manualPending] = useActionState(boundManualAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect PostHog</CardTitle>
        <p className="text-xs text-muted-foreground">
          In-app analytics, heatmaps and hot screens need a PostHog project linked to this business.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {orgConfigured ? (
          <Button
            type="button"
            disabled={pending}
            className="self-start"
            onClick={() =>
              startTransition(async () => {
                const result = await ensurePostHogProjectAction(businessId, slug);
                if (result?.error) toast.error(result.error);
                else toast.success("PostHog project created");
              })
            }
          >
            {pending ? "Creating…" : "Create PostHog project"}
          </Button>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Automatic project creation needs <code className="text-xs">POSTHOG_ORG_ID</code> configured on
              the server. Until then, create a project in PostHog yourself and paste its id and client token
              below.
            </p>
            <form action={manualFormAction} className="flex flex-col gap-3">
              {manualState?.error ? <p className="text-sm text-destructive">{manualState.error}</p> : null}
              {manualState?.ok ? <p className="text-sm text-success">Saved.</p> : null}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="posthogProjectId">Project ID</Label>
                <Input id="posthogProjectId" name="posthogProjectId" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="posthogProjectToken">Client token (phc_...)</Label>
                <Input id="posthogProjectToken" name="posthogProjectToken" required />
              </div>
              <Button type="submit" size="sm" disabled={manualPending} className="self-start">
                {manualPending ? "Saving…" : "Save"}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

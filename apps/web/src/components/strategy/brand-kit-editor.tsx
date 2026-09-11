"use client";

import type { BrandKit } from "@adv/shared";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateBrandKitAction } from "@/lib/actions/strategy";

export function BrandKitEditor({
  businessId,
  slug,
  brandKit,
}: {
  businessId: string;
  slug: string;
  brandKit: BrandKit;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = updateBrandKitAction.bind(null, businessId, slug, brandKit);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit handle & bios
      </Button>
    );
  }

  const platforms = Object.keys(brandKit.bios);

  return (
    <form
      action={async (fd) => {
        await formAction(fd);
        toast.success("Brand kit updated (new version saved)");
        setOpen(false);
      }}
      className="mt-3 flex flex-col gap-4 rounded-md border border-border p-4"
    >
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="handleSuggestions">Handle suggestions (comma separated)</Label>
        <Input
          id="handleSuggestions"
          name="handleSuggestions"
          defaultValue={brandKit.handleSuggestions.join(", ")}
        />
      </div>
      {platforms.map((platform) => {
        const bio = brandKit.bios[platform as keyof typeof brandKit.bios];
        return (
          <div key={platform} className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-sm font-medium capitalize">{platform.replace("_", " ")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`bio_short_${platform}`}>Short bio</Label>
              <Textarea
                id={`bio_short_${platform}`}
                name={`bio_short_${platform}`}
                defaultValue={bio?.short ?? ""}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`bio_long_${platform}`}>Long bio (optional)</Label>
              <Textarea
                id={`bio_long_${platform}`}
                name={`bio_long_${platform}`}
                defaultValue={bio?.long ?? ""}
                rows={3}
              />
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save as new version"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

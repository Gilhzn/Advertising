"use client";

import type { PlatformId } from "@adv/shared";
import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { platformLabel } from "@/components/platform-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { addPlatformAction } from "@/lib/actions/setup";

export function AddPlatformForm({
  businessId,
  slug,
  options,
}: {
  businessId: string;
  slug: string;
  options: PlatformId[];
}) {
  const [value, setValue] = useState<PlatformId | "">("");
  const [pending, startTransition] = useTransition();

  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onChange={(e) => setValue(e.target.value as PlatformId)} className="w-56">
        <option value="">Add another platform…</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {platformLabel(p)}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        disabled={!value || pending}
        onClick={() =>
          startTransition(async () => {
            if (!value) return;
            await addPlatformAction(businessId, slug, value);
            setValue("");
          })
        }
      >
        <Plus className="size-4" />
        Add
      </Button>
    </div>
  );
}

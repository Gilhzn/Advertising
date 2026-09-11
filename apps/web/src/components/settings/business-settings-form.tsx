"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateBusinessSettingsAction } from "@/lib/actions/settings";
import type { Business } from "@/lib/data/businesses";

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "he", label: "Hebrew" },
] as const;

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Jerusalem",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function BusinessSettingsForm({ business, slug }: { business: Business; slug: string }) {
  const boundAction = updateBusinessSettingsAction.bind(null, business.id, slug);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-success">Saved.</p> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="aiMonthlyBudgetUsd">AI monthly budget (USD)</Label>
        <Input
          id="aiMonthlyBudgetUsd"
          name="aiMonthlyBudgetUsd"
          type="number"
          min={0}
          step="0.01"
          defaultValue={business.aiMonthlyBudgetUsd}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Content languages</legend>
        <div className="flex gap-4">
          {LANGUAGES.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="languages"
                value={l.id}
                defaultChecked={business.languages.includes(l.id)}
              />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryLanguage">Primary language</Label>
          <Select id="primaryLanguage" name="primaryLanguage" defaultValue={business.primaryLanguage}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Select id="timezone" name="timezone" defaultValue={business.timezone}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="domain">Domain</Label>
        <Input id="domain" name="domain" defaultValue={business.domain ?? ""} placeholder="example.com" />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

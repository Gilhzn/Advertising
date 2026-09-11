"use client";

import { useActionState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createBusinessAction } from "@/lib/actions/businesses";

const CATEGORIES = ["game", "saas", "mobile_app", "local_business", "other"] as const;
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

export default function NewBusinessPage() {
  const [state, formAction, pending] = useActionState(createBusinessAction, undefined);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New business"
        description="Tell us about the business, app or game you're promoting. The strategist will turn this into a brand kit and channel plan."
      />
      <Card>
        <CardContent className="pt-6">
          <form action={formAction} className="flex flex-col gap-5">
            {state?.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={120} placeholder="Pixel Dungeon Run" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                required
                minLength={10}
                rows={5}
                placeholder="What is it, who is it for, what makes it different?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Category</Label>
                <Select id="category" name="category" defaultValue="other">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace("_", " ")}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="primaryLanguage">Primary language</Label>
                <Select id="primaryLanguage" name="primaryLanguage" defaultValue="en">
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Content languages</legend>
              <div className="flex gap-4">
                {LANGUAGES.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="languages" value={l.id} defaultChecked={l.id === "en"} />
                    {l.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input id="websiteUrl" name="websiteUrl" type="url" placeholder="https://example.com" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="links">Extra links</Label>
              <Textarea
                id="links"
                name="links"
                rows={3}
                placeholder="One URL per line: Discord, Steam, itch.io..."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image">Image / logo</Label>
              <input
                id="image"
                name="image"
                type="file"
                accept="image/*"
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Stored locally under /uploads for now - moves to Cloudflare R2 in a later phase.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="domain">Domain (optional)</Label>
                <Input id="domain" name="domain" placeholder="example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timezone">Timezone</Label>
                <Select id="timezone" name="timezone" defaultValue="UTC">
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetRegion">Target region (optional)</Label>
              <Input id="targetRegion" name="targetRegion" placeholder="Worldwide, US, Israel..." />
            </div>

            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create business"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

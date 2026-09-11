"use client";

import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Business } from "@/lib/data/businesses";
import type { DictKey } from "@/lib/i18n";
import { t, type UiLang } from "@/lib/i18n";

export function BusinessSwitcher({
  businesses,
  activeSlug,
  lang,
}: {
  businesses: Pick<Business, "id" | "name" | "slug">[];
  activeSlug?: string;
  lang: UiLang;
}) {
  const active = businesses.find((b) => b.slug === activeSlug);
  const tt = (k: DictKey) => t(k, lang);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="truncate">{active?.name ?? tt("nav_all_businesses")}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>{tt("nav_all_businesses")}</DropdownMenuLabel>
        {businesses.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">{tt("empty_default")}</div>
        ) : (
          businesses.map((b) => (
            <DropdownMenuItem key={b.id} asChild>
              <Link href={`/b/${b.slug}`}>{b.name}</Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/businesses/new" className="gap-2">
            <Plus className="size-4" />
            {tt("nav_new_business")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import {
  BarChart3,
  Home,
  Inbox,
  LayoutGrid,
  Lightbulb,
  Mail,
  Menu,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BusinessSwitcher } from "@/components/business-switcher";
import { LangToggle } from "@/components/lang-toggle";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import type { Business } from "@/lib/data/businesses";
import { t, type UiLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function AppShell({
  businesses,
  lang,
  userEmail,
  children,
}: {
  businesses: Pick<Business, "id" | "name" | "slug">[];
  lang: UiLang;
  userEmail?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const match = pathname.match(/^\/b\/([^/]+)/);
  const activeSlug = match?.[1];

  const businessNav = activeSlug
    ? [
        { href: `/b/${activeSlug}`, label: t("nav_overview", lang), icon: Home },
        { href: `/b/${activeSlug}/strategy`, label: t("nav_strategy", lang), icon: Sparkles },
        { href: `/b/${activeSlug}/setup`, label: t("nav_setup", lang), icon: Wand2 },
        { href: `/b/${activeSlug}/content`, label: t("nav_content", lang), icon: Inbox },
        { href: `/b/${activeSlug}/platforms`, label: t("nav_platforms", lang), icon: Rocket },
        { href: `/b/${activeSlug}/analytics`, label: t("nav_analytics", lang), icon: BarChart3 },
        { href: `/b/${activeSlug}/product`, label: t("nav_product", lang), icon: LayoutGrid },
        { href: `/b/${activeSlug}/insights`, label: t("nav_insights", lang), icon: Lightbulb },
        { href: `/b/${activeSlug}/mail`, label: t("nav_mail", lang), icon: Mail },
        { href: `/b/${activeSlug}/settings`, label: t("nav_settings", lang), icon: Settings },
      ]
    : [];

  const nav = (
    <nav className="flex flex-col gap-1">
      <Link
        href="/"
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
          pathname === "/" && "bg-accent",
        )}
      >
        <Home className="size-4" />
        {t("nav_overview", lang)}
      </Link>
      {businessNav.length > 0 ? (
        <>
          <div className="mt-3 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {businesses.find((b) => b.slug === activeSlug)?.name}
          </div>
          {businessNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                pathname === item.href && "bg-accent",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </>
      ) : null}
      <div className="mt-3 border-t border-border pt-3">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
            pathname === "/settings" && "bg-accent",
          )}
        >
          <ShieldCheck className="size-4" />
          {t("nav_app_settings", lang)}
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-border p-4 md:flex md:border-r">
        <BusinessSwitcher businesses={businesses} activeSlug={activeSlug} lang={lang} />
        {nav}
        <div className="mt-auto flex flex-col gap-2">
          <LangToggle lang={lang} />
          {userEmail ? <p className="truncate px-1 text-xs text-muted-foreground">{userEmail}</p> : null}
          <SignOutButton lang={lang} />
        </div>
      </aside>

      <div className="flex items-center justify-between border-b border-border p-3 md:hidden">
        <span className="text-sm font-semibold">Advertising</span>
        <Button variant="outline" size="icon" onClick={() => setOpen((v) => !v)}>
          <Menu className="size-4" />
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-4 border-b border-border p-4 md:hidden">
          <BusinessSwitcher businesses={businesses} activeSlug={activeSlug} lang={lang} />
          {nav}
          <LangToggle lang={lang} />
          <SignOutButton lang={lang} />
        </div>
      ) : null}

      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}

function SignOutButton({ lang }: { lang: UiLang }) {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
        {t("nav_sign_out", lang)}
      </Button>
    </form>
  );
}

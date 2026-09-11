import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { listBusinesses } from "@/lib/data/businesses";
import { countAwaitingApproval } from "@/lib/data/posts";
import type { UiLang } from "@/lib/i18n";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [businesses, jar] = await Promise.all([listBusinesses(user.id), cookies()]);
  const lang = (jar.get("ui_lang")?.value as UiLang) ?? "en";

  const counts = await Promise.all(businesses.map((b) => countAwaitingApproval(b.id)));
  const awaitingApprovalByBusiness: Record<string, number> = Object.fromEntries(
    businesses.map((b, i) => [b.id, counts[i] ?? 0]),
  );

  return (
    <AppShell
      businesses={businesses}
      lang={lang}
      userEmail={user.email}
      awaitingApprovalByBusiness={awaitingApprovalByBusiness}
    >
      {children}
    </AppShell>
  );
}

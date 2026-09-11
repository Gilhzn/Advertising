import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { listBusinesses } from "@/lib/data/businesses";
import type { UiLang } from "@/lib/i18n";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [businesses, jar] = await Promise.all([listBusinesses(user.id), cookies()]);
  const lang = (jar.get("ui_lang")?.value as UiLang) ?? "en";

  return (
    <AppShell businesses={businesses} lang={lang} userEmail={user.email}>
      {children}
    </AppShell>
  );
}

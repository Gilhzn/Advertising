import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { dirFor, type UiLang } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Advertising",
  description: "AI multi-platform promotion engine",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const lang = (jar.get("ui_lang")?.value as UiLang) ?? "en";
  return (
    <html lang={lang} dir={dirFor(lang)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

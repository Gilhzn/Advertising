"use server";

import { cookies } from "next/headers";
import { UI_LANGS, type UiLang } from "@/lib/i18n";

export async function setUiLang(lang: string): Promise<void> {
  if (!UI_LANGS.includes(lang as UiLang)) return;
  const jar = await cookies();
  jar.set("ui_lang", lang, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

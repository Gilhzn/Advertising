"use client";

import { Languages } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setUiLang } from "@/lib/actions/ui";
import type { UiLang } from "@/lib/i18n";

export function LangToggle({ lang }: { lang: UiLang }) {
  const [pending, startTransition] = useTransition();
  const next: UiLang = lang === "en" ? "he" : "en";
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="gap-1.5"
      onClick={() =>
        startTransition(async () => {
          await setUiLang(next);
          window.location.reload();
        })
      }
    >
      <Languages className="size-3.5" />
      {next === "he" ? "עברית" : "English"}
    </Button>
  );
}

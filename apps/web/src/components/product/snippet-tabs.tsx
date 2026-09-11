"use client";

import type { SdkKind, Snippet } from "@adv/analytics";
import { CopyButton } from "@/components/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const LABELS: Record<SdkKind, string> = {
  web: "Web",
  react: "React",
  nextjs: "Next.js",
  ios: "iOS",
  android: "Android",
  react_native: "React Native",
  flutter: "Flutter",
  unity: "Unity",
};

export function SnippetTabs({ snippets }: { snippets: Snippet[] }) {
  return (
    <Tabs defaultValue={snippets[0]?.kind ?? "web"}>
      <TabsList className="flex-wrap">
        {snippets.map((s) => (
          <TabsTrigger key={s.kind} value={s.kind}>
            {LABELS[s.kind]}
          </TabsTrigger>
        ))}
      </TabsList>
      {snippets.map((s) => (
        <TabsContent key={s.kind} value={s.kind} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase text-muted-foreground">{s.language}</span>
            <CopyButton value={s.install} label="Copy snippet" />
          </div>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
            <code>{s.install}</code>
          </pre>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {s.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </TabsContent>
      ))}
    </Tabs>
  );
}

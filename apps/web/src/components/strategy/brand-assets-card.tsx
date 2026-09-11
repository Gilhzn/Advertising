"use client";

import type { BrandKit } from "@adv/shared";
import { ImageIcon, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { BrandAssets } from "@/components/brand-assets";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateBrandAssetsAction } from "@/lib/actions/strategy";

export function BrandAssetsCard({
  businessId,
  slug,
  assets,
}: {
  businessId: string;
  slug: string;
  assets?: BrandKit["assets"];
}) {
  const [pending, startTransition] = useTransition();
  const hasAssets = Boolean(assets?.avatarUrl || assets?.bannerUrl);

  const generate = () =>
    startTransition(async () => {
      const result = await generateBrandAssetsAction(businessId, slug);
      if (result?.error) toast.error(result.error);
      else toast.success(hasAssets ? "Brand assets regenerated" : "Brand assets generated");
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Brand assets</CardTitle>
        <Button variant="outline" size="sm" disabled={pending} onClick={generate}>
          <Sparkles className="size-3.5" />
          {pending ? "Rendering…" : hasAssets ? "Regenerate" : "Generate"}
        </Button>
      </CardHeader>
      <CardContent>
        {hasAssets ? (
          <BrandAssets assets={assets} />
        ) : (
          <EmptyState
            icon={ImageIcon}
            title="No brand assets yet"
            description="Render a downloadable avatar and banner from this brand kit's palette and tagline."
          />
        )}
      </CardContent>
    </Card>
  );
}

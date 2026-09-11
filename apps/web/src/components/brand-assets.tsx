import type { BrandKit } from "@adv/shared";
import { Download } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

/**
 * Small preview + download link for each generated brand asset. Shared by the strategy page's
 * "Brand assets" card (full previews) and the setup wizard's `create_account` steps (same tiles,
 * shown compactly above the connector's steps so the user has the avatar/banner handy while filling
 * in the platform's signup form).
 */
export function BrandAssets({ assets }: { assets?: BrandKit["assets"] }) {
  if (!assets?.avatarUrl && !assets?.bannerUrl) return null;

  return (
    <div className="flex flex-wrap items-center gap-4">
      {assets.avatarUrl ? (
        <div className="flex items-center gap-2">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            <Image
              src={assets.avatarUrl}
              alt="Avatar preview"
              fill
              unoptimized
              className="object-cover"
              sizes="48px"
            />
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={assets.avatarUrl} download target="_blank" rel="noreferrer">
              <Download className="size-3.5" />
              Avatar
            </a>
          </Button>
        </div>
      ) : null}
      {assets.bannerUrl ? (
        <div className="flex items-center gap-2">
          <div className="relative h-12 w-36 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            <Image
              src={assets.bannerUrl}
              alt="Banner preview"
              fill
              unoptimized
              className="object-cover"
              sizes="144px"
            />
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={assets.bannerUrl} download target="_blank" rel="noreferrer">
              <Download className="size-3.5" />
              Banner
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

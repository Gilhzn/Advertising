import { PLATFORMS, type PlatformId } from "@adv/shared";
import {
  AtSign,
  Building2,
  Clapperboard,
  Gamepad2,
  Globe,
  type LucideIcon,
  MapPin,
  MessageCircle,
  Newspaper,
  Pin,
  Rocket,
  Send,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** lucide-react dropped brand/logo glyphs, so every platform gets a generic, still-distinct icon. */
const ICONS: Partial<Record<PlatformId, LucideIcon>> = {
  bluesky: AtSign,
  telegram: Send,
  discord: MessageCircle,
  facebook: Users,
  instagram: Clapperboard,
  threads: AtSign,
  linkedin: Building2,
  x: AtSign,
  reddit: MessageCircle,
  tiktok: Clapperboard,
  youtube: Clapperboard,
  pinterest: Pin,
  google_business: MapPin,
  product_hunt: Rocket,
  hacker_news: Newspaper,
  itch_io: Gamepad2,
  steam: Gamepad2,
};

export function platformLabel(id: PlatformId): string {
  return PLATFORMS[id]?.label ?? id;
}

export function PlatformIcon({ id, className }: { id: PlatformId; className?: string }) {
  const Icon = ICONS[id] ?? Globe;
  return <Icon className={cn("size-4", className)} />;
}

export function PlatformBadge({ id, className }: { id: PlatformId; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <PlatformIcon id={id} />
      {platformLabel(id)}
    </span>
  );
}

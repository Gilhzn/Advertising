import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Font } from "satori";

/**
 * Vendored fonts (see `fonts/README.md` for provenance + why these are static WOFF rather than the
 * variable TTFs the build note originally called for). Inter covers Latin scripts; Noto Sans Hebrew
 * covers Hebrew (`primaryLanguage: "he"` / `direction: "rtl"`). Both weights of both families are
 * always registered regardless of which one a template's `fontFamily` names first, since satori falls
 * back across every font in the `fonts` list per glyph.
 */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const FONT_FAMILY_LATIN = "Inter";
export const FONT_FAMILY_HEBREW = "Noto Sans Hebrew";
/** Symbol/glyph-coverage fallback only (★, →, …) - never named directly in a template's `fontFamily`. */
const FONT_FAMILY_FALLBACK = "DejaVu Sans Fallback";

let cached: Font[] | undefined;

export function loadFonts(): Font[] {
  if (cached) return cached;
  const load = (file: string) => readFileSync(resolve(PACKAGE_ROOT, "fonts", file));
  cached = [
    { name: FONT_FAMILY_LATIN, data: load("Inter-Regular.woff"), weight: 400, style: "normal" },
    { name: FONT_FAMILY_LATIN, data: load("Inter-Bold.woff"), weight: 700, style: "normal" },
    { name: FONT_FAMILY_HEBREW, data: load("NotoSansHebrew-Regular.woff"), weight: 400, style: "normal" },
    { name: FONT_FAMILY_HEBREW, data: load("NotoSansHebrew-Bold.woff"), weight: 700, style: "normal" },
    { name: FONT_FAMILY_FALLBACK, data: load("DejaVuSans-Fallback.ttf"), weight: 400, style: "normal" },
  ];
  return cached;
}

/** CSS `font-family` list: the direction-appropriate font first, the other as fallback. */
export function fontFamilyFor(direction: "ltr" | "rtl" | undefined, override?: string): string {
  const primary = override ?? (direction === "rtl" ? FONT_FAMILY_HEBREW : FONT_FAMILY_LATIN);
  const fallback = primary === FONT_FAMILY_HEBREW ? FONT_FAMILY_LATIN : FONT_FAMILY_HEBREW;
  return `${primary}, ${fallback}`;
}

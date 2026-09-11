# Vendored fonts

**Attempt 1 (as originally planned): raw variable TTFs from the Google Fonts GitHub mirror.**

```
curl -o Inter-Variable.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf"
curl -o NotoSansHebrew-Variable.ttf \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/NotoSansHebrew%5Bwdth,wght%5D.ttf"
```

Both downloaded fine (200s, correct TrueType signatures), but satori's bundled font parser
(`@shuding/opentype.js`) threw `Cannot read properties of undefined (reading '256')` in
`parseFvarAxis` for both files — it cannot parse the `fvar` table format these particular Google
Fonts variable-font builds use. This is a satori/opentype.js compatibility issue, not a network or
licensing one; `fc-list` was checked as the documented fallback but this box has no Hebrew-capable
system font at all (only DejaVu/Liberation/FreeFont/WenQuanYi — no `he-IL` coverage), so a system-font
fallback could not cover Hebrew.

**What's actually vendored: static, per-weight WOFF builds of the same two families,** pulled from the
`@fontsource` npm mirror (which repackages the exact same Google Fonts OFL sources into static
instances) via `npm pack`:

```
npm pack @fontsource/inter@5.3.0
npm pack @fontsource/noto-sans-hebrew@5.3.0
# then copied out of files/:
#   inter-latin-400-normal.woff       -> Inter-Regular.woff
#   inter-latin-700-normal.woff       -> Inter-Bold.woff
#   noto-sans-hebrew-hebrew-400-normal.woff -> NotoSansHebrew-Regular.woff
#   noto-sans-hebrew-hebrew-700-normal.woff -> NotoSansHebrew-Bold.woff
```

Verified working end-to-end with satori (mixed Latin+Hebrew render succeeds; see
`src/render.test.ts`). Same license (OFL) and same upstream font projects, just a static WOFF build
instead of a variable TTF one — and a real bold instance instead of a variable font pinned at its
default weight. `src/fonts.ts` is the only place that would need to change for a different font
choice or format later.

**`DejaVuSans-Fallback.ttf`** — copied from this environment's system fonts
(`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`, the `fc-list` fallback the build note allows) and
committed here rather than read from the filesystem at render time, so the fallback survives a
container image that doesn't happen to have `fonts-dejavu-core` installed. It is registered as a third
`loadFonts()` entry purely for glyph coverage — satori automatically falls back to any loaded font that
has the needed glyph, independent of the CSS `font-family` string, which is exactly what symbols like
`★` in a `stat` template's `stat` field (e.g. `"4.9 ★"`) need: neither Inter nor Noto Sans Hebrew's
Hebrew-subset build contains U+2605. Public domain / Bitstream Vera + DejaVu fonts license (free
redistribution, no restriction).

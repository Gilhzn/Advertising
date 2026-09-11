# itch.io — assisted connector notes

Researched 2026-09-11. Confidence **high** for "no posting API" (itch.io's documented API surface is
read-only page/download data plus OAuth for *reading* a user's games; `butler` is a build-upload
CLI); **medium** for the page limits, from `packages/knowledge/platforms/itch_io.md`.

## Why assisted

`authKind: "assisted"`, `capabilities.manualPublish = true`. The two write paths itch.io exposes are
both the wrong shape:

- **`butler`**, itch.io's CLI, pushes **builds** (delta uploads, no practical size cap). It does not
  create devlogs or forum posts.
- The web API/OAuth surface reads a user's games and download keys; it does not post.

So devlogs and Release Announcements are prepared here and published by hand.

## What the wizard prepares

| Field | Limit |
| --- | --- |
| Project title | ~80 characters |
| **Short description / tagline** | **~120 characters** — shown in lists, search and every link embed; the highest-leverage text on the page |
| Page description / devlog body | Markdown or rich text, no practical cap (metadata records 10,000) |
| Tags | up to **10**, from itch.io's vocabulary plus free tags |
| Cover image | 630x500 recommended; animated GIF allowed and effective |
| Web upload | 1 GB per file, or `butler` for anything bigger |

Devlogs **cannot be scheduled**; project pages can sit in Draft/Restricted and be published manually.

## Community rules

Post only in **Release Announcements** on the community boards. The other boards are for players and
self-promotion there is removed. One announcement per release.

## Insights

None. `fetchInsights()` returns `[]` — views and downloads live in the creator dashboard, which has
no public API.

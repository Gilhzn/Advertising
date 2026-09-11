# PostHog API research notes

Written while building `@adv/analytics`. `https://posthog.com` itself is blocked by this
environment's network egress proxy (`EGRESS_BLOCKED` on every direct `WebFetch` to
`posthog.com` and to a `posthog-posthog.mintlify.app` mirror), and PostHog's API-reference
pages (`/docs/api/projects`, `/docs/api/heatmaps`, `/docs/api/session-recordings`, ...) are
generated at build time from `https://app.posthog.com/api/schema/` rather than checked into
the `PostHog/posthog.com` docs repo as static files, so they aren't fetchable from GitHub raw
either (404s below). What follows is separated into what was actually fetched and confirmed
this session vs. what is implemented from well-established, stable PostHog API knowledge that
could not be independently re-verified here. **Before this ships against a real PostHog
project, re-run the client against a real project with `POSTHOG_PERSONAL_API_KEY` set and
diff the response shapes against `src/posthog.ts`.**

## Verified this session (fetched successfully)

- **HogQL query endpoint** — `POST /api/projects/:project_id/query/`, body
  `{ "query": { "kind": "HogQLQuery", "query": "<sql>" }, "name"?: "<label>" }`.
  Source: `https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/queries.mdx`
  (hand-authored page, not generated — fetched directly).
- **Query endpoint rate limits** — 2400 requests/hour, 240/minute, 3 concurrent queries max,
  10s max execution time per query. On budget exhaustion: `429` with JSON body
  `{ "code": "api_queries_budget_exceeded" }` and a `Retry-After` header. Additional headers
  `X-PostHog-Query-Bytes-Read` / `X-PostHog-Query-Budget-Remaining-Bytes` are documented.
  Source: same `queries.mdx` fetch above.
  **Note:** the task brief cites "120/hr" for this endpoint; an archived docs mirror
  (`archive.posthog.com/docs/api/queries`, surfaced via web search) also states 120/hour. The
  live `queries.mdx` we fetched states 2400/hour. PostHog has evidently raised this limit over
  time. `AnalyticsError` from `src/posthog.ts` never hardcodes a limit — it reads the
  `Retry-After` response header (falling back to `undefined` if absent) and surfaces the
  server-reported `code`, so the client is correct regardless of which number is current.
- **General rate-limit tiers** (from `contents/docs/api/index.mdx`, hand-authored, fetched
  directly): analytics endpoints 240/min & 1200/hour; query endpoint 2400/hour; feature-flag
  evaluation 600/min; CRUD operations 480/min & 4800/hour; capture (`/i/v0/e`) endpoints
  unlimited.
- **Web analytics is a real, distinct PostHog feature** — a pre-built dashboard over
  `$pageview`/`$autocapture` events (visitors, pageviews, sessions, bounce rate, referrers,
  UTMs, Core Web Vitals), not a separate ingestion mechanism. Bounce is defined precisely as:
  *a session with exactly one pageview, zero autocaptures, and less than 10 seconds of
  duration*. Source: web search summarizing `posthog.com/docs/web-analytics/dashboard` and
  `posthog.com/tutorials/bounce-rate` (page content itself unreachable — `posthog.com`
  blocked). `queries.ts#overview` implements bounce with exactly this definition over HogQL
  (per-`$session_id` aggregation of pageview count / autocapture count / max
  `$session_duration`), rather than calling a "web analytics" endpoint — there does not appear
  to be a public non-HogQL REST endpoint for this; the dashboard is UI-only atop
  `WebOverviewQuery`/`WebStatsTableQuery` query kinds, which are internal-only sibling kinds to
  `HogQLQuery` and not documented as free-form public API surface, so we compute the same
  metric via HogQL directly as the task allows.
- **Project creation endpoint shape** — cross-referenced via web search of
  `posthog.com/docs/api/projects` (the page itself 404s over direct fetch;
  `search`-engine-cached summary was consistent across two independent snippets):
  `POST /api/organizations/:organization_id/projects/`, `Authorization: Bearer <personal api
  key>`, body includes `name`; `201` response includes `id`, `organization`, `name`,
  `api_token`. This matches PostHog's long-stable, widely-referenced REST shape. Implemented
  as documented in `src/posthog.ts#createProject` / `#getProject`.

## Not independently verified this session (implemented from stable, well-known PostHog API
## surface — flag before relying on exact field names in production)

- **Heatmaps API** — PostHog docs list two separate reference pages,
  "Heatmaps API Reference" (`/docs/api/heatmaps`) and "Heatmap API Reference"
  (`/docs/api/heatmap-screenshots`), confirming the task's hint that there's a distinct
  screenshot resource. Neither page's generated content was fetchable (blocked domain +
  not-checked-in generated docs). `src/posthog.ts#listHeatmaps` is implemented against the
  well-known shape (`GET /api/projects/:id/heatmaps/?type=click&date_from=...&date_to=...`,
  returning aggregated `{x, y, count, ...}` buckets keyed by page URL) — i.e. **only saved /
  aggregated heatmap data is exposed**, matching the task's fallback instruction ("if the API
  only exposes saved heatmaps, implement that and document"). `getHeatmapScreenshot` calls a
  guessed `GET /api/projects/:id/heatmaps/screenshot/` and returns the raw JSON body typed
  loosely (`Record<string, unknown>`) specifically so a shape mismatch degrades to "field not
  present" rather than a runtime crash. **Action item:** confirm the real path/fields against
  a live project before wiring this into a dashboard.
- **Session recordings list** — `GET /api/projects/:id/session_recordings/?limit=N`, response
  `{ results: [...], next?: string }`, one of PostHog's longest-stable public endpoints.
  Implemented as-is in `src/posthog.ts#listRecordings`; result rows are typed loosely
  (`SessionRecordingSummary` keeps only the handful of fields we rely on and passes the rest
  through) for the same reason.
- **Autocapture / event schema** (`$pageview`, `$autocapture`, `$rageclick`, `$screen`,
  `$current_url`, `$screen_name`, `$session_id`, `$session_duration`, `elements_chain`,
  `utm_source`/`utm_medium`/`utm_campaign`) — PostHog's standard, publicly documented
  autocapture event/property names, used throughout `src/queries.ts`'s HogQL builders. Assumed
  stable; not re-verified against a live schema this session.
- **`funnel()` and `retention()` HogQL builders** are intentionally simplified,
  single-HogQL-query approximations of PostHog's native `FunnelsQuery`/`RetentionQuery` kinds
  (which are not `HogQLQuery` and not exercised here per the task's "HogQL builders"
  requirement): `funnel()` returns independent per-step distinct-user counts within the
  period (no ordering/time-window enforcement between steps — a real sequential/windowed
  funnel needs PostHog's dedicated query kind or a more elaborate `arraySort`/window-function
  HogQL query); `retention()` buckets each person by their first-seen day in the period via a
  ClickHouse window function and checks whether they returned exactly `cohortDays` later. Both
  are documented inline in `src/queries.ts` and in each function's JSDoc.
- **`topScreens()` time-on-screen** — HogQL has no per-pageview "time spent" property, so
  "total time" is approximated by summing PostHog's session-level `$session_duration` property
  across every `$pageview`/`$screen` row for that screen. This **overcounts** sessions with
  multiple pageviews on the same screen (each row in the sum carries the same whole-session
  duration) — documented as an approximation both in NOTES and inline JSDoc, per the task's
  explicit allowance to approximate and document.
- **PostHog SDK install snippets** (`src/setup.ts#snippetFor`) for web/React/Next.js/iOS/
  Android/React Native/Flutter/Unity are written from stable, widely-published PostHog SDK
  installation patterns (`posthog-js`, `posthog-ios`, `posthog-android`, `posthog-react-native`,
  `posthog_flutter`, PostHog Unity SDK). The Unity SDK's exact API surface is the least certain
  of the set (fewest public references) — flagged inline in that snippet's `notes` array;
  confirm against `posthog.com/docs/libraries/unity` before shipping it verbatim.

## URLs consulted

- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/queries.mdx (fetched OK)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/index.mdx (fetched OK)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/projects.mdx (404 — generated page, not in repo)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/organizations.mdx (404 — generated page)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/heatmaps.mdx (404 — generated page)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/heatmap-screenshots.mdx (404 — generated page)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/api/session-recordings.mdx (404 — generated page)
- https://raw.githubusercontent.com/PostHog/posthog.com/master/contents/docs/integrate/provisioning.mdx (fetched OK — a different, partner-oriented OAuth provisioning API, not used here)
- https://posthog.com/docs/api/projects, /docs/api/heatmaps, /docs/api/heatmap-screenshots, /docs/api/session-recordings, /docs/web-analytics/dashboard, /docs/web-analytics/getting-started, /tutorials/bounce-rate — all `posthog.com`, blocked by egress proxy; consulted only indirectly via `WebSearch` result snippets.

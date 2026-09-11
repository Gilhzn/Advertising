# Bluesky (atproto) - verified API notes

Researched 2026-09-11. Primary sources below are the **lexicon files and PDS source in
`bluesky-social/atproto@main`**, which are the authoritative definition of the wire format
(`docs.bsky.app` and `atproto.com` were unreachable from this environment, so every claim here is
backed by the repository instead of the rendered docs).

## Auth - app passwords, not OAuth

`authKind: "token"`. The user pastes `handle` + an **app password** created at
<https://bsky.app/settings/app-passwords>.

- `POST {pds}/xrpc/com.atproto.server.createSession`
  body `{ identifier, password, authFactorToken?, allowTakendown? }`
  → `{ accessJwt, refreshJwt, handle, did, active?, status? }`
  Errors: `AccountTakedown`, `AuthFactorTokenRequired`.
  <https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/server/createSession.json>
- `POST {pds}/xrpc/com.atproto.server.refreshSession` — **authenticated with the `refreshJwt`, not
  the accessJwt** → same payload shape. Errors: `InvalidToken`, `ExpiredToken`, `AccountTakedown`.
  <https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/server/refreshSession.json>

Default PDS host is `https://bsky.social`; we store the host in `config.pdsUrl` so self-hosted PDSs
work. Because `Connector.refresh(tokens)` has no account context, this connector also implements the
added optional `refreshForAccount(account)` which uses `config.pdsUrl`.

## Publishing

`POST {pds}/xrpc/com.atproto.repo.createRecord` with
`{ repo: <did>, collection: "app.bsky.feed.post", record }` → `{ uri, cid, commit, validationStatus }`.
<https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/repo/createRecord.json>

`app.bsky.feed.post` record (verified field names):
`text` (maxLength 3000 **bytes**, maxGraphemes **300**), `createdAt` (required), `facets`, `reply`,
`embed`, `langs` (max 3), `tags` (max 8), `labels`.
<https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json>

- Thread replies: `reply: { root: {uri,cid}, parent: {uri,cid} }` (`#replyRef`, both required).
- Images: `embed = { $type: "app.bsky.embed.images", images: [{ image: <blob>, alt, aspectRatio? }] }`,
  **max 4 images, blob maxSize 2,000,000 bytes, accept `image/*`**.
  <https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/embed/images.json>
- Blob upload: `POST /xrpc/com.atproto.repo.uploadBlob`, `Content-Type` = the real media type, body =
  raw bytes → `{ blob }`. Blobs are garbage-collected if not referenced within minutes.
  <https://github.com/bluesky-social/atproto/blob/main/lexicons/com/atproto/repo/uploadBlob.json>

### Facets

`app.bsky.richtext.facet` = `{ index: { byteStart, byteEnd }, features: [...] }` where the index is
**UTF-8 byte offsets, not UTF-16** — the lexicon calls this out explicitly for JavaScript callers.
Features: `#link {uri}`, `#tag {tag}` (without the `#`), `#mention {did}` (a **DID**, not a handle).
<https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/richtext/facet.json>

We use `@atproto/api`'s `RichText.detectFacetsWithoutResolution()` for detection (pure, no network —
verified in `dist/rich-text/detection.js`, where the mention feature is emitted with the *handle*
placed in `did` and the comment `// must be resolved afterwards`), then resolve mentions ourselves via
`com.atproto.identity.resolveHandle` through `fetchJson`, so all HTTP stays in `src/http.ts`. An
unresolvable mention degrades to plain text rather than failing the post.

## Insights

- `app.bsky.feed.getPostThread?uri=&depth=0` → `thread.post.{likeCount,repostCount,replyCount,quoteCount}`.
- `app.bsky.feed.getAuthorFeed?actor=&limit=&filter=posts_no_replies` → `feed[].post` (same counters),
  used when we have no stored post ids yet; filtered client-side by `indexedAt >= since`.
- `app.bsky.actor.getProfile?actor=` → `followersCount` → `followers`.

There is no impressions/reach metric in the AppView API — Bluesky simply does not publish one.

## Rate limits (verified in PDS source)

`packages/pds/src/rate-limits.ts`: shared `repo-write-hour` = **5,000 points/hour** and
`repo-write-day` = **35,000 points/day**, with the inline comment `creates=3, puts=2, deletes=1`;
`createRecord.ts` confirms `calcPoints: () => 3`. So ≈1,666 creates/hour, ≈11,666/day.
`createSession` is limited to **300/day per account** and **30 per 5 minutes per IP**
(`packages/pds/src/api/com/atproto/server/createSession.ts`).
Our `rateLimit` is a deliberately conservative 60/hour — a marketing account never needs more, and it
leaves headroom for thread posts (one `createRecord` each).

## Deviations from `PLATFORMS.bluesky`

`PLATFORMS` marks `video: true`. The connector reports `video: false`: `app.bsky.embed.video`
requires uploading through the separate video service (`video.bsky.app`, job-based with a processing
poll), which is out of scope for wave 1. `publish` raises `invalid_media` if a video is attached.

## Review / audit

None. App passwords work the day the account is created; there is no developer program, no app
review and no quota application. See `docs/app-reviews.md`.

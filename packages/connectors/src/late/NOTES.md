# Late (getlate.dev) aggregator — research notes

Researched 2026-09-11. **`getlate.dev` is blocked by the build proxy**, so the request shape below
comes from a **mirror of Late's own published skill documentation** on GitHub
(`sundial-org/awesome-openclaw-skills@main:skills/late-api/*`, whose `SKILL.md` describes itself as
"Official Late API reference" and links back to `getlate.dev/docs`). Duplicates of the same files
exist in `modbender/skill-library-mcp` and `mmcmedia/openclaw-agents`.

> **Confidence: unverified.** No response from Late's API was observed. Endpoint paths, the request
> body and the rate limits are second-hand; the **response** shape in particular (`post._id` vs `_id`)
> is a guess, which is why `postIdOf()` accepts both wrappings and both id spellings. Re-verify
> against a live key before enabling this route for a customer.

| Fact | Confidence |
| --- | --- |
| Base URL `https://getlate.dev/api/v1`, `Authorization: Bearer sk_…` | medium |
| `POST /v1/posts` with `content` + `platforms[]` + `publishNow` / `scheduledFor` | medium |
| `mediaItems: [{type, url}]` | medium |
| `GET /v1/accounts/{id}/health` | medium |
| Error envelope `{ error, code, details }` and the code list | medium |
| Rate limits 60/120/600/1200 per minute by plan | low |
| **Response body shape** | **low** |
| Late's platform key for `google_business` | **low** — guessed as `google_business`; the accounts API exposes a `gmb-reviews` sub-resource, so it may be `gmb` |

## What this is for

Late is a **fallback transport**, not a replacement for the first-party connectors. It exists for one
situation: a platform whose app review has not cleared (TikTok's audit, Pinterest Standard access,
Google Business quota) where the customer already has a Late subscription and wants to publish now.

Routing is per-account and opt-in:

- `LATE_API_KEY` must be set on the deployment (`isLateEnabled()`), **and**
- the account row must carry `config.via === "late"`.

`registerAllConnectors()` never registers Late connectors, because the registry is keyed by platform
id and doing so would silently replace the real connector for every business on the deployment.
Instead `resolveConnector(platform, account)` in `all.ts` returns the Late connector for exactly the
accounts that asked for it. `lateConnectors()` returns `[]` when the key is unset.

## Mapping

```jsonc
POST https://getlate.dev/api/v1/posts
{
  "content": "<composeBody output for the real platform>",
  "platforms": [ { "platform": "twitter", "accountId": "<config.lateAccountId>" } ],
  "publishNow": true,
  "mediaItems": [ { "type": "image", "url": "https://…" } ]
}
```

`content` is composed with **our** platform's conventions (`composeBody({ platform })`), so an X post
routed through Late still gets X's hashtag and link rules and X's 280-character limit.

`publishNow: true` always: our worker owns scheduling, approvals and the calendar, and having two
schedulers disagree is worse than any latency it saves. (`scheduledFor` and `queuedFromProfile` exist
and are deliberately unused.)

Platform name map (`LATE_PLATFORM_NAMES`): our `x` → Late's `twitter`; the other eleven are identity
mappings. Late supports 13 platforms (Snapchat and Instagram Stories are theirs, not ours); our four
assisted platforms are not routable and `createLateConnector` throws for them.

## Insights

`fetchInsights()` returns `[]`. Late's analytics endpoints are platform-specific and partial
(`linkedin-post-analytics`, YouTube daily views) and mapping them per platform would be a second
integration. `verify()` says so in a `warning` so the user is not surprised by an empty analytics
tab for that account.

## Cost / privacy note

Late is a paid third party on a per-plan basis, and **posts, media URLs and the platform OAuth tokens
live in their infrastructure**. The wizard's first step says this plainly and the caveat tells the
user not to route a platform through Late if that is unacceptable for the business. This is a
deliberate product decision surfaced to the user, not a default.

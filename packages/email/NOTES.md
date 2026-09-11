# API verification notes

`developers.cloudflare.com`, `resend.com`, and `migadu.com` are blocked by this
session's network egress proxy, so the facts below were verified against the
**official Cloudflare TypeScript SDK source**, the **official Resend Node SDK
source**, and a **community Go client + Terraform provider for Migadu**
(Migadu has no official SDK) on `raw.githubusercontent.com`/`github.com`,
plus targeted web search. Anything not confirmed this way is marked
UNVERIFIED and handled defensively in code (documented inline too).

## Cloudflare API v4

Base URL: `https://api.cloudflare.com/client/v4`. Auth: `Authorization: Bearer
<CLOUDFLARE_API_TOKEN>`.

Verified from `cloudflare/cloudflare-typescript` (`src/resources/**`):

- Zones — `GET /zones` — list, filterable by `name` (supports `contains`,
  `starts_with`, etc. operators; we use plain equality per candidate domain).
  Source: https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/zones/zones.ts
- DNS records (`src/resources/dns/records.ts`):
  https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/dns/records.ts
  - `POST /zones/{zone_id}/dns_records` — create
  - `PUT /zones/{zone_id}/dns_records/{dns_record_id}` — update
  - `GET /zones/{zone_id}/dns_records` — list
  - `DELETE /zones/{zone_id}/dns_records/{dns_record_id}` — delete
  - Fields: `type`, `name`, `content`, `ttl` (1 = automatic, else 60-86400),
    `proxied`, `priority` (MX/SRV/URI only), `comment`.
- Email Routing settings (`src/resources/email-routing/email-routing.ts`):
  https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/email-routing/email-routing.ts
  - `POST /zones/{zone_id}/email/routing/enable` — enable (SDK marks this
    **deprecated** but it is still the shipped/functional method; the newer
    dashboard flow auto-enables routing when the first rule is created. We
    call `enable` explicitly and treat a 400 "already enabled" style error as
    success by checking `getEmailRoutingSettings` first).
  - `GET /zones/{zone_id}/email/routing` — get settings (`Settings` type has
    `enabled`, `name`, `created`, `modified`, `skip_wizard`, `status`, `tag`).
  - `GET /zones/{zone_id}/email/routing/dns` — required DNS records
    (`DNSRecord[]`: `type`, `name`, `content`, `priority`, `ttl`).
    Source: https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/email-routing/dns.ts
- Destination addresses (account-scoped) (`src/resources/email-routing/addresses.ts`):
  https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/email-routing/addresses.ts
  - `POST /accounts/{account_id}/email/routing/addresses` body `{ email }`
  - `GET /accounts/{account_id}/email/routing/addresses` — list
  - Response `Address`: `id`, `email`, `created`, `modified`, `verified`
    (null until the recipient clicks the confirmation email Cloudflare sends).
- Routing rules (`src/resources/email-routing/rules/rules.ts`):
  https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/email-routing/rules/rules.ts
  - `POST /zones/{zone_id}/email/routing/rules` body
    `{ matchers: [{ type: "literal", field: "to", value }], actions: [{ type: "forward", value: [dest] }], enabled, name }`
  - `GET /zones/{zone_id}/email/routing/rules` — list (used for idempotency).

UNVERIFIED: the exact wording of Cloudflare's error body when
`email/routing/enable` is called on an already-enabled zone, and when a
destination address that already exists is re-POSTed. Code does not rely on
error-message parsing for idempotency — it always lists first and compares,
falling back to treating a non-2xx create call as fatal only when the
resource still doesn't show up on a follow-up list/get.

## Migadu API

No official docs reachable; verified against `metio/migadu-client.go`
(actively maintained Go client backing a published Terraform provider):

- Base URL: `https://api.migadu.com/v1/` — confirmed in
  https://raw.githubusercontent.com/metio/migadu-client.go/main/client/migadu_client.go
  (`New()` default endpoint).
- Auth: HTTP Basic (`req.SetBasicAuth(username, token)`) → username is the
  Migadu admin email, password is the API key. Matches
  `MIGADU_ADMIN_EMAIL` / `MIGADU_API_KEY` env vars already in `.env.example`.
- Mailboxes (`client/mailboxes.go`):
  https://raw.githubusercontent.com/metio/migadu-client.go/main/client/mailboxes.go
  - `GET domains/{domain}/mailboxes` — list
  - `GET domains/{domain}/mailboxes/{local_part}` — get
  - `POST domains/{domain}/mailboxes` — create
  - `PUT domains/{domain}/mailboxes/{local_part}` — update
  - `DELETE domains/{domain}/mailboxes/{local_part}` — delete
  - Mailbox JSON fields (`model/mailboxes.go`):
    https://raw.githubusercontent.com/metio/migadu-client.go/main/model/mailboxes.go
    `local_part`, `domain_name`, `address`, `name`, `password`,
    `password_method`, `password_recovery_email`, `is_internal`, `may_send`,
    `may_receive`, ... We only send `local_part`, `name`, `password` on
    create — UNVERIFIED what `password_method` enum values are legal, so we
    omit it and rely on Migadu defaulting to "set this exact password" when
    `password` is present (this is the behavior documented by every
    third-party client and blog post we found).
- **No domain/DNS/verification endpoints exist in the public API** — the
  `ClientInterface` in
  https://raw.githubusercontent.com/metio/migadu-client.go/main/client/interface.go
  only exposes aliases/identities/mailboxes/rewrite-rules. The
  `hosted-email-verify=<code>` TXT value shown in Migadu's dashboard has no
  documented API to fetch programmatically, so `requiredDnsRecords(domain,
  verifyCode?)` takes it as an **optional, manually-supplied** parameter and
  simply omits that record when not given (all mail-flow records — MX, SPF,
  DKIM, DMARC — are still returned; those are fixed strings, not
  domain-specific secrets, and don't need an API).
- Required DNS records (MX/SPF/DKIM/DMARC), cross-checked against a
  real, working DNSControl config for Migadu:
  https://gist.github.com/tennox/f2836fb57e2ac3b54c0c044b7777eb35
  - `MX @ 10 aspmx1.migadu.com`, `MX @ 20 aspmx2.migadu.com`
  - `TXT @ "v=spf1 include:spf.migadu.com -all"`
  - `CNAME key1._domainkey -> key1.<domain>._domainkey.migadu.com` (and
    key2/key3 the same way). **Note**: the task brief's suggested target
    shape (`key1.<domain>.dkim.migadu.com`) does not match this verified,
    working example — the real target is
    `key{N}.<domain>._domainkey.migadu.com`. We implemented the verified
    form.
  - `TXT _dmarc "v=DMARC1; p=quarantine;"` (a reasonable default policy;
    Migadu's dashboard may suggest stricter policies later — this is a
    starting point, not something Migadu's API dictates).

## Resend API

Verified against `resend/resend-node` SDK source:

- Base URL: `https://api.resend.com`. Auth: `Authorization: Bearer
  <RESEND_API_KEY>` (standard, not separately re-verified — this is Resend's
  universally documented and unchanged auth scheme).
- Domains (`src/domains/domains.ts`,
  `src/domains/interfaces/domain.ts`):
  https://raw.githubusercontent.com/resend/resend-node/main/src/domains/domains.ts
  https://raw.githubusercontent.com/resend/resend-node/main/src/domains/interfaces/domain.ts
  - `POST /domains` body `{ name }` → response includes a `records` array
    (each record: `record`, `name`, `type` (`MX`|`TXT`|`CNAME`|`CAA`),
    `value`, `ttl`, `status`, and `priority` for the receiving MX record) —
    UNVERIFIED exact top-level response envelope key casing beyond what the
    SDK types show (`Domain` itself doesn't literally embed `records`; the
    create-response wrapper type does per Resend's public docs/community
    write-ups). Code treats the response defensively (`records ?? []`).
  - `POST /domains/{id}/verify` — trigger re-check.
  - `GET /domains` — list (used so `verifyDomainSetup` is idempotent: if a
    domain with that name already exists, we return it instead of creating a
    duplicate).
- Emails (`src/emails/interfaces/create-email-options.interface.ts`):
  https://raw.githubusercontent.com/resend/resend-node/main/src/emails/emails.ts
  - `POST /emails` body: `from`, `to`, `subject`, `html`, `text`,
    `reply_to` (camelCase `replyTo` in the SDK, snake on the wire), `cc`,
    `bcc`.

## What this means for the code

- `cloudflare.ts` and `migadu.ts` hit `fetch` directly (there is no shared
  `packages/connectors/src/http.ts` yet — it doesn't exist in this repo as of
  this task, and this package must not create files outside
  `packages/email`), with a small internal retry/timeout wrapper local to
  this package (`src/http.ts`) mirroring the conventions described in
  `CLAUDE.md` (timeouts, retries, structured `JobError`-style errors,
  logging via `@adv/shared` `logger`, never logging secrets/tokens).
- All provider calls are designed to be safe to re-run (see idempotency notes
  above); `provisionMailbox` / `verifyMailboxDns` never assume a step hasn't
  already happened.

# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead: **Security -> Report a vulnerability** on this repository
(https://github.com/Gilhzn/Advertising/security/advisories/new). Include what you found, how to
reproduce it, and what an attacker could do with it. You will get a first response within a few days.

## What this project handles

This engine stores OAuth tokens for social platforms, a mailbox password, and the content queued for
publishing on a business's behalf. The parts that matter most to its security are:

| Area | Where |
|---|---|
| Token encryption at rest (AES-256-GCM) | `packages/shared/src/crypto.ts` |
| Secret redaction before anything is logged or stored | `packages/shared/src/redact.ts` |
| Outbound request guards (SSRF) | `packages/agents/src/tools/safe-fetch.ts`, `packages/connectors/src/net-guard.ts` |
| The human-approval gate for community posts | `packages/agents/src/tools/engine.ts`, `packages/agents/src/hooks.ts`, `apps/worker/src/jobs/publish_post.ts` |
| Sign-in | `apps/web/src/auth.ts`, `apps/web/src/lib/owner-auth.ts` |
| Per-request authorization | `apps/web/src/lib/actions/`, `apps/web/src/lib/data/` |

The findings from each audit, what was fixed and what was accepted, are recorded in
[`docs/security-review.md`](docs/security-review.md).

## Running this yourself

- Never commit a `.env`. Only `.env.example` belongs in the repository.
- `TOKEN_ENCRYPTION_KEY` must be the same value everywhere the engine runs, and changing it makes
  every stored platform token undecryptable - reconnect the accounts after a rotation.
- Generate secrets on your own machine (`openssl rand -hex 32`). Do not paste a secret that was
  generated inside a chat transcript, a ticket or a shared document into a production environment.
- The worker must not run as root: the agent runtime refuses permission bypass for the root user.

## A note for contributors

This repository contains a Claude Code `SessionStart` hook (`.claude/settings.json`) that runs
`scripts/session-start.sh` when the project is opened in Claude Code. That is a convenience for
development, and it also means a pull request that edits that script proposes code that would run on
a reviewer's machine. Those paths are covered by `CODEOWNERS`; review changes to them by reading the
diff before checking the branch out.

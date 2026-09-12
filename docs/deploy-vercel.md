# Deploying to Vercel (dashboard) + Neon (Postgres) + GitHub Actions (worker)

This is the zero-server setup: Vercel hosts the Next.js dashboard, Neon hosts Postgres, and the worker
(AI agents, publishing, insights, mailbox provisioning) runs as a scheduled GitHub Actions job every
10 minutes. The repository is public, so those minutes are free.

Everything below is a one-time setup of about 10 minutes. After that, every push to the production
branch redeploys the dashboard automatically, and the worker keeps ticking on its own.

## 1. Vercel project (dashboard)

1. https://vercel.com/new → **Import** `Gilhzn/Advertising` (authorize the GitHub app if asked).
2. **Root Directory**: `apps/web` — this is the step people miss. In the import screen the field shows
   `./` by default; click **Edit** next to it and pick `apps/web`. (Existing project: Settings → General →
   Root Directory → `apps/web` → Save → Redeploy.) If it stays `./`, the build fails on purpose within
   seconds with the message "this Vercel project must use Root Directory = apps/web".
   `apps/web/vercel.json` sets the monorepo install/build commands (only the dashboard's workspace
   dependencies are installed, so the build is fast).
3. **Production Branch**: `claude/multi-platform-business-promotion-nq9iea` (Settings → Git after the
   first import), or merge that branch into `main` first.
4. Do not deploy yet — add storage and variables first (steps 2 and 3), then **Deploy**.

## 2. Storage (Vercel Marketplace, all inside the project)

- **Neon Postgres**: Storage → *Create Database* → **Neon** → free plan → connect to the project.
  Vercel injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` into the project's environment.
- **Blob**: Storage → *Create* → **Blob** → connect. Vercel injects `BLOB_READ_WRITE_TOKEN`; uploaded
  logos, rendered post images and brand assets are stored there (the filesystem on Vercel is read-only).
  If you prefer Cloudflare R2, set the `R2_*` variables instead - R2 wins when both are present.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Value |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` (64 hex chars; **the same value must be used by the worker**) |
| `APP_URL` | `https://<your-project>.vercel.app` (set after the first deploy, then redeploy) |
| `OWNER_EMAIL` | your login email |
| `OWNER_PASSWORD` | the password you want to sign in with. Quickest path - nothing to run locally. |
| `OWNER_PASSWORD_HASH` | optional hardening instead of `OWNER_PASSWORD`: run `pnpm owner:hash '<your password>'` locally and paste the result. |
| `ANTHROPIC_API_KEY` | only needed on Vercel if you enable image generation or direct API calls from the dashboard; the agents run in the worker |
| Platform apps (optional) | `META_APP_ID/SECRET`, `THREADS_APP_ID/SECRET`, `LINKEDIN_CLIENT_ID/SECRET`, `X_CLIENT_ID/SECRET`, `REDDIT_*`, `TIKTOK_*`, `GOOGLE_*`, `PINTEREST_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` - needed for the wizard's OAuth/token steps of each platform |
| `POSTHOG_HOST`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_ORG_ID` | optional, product analytics |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `EMAIL_PROVIDER`, `MIGADU_*`, `RESEND_API_KEY` | optional, business mailbox |

OAuth redirect URIs to register in each platform's developer console: `https://<your-project>.vercel.app/api/oauth/<platform>/callback`.

The sign-in page doubles as a setup screen: until a sign-in provider exists it lists exactly which
of these variables are still missing (names only, never values).

Then **Deploy**. The build runs `pnpm db:migrate` against Neon, so the schema is always current.
Open `https://<your-project>.vercel.app/login` and sign in with `OWNER_EMAIL` + your password.

## 4. Worker (GitHub Actions)

GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `DATABASE_URL` | the **unpooled** Neon string (`DATABASE_URL_UNPOOLED` in Vercel → Storage → Neon → `.env.local` tab) |
| `ANTHROPIC_API_KEY` | your Anthropic key (the agents run here) |
| `TOKEN_ENCRYPTION_KEY` | identical to the Vercel value |
| `APP_URL` | `https://<your-project>.vercel.app` |
| `BLOB_READ_WRITE_TOKEN` | same as in Vercel (Storage → Blob → `.env.local` tab), or the `R2_*` set |
| `SUPERVISOR_MODEL` | optional, e.g. `claude-fable-5-1` |
| `AI_MONTHLY_BUDGET_USD` | optional, default 50 per business |
| Platform / PostHog / mailbox secrets | same names as in Vercel, only the ones you use |
| `APP_REPO_GITHUB_TOKEN` | optional, for the app-improvement PR agent (mapped to `GITHUB_TOKEN` inside the job) |

The workflow `.github/workflows/worker-tick.yml` runs every 10 minutes and skips politely until
`DATABASE_URL` and `ANTHROPIC_API_KEY` exist. To run it now: **Actions → Worker tick → Run workflow**.
Each tick: applies migrations, enqueues any schedules that were due since the previous tick
(publishing, insights, autopilot, weekly analyst), works the queues until they are empty (max 20 min),
and exits. Posting precision is therefore ~10 minutes; switch to the always-on worker in
`docs/deploy.md` (Railway) when you need minute precision.

## 5. First run

1. Login → **New business** → description (+ logo, link) → the strategy page shows "running" until
   the next worker tick finishes discovery (up to ~10 min + a few minutes of agent time).
2. Approve the strategy → **Setup** → create/connect accounts (Bluesky and Telegram need no app review).
3. **Content → Generate next 7 days** → approve posts → the worker publishes them on schedule.
4. **Insights** runs weekly; **Product** needs the PostHog snippet in your app.

## Notes

- The runtime agents run through the Claude Agent SDK, which refuses to run with permission bypass as
  the `root` user. GitHub Actions runners and the Dockerfiles in this repo already run as a non-root
  user; if you host the worker elsewhere, run it as a regular user.

## Troubleshooting

- Build fails and the log is cut off: click the copy icon next to "N lines" in Build Logs and paste the
  last lines; the "Summary" section shows the failing command.

- Build fails on Vercel with a Postgres error: `DATABASE_URL` missing at build time → connect Neon first.
- "Uploads need a storage backend": connect Blob or set `R2_*`.
- Login page shows no password form: `OWNER_EMAIL` and `OWNER_PASSWORD_HASH`/`OWNER_PASSWORD` missing.
- Worker tick "skipped": add the two required repository secrets.
- Tokens fail to decrypt in the worker: `TOKEN_ENCRYPTION_KEY` differs between Vercel and GitHub.

---
name: release-checklist
description: Steps to verify and ship a phase - migrations, env, lint/typecheck/tests, evals, docker build, Railway deploy, smoke tests. Load at the end of every phase before committing and pushing.
---
# Release checklist

1. `pnpm lint && pnpm typecheck && pnpm test` green from the repo root.
2. New DB changes: `pnpm db:generate` produced a migration in `packages/db/drizzle`, `pnpm db:migrate` applied cleanly to a fresh Postgres (`docker compose up -d postgres`).
3. New env vars added to `.env.example` and `docs/deploy.md`.
4. Agent behaviour changed: `pnpm eval` passes (mock mode) and the cost report is within `model-policy` targets.
5. `docker build -f apps/worker/Dockerfile .` and `docker build -f apps/web/Dockerfile .` succeed.
6. Smoke: `pnpm -F @adv/worker start` boots, `/health` on web returns 200, one job runs end to end against the seed business.
7. Update `docs/decisions.md` and the phase status in `CLAUDE.md`.
8. Commit with a descriptive message; push to the designated branch with `git push -u origin <branch>`.

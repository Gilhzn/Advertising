#!/usr/bin/env bash
# Claude Code SessionStart hook: bring up a local Postgres and apply migrations so tests and the
# dashboard work in a fresh session.
#
# This file runs automatically when the project is opened in Claude Code, so it is deliberately
# conservative: it installs nothing from the network, it never elevates beyond what the sandbox
# already allows, and it only touches a database directory it owns.
set -u
cd "$(dirname "$0")/.." || exit 0

if [ ! -d node_modules ]; then
  echo "session-start: dependencies are not installed - run 'pnpm install' (it executes package install scripts, so run it yourself)"
fi

export DATABASE_URL="${DATABASE_URL:-postgres://adv:adv@localhost:5432/adv}"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)

if [ -z "$PGBIN" ]; then
  echo "session-start: no local postgres - use 'docker compose up -d postgres', then 'pnpm db:migrate'"
  exit 0
fi
if ! command -v su >/dev/null || [ "$(id -u)" -ne 0 ]; then
  echo "session-start: not running as root, skipping database bootstrap - use 'docker compose up -d postgres'"
  exit 0
fi

PGDATA=/var/lib/pg-adv
if [ ! -d "$PGDATA" ]; then
  mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
  # scram-sha-256 rather than trust: a local account cannot connect as another role without the password.
  su postgres -c "$PGBIN/initdb -D $PGDATA --auth-local=scram-sha-256 --auth-host=scram-sha-256" >/dev/null 2>&1
fi
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/log.txt -o '-p 5432 -k /tmp' start" >/dev/null 2>&1 || true
sleep 2

# The role owns its own database and nothing else. It is not a superuser.
if ! su postgres -c "psql -h /tmp -tAc \"SELECT 1 FROM pg_roles WHERE rolname='adv'\"" 2>/dev/null | grep -q 1; then
  su postgres -c "psql -h /tmp -c \"CREATE USER adv WITH PASSWORD 'adv' CREATEDB;\" -c 'CREATE DATABASE adv OWNER adv;'" >/dev/null 2>&1
fi

if [ -d node_modules ] && pnpm db:migrate >/dev/null 2>&1; then
  echo "session-start: postgres ready, migrations applied"
else
  echo "session-start: postgres ready - run 'pnpm db:migrate' once dependencies are installed"
fi

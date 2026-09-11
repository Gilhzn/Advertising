#!/usr/bin/env bash
# Claude Code SessionStart hook: make the local toolchain and Postgres usable in web sessions.
set -u
cd "$(dirname "$0")/.." || exit 0
[ -d node_modules ] || pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
export DATABASE_URL="${DATABASE_URL:-postgres://adv:adv@localhost:5432/adv}"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
if [ -n "$PGBIN" ] && command -v su >/dev/null; then
  PGDATA=/var/lib/pg-adv
  if [ ! -d "$PGDATA" ]; then
    mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
    su postgres -c "$PGBIN/initdb -D $PGDATA -A trust" >/dev/null 2>&1
  fi
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/log.txt -o '-p 5432 -k /tmp' start" >/dev/null 2>&1 || true
  sleep 2
  su postgres -c "psql -h /tmp -tc \"SELECT 1 FROM pg_roles WHERE rolname='adv'\"" 2>/dev/null | grep -q 1 || \
    su postgres -c "psql -h /tmp -c \"CREATE USER adv WITH PASSWORD 'adv' SUPERUSER;\" -c 'CREATE DATABASE adv OWNER adv;'" >/dev/null 2>&1
  pnpm db:migrate >/dev/null 2>&1 && echo "session-start: postgres ready, migrations applied"
else
  echo "session-start: postgres binaries not found; run 'apt-get install -y postgresql-16' or 'docker compose up -d postgres'"
fi

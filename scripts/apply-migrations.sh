#!/usr/bin/env bash
# Applies drizzle/migrations/*.sql in order via the Supabase SQL API or psql.
# Requires: SUPABASE_DB_URL (postgres connection) OR use the SQL editor manually.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/drizzle/migrations"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Set SUPABASE_DB_URL (postgres://...) or paste files in order in the Supabase SQL editor:"
  ls -1 "$MIG"/*.sql | sort
  echo "Then run: scripts/sql/bootstrap-admin.sql and scripts/sql/confirm_live_payment.sql"
  exit 1
fi

for f in $(ls -1 "$MIG"/*.sql | sort); do
  echo "==> $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/sql/confirm_live_payment.sql"
echo "Done. Next: edit scripts/sql/bootstrap-admin.sql with your user id and run it."

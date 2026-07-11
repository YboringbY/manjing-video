#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="${MIGRATIONS_DIR:-prisma/migrations}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for migration preflight." >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for migration preflight." >&2
  exit 2
fi

db_url=${DATABASE_URL%%\?*}
applied=()
while IFS= read -r migration; do
  applied+=("$migration")
done < <(psql "$db_url" -Atc 'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')

is_applied() {
  local candidate=$1
  local item
  for item in "${applied[@]}"; do
    [[ "$item" == "$candidate" ]] && return 0
  done
  return 1
}

is_explicitly_approved() {
  local candidate=$1
  local approved=",${APPROVED_DESTRUCTIVE_MIGRATIONS:-},"
  [[ "$approved" == *",$candidate,"* ]]
}

pending=()
blocked=()

while IFS= read -r migration_dir; do
  migration=$(basename "$migration_dir")
  is_applied "$migration" && continue
  pending+=("$migration")
  sql_file="$migration_dir/migration.sql"
  [[ -f "$sql_file" ]] || continue
  if grep -Ein '(^|;)[[:space:]]*(DELETE[[:space:]]+FROM|TRUNCATE[[:space:]]|DROP[[:space:]]+(TABLE|SCHEMA|DATABASE)|ALTER[[:space:]]+TABLE.*DROP[[:space:]]+(COLUMN|CONSTRAINT))' "$sql_file" >/dev/null; then
    echo "Destructive SQL detected in pending migration $migration:" >&2
    grep -Ein '(^|;)[[:space:]]*(DELETE[[:space:]]+FROM|TRUNCATE[[:space:]]|DROP[[:space:]]+(TABLE|SCHEMA|DATABASE)|ALTER[[:space:]]+TABLE.*DROP[[:space:]]+(COLUMN|CONSTRAINT))' "$sql_file" >&2
    is_explicitly_approved "$migration" || blocked+=("$migration")
  fi
done < <(find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d | sort)

echo "Pending migrations: ${#pending[@]}"
printf '  %s\n' "${pending[@]:-none}"

echo "Current business row counts:"
psql "$db_url" -P pager=off -c '
SELECT
  (SELECT count(*) FROM "Project") AS projects,
  (SELECT count(*) FROM "ProjectWorkspace") AS workspaces,
  (SELECT count(*) FROM "Material") AS materials,
  (SELECT count(*) FROM "Shot") AS shots,
  (SELECT count(*) FROM "VideoTask") AS tasks,
  (SELECT count(*) FROM "VideoAsset") AS assets;
'

if ((${#blocked[@]})); then
  echo "Migration preflight blocked destructive migrations: ${blocked[*]}" >&2
  echo "Production data deletion must be a separate reviewed maintenance operation." >&2
  echo "If explicitly approved, provide all of:" >&2
  echo "  APPROVED_DESTRUCTIVE_MIGRATIONS=<exact comma-separated migration names>" >&2
  echo "  PRODUCTION_CHANGE_TICKET=<incident/change reference>" >&2
  echo "  PRE_MIGRATION_BACKUP=<non-empty backup file>" >&2
  exit 3
fi

if [[ -n "${APPROVED_DESTRUCTIVE_MIGRATIONS:-}" ]]; then
  [[ -n "${PRODUCTION_CHANGE_TICKET:-}" ]] || { echo "PRODUCTION_CHANGE_TICKET is required." >&2; exit 4; }
  [[ -n "${PRE_MIGRATION_BACKUP:-}" && -s "${PRE_MIGRATION_BACKUP}" ]] || { echo "A non-empty PRE_MIGRATION_BACKUP is required." >&2; exit 4; }
fi

echo "Migration preflight passed."

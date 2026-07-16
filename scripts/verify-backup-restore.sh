#!/usr/bin/env bash
set -euo pipefail

backup_file=${BACKUP_FILE:-}
source_url=${SOURCE_DATABASE_URL:-${DATABASE_URL:-}}
temp_db=${RESTORE_VERIFY_DATABASE:-manjing_restore_verify_$(date +%Y%m%d_%H%M%S)}
admin_user=${DB_ADMIN_USER:-postgres}
restore_input=$backup_file
temp_backup=

if [[ -z "$backup_file" || ! -s "$backup_file" || -z "$source_url" ]]; then
  echo "BACKUP_FILE and SOURCE_DATABASE_URL/DATABASE_URL are required; backup must be non-empty." >&2
  exit 2
fi
if [[ ! "$temp_db" =~ ^manjing_restore_verify_[a-zA-Z0-9_]+$ ]]; then
  echo "Unsafe restore verification database name: $temp_db" >&2
  exit 2
fi

source_url=${source_url%%\?*}

as_admin() {
  if [[ $(id -u) -eq 0 && "$admin_user" != "root" ]]; then
    runuser -u "$admin_user" -- "$@"
  else
    "$@"
  fi
}

cleanup() {
  [[ -z "$temp_backup" ]] || rm -f "$temp_backup"
  if [[ "${KEEP_RESTORE_VERIFY_DATABASE:-no}" != "yes" ]]; then
    as_admin dropdb --if-exists "$temp_db" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

as_admin dropdb --if-exists "$temp_db"
as_admin createdb "$temp_db"
if [[ $(id -u) -eq 0 && "$admin_user" != "root" ]]; then
  temp_backup=$(mktemp)
  cp "$backup_file" "$temp_backup"
  chown "$admin_user" "$temp_backup"
  chmod 600 "$temp_backup"
  restore_input=$temp_backup
fi
as_admin pg_restore --no-owner --no-privileges --dbname="$temp_db" "$restore_input"

count_sql='SELECT concat_ws(chr(44),
  (SELECT count(*) FROM "Project"),
  (SELECT count(*) FROM "ProjectWorkspace"),
  (SELECT count(*) FROM "Material"),
  (SELECT count(*) FROM "ProjectMaterial"),
  (SELECT count(*) FROM "Shot"),
  (SELECT count(*) FROM "VideoTask"),
  (SELECT count(*) FROM "VideoAsset")
);'
source_counts=$(psql "$source_url" -Atc "$count_sql")
restored_counts=$(as_admin psql -d "$temp_db" -Atc "$count_sql")

source_has_image_tasks=$(psql "$source_url" -Atc "SELECT to_regclass('\"ImageTask\"') IS NOT NULL;")
if [[ "$source_has_image_tasks" == "t" ]]; then
  restored_has_image_tasks=$(as_admin psql -d "$temp_db" -Atc "SELECT to_regclass('\"ImageTask\"') IS NOT NULL;")
  [[ "$restored_has_image_tasks" == "t" ]] || { echo "Backup restore is missing ImageTask." >&2; exit 6; }
  source_counts="$source_counts,$(psql "$source_url" -Atc 'SELECT count(*) FROM "ImageTask";')"
  restored_counts="$restored_counts,$(as_admin psql -d "$temp_db" -Atc 'SELECT count(*) FROM "ImageTask";')"
fi

echo "Source counts:   $source_counts"
echo "Restored counts: $restored_counts"
[[ "$source_counts" == "$restored_counts" ]] || { echo "Backup restore verification failed." >&2; exit 6; }

echo "Backup restore verification passed using isolated database $temp_db."

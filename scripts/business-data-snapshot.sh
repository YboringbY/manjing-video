#!/usr/bin/env bash
set -euo pipefail

mode=${1:-}
snapshot_file=${2:-}

if [[ "$mode" != "capture" && "$mode" != "verify" ]]; then
  echo "Usage: $0 <capture|verify> <snapshot-file>" >&2
  exit 2
fi
if [[ -z "$snapshot_file" || -z "${DATABASE_URL:-}" ]]; then
  echo "Snapshot file and DATABASE_URL are required." >&2
  exit 2
fi

db_url=${DATABASE_URL%%\?*}

snapshot() {
  psql "$db_url" -At <<'SQL'
    SELECT json_build_object(
      'projects', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(id::text, ',' ORDER BY id), '')))) FROM "Project";
    SELECT json_build_object(
      'workspaces', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(("tenantId" || ':' || "projectId"::text), ',' ORDER BY "tenantId", "projectId"), '')))) FROM "ProjectWorkspace";
    SELECT json_build_object(
      'materials', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(id::text, ',' ORDER BY id), '')))) FROM "Material";
    SELECT json_build_object(
      'materialLinks', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(("tenantId" || ':' || "projectId"::text || ':' || "materialId"::text), ',' ORDER BY "tenantId", "projectId", "materialId"), '')))) FROM "ProjectMaterial";
    SELECT json_build_object(
      'shots', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(("tenantId" || ':' || "projectId"::text || ':' || id::text), ',' ORDER BY "tenantId", "projectId", id), '')))) FROM "Shot";
    SELECT json_build_object(
      'tasks', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(("tenantId" || ':' || "projectId"::text || ':' || id), ',' ORDER BY "tenantId", "projectId", id), '')))) FROM "VideoTask";
    SELECT json_build_object(
      'assets', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(("tenantId" || ':' || "projectId"::text || ':' || id::text), ',' ORDER BY "tenantId", "projectId", id), '')))) FROM "VideoAsset";
    SELECT (to_regclass('"ImageTask"') IS NOT NULL) AS image_tasks_exists \gset
    \if :image_tasks_exists
      SELECT json_build_object(
        'imageTasks', json_build_object('count', count(*), 'ids', md5(COALESCE(string_agg(("tenantId" || ':' || "projectId"::text || ':' || id), ',' ORDER BY "tenantId", "projectId", id), '')))) FROM "ImageTask";
    \else
      SELECT json_build_object('imageTasks', json_build_object('count', 0, 'ids', md5('')));
    \endif
SQL
}

if [[ "$mode" == "capture" ]]; then
  snapshot > "$snapshot_file"
  chmod 600 "$snapshot_file"
  test -s "$snapshot_file"
  echo "Business data snapshot saved: $snapshot_file"
  cat "$snapshot_file"
  exit 0
fi

[[ -s "$snapshot_file" ]] || { echo "Snapshot does not exist or is empty: $snapshot_file" >&2; exit 2; }
current_file=$(mktemp)
trap 'rm -f "$current_file"' EXIT
snapshot > "$current_file"

node - "$snapshot_file" "$current_file" <<'NODE'
const fs = require("fs");

function read(file) {
  return Object.assign({}, ...fs.readFileSync(file, "utf8").trim().split(/\n+/).map(line => JSON.parse(line)));
}

const before = read(process.argv[2]);
const after = read(process.argv[3]);
const changes = Object.keys(before).filter(key => {
  return !after[key] || before[key].count !== after[key].count || before[key].ids !== after[key].ids;
});

if (!changes.length) {
  console.log("Business data conservation check passed.");
  process.exit(0);
}

for (const key of changes) {
  console.error(`${key}: before=${JSON.stringify(before[key])} after=${JSON.stringify(after[key])}`);
}

let backupReady = false;
try { backupReady = fs.statSync(process.env.PRE_MIGRATION_BACKUP || "").size > 0; } catch {}

if (process.env.ALLOW_BUSINESS_DATA_CHANGE === "yes" && process.env.PRODUCTION_CHANGE_TICKET && backupReady) {
  console.error(`Business data change explicitly approved by ${process.env.PRODUCTION_CHANGE_TICKET}.`);
  process.exit(0);
}

console.error("Business data identity changed during migration; deployment is blocked.");
process.exit(5);
NODE

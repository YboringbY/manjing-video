#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/manjing-video}"
PM2_APP="${PM2_APP:-manjing-video}"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"

if [[ "${PRODUCTION_DEPLOY_APPROVED:-}" != "yes" ]]; then
  echo "Production deployment requires explicit approval: PRODUCTION_DEPLOY_APPROVED=yes" >&2
  exit 2
fi

if [[ -z "${PRODUCTION_SMOKE_ACCOUNT:-}" || -z "${PRODUCTION_SMOKE_PASSWORD:-}" ]]; then
  if [[ "${PRODUCTION_SMOKE_SKIP_APPROVED:-}" != "yes" ]]; then
    echo "Authenticated production smoke credentials are required. An explicit approved exception requires PRODUCTION_SMOKE_SKIP_APPROVED=yes." >&2
    exit 2
  fi
  echo "WARNING: authenticated production smoke will be skipped by explicit exception."
fi

cd "$APP_DIR"
[[ -z "$(git status --porcelain)" ]] || { echo "Production worktree is not clean." >&2; exit 2; }

echo "Fetching origin/$BRANCH..."
git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"

set -a
. ./.env
set +a

npm ci
npx prisma generate
npm run build

mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y%m%d-%H%M%S)
db_url=${DATABASE_URL%%\?*}
PRE_MIGRATION_BACKUP="$BACKUP_DIR/manjing-video-db-pre-deploy-$stamp.dump"
export PRE_MIGRATION_BACKUP
pg_dump --format=custom --file="$PRE_MIGRATION_BACKUP" "$db_url"
chmod 600 "$PRE_MIGRATION_BACKUP"
[[ -s "$PRE_MIGRATION_BACKUP" ]] || { echo "Database backup is empty." >&2; exit 2; }

npm run db:preflight
business_snapshot=$(mktemp)
service_stopped=no
migration_started=no

deployment_error() {
  rm -f "$business_snapshot"
  if [[ "$service_stopped" == "yes" && "$migration_started" == "no" ]]; then
    echo "Pre-migration failure; restarting the unchanged application." >&2
    pm2 start "$PM2_APP" >/dev/null || true
  elif [[ "$migration_started" == "yes" ]]; then
    echo "Migration or conservation check failed; application remains stopped for manual recovery." >&2
  fi
}
trap deployment_error ERR

pm2 stop "$PM2_APP"
service_stopped=yes
bash scripts/business-data-snapshot.sh capture "$business_snapshot"
migration_started=yes
npx prisma migrate deploy
bash scripts/business-data-snapshot.sh verify "$business_snapshot"
rm -f "$business_snapshot"
pm2 restart "$PM2_APP" --update-env
service_stopped=no
trap - ERR
pm2 status "$PM2_APP" --no-color

curl --retry 10 --retry-all-errors --retry-delay 1 -fsS -o /dev/null http://127.0.0.1:3000/
auth_status=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/auth/me)
[[ "$auth_status" == "401" ]] || { echo "Post-deploy auth smoke returned $auth_status." >&2; exit 7; }

if [[ -n "${PRODUCTION_SMOKE_ACCOUNT:-}" && -n "${PRODUCTION_SMOKE_PASSWORD:-}" ]]; then
  PRODUCTION_BASE_URL=http://127.0.0.1:3000 npm run smoke:production
else
  echo "Authenticated production smoke skipped by explicit approved exception."
fi

echo "Deployment complete. Backup: $PRE_MIGRATION_BACKUP"

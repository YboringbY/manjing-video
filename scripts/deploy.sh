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
npx prisma migrate deploy
pm2 restart "$PM2_APP" --update-env
pm2 status "$PM2_APP" --no-color

echo "Deployment complete. Backup: $PRE_MIGRATION_BACKUP"

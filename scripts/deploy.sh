#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/manjing-video}"
PM2_APP="${PM2_APP:-manjing-video}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

echo "Deploying $PM2_APP from origin/$BRANCH..."
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

npm ci
npm run build

pm2 restart "$PM2_APP"
pm2 save

echo "Deployment complete."

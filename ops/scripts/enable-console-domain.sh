#!/usr/bin/env bash
set -euo pipefail

app_dir=${APP_DIR:-/opt/manjing-video}
nginx_config=${NGINX_CONFIG:-/etc/nginx/sites-available/manjing-video}
new_nginx_config=${NEW_NGINX_CONFIG:-/tmp/manjing-video-domain.conf}
backup_dir=${BACKUP_DIR:-/root/backups}
domain=${CONSOLE_DOMAIN:-console.manjingstudio.com}
pm2_app=${PM2_APP:-manjing-video}
stamp=$(date +%Y%m%d-%H%M%S)
nginx_backup="$backup_dir/manjing-video-nginx-before-domain-$stamp.conf"
env_backup="$backup_dir/manjing-video-env-before-domain-$stamp.env"
env_file="$app_dir/.env"

[[ -s "$new_nginx_config" ]] || { echo "New Nginx config is missing or empty: $new_nginx_config" >&2; exit 2; }
[[ -s "$nginx_config" ]] || { echo "Current Nginx config is missing or empty: $nginx_config" >&2; exit 2; }
[[ -s "$env_file" ]] || { echo "Application environment file is missing or empty: $env_file" >&2; exit 2; }

mkdir -p "$backup_dir"
cp --preserve=mode,ownership,timestamps "$nginx_config" "$nginx_backup"
cp --preserve=mode,ownership,timestamps "$env_file" "$env_backup"
chmod 600 "$env_backup"

rollback() {
  set +e
  echo "Domain enablement failed; restoring Nginx and application environment." >&2
  cp --preserve=mode,ownership,timestamps "$nginx_backup" "$nginx_config"
  cp --preserve=mode,ownership,timestamps "$env_backup" "$env_file"
  nginx -t && systemctl reload nginx
  cd "$app_dir" || return
  set -a
  . ./.env
  set +a
  pm2 restart "$pm2_app" --update-env
}
trap rollback ERR

install -o root -g root -m 644 "$new_nginx_config" "$nginx_config"

env_tmp=$(mktemp)
grep -v '^ASSET_PUBLIC_BASE_URL=' "$env_file" > "$env_tmp"
printf '\nASSET_PUBLIC_BASE_URL=https://%s\n' "$domain" >> "$env_tmp"
chown --reference="$env_file" "$env_tmp"
chmod --reference="$env_file" "$env_tmp"
mv "$env_tmp" "$env_file"

nginx -t
systemctl reload nginx

cd "$app_dir"
set -a
. ./.env
set +a
pm2 restart "$pm2_app" --update-env

curl --retry 10 --retry-all-errors --retry-delay 1 -fsS -o /dev/null http://127.0.0.1:3000/
http_status=$(curl --resolve "$domain:80:127.0.0.1" -sS -o /dev/null -w '%{http_code}' "http://$domain/")
https_status=$(curl --resolve "$domain:443:127.0.0.1" -sS -o /dev/null -w '%{http_code}' "https://$domain/")
[[ "$http_status" == "301" ]] || { echo "Domain HTTP redirect returned $http_status." >&2; exit 7; }
[[ "$https_status" == "200" ]] || { echo "Domain HTTPS health check returned $https_status." >&2; exit 7; }

trap - ERR
rm -f "$new_nginx_config"
printf 'Console domain enabled.\nNginx backup: %s\nEnvironment backup: %s\n' "$nginx_backup" "$env_backup"

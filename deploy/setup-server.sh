#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu server, run as root. The Ops workflow runs it
# ("setup" task, docs/OPERATIONS.md) with the GitHub deploy key's public key as $1; running
# it again is harmless. It installs Docker, creates the `deploy` user (which gets root's SSH
# keys plus the deploy key), adds swap, creates /opt/rsc with generated secrets in
# local.env, and schedules the nightly backup. Afterwards the deploy key no longer opens root.
set -euo pipefail
deploy_key=${1:?Usage: setup-server.sh "<deploy public key>"}
key_body=$(awk '{print $2}' <<< "$deploy_key") # the key itself, without type or comment
export DEBIAN_FRONTEND=noninteractive

if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

id deploy > /dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
keys=/home/deploy/.ssh/authorized_keys
touch "$keys"
cat /root/.ssh/authorized_keys "$keys" <(printf '%s\n' "$deploy_key") | awk 'NF && !seen[$2]++' > "$keys.new"
mv "$keys.new" "$keys"
chown deploy:deploy "$keys" && chmod 600 "$keys"
# The deploy key was only let into root for this first run.
# Kept as is if it held no other key, so root is never locked out.
grep -vF "$key_body" /root/.ssh/authorized_keys > /root/.ssh/authorized_keys.new || true
if [ -s /root/.ssh/authorized_keys.new ]; then
  mv /root/.ssh/authorized_keys.new /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
else
  rm /root/.ssh/authorized_keys.new
fi

# Swap: a safety margin for memory spikes (pg_dump, restores, image pulls).
if ! swapon --show | grep -q .; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile > /dev/null; }
  if swapon /swapfile; then
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  else
    echo "Warning: could not enable swap; carrying on without it." >&2
  fi
fi

install -d -o deploy -g deploy /opt/rsc
# Secrets that never leave the server. Settings from GitHub arrive as github.env on each
# deploy; .env is github.env followed by local.env, so a line added here wins.
if [ ! -f /opt/rsc/local.env ]; then
  umask 077
  cat > /opt/rsc/local.env << EOF
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
POSTGRES_USER=rsc
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=rsc
EOF
  chown deploy:deploy /opt/rsc/local.env
fi

cron='15 3 * * * /opt/rsc/backup.sh >> /opt/rsc/backup.log 2>&1'
existing=$(crontab -u deploy -l 2> /dev/null | grep -vF '/opt/rsc/backup.sh' || true)
disk_cron='45 3 * * * /opt/rsc/disk.sh check >> /opt/rsc/disk.log 2>&1'
existing=$(printf '%s\n' "$existing" | grep -vF '/opt/rsc/disk.sh' || true)
printf '%s\n%s\n%s\n' "$existing" "$cron" "$disk_cron" | awk NF | crontab -u deploy -

echo "Server ready: $(docker --version), user deploy, /opt/rsc."

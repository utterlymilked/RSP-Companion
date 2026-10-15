# Operations

How RSP Companion runs in production: one EU server running Docker Compose with three
containers (the app image, Postgres 17 and Caddy for HTTPS), nightly database dumps to
S3-compatible storage, and deploys from GitHub Actions. Pedro owns every account (hosting,
domain, email, storage, GitHub). Running cost is mostly the server; see "Costs" below.

Files: [`Dockerfile`](../Dockerfile) (the image), [`deploy/`](../deploy) (what lives on the
server in `/opt/rsp`), [`.github/workflows/image.yml`](../.github/workflows/image.yml) (build,
publish, deploy).

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| App image | `ghcr.io/utterlymilked/rsp-companion` | API plus the web build. Tags: `main` (latest main) and `sha-<commit>` (each main commit). Applies pending migrations on start. |
| Postgres 17 | `db` container, volume `rsp_db-data` | Not exposed outside the server. |
| Caddy | `caddy` container, ports 80 and 443 | Gets and renews the HTTPS certificate for `APP_DOMAIN`. |
| Backups | S3 bucket (Hetzner Object Storage) | `deploy/backup.sh`, nightly via cron, kept `BACKUP_RETENTION_DAYS` days. |
| Email | Brevo (SMTP) | Invitations, magic links, password resets. |
| Secrets | `/opt/rsp/.env` on the server; GitHub secrets for the deploy key | Never in the repo or in chat. |

## Costs

Hetzner Cloud prices as shown in the console on 2026-10-15, per month including 23% VAT
(check the console for current prices):

| Item | Price | Notes |
| --- | --- | --- |
| Server, Cost-Optimized x86, cheapest plan with at least 2 GB RAM | €6.75 | Recommended. Older hardware with limited availability, which is fine here: the stack uses about 140 MB of RAM when idle (app 90 MB, Postgres 35 MB, Caddy 12 MB). |
| Server CPX12 (Regular Performance, 1 vCPU AMD, 2 GB RAM) | €14.13 | Fallback when no Cost-Optimized plan is available in the location. |
| Server CPX02 (1 vCPU, 1 GB RAM) | €7.37 | Would run today with the swap file from section 2, but leaves little headroom. |
| Server CPX22 (2 vCPU, 4 GB RAM) | €23.97 | Not needed at club scale; resizing later takes a reboot. |
| Primary IPv4 | €0.62 | Needed: many mobile networks and email providers still rely on IPv4. |
| Object Storage (backups) | see console | Billed by usage with a monthly base price. |
| Domain | registrar's yearly price | Nothing extra if the club already has one; a subdomain such as `app.` is free. |
| Brevo (email) | free plan | Has a daily sending limit, far above what invitations and resets need. |

Expected total: €7.37 a month with a Cost-Optimized server and IPv4 (€14.75 with CPX12),
plus backup storage. Images are built by
GitHub Actions, not on the server, so the server never needs build-time memory. The image is
built for x86 (amd64), so choose an x86 plan, not Arm.

## 1. Accounts (once, Pedro)

1. **Hetzner Cloud**: sign up at console.hetzner.cloud and create a project "RSP Companion".
2. **Server**: *Add Server*, location Falkenstein or Nuremberg (EU), image Ubuntu 24.04,
   type **Cost-Optimized, x86**, the cheapest plan with at least 2 GB RAM (if none is
   available there, Regular Performance **CPX12**), IPv4 on. Add your SSH public key
   (`ssh-keygen -t ed25519`, then paste the `.pub` file). The private key stays on your computer.
3. **Firewall**: allow inbound TCP 22, 80, 443 and UDP 443 only; attach it to the server.
4. **Object Storage**: create a bucket in the same location (for example `rsp-backups`) and
   an S3 access key for it. The endpoint is `https://<location>.your-objectstorage.com`
   (`fsn1`, `nbg1`, …).
5. **Domain**: add a DNS `A` record for the app's address (for example `app.<club domain>`)
   pointing at the server's IPv4. The same domain becomes the base of the store identifier
   (M4b), so a domain the club owns is best.
6. **Email**: a free Brevo account; under *SMTP & API* create an SMTP key. Add and verify the
   sender domain (SPF/DKIM records) so emails don't land in spam.

## 2. Prepare the server (once)

Log in as root (`ssh root@<server IP>`), then:

```sh
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh        # Docker Engine and the compose plugin
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/ && chown deploy:deploy /home/deploy/.ssh/authorized_keys
install -d -o deploy -g deploy /opt/rsp
# 2 GB swap file: a safety margin for memory spikes (pg_dump, restores, image pulls)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Ubuntu installs security updates automatically (`unattended-upgrades`); leave it on. From
now on log in as `deploy`.

Copy the server files from a checkout of the repo on your computer:

```sh
scp deploy/compose.yml deploy/Caddyfile deploy/*.sh deploy/.env.example deploy@<server>:/opt/rsp/
```

On the server, create the settings file and fill it in (comments in the file say what each
value is; generate secrets with `openssl rand -hex 32`):

```sh
cd /opt/rsp
cp .env.example .env && chmod 600 .env
nano .env
```

The image is private on GitHub, so the server logs in to the registry once. Create a GitHub
personal access token (classic) with only the `read:packages` scope, then:

```sh
docker login ghcr.io -u utterlymilked     # paste the token as the password
```

## 3. First start

```sh
cd /opt/rsp
docker compose pull
docker compose up -d
docker compose logs -f app                 # "Migrations applied." then "listening"
curl https://<APP_DOMAIN>/api/health       # {"status":"ok","version":"sha-…"}
```

Create the first admin (direção). The password is read from stdin, so it stays out of the
shell history:

```sh
read -rs PASSWORD && printf '%s\n' "$PASSWORD" | docker compose exec -T app \
  node dist/scripts/create-admin.js --email ana@example.pt --name "Ana Silva"; unset PASSWORD
```

Every other account is invited from the app.

## 4. Automatic deploys

Each push to `main` builds the image, publishes it to GHCR and, once these settings exist,
deploys it: the workflow copies the `deploy/` files to `/opt/rsp`, runs
`docker compose pull && docker compose up -d` over SSH and waits for `/api/health`.

1. On your computer, create a key used only by GitHub:
   `ssh-keygen -t ed25519 -f rsp-deploy -N "" -C github-deploy`.
2. Append `rsp-deploy.pub` to `/home/deploy/.ssh/authorized_keys` on the server.
3. In the GitHub repo, *Settings → Secrets and variables → Actions*:
   - variable `DEPLOY_HOST`: the app domain (used for SSH and the health check);
   - variable `DEPLOY_USER` (optional, default `deploy`);
   - secret `DEPLOY_SSH_KEY`: the contents of the private key file `rsp-deploy`;
   - secret `DEPLOY_KNOWN_HOSTS`: the output of `ssh-keyscan <APP_DOMAIN>`.
4. Delete `rsp-deploy` from your computer if you like; GitHub keeps the only copy needed.

The deploy job runs in the GitHub environment `production`; add required reviewers there if
deploys should wait for an approval. Without `DEPLOY_HOST` the job is skipped and deploys
are manual (section 7).

## 5. Backups

`deploy/backup.sh` dumps the database (`pg_dump`, custom format), checks the dump is
readable, uploads it to `s3://$BACKUP_S3_BUCKET/db/rsp-<UTC timestamp>.dump` and deletes
dumps older than `BACKUP_RETENTION_DAYS`. It uses an rclone container, so nothing extra is
installed on the server.

Schedule it nightly as `deploy` (`crontab -e`):

```
15 3 * * * /opt/rsp/backup.sh >> /opt/rsp/backup.log 2>&1
```

Run it once by hand after setting it up and check the bucket. Each line in `backup.log` is a
successful upload; a run without one failed.

Dumps contain all personal and health data. The bucket stays private, its key is only in
`/opt/rsp/.env`, and a dump is never copied to a laptop except for a restore.

## 6. Restore

**Drill** (monthly, and after any change to the scripts): restores the latest dump into a
separate database, `rsp_restore_check`, and prints row counts. The live database is not
touched.

```sh
/opt/rsp/restore.sh                         # latest dump
/opt/rsp/restore.sh rsp-2026-10-15T031500Z.dump
```

Compare the counts with the live app; drop the copy afterwards with
`docker compose exec db psql -U rsp -d postgres -c "DROP DATABASE rsp_restore_check"`.

**Real restore** (data loss or corruption): replaces the live database with a dump. It asks
you to type `restore`, stops the app, restores and starts the app again.

```sh
/opt/rsp/restore.sh --production [dump]
```

Restoring a dump made by an older version is fine: the app applies newer migrations on
start.

**New server**: repeat sections 2 and 3 (skip creating the admin), then run
`restore.sh --production`.

## 7. Updates, rollback and logs

- **Manual deploy**: `cd /opt/rsp && docker compose pull && docker compose up -d`.
- **Roll back**: set `APP_IMAGE=ghcr.io/utterlymilked/rsp-companion:sha-<commit>` in `.env`
  and run `docker compose up -d`. While it is pinned, automatic deploys keep that version;
  remove the line (or set `:main`) to follow main again.
  Migrations only go forward: if the bad release changed the schema, the older image may
  not work with it, and the fix is a new release or a restore.
- **Logs**: `docker compose logs -f app` (also `db`, `caddy`). Docker keeps them per container.
- **Status**: `docker compose ps` (the app container reports `healthy`).
- **Postgres or Caddy updates**: `docker compose pull && docker compose up -d` picks up new
  minor versions. A Postgres major upgrade (18) is a dump and restore into a new volume, done
  as its own task.

## 8. Universal links (M4b)

Email links (`https://<APP_DOMAIN>/invite?…`, `/reset-password?…`) open the app when it's
installed once the server publishes `/.well-known/apple-app-site-association` and
`/.well-known/assetlinks.json`. They are served only when these are set in `.env`:

- `APPLE_TEAM_ID`: the 10-character Team ID from the Apple Developer account;
- `ANDROID_CERT_SHA256`: the SHA-256 fingerprint(s) of the app signing certificate, from
  `eas credentials` or Play Console (comma-separated if there are several).

## Trying the stack locally

The production stack runs on a laptop with Docker, without a domain:

```sh
docker build -t rsp-companion:local .
cp -r deploy /tmp/rsp && cd /tmp/rsp && cp .env.example .env
# in .env: APP_DOMAIN=:80, APP_URL=https://localhost, APP_IMAGE=rsp-companion:local,
#          a 32+ character BETTER_AUTH_SECRET, any smtp:// SMTP_URL, a POSTGRES_PASSWORD
docker compose up -d && curl http://localhost/api/health
```

`backup.sh` and `restore.sh` can be tried against `rclone serve s3` (an S3 server in the
rclone image) with `RCLONE_DOCKER_ARGS=--network=host` and `BACKUP_S3_ENDPOINT` pointing at it.

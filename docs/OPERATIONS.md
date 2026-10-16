# Operations

How RSC Companion runs in production: one EU server running Docker Compose with three
containers (the app image, Postgres 17 and Caddy for HTTPS), nightly database dumps to
S3-compatible storage, and deploys from GitHub Actions. Pedro owns every account (hosting,
domain, email, storage, GitHub). Running cost is mostly the server; see "Costs" below.

Files: [`Dockerfile`](../Dockerfile) (the image), [`deploy/`](../deploy) (what lives on the
server in `/opt/rsc`, plus `ci.sh` and `setup-server.sh`),
[`.github/workflows/image.yml`](../.github/workflows/image.yml) (build and publish) and
[`.github/workflows/ops.yml`](../.github/workflows/ops.yml) (deploy and server tasks).

## What runs where

| Piece | Where | Notes |
| --- | --- | --- |
| App image | `ghcr.io/utterlymilked/rsc-companion` | API plus the web build. Tags: `main` (latest main) and `sha-<commit>` (each main commit). Applies pending migrations on start. |
| Postgres 17 | `db` container, volume `rsc_db-data` | Not exposed outside the server. |
| Caddy | `caddy` container, ports 80 and 443 | Gets and renews the HTTPS certificate for `APP_DOMAIN`. |
| Backups | S3 bucket (Hetzner Object Storage) | `deploy/backup.sh`, nightly via cron, kept `BACKUP_RETENTION_DAYS` days. |
| Email | Brevo (SMTP) | Invitations, magic links, password resets. |
| Settings and secrets | GitHub Actions variables and secrets, copied to `/opt/rsc/github.env` on each deploy; the auth secret and database password only in `/opt/rsc/local.env` on the server | Never in the repo or in chat. |

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
| Domain | registrar's yearly price | Not needed for staging (see "Before there is a domain"). Nothing extra if the club already has one; a subdomain such as `app.` is free. |
| Brevo (email) | free plan | Has a daily sending limit, far above what invitations and resets need. |

Expected total: €7.37 a month with a Cost-Optimized server and IPv4 (€14.75 with CPX12),
plus backup storage. Images are built by
GitHub Actions, not on the server, so the server never needs build-time memory. The image is
built for x86 (amd64), so choose an x86 plan, not Arm.

## 1. Accounts (once, Pedro)

1. **Hetzner Cloud**: sign up at console.hetzner.cloud and create a project "RSC Companion".
2. **Server**: *Add Server*, name it `rsc-staging` (and `rsc-production` later), location Falkenstein or Nuremberg (EU), image Ubuntu 24.04,
   type **Cost-Optimized, x86**, the cheapest plan with at least 2 GB RAM (if none is
   available there, Regular Performance **CPX12**), IPv4 on. Add your SSH public key
   (`ssh-keygen -t ed25519`, then paste the `.pub` file). The private key stays on your computer.
3. **Firewall**: allow inbound TCP 22, 80, 443 and UDP 443 only; attach it to the server.
4. **Object Storage**: create a bucket in the same location (for example `rsc-backups`) and
   an S3 access key for it. The endpoint is `https://<location>.your-objectstorage.com`
   (`fsn1`, `nbg1`, …).
5. **Domain** (can wait): add a DNS `A` record for the app's address (for example
   `app.<club domain>`) pointing at the server's IPv4. Until there is one, use the server's
   free sslip.io name (next section). The real domain is needed before the store release
   (M4b): universal links and the store listing use it, so a domain the club owns is best.
6. **Email**: a free Brevo account; under *SMTP & API* create an SMTP key. Add and verify the
   sender domain (SPF/DKIM records) so emails don't land in spam. Without a domain yet,
   verify a single sender address instead; emails may then land in spam more often.

### Before there is a domain

[sslip.io](https://sslip.io) is a free public DNS service: `<IP with dashes>.sslip.io`
resolves to that IP, so a server at `203.0.113.7` is reachable as `203-0-113-7.sslip.io`, and
Caddy gets a normal Let's Encrypt certificate for it. Use that name as `DEPLOY_HOST`
(section 2); the app is then served at `https://203-0-113-7.sslip.io`.

Moving to the real domain later: add its `A` record, change the `DEPLOY_HOST` variable and
the `DEPLOY_KNOWN_HOSTS` secret (`ssh-keyscan -t ed25519 <new domain>`), and run the Ops
workflow with `deploy`. Everyone signs in again once (sessions are tied to the address), and
links in emails sent before the change stop working.

## 2. Connect GitHub to the server (once, Pedro)

Everything on the server is done by the **Ops** workflow
([`ops.yml`](../.github/workflows/ops.yml), which runs [`deploy/ci.sh`](../deploy/ci.sh)) over
SSH, so nobody types commands on the server. It needs a key of its own and the settings below.

1. On your laptop, create the key (press Enter twice when asked for a passphrase):
   `ssh-keygen -t ed25519 -f rsc-deploy -C github-deploy`.
2. Let it into the server's root account for the one-time setup (your own key logs you in):
   `cat rsc-deploy.pub | ssh root@<server IP> "cat >> .ssh/authorized_keys"`.
   The setup moves it to the `deploy` user and removes it from root.
3. Print the server's identity for GitHub: `ssh-keyscan -t ed25519 <DEPLOY_HOST>`.
4. In the GitHub repo, *Settings → Secrets and variables → Actions*:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `DEPLOY_HOST` | The app's address: the domain, or the server's sslip.io name |
   | Variable | `MAIL_FROM` | Sender of the app's emails, e.g. `RSC Companion <secretaria@example.pt>` (an address verified in Brevo) |
   | Variable | `BACKUP_S3_ENDPOINT` | e.g. `https://fsn1.your-objectstorage.com` |
   | Variable | `BACKUP_S3_BUCKET` | e.g. `rsc-backups` |
   | Secret | `DEPLOY_SSH_KEY` | The whole content of the private key file `rsc-deploy` |
   | Secret | `DEPLOY_KNOWN_HOSTS` | The line printed by `ssh-keyscan` |
   | Secret | `SMTP_LOGIN`, `SMTP_KEY` | Brevo, *SMTP & API → SMTP*: the login and an SMTP key |
   | Secret | `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | The bucket's S3 credentials |

   Optional variables: `DEPLOY_USER` (default `deploy`), `APP_IMAGE` (section 7),
   `BACKUP_RETENTION_DAYS` (default 30), `SMTP_HOST` / `SMTP_PORT` (default Brevo,
   `smtp-relay.brevo.com:587`), `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` (section 8).
5. Delete `rsc-deploy` from your laptop if you like; GitHub keeps the only copy needed.

## 3. Set up and start (once)

In the repo's *Actions* tab, open **Ops**, *Run workflow*, and run these tasks in order:

1. `setup`: installs Docker, creates the `deploy` user (with your key and the deploy key),
   adds 2 GB of swap, creates `/opt/rsc` with generated secrets in `local.env` (the auth
   secret and database password never leave the server), and schedules the nightly backup.
   Ubuntu installs security updates by itself (`unattended-upgrades`).
2. `deploy`: writes the settings from GitHub to `/opt/rsc/github.env`, joins them with
   `local.env` into `.env`, copies the `deploy/` files, pulls the image (logging in to GHCR
   with the run's own short-lived token, so the server stores no registry password),
   restarts and waits for `https://<DEPLOY_HOST>/api/health`.
3. `backup` then `restore-drill`: proves backups work (section 6).

Then create the first admin (direção) from your laptop. The password is read from your
terminal, so it stays out of the shell history and the chat:

```sh
ssh deploy@<server IP>
read -rs PASSWORD && printf '%s\n' "$PASSWORD" | docker compose -f /opt/rsc/compose.yml exec -T app \
  node dist/scripts/create-admin.js --email ana@example.pt --name "Ana Silva"; unset PASSWORD
```

Every other account is invited from the app.

## 4. Automatic deploys

Each push to `main` builds the image, publishes it to GHCR and, when `DEPLOY_HOST` is set,
runs the Ops `deploy` task. Changing a variable or secret takes effect at the next deploy;
run Ops `deploy` to apply it at once. Ops runs in the GitHub environment `production`; add
required reviewers there if deploys should wait for an approval. Other Ops tasks: `status`
(containers, memory, disk, recent app logs, backup log).

Browsers pick up a deploy without a hard refresh: the page is served `no-cache`, hashed
bundles are cached for good, and open tabs reload when `/api/health` reports a new version
(details in `docs/ARCHITECTURE.md`, Releases). Check with
`curl -sI https://<host>/ | grep -i cache-control`.

## 5. Backups

`deploy/backup.sh` dumps the database (`pg_dump`, custom format), checks the dump is
readable, uploads it to `s3://$BACKUP_S3_BUCKET/db/rsc-<UTC timestamp>.dump` and deletes
dumps older than `BACKUP_RETENTION_DAYS`. It uses an rclone container, so nothing extra is
installed on the server.

The `setup` task schedules it nightly at 03:15 (UTC) in the `deploy` user's crontab:
`/opt/rsc/backup.sh >> /opt/rsc/backup.log 2>&1`. Run Ops `backup` to take one now. Each
"Backup uploaded" line in `backup.log` (shown by Ops `status`) is a successful upload; a
night without one failed.

Dumps contain all personal and health data. The bucket stays private, its key is only in
GitHub secrets and `/opt/rsc/.env`, and a dump is never copied to a laptop except for a
restore.

### Document storage (M14)

Uploaded documents (medical exams, ID, federation registration) live in an S3-compatible
bucket, **separate from the backups bucket**. Create it like the backups one (section 1), then
add these to the repository settings used by the `Ops` workflow and run `setup`/`deploy`:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `STORAGE_S3_ENDPOINT` | e.g. `https://fsn1.your-objectstorage.com` |
| Variable | `STORAGE_S3_REGION` | the location, e.g. `fsn1` |
| Variable | `STORAGE_S3_BUCKET` | e.g. `rsc-documents` |
| Secret | `STORAGE_S3_ACCESS_KEY_ID`, `STORAGE_S3_SECRET_ACCESS_KEY` | the bucket's S3 credentials |

Without them the Documentos screens work but uploads answer "storage not set up". The bucket
stays private; the app hands out 5 minute signed links. The database backup does not include
these files: the bucket's own durability applies, so keep a periodic copy of the bucket
(for example `rclone sync`) once real documents are stored.

## 6. Restore

**Drill** (monthly, and after any change to the scripts): restores the latest dump into a
separate database, `rsc_restore_check`, and prints row counts. The live database is not
touched. Run Ops `restore-drill`, or on the server as `deploy`:

```sh
/opt/rsc/restore.sh                         # latest dump
/opt/rsc/restore.sh rsc-2026-10-15T031500Z.dump
```

Compare the counts with the live app; drop the copy afterwards with
`docker compose exec db psql -U rsc -d postgres -c "DROP DATABASE rsc_restore_check"`.

**Real restore** (data loss or corruption): replaces the live database with a dump. It asks
you to type `restore`, stops the app, restores and starts the app again.

```sh
/opt/rsc/restore.sh --production [dump]
```

Restoring a dump made by an older version is fine: the app applies newer migrations on
start.

**New server**: repeat sections 2 and 3 (skip creating the admin), then run
`restore.sh --production` on it.

## 7. Updates, rollback and logs

- **Deploy again**: run Ops `deploy`.
- **Roll back**: set the GitHub variable `APP_IMAGE` to
  `ghcr.io/utterlymilked/rsc-companion:sha-<commit>` and run Ops `deploy`. While it is set,
  automatic deploys keep that version; delete the variable to follow main again.
  Migrations only go forward: if the bad release changed the schema, the older image may
  not work with it, and the fix is a new release or a restore.
- **Status and logs**: Ops `status`, or on the server as `deploy`:
  `cd /opt/rsc && docker compose ps` and `docker compose logs -f app` (also `db`, `caddy`).
- **Postgres or Caddy updates**: every deploy pulls new minor versions. A Postgres major upgrade (18) is a dump and restore into a new volume, done
  as its own task.

## Demo data on staging

Ops task `seed-demo` loads the same fake data as `pnpm db:seed` (invented people, the 2026/27
season's trainings and matches around today, call-ups, fees, economato, incidents, injuries,
scouting and announcements) plus one login per kind of user: `admin@rsc.test`,
`treinador@rsc.test`, `delegado@rsc.test`, `pais@rsc.test`, `tesouraria@rsc.test`,
`economato@rsc.test`, `fisio@rsc.test`, `scout@rsc.test`. The password is random, new on
every run, and printed at the end of the job log. It refuses a database that already holds
club data (it is for staging, never for the club's real server) and leaves existing
accounts alone; announcements also reach their inboxes.

Ops task `reset-demo` refreshes it: it takes a backup, then replaces the demo data with a new
set around today. Every login that is not a demo one keeps its password and club-wide roles
(its person link and team roles go, since those people and teams are replaced). It refuses a
database without the demo admin, so it cannot wipe the club's real data.

## Android test APKs

Until the club has store accounts (M4b is deferred), every merge to `main` that touches the app
builds an installable Android APK with a local Gradle build in GitHub Actions
([`android-apk.yml`](../.github/workflows/android-apk.yml)); no Expo or EAS account is needed. It
points at staging (`https://178-105-48-29.sslip.io`; set the Actions variable `APK_API_URL`
to change it) and is attached to the rolling pre-release `android-latest`. Run it by hand from
Actions → Android APK → Run workflow. The first build takes about 15 minutes.

**Install on a phone**: open `https://github.com/utterlymilked/RSP-Companion/releases/tag/android-latest`
in the phone's browser, download `rsc-companion.apk`, open it and allow "install unknown apps"
for the browser when Android asks. Later builds install over the previous one (the version
code grows with every run) as long as the signing key is the same.

**Signing**: without secrets the APK is signed with Expo's stock debug key, which is fine for
tests. For a private key of our own (recommended once testers other than Pedro install it),
add four repository secrets once; changing the key later means uninstalling the app first:

1. `keytool -genkeypair -v -keystore rsc.keystore -alias rsc -keyalg RSA -keysize 2048 -validity 10000`
   (needs Java; remember the passwords).
2. `base64 -w0 rsc.keystore` and save the output as secret `ANDROID_KEYSTORE_BASE64`.
3. Add secrets `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`rsc`) and `ANDROID_KEY_PASSWORD`.
4. Keep `rsc.keystore` and the passwords in your password manager; losing them means a new key.

Test APKs are not for the Play Store: that needs an AAB and the club's Play account (M4b).

## 8. Universal links (M4b)

Email links (`https://<APP_DOMAIN>/invite?…`, `/reset-password?…`) open the app when it's
installed once the server publishes `/.well-known/apple-app-site-association` and
`/.well-known/assetlinks.json`. They are served only when these GitHub variables are set
(applied at the next deploy):

- `APPLE_TEAM_ID`: the 10-character Team ID from the Apple Developer account;
- `ANDROID_CERT_SHA256`: the SHA-256 fingerprint(s) of the app signing certificate, from
  `eas credentials` or Play Console (comma-separated if there are several).

## Trying the stack locally

The production stack runs on a laptop with Docker, without a domain:

```sh
docker build -t rsc-companion:local .
cp -r deploy /tmp/rsc && cd /tmp/rsc && cp .env.example .env
# in .env: APP_DOMAIN=:80, APP_URL=https://localhost, APP_IMAGE=rsc-companion:local,
#          a 32+ character BETTER_AUTH_SECRET, any smtp:// SMTP_URL, a POSTGRES_PASSWORD
docker compose up -d && curl http://localhost/api/health
```

`backup.sh` and `restore.sh` can be tried against `rclone serve s3` (an S3 server in the
rclone image) with `RCLONE_DOCKER_ARGS=--network=host` and `BACKUP_S3_ENDPOINT` pointing at it.

> **Repo rename**: the image is published as `ghcr.io/utterlymilked/rsc-companion` whatever the
> GitHub repository is called, so renaming the repository (RSP-Companion to RSC-Companion) does
> not affect deploys. GitHub redirects the old repository URL.

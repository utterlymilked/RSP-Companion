# ADR 0009: Documents, file storage and expiry tracking

- Status: Accepted
- Date: 2026-10-16

## Context

M14 keeps files for people (medical exam, federation registration, ID) and warns before they
expire. Files are personal data, and the medical certificate is health-adjacent, so the
rules of ADR 0003 and 0008 apply. The club runs one small server (ADR 0001) and already
has an S3-compatible bucket for backups (OPERATIONS.md).

## Decision

- **Storage** (`apps/server/src/storage/`): an interface with `put`, `delete` and
  `signedUrl`. Production uses an S3-compatible bucket (`STORAGE_S3_*`, pre-signed GET URLs of
  5 minutes, so file bytes go from the bucket to the phone without passing through the API).
  Development can use a directory (`STORAGE_DIR`); its "signed URL" is an HMAC token on
  `/api/documents/files/:token`. With neither configured, uploads answer 503
  `storage_unavailable` and the rest of the app works. Use a **separate bucket** from the
  backups: different key, different retention, and a leaked documents key must not expose dumps.
- **Upload** is the raw file as the request body with the metadata in the query string
  (`POST /api/documents/people/:personId?kind=&fileName=&expiresOn=`). No multipart: the typed
  client and CSRF rules stay simple, and the same call works from browser and phone. Limits:
  10 MB; PDF, JPEG and PNG only, checked by declared type and by the file's first bytes. Files
  are stored under `documents/<personId>/<uuid>` with no user-supplied name in the key.
- **Table** `documents`: person, kind, optional title, issue and expiry dates, storage key,
  original file name, type and size. The key never leaves the server.
- **Access**: `documents.read` (admin, secretaria, coach and delegado for their team) lists
  kind, title and expiry, never the file. `documents.write` (admin, secretaria) uploads,
  deletes and opens files of every kind except `medical_exam`. Medical exams are health tier:
  upload needs `health.medical.write`, opening needs `health.medical.read` (doctor, nurse),
  through `authorizeHealthWrite/Read`, so they are audited like any health data. The other
  clinical roles do not learn that such a file exists. Opening or changing any file is audited
  (`document.read`, `document.write`, with the kind only).
- **Expiry**: `GET /api/documents/expiring?days=30&teamId=` lists, for people currently in a
  team, each person's latest expiry per kind when it is expired or within `days` (default 30,
  `DEFAULT_EXPIRY_WARNING_DAYS`). A renewed document replaces the old one by having a later
  expiry. The Documentos tab shows this list; M15 sends the reminders from the same query.

## Alternatives considered

- **Upload straight to the bucket with a pre-signed PUT.** Saves server bandwidth, but needs
  CORS on the bucket for the web app and cannot check the file contents. Revisit if files grow.
- **Files in Postgres (`bytea`).** No new service, but dumps and backups would balloon.
- **Multipart upload.** Works with the typed client only through a File type that differs on
  web and native; the raw body is simpler.

## Consequences

- Deleting a person cascades the rows but not the files; the erasure job (M17) must delete the
  storage keys first. Deleting a document removes the file best-effort (a failure leaves an
  orphan, never a dangling row).
- Athletes and guardians cannot yet see their own documents; no "required documents" rule yet
  (which kinds each role must hold is a question for the club, `REQUIREMENTS.md`).
- The expiring list covers people with a current team membership; staff without a team are
  not reported yet.

# ADR 0024: Self-registration and identity approval

- Status: Proposed (design only; nothing is implemented until Pedro answers the open questions)
- Date: 2026-10-24
- Amends: ADR 0003 ("no public sign-up"), which stays true everywhere except prod behind the flag below.
- Related: ADR 0012 (privacy tooling, consents, retention), ADR 0009 (documents), ADR 0015
  (identity and import), ADR 0017 (stacks). Roadmap and CMD plan: `docs/REGISTRATION.md`.

## Context

Today accounts exist only by invitation (ADR 0003). Pedro wants, on **prod only**, people to
register themselves, prove the email is theirs, and then ask to be recognised as a real person
of the club. A `person` carries real data, so it is never created from a bare claim: it needs
either a submitted identity document approved by a human, or a Chave Móvel Digital (CMD)
authentication, which is trustworthy by itself.

This ADR is written against the persons/identities model Pedro described (a person has a guid,
metadata and one or more identities `(type, value)` unique per pair; a user relates to zero or
more persons as owner or representative). That model is designed in a sibling thread; the
assumptions made here are listed at the end. No real data goes in the repo, and uploaded
documents are never committed, logged or copied outside the document store.

## Decision

### 1. Abuse protection (in layers, cheapest first)

The risks are mail bombing (someone makes us send verification emails to a victim), mass
signup, credential stuffing, and enumeration of who has an account.

1. **Kill switch and per-stack flag.** `SELF_REGISTRATION=on|off`, default off, set per stack
   (on only for prod; staging keeps invitation plus tester access code, ADR 0018). A club
   setting can additionally close registration without a deploy.
2. **Rate limits in the app, stored in Postgres** (Better Auth's limiter with database
   storage, so limits survive restarts and work across restarts of the one container), with
   custom rules per route: sign-up, resend verification, password reset, magic link.
   Starting values, tunable in settings: sign-up 5 per hour per IP and 3 per day per
   email-domain+IP; verification email at most 1 per 60 s, 3 per hour and 6 per day per
   address; password reset and magic link the same per address; login 10 per 10 min per IP
   and 5 per 10 min per email. The client IP is the one set by Caddy (`X-Forwarded-For`); the
   server trusts only Caddy.
3. **Global email budget (circuit breaker).** A daily counter of outgoing registration
   emails against the mail provider's plan (check the current Brevo free-plan limit). At 80%
   an admin notification; at 100% registration emails pause (login and invited flows keep a
   reserved share) and the sign-up screen says "try again later". This caps the damage of any
   bypass to a bounded number of emails.
4. **Proof of work or captcha on sign-up and resend** (options below). Recommended:
   **ALTCHA** (self-hosted proof-of-work, no third party, no cookies, GDPR-friendly, works in
   React Native via fetch plus a small JS solver). Escalation path if abuse persists: add
   **Cloudflare Turnstile** (free, invisible, but a third-party processor to name in the
   privacy notice and a WebView on mobile). hCaptcha and reCAPTCHA rejected (tracking,
   consent banners). On mobile, Play Integrity / App Attest are a later hardening, not v1.
5. **Email hygiene.** Reject disposable-email domains (a maintained list loaded at build
   time, overridable by admin), normalise addresses (case, Gmail dots/plus are *not*
   normalised, only lowercased), and use **identical responses** whether or not the address
   already exists ("if this address can register, we sent a link") so the form cannot be used
   to enumerate accounts.
6. **Unverified accounts are cheap and short-lived.** Account is created `inactive` and only
   activates on the verification link (single use, hashed token, 24 h). Unverified accounts
   are deleted after 7 days by the purge job (section 9). No session, no data, no role until
   verified.
7. **Edge.** Caddy (stock build has no rate-limit module; a custom `xcaddy` build is possible
   but not needed now) keeps request body limits and timeouts. Hetzner Cloud Firewall allows
   only 80/443 (and SSH from known IPs). Document uploads have their own smaller per-user
   limits (section 5).
8. **Visibility.** Rejected/limited requests are counted (not stored with raw IP/email: HMAC
   with a server secret, kept 14 days) and surface in the Ops status as a signup-spike
   indicator, so Pedro can flip the kill switch.

### 2. Self-registration (prod only)

- Sign-up form: name (display only), email, password (10+ chars, existing rule), tick "I am
  16 or over" and "I read the notice" (privacy notice link), proof-of-work. Creates the user
  `inactive` and sends the verification email (Better Auth `emailVerification`, requirement
  `requireEmailVerification: true` for this path). The 16+ declaration is a first gate only;
  the date of birth proved later is authoritative (Portugal's age of digital consent is 13,
  Lei 58/2019 art. 16; 16 is our conservative choice, see question 6).
- Verification link activates the account, signs in, and lands on Profile.
- The invitation flow of ADR 0003 is unchanged and still the way staff, coaches and clinical
  roles get their accounts. An invited email that already self-registered gets roles granted
  on the existing account (`user_exists` path).

### 3. Roles for new accounts

- New club-wide roles **`anonymous`** (verified email, no person yet) and **`external`**
  (verified real person who is not in the club's records). Both are in the role matrix with
  almost nothing: `anonymous` = own profile, own settings, identity submission, delete my
  account; `external` = the same plus read of the public parts the club chooses later.
- `anonymous` is assigned at activation. It is replaced (not added to) when an approval
  gives a real role, so the role list stays readable.
- Navigation: only Profile and Settings (matches the module tiers, Pedro 2026-10-24). The
  identity submission lives inside Profile.

### 4. Two ways to create a person

A self-registered user cannot create a person directly. They start an **identity claim** from
Profile, choosing one method:

**A. Document submission (beta).** The user enters: document type (NIF, CC, BI, passport,
residence permit; their choice), document number, full name, date of birth, and uploads
photos/scans (front, back where applicable; PDF/JPEG/PNG/HEIC, 8 MB each, at most 3 files).
They accept the identity notice (section 7). Result: an `identity_submission` in status
`pending`, pre-triaged (section 5), then waiting in the human queue (section 6).

**B. CMD (alpha, roadmap only).** The user authenticates with Chave Móvel Digital through AMA's
Autenticação.gov service; the signed assertion carries the identity attributes and is trusted
as proof, so the claim is **auto-approved** (section 8 still applies for lookup and role).
Needs onboarding with AMA; steps are in `docs/REGISTRATION.md`. The module is built behind a
flag and stays alpha until AMA approves the club as a service provider.

### 5. Document pre-triage (automatic, advisory)

Runs in the app right after upload. It never approves; it only rejects obviously invalid
input and annotates the rest so the human spends seconds, not minutes.

- Hard rejects (user told immediately, they can resubmit): wrong file type (magic bytes, not
  extension), size, unreadable/blank image, NIF failing its modulo-11 check digit, CC/BI
  number failing its check digit (CC MRZ check digits), date of birth in the future or
  implausible (age under 0 or over 110), more than 3 submissions pending or 5 per 30 days.
- Annotations the reviewer sees: checksum results; whether the document number and name were
  readable from the image (optional local OCR, alpha; **no third-party OCR or cloud AI sees
  identity documents**); name/date of birth vs. claimed values (fuzzy, accent-insensitive);
  document looks expired (CC validity printed, if read); **match flag** (an identity with the
  same `(type, value)` already belongs to a person, section 8); duplicate file (SHA-256 seen
  in another submission); image quality (blur/crop heuristics).
- Optional malware scan (ClamAV in the Compose stack) before the file is stored; skipped if
  not deployed, but then only images are accepted (re-encoded server-side, which also strips
  EXIF/GPS). PDFs are rasterised or refused.
- Triage output is stored as JSON on the submission and shown with the reasons.

### 6. Human approval queue

- New permission `identity.review`, held by **`admin` (direção) and a new role `hr`
  (recursos humanos)**; `developer` holds it for support but sees no document images (its
  matrix entry excludes `identity.documents.read`, like health data in ADR 0019).
  Open question 3: whether `hr` is needed now or direção alone suffices at first.
- Queue shows submissions oldest first with triage flags. Reviewer opens a single screen:
  claimed data, triage, the matched existing person (name and date of birth only, when a
  match exists), and the document images. Actions: **approve**, **reject** (reason from a
  list plus free text, sent to the user), **ask for another image** (status `needs_info`).
- Separation of duties: the reviewer cannot be the submitter or the owner of a matched
  person; decisions are final for that submission; every view of a document and every
  decision is audited (`identity.document_viewed`, `identity.approved`, ...). Document access
  is by short-lived (5 minute) signed read through the API, never a public URL.
- SLA: queue size on the admin home (when the approvals module is on) and a reminder email to
  reviewers when anything waits more than 3 days; user sees "waiting for review" and gets an
  email on decision.
- Wiring to the module system: this is the `approvals` module (beta). It is generic (a queue
  of typed requests with approve/reject/needs-info and an audit trail); identity claims are
  its first request type, so later requests (guardian-of-child claims, role requests) reuse it.

### 7. RGPD disclaimer and consent records

- **Controller:** Real Sport Clube Massamá. **Purpose:** verify the identity of someone
  asking to be linked to their record in the club app. **Legal basis:** explicit consent
  (art. 6(1)(a)) for processing the document, because the user chooses to provide it and may
  choose CMD instead; the account itself rests on contract/legitimate interest. To be
  confirmed with whoever advises the club on RGPD (question 8).
- The notice is shown on the claim screen, **versioned** (`identity_notice` v1, pt-PT with
  English), with: who, what is collected (type, number, name, date of birth, images), why,
  who sees it (direção/HR only), how long it is kept (section 10), the right to withdraw and
  to erasure, the CNPD complaint route, and that processors are the host and mail provider.
  A short draft text lives in `docs/REGISTRATION.md`; it needs legal review before launch.
- **Consent record:** a `consents` row of a new kind `identity_verification` (ADR 0012) with
  the notice version and timestamp. Without it the submit button is disabled and the API
  refuses. Withdrawing consent while a claim is pending withdraws the claim and purges its
  files at once. Record only version and time (no IP, no user agent).
- Portuguese rules restrict keeping copies of the Cartão de Cidadão (Lei 7/2007: the
  holder's consent or a legal basis is needed). Open question 8 asks for this to be checked;
  the short retention below is also our mitigation.
- The user can view, withdraw and delete their submission from Profile (privacy tooling, ADR
  0012).

### 8. After approval: lookup, linking, role

On approval (or CMD success), in one transaction:

1. **Lookup** `identities` by `(type, value)`. The value is compared normalised (digits only
   for NIF/CC number, upper-case letters stripped of spaces for passports).
2. **Match found → attach as owner.** The existing person is linked to the user as `owner`.
   Safeguards, because a claimed NIF is exactly what an impersonator would type:
   - the name and date of birth proved by the document must agree with the existing person
     (accent-insensitive; a disagreement blocks the one-click approve and forces the reviewer
     to resolve it, with a visible reason);
   - a person has at most **one owner user**. If one exists, the claim is not approved
     automatically; the reviewer decides (typical cause: the person already registered with
     another email) and the old user can be merged or disabled;
   - a minor (under 18) is attached only if the claimant is the person. Parents claiming a
     child use the representative flow (a later request type of the approvals module).
   The role comes from the **position → role map** (below) based on the person's current
   positions in the club.
3. **No match → create the person** with the claimed identity (and the personal data table:
   name, date of birth), link as owner, give the **`external`** role.
4. Record the **proof** on the person: `identity_proofs` (method document|cmd, submission
   id, decided by/at, document type, whether evidence was purged) and the **external/process
   keys** in `person_external_refs` (`system`, `key`, `source_process`, `recorded_at`):
   the submission id, and for CMD the stable subject identifier the assertion returned.
   These keys stay for the life of the person record and survive the purge of the images.
5. The user's role `anonymous` is replaced by the mapped role (or `external`). Audit entries
   and an email to the user.

**Position → role map** (`position_role_map`: `position`, `role`, optional team/class
scope rule, `auto`). Edited by direção under Settings; shows who would receive what before
saving. It maps club positions held by a person (coach, team manager, scout, secretary, ...)
to the existing roles (ADR 0003). Rules:
- Roles are **recomputed when a position changes** (not only at approval), so a coach who
  leaves loses the role; manual grants by an admin are marked `manual` and never removed by
  the map.
- **Clinical roles (doctor, nurse, physio, nutritionist, psychologist) are never given by the
  map**; they need an explicit admin grant. The same for `admin`, `developer`, `treasurer`.
  The map may only assign low-risk roles by default; the allowed set is a constant checked
  by a test.
- Scoped roles (coach, team manager) take the team from the person's position record.
- A person with several positions gets the union.

### 9. Inactive-user purge

A periodic job next to `retention.ts` (ADR 0012), with a dry-run mode, a cap per run and an
audit entry per action. It acts on **users**, not on persons (person data follows club
retention, ADR 0012 and M25):

| Account state | Rule |
| --- | --- |
| Unverified email | Delete after 7 days. |
| Verified, `anonymous`, no person, no sign-in | Warn at 11 months, delete at 12 (a notice email 30 and 7 days before). |
| Has a person (owner or representative) | Never auto-deleted. After 24 months without sign-in: deactivate (reactivation by password reset or admin), warn at 23. |
| Holds any club role (staff, coach, ...), admin, developer, tester | Never touched by the job. |

"Inactive" = no session created or refreshed. Deleting a user removes sessions, accounts,
verifications and their pending submissions (files first); audit rows keep the id only.

### 10. Retention and encrypted storage for identity evidence

Proposed (**tbd**, question 7). RGPD storage-limitation says: keep only as long as needed for
the purpose. The purpose is the decision; after it, a record that the check happened is
enough, the images are not.

| Item | Proposed retention |
| --- | --- |
| Document images of an approved submission | **30 days after the decision** (window for complaints/corrections), then deleted. |
| Rejected / withdrawn / expired submission images | **14 days** after the decision. |
| Pending, no activity | Expire (and purge) after 30 days; the user is told at 14. |
| Claimed values kept on the submission row | Cleared at decision (the value lives on the person's identity if approved). |
| `identity_proofs` and `person_external_refs` (method, who/when decided, doc type, keys, no images) | As long as the person record exists, then follows person erasure. |
| Triage JSON | Deleted with the images. |
| Audit entries of decisions and document views | Per the audit retention of ADR 0012 (ids only, no personal data). |

Why not longer: images of identity documents are the highest-impact data the club holds
(identity theft); a short window removes most of the breach risk, and the proof record
answers "why is this person linked to that user" without the image. Counter-argument for
longer: disputes or later fraud; if direção wants a longer window the ADR is amended with a
number and a justification.

**Storage.**
- Identity documents use a **dedicated private bucket/prefix** (not the public-facing
  documents of ADR 0009), with no public URLs, server-side only access.
- **Application-level envelope encryption**: each file gets a random data key (AES-256-GCM),
  the data key is wrapped by a master key from the environment (`IDENTITY_DOCS_KEY`, in the
  server-only secrets, 32 bytes, rotatable via a `key_id` stored per file). A database or
  bucket leak alone reveals nothing. Hashes (SHA-256 of the plaintext) are kept for
  duplicate detection only.
- **Blocker:** `STORAGE_S3_*` is not configured on staging and `PROD_STORAGE_S3_*` not on
  prod (a container replace loses local uploads). The document method is therefore refused
  (feature flag cannot be turned on, health check warns) until object storage and
  `IDENTITY_DOCS_KEY` exist. The prod backup must exclude or encrypt the bucket accordingly.
- Staging and tests only ever see fake documents (generated images), never real ones.
- Purge job deletes files from storage before rows, and verifies deletion.

### 11. Modules, tiers and flags (Pedro's module system, 2026-10-24)

| Module | Tier | Depends on |
| --- | --- | --- |
| `registration` (sign-up, verification, anonymous role, abuse protection) | beta | users, settings, profile |
| `approvals` (generic queue, review screen, audit) | beta | users |
| `identity-claims` (document method, pre-triage, position→role map, notice) | beta | registration, approvals, persons |
| `identity-cmd` (CMD authentication) | alpha | identity-claims |
| `account-purge` (inactive-user job) | beta | users |

Turning a module on needs its dependencies on; turning one off turns off its dependents.
Note a tension for question 1: a beta module is visible only to tester roles in prod, but
the people who need sign-up are *not yet* users.

## Alternatives considered

- **Create the person on sign-up, verify later.** Rejected: persons carry real data and the
  history of changes; a bad claim would pollute them.
- **Third-party identity verification (selfie + ID vendors).** Rejected: cost, sends
  children's and adults' documents to a processor outside the club's control, and the club is
  small enough for human review.
- **Keep document images for the life of the membership.** Rejected as default (see above).
- **Captcha from Google.** Rejected: tracking and consent-banner cost in a mobile app.
- **Auto-approve when the document number matches an existing person.** Rejected: a number
  is what an impersonator knows; the image and name/date check is the proof.

## Consequences

- ADR 0003's "no public sign-up" now has one exception, prod behind a flag; the amendment is
  noted there when implemented.
- New server pieces: auth rate-limit rules and the email budget, `registration` and
  `approvals` modules, `identity-claims` tables, the purge job, encrypted storage helper.
- Support burden: someone at the club must clear the queue; the SLA reminder exists for that.
- Everything here stays off until object storage and the notice text are in place.

## Assumptions about the persons/identities model (sibling thread)

1. `persons` has a guid and metadata; `identities(person, type, value)` is unique on
   `(type, value)` and every person has at least one.
2. Personal data (name, date of birth) is a separate table with history, so the claim can fill it.
3. A user links to persons through `person_users(user, person, kind owner|representative)`;
   a person has at most one `owner`.
4. Persons have positions in the club (team roster, staff role) that can be read to compute
   roles; this ADR does not define them.
5. Identity values (NIF, CC number) are personal data and are stored under the identity
   tier; hashing for lookup versus plain storage is for the sibling ADR.

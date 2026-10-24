# Registration and identity approval: roadmap

Design: `docs/adr/0026-self-registration-and-identity-approval.md` (read it first). This file
holds the task breakdown, the CMD plan and the draft notice text. Status: **design accepted**
(Pedro's answers 2026-10-24 are in the ADR); R1 to R3 done, rest not started. Tasks use the module tiers (Pedro,
2026-10-24). Numbers are provisional (claim real ones when committing; sibling threads add
tasks too).

## Tasks (in order)

### R1 Abuse protection foundation (Standard) , module `registration`, beta — **done**
- Rate-limit rules per route in Better Auth with database storage; per-address email limits;
  daily email budget with circuit breaker; `SELF_REGISTRATION` flag per stack plus a club
  setting; HMAC'd counters and an Ops status line; ALTCHA challenge endpoint and client.
- Done when: tests show limits per IP and per address, the budget pauses registration emails
  at the cap, responses are identical for existing and new addresses.

### R2 Self-registration and roles `anonymous`, `external` (Standard) , `registration` — **done**
- Sign-up screen (prod flag), email verification, `requireEmailVerification`, unverified
  cleanup (7 days), disposable-domain list, roles added to the permission matrix with
  allowed/denied tests, navigation limited to Profile and Settings for `anonymous`.

### R3 Approvals module (Standard) , module `approvals`, beta — **done**
- Generic request queue (type, subject, payload reference, status, reviewer, reason),
  `identity.review` permission, roles `admin` and `hr`, audit, email on
  decision, reviewer reminders. No identity logic yet (a test request type proves it).

### R4 Encrypted identity-evidence storage (Standard) , blocker for R5
- Private bucket/prefix, envelope encryption helper, key rotation by `key_id`, signed
  short-lived reads, purge helper, health warning when unset. Needs Pedro to create the
  object-storage bucket (a numbered checklist is given when this starts). Staging uses fake
  documents only.

### R5 Document identity claim and triage (Heavy) , module `identity-claims`, beta
- Claim screen in Profile, versioned notice and `identity_verification` consent, upload with
  re-encoding (EXIF stripped), check-digit validation (NIF, CC), triage JSON, review screen,
  approve/reject/needs-info, lookup and attach-as-owner with the safeguards of ADR 0026
  section 8, person creation for new identities, `identity_proofs`, `person_external_refs`.
  Depends on the persons/identities tables from the data-model thread.

### R6 Position → role map (Standard) , `identity-claims`
- Settings screen, recompute on position change, manual grants never removed, clinical roles
  excluded by constant plus a test, preview before saving.

### R7 Retention and inactive-user purge (Standard) , module `account-purge`, beta
- Evidence purge (configurable retention setting; default delete at decision, pending expire at 30 days), inactive-user job per ADR 0026 section 9, dry-run,
  cap per run, warning emails, audit; documented in `OPERATIONS.md`.

### R8 CMD authentication (Heavy) , module `identity-cmd`, **alpha**
- Only after AMA onboarding (below). SAML 2.0 service provider flow, attribute mapping,
  auto-approval, subject identifier kept as an external ref, mobile return via deep link.

### Later
- Guardian/representative claims ("this child is mine") as a second approvals request type.
- Play Integrity / App Attest on sign-up if abuse appears.
- Optional local OCR to prefill the claim form.

## CMD plan (Chave Móvel Digital through AMA)

What is certain: CMD authentication is offered by AMA (Agência para a Modernização
Administrativa) through the national authentication service (Autenticação.gov), and entities
integrate as a **service provider** (SAML 2.0, the national eIDAS node uses the same
protocol), asking for specific identity attributes. What must be confirmed with AMA directly,
because conditions change and private clubs are not their usual client: whether a private
association may onboard, any fee, the attribute set it may request (name, date of birth, NIF,
civil ID number), the legal basis AMA requires, and the lead time. None of this is assumed.

Steps (Pedro or the club's legal representative does 1 to 3; the thread prepares everything
else):
1. **Check eligibility and contact AMA** through the Autenticação.gov / "Serviços de
   Autenticação" onboarding contact (get the current form and contact from the AMA site).
   Ask: eligibility of an association, attributes available, cost, SLA, test environment.
2. **Formal request** by the club's legal representative: entity data, purpose, legal
   basis, list of requested attributes with justification (data minimisation: name, date of
   birth and NIF at most), data-protection contact.
3. **Technical onboarding**: AMA asks for the service-provider metadata (entity id, ACS
   URL, signing and encryption certificates). The thread generates the certificates, the
   metadata endpoint and a test client; secrets go in server-only env on each stack.
4. **Pre-production tests** against AMA's test environment with test credentials (no real
   citizen data in the repo or in staging logs).
5. **Production activation**, then flip `identity-cmd` from alpha to beta after one successful
   real login by Pedro; privacy notice updated (AMA becomes a recipient/processor of the
   authentication step).
6. Record: certificate renewal dates (add to `OPERATIONS.md`), and the AMA contact.

Decision for now: keep CMD a roadmap item; the document method ships first.

## Draft notice text (pt-PT, needs legal review before launch)

> **Verificação de identidade.** O Real Sport Clube Massamá (responsável pelo tratamento)
> pede-lhe o tipo e o número de um documento de identificação, o nome completo, a data de
> nascimento e uma imagem do documento, para confirmar que é a pessoa que pede para ficar
> associada ao seu registo na aplicação. Só a direção e os recursos humanos veem estes dados.
> As imagens são guardadas cifradas e apagadas assim que o pedido é decidido (ou retirado, ou
> expira); mantemos apenas o registo de que a verificação foi feita. O
> consentimento é voluntário e pode ser retirado a qualquer momento no seu perfil, o que
> cancela o pedido e apaga as imagens. Pode pedir acesso, retificação ou apagamento dos seus
> dados e apresentar queixa à CNPD. Pode, em alternativa, usar a Chave Móvel Digital (quando
> disponível).

(English version to be added next to it in the app, as for every other string.)

## Decisions and what is left

Answered by Pedro 2026-10-24 (recorded in the ADR): prod starts closed; staging uses rotating
keys; `hr` role created; admin may decide alone; clinical roles never auto-mapped; children may
register; retention is a setting and files are deleted at the decision; object storage will be
created at R4; CMD later (Pedro can approach AMA, believed developer friendly).

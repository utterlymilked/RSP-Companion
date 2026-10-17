# Requirements from the club

What Real Sport Clube Massamá has told us, in their words where useful. Business questions
go to the club in Portuguese through the questionnaire page
(<https://claude.ai/artifact/At3WwGbn935k5i6xXS4HsF>); technical decisions are Pedro's.
Update this file whenever new answers arrive, and adjust `ROADMAP.md` if priorities change.
Never copy personal data (names, contacts, health info) into this file or the repo.

## Answers received 2026-10-15

| Topic | Answer | Consequence |
| --- | --- | --- |
| Sports and age groups | All the listed age groups and sections (petizes to seniores, feminino, veteranos). Athlete count not given yet. | Teams/escalões are data, not hard-coded. |
| Priorities | 1) Register people and users ("registo de entidades", Pedro's wording, for access). 2) **Room and field management** is the first feature. Then incident log (ocorrências), equipment, player evaluations/scouting (today in Google Forms), call-ups. Other modules are "also interesting". | Roadmap reordered: facilities right after members; scouting and incidents added. |
| Users and roles | The proposed roles plus: nutritionist, doctor, physiotherapist, nurse, psychologist, sociologist, economato (stores), scouting, recruitment. Athlete performance evaluation is wanted. | Health staff means special-category data (GDPR art. 9), often of minors: privacy tiers are designed in M2, not bolted on later. |
| Current tools | Excel, Google Sheets, WhatsApp groups, paper, and an app called "EM JOGO". Data can be exported for import. | Import scripts in M5; EM JOGO's role to be clarified. |
| Payments | Yes to generated Multibanco / MB WAY references. Kit/equipment purchases are also charged. | Fees ledger covers equipment sales, not only quotas. |
| Language | Both Portuguese and English. | i18n pt-PT + en from the app shell (M3). |
| Budget | Pedro covers hosting for now. | Hetzner VPS, Pedro owns the accounts. |
| Other | Links to three Google Sheets (more coming), read via the Google Drive/Sheets connector. | See "Current spreadsheets" below. |

## Answers re-read 2026-10-17 (all 23 questionnaire answers)

Only generic findings; links and personal data stay in the questionnaire. "Built" says what `main` does today.

| Topic | Answer | Built / gap |
| --- | --- | --- |
| Booking requests | Secretaria and direção confirm. **Every staff member (RH) and every gabinete may request** a room or field. Campo 2 whole, half or third; campo 3 whole or half. | Built: office confirms, only coach and delegado (own team) request. **Gap:** requesting is not open to the other staff roles (clinical, scouting, recruitment, economato, coordination...). |
| Who approves | Two answers differ: secretaria and direção (`reservas`), or the Diretor da Entidade Formadora and the Diretor de Campo (`salas-campos`). | Open: ask which, and whether "Diretor de Campo" needs its own role. |
| Pain points | Overlaps, last-minute changes, and telling all staff, athletes and guardians at once. | Overlaps prevented. **Gap:** change notifications to everyone affected (push exists in M15, not wired to booking changes). |
| Floor plan | Three floors: entrance hall; floor 1 changing rooms (7, referees, coaches), medical/physio office, stores, WCs, two storerooms; floor 2 secretaria, strength room, two auditoriums, workcenter, direction, coordination, scouting office, printer room, two meeting rooms. A weekly training plan per escalão and class will follow. | Built: schematic plan. **Gap:** changing rooms are not bookable spaces yet; the weekly training plan must be importable as recurring bookings per team. |
| Contacts of athletes | Coaches and delegados may see contacts and birth dates **only through permission of direção or secretaria**. | Contradicts our default (own team sees them, ADR 0003). **Gap:** per-grant permission instead of a blanket rule. |
| Health history | Athletes (or guardians) may see their clinical history, **only with permission of the direção or the head of the medical office**. Clinical roles "can" record what they need. | Built: no athlete access to health data. **Gap:** a revocable release by direção or the medical head. |
| Documents | Athletes: photo, federation registration form, sports medical exam, ID (citizen card, residence card or passport). Staff documents are also recorded: coaching licence (TPTD), professional card, training diplomas (first aid, defibrillator). Coaches see only their team. Warn **one month** before expiry. | Built: 30 days, team-scoped. **Gap:** staff documents with kinds, "required documents" per role, expiry reminders as notifications. |
| Scouting | Evaluations are seen only by direção and scouting staff; athlete data by secretaria and direção. Criteria come from the club's existing scouting form. Prospect data may be kept without time limit. | Built: 12 month prospect retention (ADR 0007). **Gap:** retention is a club setting, default unlimited. |
| Retention | Former members and health records: no limit for now, **but configurable**. | M17 has no health or former-member retention; add a configurable policy. |
| Consents | Paper today: one authorisation for use of data and images. | Built: image rights and transport consents; fine, add one combined data-and-image wording. |
| Priorities | 1) Entities and access. 2) Rooms and fields. Then incidents, equipment, scouting (all in Google Forms today), call-ups. | All built. Priority is now polish and replacing the forms in daily use. |
| Payments | Wanted; kit and equipment sales are charged too. Amounts will be sent later. | Built: ledger incl. equipment. Waiting for amounts and for the gateway (M12b). |
| Hosting, EM JOGO | Pedro pays hosting for now. EM JOGO answer: "both options" (unclear). | Open. |

## Current spreadsheets (structure only, read 2026-10-15)

The club runs the 2026/27 season from Google Sheets. Structure matters for the data model and
for import scripts; personal data in them stays in the sheets.

**Room booking** (`MARCAÇÃO_AUDITORIO_SALAS_REUNIÕES_26-27`, tab `MARCAÇÃO_26-27`, ~400 rows).
Columns: infrastructure, department that books, date, activity, start, end, duration, status,
target group, expected participants, actual participants, notes. Lookup tab `DADOS` lists:
- Spaces: auditório, sala de reuniões 1 and 2, sala de treino de força, gabinete de
  recrutamento/metodologia, gabinete da direção, gabinete DEF.
- Departments ("gabinetes") that book: direção RSC, direção EF, coordenação, metodologia de
  treino e jogo, treino específico de GR, nutrição, avaliação funcional / treino de força,
  scouting e recrutamento, análise de dados de performance, psicologia, intervenção social,
  medicina e reabilitação, fisioterapia, gestão administrativa, plus external users: aluguer
  (rental), GP Sport Academy, Real SC SAD.
- Activities: formação, análise de jogo, reunião EE/jogadores, reunião, recrutamento.
- Statuses: confirmado, a confirmar, não confirmado, anulado, realizado, agendar, reagendar,
  adiada, reagendado, cancelado.
- Target groups: SFFRSC geral, EF geral, sub-10 to sub-19, seniores masc/fem, pais/EE,
  coordenação, direção.

**Matches** (`Marcação_Jogos_2026-27_SFFRSC`, ~400 rows plus a weekly summary tab).
Columns: section (fem/masc), escalão, birth year, date, activity (jogo treino, campeonato
FPF, taça), status, type, round, start/end/duration, coaches, number of teams, format
(fut 11 / fut 7 / fut 4+GR / fut 3), number of games, call-up, delegation, opponent, venue
(home complex campo 1/2/3 or away ground), notes, transport, kit, medical cover (e.g. first
aid with defibrillator).

**Football school** (`26-27_Escala_Turmas_Atletas_Técnicos_...`). Tabs: all activities with
participation (called up vs present), classes and coaches with schedules and **monthly fees
per class** (e.g. 37,50 € / 42,50 € / 55 €), escalões → classes (turma codes such as 11, 21,
61/81), and a long list of away venues.

**What this means for the design**
- Several organisations share people and spaces: Real SC (club), Real SC SAD (senior
  professional side), Escola de Futebol, SFFRSC, GP Sport Academy, external renters. They
  appear as booking parties and as employers of coaches.
- Escalão (age group by birth years) → turma/class (training group with code, schedule,
  fee, coach) → athletes. Teams for competition are formed from classes.
- Bookings carry a requesting department, activity type, target group, a rich status
  workflow and expected vs actual attendance. Fields at the home complex are campos 1, 2, 3
  (2 and 3 can be booked together).
- Matches need format, round, opponent, venue (home field or external ground), transport,
  kit and medical cover.

## Open follow-ups (asked 2026-10-15)

- How room and field booking works today (spaces, subdivisions, who books/approves, shared use).
- What incidents (ocorrências) cover and who may see them.
- Evaluation and scouting criteria, scales, evaluators; external prospects?
- What "EM JOGO" is and whether we replace it.
- Current fee amounts and discounts.
- Which health data each clinical role records and who else may see it (e.g. coach sees "injured" but not the diagnosis).
- Whether coaches and delegados may see contacts and birth dates of their own athletes and
  guardians (asked 2026-10-15; M2 default is yes, for their team or class only; see ADR 0003).

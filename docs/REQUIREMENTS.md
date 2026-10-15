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

## Import of existing data

Import expects a CSV per sheet (Google Sheets: File > Download > CSV). Column aliases are in
`apps/server/src/modules/people/import.ts`. The athlete and member sheets have not been
inspected yet, so the aliases are a best guess; send the header row of each sheet (no data)
and the mapping is adjusted.

## Open follow-ups (asked 2026-10-15)

- How room and field booking works today (spaces, subdivisions, who books/approves, shared use).
- What incidents (ocorrências) cover and who may see them.
- Evaluation and scouting criteria, scales, evaluators; external prospects?
- What "EM JOGO" is and whether we replace it.
- Current fee amounts and discounts.
- Which health data each clinical role records and who else may see it (e.g. coach sees "injured" but not the diagnosis).
- Whether coaches and delegados may see contacts and birth dates of their own athletes and
  guardians (asked 2026-10-15; M2 default is yes, for their team or class only; see ADR 0003).
